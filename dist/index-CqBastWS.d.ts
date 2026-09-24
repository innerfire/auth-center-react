import { d as AccountCenterAuthScope, r as AccountProfile, t as AccountCenterAdapter } from "./types-DN5cBx0E.js";

//#region src/adapters/default-adapter.d.ts

interface DefaultAdapterOptions {
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
declare function createDefaultAdapter(fetchFn: typeof globalThis.fetch, options?: DefaultAdapterOptions): AccountCenterAdapter;
//#endregion
//#region src/error.d.ts
/**
 * Unified error model (GENAIWDE-7).
 *
 * AccountCenterError provides a consistent error type across all adapter
 * implementations. GatewayProfileAdapterError remains public for backward
 * compatibility.
 *
 * The `code` field is intentionally left as `string` (not a closed union)
 * so new codes can be added without breaking existing consumers.
 */
interface AccountCenterErrorOptions {
  /** Error code — string to allow extension without breaking changes. */
  code: string;
  /** Fixed, security-safe message. Never exposes upstream body/statusText/URL. */
  message: string;
  /** Whether the operation is safe to retry. */
  retryable: boolean;
  /** Optional HTTP status code for diagnostics (not exposed to users). */
  status?: number;
}
/**
 * Unified error class for account-center operations.
 *
 * All adapter implementations should throw errors that are either
 * instances of this class or have compatible `.code` / `.retryable`
 * properties (duck-typing).
 */
declare class AccountCenterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(opts: AccountCenterErrorOptions);
}
/**
 * Type guard: check if a value is an AccountCenterError.
 *
 * Also returns true for GatewayProfileAdapterError (which has the same
 * shape) to maintain backward compatibility.
 */
declare function isAccountCenterError(value: unknown): value is AccountCenterError;
//#endregion
//#region src/adapters/gateway-profile-adapter.d.ts

interface GatewayProfileAdapterOptions {
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
interface GatewayProfileAdapterErrorOptions {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
}
declare class GatewayProfileAdapterError extends AccountCenterError {
  constructor(opts: GatewayProfileAdapterErrorOptions);
}
/**
 * Create an AccountCenterAdapter that reads profiles from the Gateway
 * and delegates all writes to the legacy adapter.
 */
declare function createGatewayProfileAdapter(options: GatewayProfileAdapterOptions): AccountCenterAdapter;
//#endregion
export { isAccountCenterError as a, AccountCenterError as i, GatewayProfileAdapterOptions as n, DefaultAdapterOptions as o, createGatewayProfileAdapter as r, createDefaultAdapter as s, GatewayProfileAdapterError as t };
//# sourceMappingURL=index-CqBastWS.d.ts.map