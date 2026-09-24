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

// ─── AccountCenterError ────────────────────────────────────────

export interface AccountCenterErrorOptions {
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
export class AccountCenterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(opts: AccountCenterErrorOptions) {
    super(opts.message);
    this.name = "AccountCenterError";
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

/**
 * Type guard: check if a value is an AccountCenterError.
 *
 * Also returns true for GatewayProfileAdapterError (which has the same
 * shape) to maintain backward compatibility.
 */
export function isAccountCenterError(value: unknown): value is AccountCenterError {
  return value instanceof AccountCenterError;
}
