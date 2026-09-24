//#region src/auth-scope.ts
/** WeakMap from scope object → monotonic numeric ID */
const authScopeIds = /* @__PURE__ */ new WeakMap();
/** Monotonic counter for auth scope IDs */
let authScopeIdCounter = 0;
/**
* Get the numeric ID for an auth scope.
* @internal — used by hooks for query key construction.
*/
function getAuthScopeId(scope) {
	const id = authScopeIds.get(scope);
	if (id === void 0) throw new Error("Invalid auth scope: not created via createAccountCenterAuthScope()");
	return id;
}
/**
* Create an opaque auth scope object.
*
* Returns a frozen empty object with a unique numeric ID.
* The scope is used as a cache key and must not contain sensitive data.
* Each call produces a distinct scope (different identity).
*/
function createAccountCenterAuthScope() {
	const scope = Object.freeze({});
	authScopeIds.set(scope, authScopeIdCounter++);
	return scope;
}

//#endregion
//#region src/error.ts
/**
* Unified error class for account-center operations.
*
* All adapter implementations should throw errors that are either
* instances of this class or have compatible `.code` / `.retryable`
* properties (duck-typing).
*/
var AccountCenterError = class extends Error {
	constructor(opts) {
		super(opts.message);
		this.name = "AccountCenterError";
		this.code = opts.code;
		this.retryable = opts.retryable;
		this.status = opts.status;
	}
};
/**
* Type guard: check if a value is an AccountCenterError.
*
* Also returns true for GatewayProfileAdapterError (which has the same
* shape) to maintain backward compatibility.
*/
function isAccountCenterError(value) {
	return value instanceof AccountCenterError;
}

//#endregion
export { getAuthScopeId as i, isAccountCenterError as n, createAccountCenterAuthScope as r, AccountCenterError as t };
//# sourceMappingURL=error-DD3Y3R35.js.map