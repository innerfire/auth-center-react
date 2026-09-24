/**
 * Gateway Profile Adapter (GENAIWDE-6 + GENAIWDE-7).
 *
 * Factory that produces an `AccountCenterAdapter` whose `getProfile`
 * reads the user profile from the Gateway endpoint while all write
 * methods delegate to the required legacy adapter.
 *
 * GENAIWDE-7 additions:
 * - Required `getAuthScope` for auth-scoped query keys
 * - Optional `onUnauthorized` callback with per-scope dedup (WeakSet)
 * - Status classification with fixed security messages
 * - Metadata snapshot at construction (shallow copy)
 * - Legacy patch projection: only nickname/avatarUrl + metadata
 *
 * Design invariants:
 * - Fixed relative path: `/gateway/v1/auth/profile`
 * - GET only, no body, no query parameters
 * - Single `Authorization: Bearer <token>` header (fresh per request)
 * - `credentials: "omit"`, `cache: "no-store"`
 * - 200 responses validated via `decodeGatewayProfile` from GENAIWDE-5
 * - `profileMetadata` (capabilities, degradedReasons) is snapshotted at
 *   construction and explicitly composed into results — never fabricated
 * - Write methods delegate to `legacyAdapter` with metadata re-attachment
 * - Missing/empty token fails safely before any network call
 * - Fixed error messages never expose token, URL, response body, or Profile
 * - No calls to `/validate`
 */
import type {
  AccountCenterAdapter,
  AccountProfile,
} from "../types";
import { decodeGatewayProfile, GatewayProfileError } from "../gateway-profile";
import {
  createAccountCenterAuthScope,
  type AccountCenterAuthScope,
} from "../auth-scope";
import { AccountCenterError } from "../error";

// ─── Options (single object, minimal controlled interface) ──────────

export interface GatewayProfileAdapterOptions {
  /** Fetch implementation (injected for testability). */
  fetchFn: typeof globalThis.fetch;
  /** Returns the current auth token. Called fresh on each getProfile. */
  getAccessToken: () => Promise<string>;
  /** Required legacy adapter for all write operations. */
  legacyAdapter: AccountCenterAdapter;
  /**
   * Explicit metadata to compose into the AccountProfile result.
   * Must be provided — never fabricated by this adapter.
   * Snapshotted (shallow-copied) at construction time.
   */
  profileMetadata: Pick<AccountProfile, "capabilities" | "degradedReasons">;
  /**
   * Returns the current auth scope for query key construction.
   * Called by the adapter to expose via getProfileAuthScope().
   * Also used internally for 401 dedup.
   * When omitted, a default internal scope is used.
   */
  getAuthScope?: () => AccountCenterAuthScope;
  /**
   * Optional: called (at most once per auth scope) when a 401 is received.
   * Deduplicated via WeakSet per scope — same scope triggers at most once,
   * new scope can trigger again. Callback rejection is swallowed.
   * No error/token/profile is passed to the callback.
   */
  onUnauthorized?: () => void | Promise<void>;
}

// ─── Error class ────────────────────────────────────────────────

export interface GatewayProfileAdapterErrorOptions {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
}

export class GatewayProfileAdapterError extends AccountCenterError {
  constructor(opts: GatewayProfileAdapterErrorOptions) {
    super(opts);
    this.name = "GatewayProfileAdapterError";
  }
}

// ─── Constants ──────────────────────────────────────────────────

const PROFILE_PATH = "/gateway/v1/auth/profile" as const;

// ─── Status classification (GENAIWDE-7 §4) ─────────────────────

/**
 * Classify an HTTP status code into a fixed error code and retryability.
 * Fixed security messages — never exposes body/statusText/URL.
 */
