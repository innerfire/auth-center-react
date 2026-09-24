/**
 * Default fetch-based adapter — mirrors the BFF envelope contract.
 *
 * BFF success envelope: { data: T }
 * BFF error envelope:   { error: { code, message, retryable } }
 *
 * The host app (apps/app) wraps fetch via its own `apiFetch`
 * so 401s are intercepted properly.
 *
 * GENAIWDE-7 additions:
 * - Each adapter instance owns its own internal scope (no module singleton).
 * - Optional `getAuthScope` via options: when provided, the adapter
 *   uses the host-provided scope and marks `hasExplicitAuthScope: true`.
 * - 401 from BFF (status or code) normalized to code=UNAUTHORIZED,
 *   status=401, retryable=false — regardless of source shape.
 * - Fixed error messages: never exposes upstream statusText, response body,
 *   or message text. Safe status classification only.
 * - JSON parse failure, non-OK without envelope, error envelope — all
 *   produce fixed messages with appropriate status codes.
 */
import type {
  AccountCenterAdapter,
  AccountProfile,
  PasswordChangePayload,
  PasswordChangeResult,
  ProfilePatchPayload,
  LogoutResult,
  ApiEnvelope,
} from "../types";
import {
  createAccountCenterAuthScope,
  type AccountCenterAuthScope,
} from "../auth-scope";
import { AccountCenterError } from "../error";

// ─── Error class ────────────────────────────────────────────────────

class AccountApiError extends AccountCenterError {
  constructor(
    code: string,
    message: string,
    retryable = false,
    status?: number,
  ) {
    super({ code, message, retryable, status });
    this.name = "AccountApiError";
  }
}

// ─── Status classification (fixed messages, §4) ─────────────────────

/**
 * Classify a numeric status into a fixed code and retryable flag.
 * Never exposes upstream text or body — safe fixed messages only.
 */
function classifyDefaultStatus(status: number): {
  code: string;
  message: string;
  retryable: boolean;
} {
  switch (status) {
    case 401:
      return { code: "UNAUTHORIZED", message: "Authentication required", retryable: false };
    case 403:
      return { code: "FORBIDDEN", message: "Access denied", retryable: false };
    case 404:
      return { code: "NOT_FOUND", message: "Resource not found", retryable: false };
    case 422:
      return { code: "INVALID_REQUEST", message: "Request was invalid", retryable: false };
    case 429:
      return { code: "RATE_LIMITED", message: "Too many requests", retryable: true };
    default:
      if (status >= 500 && status <= 599) {
        return { code: "UPSTREAM_ERROR", message: "Server returned an unexpected response", retryable: true };
      }
      return { code: "UPSTREAM_ERROR", message: "Server returned an unexpected response", retryable: false };
  }
}

// ─── Envelope helpers ───────────────────────────────────────────────

const UNAUTHORIZED_BFF_CODE = "UNAUTHENTICATED";

async function unwrapEnvelope<T>(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    // Network failure: fixed message, no upstream error detail leaked
    throw new AccountApiError("NETWORK", "Network request failed", true);
  }

  // Attempt to parse JSON envelope in all cases (even non-ok)
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // JSON parse failure: fixed message, no statusText or response body leaked.
    const classified = classifyDefaultStatus(res.status);
    throw new AccountApiError(
      classified.code,
      classified.message,
      classified.retryable,
      res.status,
    );
  }

  const envelope = body as ApiEnvelope<T>;

  // Error envelope from BFF
  if (envelope && typeof envelope === "object" && "error" in envelope) {
    const raw = (envelope as { error: { code: string; message: string; retryable: boolean } }).error;

    // §4/§8: Normalize 401 regardless of source
    //   - BFF code "UNAUTHENTICATED" → code=UNAUTHORIZED, status=401, retryable=false
    //   - status===401 (shouldn't have envelope, but defense-in-depth) → same
    if (raw.code === UNAUTHORIZED_BFF_CODE || res.status === 401) {
      throw new AccountApiError("UNAUTHORIZED", "Authentication required", false, 401);
    }

    // §5: Non-401 BFF error — use BFF code/message but fixed safe message
    //     Never expose upstream message text
    const classified = classifyDefaultStatus(res.status);
    throw new AccountApiError(
      raw.code,
      classified.message,
      raw.retryable,
      res.status,
    );
  }

  // Non-ok without proper envelope
  if (!res.ok) {
    const classified = classifyDefaultStatus(res.status);
    // Keep the legacy UPSTREAM code except for authentication, which must be
    // normalized so cache clearing and login recovery cannot miss a 401.
    throw new AccountApiError(
      res.status === 401 ? "UNAUTHORIZED" : "UPSTREAM",
      classified.message,
      classified.retryable,
      res.status,
    );
  }

  // Success envelope
  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return (envelope as { data: T }).data;
  }

  // Non-envelope success (shouldn't happen, but be lenient)
  return envelope as unknown as T;
}

// ─── Factory ────────────────────────────────────────────────────────

export interface DefaultAdapterOptions {
  /**
   * Optional: provide a host-controlled auth scope.
   * When provided, the adapter marks `hasExplicitAuthScope: true`
   * and the host MUST rotate (destroy + recreate) the scope object
   * on user/subject switch.
   *
   * When omitted, each adapter instance creates its own internal scope.
   */
  getAuthScope?: () => AccountCenterAuthScope;
}

/**
 * Create an AccountCenterAdapter that reads profiles from the BFF.
 *
 * @param fetchFn - Fetch implementation (injected for testability).
 * @param options - Optional configuration including host-provided auth scope.
 *
 * Scope behaviour:
 * - Without `options.getAuthScope`: each adapter instance gets its own
 *   internal scope (no module singleton). `hasExplicitAuthScope` is false.
 * - With `options.getAuthScope`: the host-provided scope is used and
 *   `hasExplicitAuthScope` is true. The host MUST rotate the scope on
 *   user/subject switch (documented contract).
 */
export function createDefaultAdapter(
  fetchFn: typeof globalThis.fetch,
  options?: DefaultAdapterOptions,
): AccountCenterAdapter {
  // §6: Each instance owns its own scope (no module-level singleton)
  const internalDefaultScope = createAccountCenterAuthScope();
  const resolveAuthScope = options?.getAuthScope ?? (() => internalDefaultScope);
  const hasExplicit = Boolean(options?.getAuthScope);

  return {
    getProfile: () =>
      unwrapEnvelope<AccountProfile>(fetchFn, "/api/account/profile"),

    // §7: expose scope for query key construction
    getProfileAuthScope: () => resolveAuthScope(),

    // §7: capability marker — true when host provides scope
    hasExplicitAuthScope: hasExplicit,

    patchProfile: (payload: ProfilePatchPayload) =>
      unwrapEnvelope<AccountProfile>(fetchFn, "/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),

    uploadAvatar: async (blob: Blob) => {
      const form = new FormData();
      // BFF expects field name "file", not "avatar"
      form.append("file", blob, "avatar.jpg");
      return unwrapEnvelope<{ avatarUrl: string }>(fetchFn, "/api/account/avatar", {
        method: "POST",
        body: form,
      });
    },

    changePassword: (payload: PasswordChangePayload) =>
      unwrapEnvelope<PasswordChangeResult>(fetchFn, "/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),

    logout: async () => {
      try {
        return await unwrapEnvelope<LogoutResult>(fetchFn, "/api/account/logout", {
          method: "POST",
        });
      } catch {
        // Navigation fallback still reaches a server route that clears HttpOnly cookies.
        return { logoutUrl: "/api/casdoor/logout" };
      }
    },
  };
}
