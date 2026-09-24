/**
 * Opaque auth scope (GENAIWDE-7).
 *
 * An AccountCenterAuthScope is a non-sensitive opaque token that identifies
 * the current authentication state. It is used to:
 * - Key profile query caches so scope changes immediately invalidate old data
 * - Deduplicate 401 onUnauthorized callbacks per scope
 *
 * Invariants:
 * - The brand type prevents accidental mixing with other object types.
 * - The WeakMap maps each scope object to a numeric ID for query keys.
 * - Sensitive values (token, subject, email, hash) must NEVER enter a key.
 * - Each scope is a frozen empty object — no data can be attached.
 */

// ─── Brand type ────────────────────────────────────────────────

declare const __accountCenterAuthScope: unique symbol;

/**
 * Opaque brand type for auth scope objects.
 * Created exclusively via {@link createAccountCenterAuthScope}.
 */
export type AccountCenterAuthScope = {
  readonly [__accountCenterAuthScope]: "AccountCenterAuthScope";
};

// ─── Internal ID mapping ───────────────────────────────────────

/** WeakMap from scope object → monotonic numeric ID */
const authScopeIds = new WeakMap<object, number>();

/** Monotonic counter for auth scope IDs */
let authScopeIdCounter = 0;

/**
 * Get the numeric ID for an auth scope.
 * @internal — used by hooks for query key construction.
 */
export function getAuthScopeId(scope: AccountCenterAuthScope): number {
  const id = authScopeIds.get(scope as unknown as object);
  if (id === undefined) {
    throw new Error("Invalid auth scope: not created via createAccountCenterAuthScope()");
  }
  return id;
}

// ─── Factory ───────────────────────────────────────────────────

/**
 * Create an opaque auth scope object.
 *
 * Returns a frozen empty object with a unique numeric ID.
 * The scope is used as a cache key and must not contain sensitive data.
 * Each call produces a distinct scope (different identity).
 */
export function createAccountCenterAuthScope(): AccountCenterAuthScope {
  const scope = Object.freeze({}) as AccountCenterAuthScope;
  authScopeIds.set(scope as unknown as object, authScopeIdCounter++);
  return scope;
}