function classifyStatusError(status: number): {
  code: string;
  message: string;
  retryable: boolean;
} {
  switch (status) {
    case 401:
      return { code: "UNAUTHORIZED", message: "Gateway authentication failed", retryable: false };
    case 403:
      return { code: "FORBIDDEN", message: "Access to the requested resource is denied", retryable: false };
    case 404:
      return { code: "NOT_FOUND", message: "The requested resource was not found", retryable: false };
    case 422:
      return { code: "INVALID_REQUEST", message: "The request was invalid", retryable: false };
    case 429:
      return { code: "RATE_LIMITED", message: "Too many requests", retryable: true };
    default:
      if (status >= 500 && status <= 599) {
        return { code: "UPSTREAM_ERROR", message: "Gateway returned an unexpected response", retryable: true };
      }
      return { code: "UPSTREAM_ERROR", message: "Gateway returned an unexpected response", retryable: false };
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create an AccountCenterAdapter that reads profiles from the Gateway
 * and delegates all writes to the legacy adapter.
 */
export function createGatewayProfileAdapter(
  options: GatewayProfileAdapterOptions,
): AccountCenterAdapter {
  const {
    fetchFn,
    getAccessToken,
    legacyAdapter,
    profileMetadata,
    onUnauthorized,
  } = options;

  // Default scope when getAuthScope is not provided
  const internalDefaultScope = createAccountCenterAuthScope();
  const resolveAuthScope = options.getAuthScope ?? (() => internalDefaultScope);

  // ── Snapshot metadata at construction (GENAIWDE-7 §7) ────────
  // Shallow copy booleans + degradedReasons array to prevent
  // caller mutation after construction.
  const snapshotMetadata: Pick<AccountProfile, "capabilities" | "degradedReasons"> = {
    capabilities: { ...profileMetadata.capabilities },
    degradedReasons: [...profileMetadata.degradedReasons],
  };

  // ── 401 dedup per auth scope (GENAIWDE-7 §3) ────────────────
  // WeakSet tracks scopes that have already triggered onUnauthorized.
  // "Mark first, then callback" prevents re-entrance.
  const notifiedScopes = new WeakSet<AccountCenterAuthScope>();

  async function fetchProfile(): Promise<AccountProfile> {
    // 0. Snapshot auth scope BEFORE token acquisition (GENAIWDE-7 §1)
    const requestScope = resolveAuthScope();

    // 1. Acquire fresh token — fail safely if missing/empty.
    let rawToken: unknown;
    try {
      rawToken = await getAccessToken();
    } catch {
      throw new GatewayProfileAdapterError({
        code: "TOKEN_ERROR",
        message: "Unable to obtain access token",
        retryable: false,
      });
    }

    if (
      typeof rawToken !== "string" ||
      rawToken.trim().length === 0
    ) {
      throw new GatewayProfileAdapterError({
        code: "TOKEN_MISSING",
        message: "Access token is missing or empty",
        retryable: false,
      });
    }

    // 1a. Scope drift check after token acquisition — nonretryable
    if (resolveAuthScope() !== requestScope) {
      throw new GatewayProfileAdapterError({
        code: "AUTH_SCOPE_CHANGED",
        message: "Auth scope changed during token acquisition",
        retryable: false,
      });
    }

    const token: string = rawToken;

    // 2. Fetch profile from Gateway
    let response: Response;
    try {
      response = await fetchFn(PROFILE_PATH, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      // Network error: retryable, fixed message
      throw new GatewayProfileAdapterError({
        code: "NETWORK_ERROR",
        message: "Network request to Gateway failed",
        retryable: true,
      });
    }

    // 3. Post-response scope drift check (GENAIWDE-7 §1)
    //    If scope has changed since the request was dispatched,
    //    the response belongs to the old scope — discard and throw.
    //    This prevents scope-A response from populating scope-B cache,
    //    and prevents late scope-A 401 from marking/callbacking scope-B.
    if (resolveAuthScope() !== requestScope) {
      throw new GatewayProfileAdapterError({
        code: "AUTH_SCOPE_CHANGED",
        message: "Auth scope changed before response was processed",
        retryable: false,
      });
    }

    // 4. Handle non-OK status codes — classified status (GENAIWDE-7 §4)
    if (!response.ok) {
      const classified = classifyStatusError(response.status);

      // 401: per-scope dedup for onUnauthorized callback.
      //      Dedup by requestScope only — same scope triggers at most once.
      //      Only callback if requestScope is STILL the current scope
      //      (prevents late scope-A 401 from notifying scope-B).
      if (response.status === 401) {
        const currentScope = resolveAuthScope();
        if (currentScope === requestScope && !notifiedScopes.has(requestScope)) {
          notifiedScopes.add(requestScope);
          if (onUnauthorized) {
            try {
              const result = onUnauthorized();
              // Fire-and-forget: don't await potentially永不结束的callback
              Promise.resolve(result).catch(() => {});
            } catch {
              // Sync throw is swallowed (GENAIWDE-7 §3)
            }
          }
        }
      }

      throw new GatewayProfileAdapterError({
        code: classified.code,
        message: classified.message,
        retryable: classified.retryable,
        status: response.status,
      });
    }

    // 4. Validate content-type is JSON.
    const contentType = response.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (mediaType !== "application/json") {
      throw new GatewayProfileAdapterError({
        code: "INVALID_RESPONSE",
        message: "Gateway returned a non-JSON response",
        retryable: false,
      });
    }

    // 5. Parse JSON — handle parse failures
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GatewayProfileAdapterError({
        code: "MALFORMED_JSON",
        message: "Gateway response could not be parsed as JSON",
        retryable: false,
      });
    }

    // 6. Decode Gateway profile DTO via validated decoder
    let patch;
    try {
      patch = decodeGatewayProfile(body);
    } catch (err) {
      if (err instanceof GatewayProfileError) {
        throw new GatewayProfileAdapterError({
          code: "INVALID_GATEWAY_PROFILE",
          message: "Gateway profile data is malformed",
          retryable: false,
        });
      }
      throw new GatewayProfileAdapterError({
        code: "INVALID_GATEWAY_PROFILE",
        message: "Gateway profile data is malformed",
        retryable: false,
      });
    }

    // 7. Compose full AccountProfile with explicit field selection.
    //    Uses snapshotted metadata — never from DTO or caller.
    return {
      username: patch.username,
      nickname: patch.nickname,
      firstName: patch.firstName,
      lastName: patch.lastName,
      bio: patch.bio,
      avatarUrl: patch.avatarUrl,
      email: patch.email,
      phone: patch.phone,
      organization: patch.organization,
      capabilities: snapshotMetadata.capabilities,
      degradedReasons: snapshotMetadata.degradedReasons,
    };
  }

  return {
    getProfile: fetchProfile,

    // GENAIWDE-7 §7: expose auth scope via lifecycle method
    getProfileAuthScope: () => resolveAuthScope(),

    // Only host-provided scopes may use the five-minute cache. The internal
    // compatibility scope cannot observe a principal switch, so it stays stale.
    hasExplicitAuthScope: options.getAuthScope !== undefined,

    // GENAIWDE-7 §7: legacy patch — project nickname/avatarUrl + re-attach metadata
    patchProfile: async (...args) => {
      const legacyResult = await legacyAdapter.patchProfile(...args);
      // Only project nickname and avatarUrl; re-attach snapshotted metadata.
      // Never include subject or old metadata from legacy result.
      return {
        username: legacyResult.username,
        nickname: legacyResult.nickname,
        firstName: legacyResult.firstName,
        lastName: legacyResult.lastName,
        bio: legacyResult.bio,
        avatarUrl: legacyResult.avatarUrl,
        email: legacyResult.email,
        phone: legacyResult.phone,
        organization: legacyResult.organization,
        capabilities: snapshotMetadata.capabilities,
        degradedReasons: snapshotMetadata.degradedReasons,
      };
    },

    uploadAvatar: (...args) => legacyAdapter.uploadAvatar(...args),
    changePassword: (...args) => legacyAdapter.changePassword(...args),
    logout: (...args) => legacyAdapter.logout(...args),
  };
}
