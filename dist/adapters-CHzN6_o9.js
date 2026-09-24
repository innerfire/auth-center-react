import { r as createAccountCenterAuthScope, t as AccountCenterError } from "./error-DD3Y3R35.js";
import { n as decodeGatewayProfile, t as GatewayProfileError } from "./gateway-profile-DwyoIRxY.js";

//#region src/adapters/default-adapter.ts
var AccountApiError = class extends AccountCenterError {
	constructor(code, message, retryable = false, status) {
		super({
			code,
			message,
			retryable,
			status
		});
		this.name = "AccountApiError";
	}
};
/**
* Classify a numeric status into a fixed code and retryable flag.
* Never exposes upstream text or body — safe fixed messages only.
*/
function classifyDefaultStatus(status) {
	switch (status) {
		case 401: return {
			code: "UNAUTHORIZED",
			message: "Authentication required",
			retryable: false
		};
		case 403: return {
			code: "FORBIDDEN",
			message: "Access denied",
			retryable: false
		};
		case 404: return {
			code: "NOT_FOUND",
			message: "Resource not found",
			retryable: false
		};
		case 422: return {
			code: "INVALID_REQUEST",
			message: "Request was invalid",
			retryable: false
		};
		case 429: return {
			code: "RATE_LIMITED",
			message: "Too many requests",
			retryable: true
		};
		default:
			if (status >= 500 && status <= 599) return {
				code: "UPSTREAM_ERROR",
				message: "Server returned an unexpected response",
				retryable: true
			};
			return {
				code: "UPSTREAM_ERROR",
				message: "Server returned an unexpected response",
				retryable: false
			};
	}
}
const UNAUTHORIZED_BFF_CODE = "UNAUTHENTICATED";
async function unwrapEnvelope(fetchFn, url, init) {
	let res;
	try {
		res = await fetchFn(url, init);
	} catch {
		throw new AccountApiError("NETWORK", "Network request failed", true);
	}
	let body;
	try {
		body = await res.json();
	} catch {
		const classified = classifyDefaultStatus(res.status);
		throw new AccountApiError(classified.code, classified.message, classified.retryable, res.status);
	}
	const envelope = body;
	if (envelope && typeof envelope === "object" && "error" in envelope) {
		const raw = envelope.error;
		if (raw.code === UNAUTHORIZED_BFF_CODE || res.status === 401) throw new AccountApiError("UNAUTHORIZED", "Authentication required", false, 401);
		const classified = classifyDefaultStatus(res.status);
		throw new AccountApiError(raw.code, classified.message, raw.retryable, res.status);
	}
	if (!res.ok) {
		const classified = classifyDefaultStatus(res.status);
		throw new AccountApiError(res.status === 401 ? "UNAUTHORIZED" : "UPSTREAM", classified.message, classified.retryable, res.status);
	}
	if (envelope && typeof envelope === "object" && "data" in envelope) return envelope.data;
	return envelope;
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
function createDefaultAdapter(fetchFn, options) {
	const internalDefaultScope = createAccountCenterAuthScope();
	const resolveAuthScope = options?.getAuthScope ?? (() => internalDefaultScope);
	return {
		getProfile: () => unwrapEnvelope(fetchFn, "/api/account/profile"),
		getProfileAuthScope: () => resolveAuthScope(),
		hasExplicitAuthScope: Boolean(options?.getAuthScope),
		patchProfile: (payload) => unwrapEnvelope(fetchFn, "/api/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		}),
		uploadAvatar: async (blob) => {
			const form = new FormData();
			form.append("file", blob, "avatar.jpg");
			return unwrapEnvelope(fetchFn, "/api/account/avatar", {
				method: "POST",
				body: form
			});
		},
		changePassword: (payload) => unwrapEnvelope(fetchFn, "/api/account/password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		}),
		logout: async () => {
			try {
				return await unwrapEnvelope(fetchFn, "/api/account/logout", { method: "POST" });
			} catch {
				return { logoutUrl: "/api/casdoor/logout" };
			}
		}
	};
}

//#endregion
//#region src/adapters/gateway-profile-adapter.ts
var GatewayProfileAdapterError = class extends AccountCenterError {
	constructor(opts) {
		super(opts);
		this.name = "GatewayProfileAdapterError";
	}
};
const PROFILE_PATH = "/gateway/v1/auth/profile";
/**
* Classify an HTTP status code into a fixed error code and retryability.
* Fixed security messages — never exposes body/statusText/URL.
*/
function classifyStatusError(status) {
	switch (status) {
		case 401: return {
			code: "UNAUTHORIZED",
			message: "Gateway authentication failed",
			retryable: false
		};
		case 403: return {
			code: "FORBIDDEN",
			message: "Access to the requested resource is denied",
			retryable: false
		};
		case 404: return {
			code: "NOT_FOUND",
			message: "The requested resource was not found",
			retryable: false
		};
		case 422: return {
			code: "INVALID_REQUEST",
			message: "The request was invalid",
			retryable: false
		};
		case 429: return {
			code: "RATE_LIMITED",
			message: "Too many requests",
			retryable: true
		};
		default:
			if (status >= 500 && status <= 599) return {
				code: "UPSTREAM_ERROR",
				message: "Gateway returned an unexpected response",
				retryable: true
			};
			return {
				code: "UPSTREAM_ERROR",
				message: "Gateway returned an unexpected response",
				retryable: false
			};
	}
}
/**
* Create an AccountCenterAdapter that reads profiles from the Gateway
* and delegates all writes to the legacy adapter.
*/
function createGatewayProfileAdapter(options) {
	const { fetchFn, getAccessToken, legacyAdapter, profileMetadata, onUnauthorized } = options;
	const internalDefaultScope = createAccountCenterAuthScope();
	const resolveAuthScope = options.getAuthScope ?? (() => internalDefaultScope);
	const snapshotMetadata = {
		capabilities: { ...profileMetadata.capabilities },
		degradedReasons: [...profileMetadata.degradedReasons]
	};
	const notifiedScopes = /* @__PURE__ */ new WeakSet();
	async function fetchProfile() {
		const requestScope = resolveAuthScope();
		let rawToken;
		try {
			rawToken = await getAccessToken();
		} catch {
			throw new GatewayProfileAdapterError({
				code: "TOKEN_ERROR",
				message: "Unable to obtain access token",
				retryable: false
			});
		}
		if (typeof rawToken !== "string" || rawToken.trim().length === 0) throw new GatewayProfileAdapterError({
			code: "TOKEN_MISSING",
			message: "Access token is missing or empty",
			retryable: false
		});
		if (resolveAuthScope() !== requestScope) throw new GatewayProfileAdapterError({
			code: "AUTH_SCOPE_CHANGED",
			message: "Auth scope changed during token acquisition",
			retryable: false
		});
		const token = rawToken;
		let response;
		try {
			response = await fetchFn(PROFILE_PATH, {
				method: "GET",
				headers: { Authorization: `Bearer ${token}` },
				credentials: "omit",
				cache: "no-store"
			});
		} catch {
			throw new GatewayProfileAdapterError({
				code: "NETWORK_ERROR",
				message: "Network request to Gateway failed",
				retryable: true
			});
		}
		if (resolveAuthScope() !== requestScope) throw new GatewayProfileAdapterError({
			code: "AUTH_SCOPE_CHANGED",
			message: "Auth scope changed before response was processed",
			retryable: false
		});
		if (!response.ok) {
			const classified = classifyStatusError(response.status);
			if (response.status === 401) {
				if (resolveAuthScope() === requestScope && !notifiedScopes.has(requestScope)) {
					notifiedScopes.add(requestScope);
					if (onUnauthorized) try {
						const result = onUnauthorized();
						Promise.resolve(result).catch(() => {});
					} catch {}
				}
			}
			throw new GatewayProfileAdapterError({
				code: classified.code,
				message: classified.message,
				retryable: classified.retryable,
				status: response.status
			});
		}
		if (((response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "") !== "application/json") throw new GatewayProfileAdapterError({
			code: "INVALID_RESPONSE",
			message: "Gateway returned a non-JSON response",
			retryable: false
		});
		let body;
		try {
			body = await response.json();
		} catch {
			throw new GatewayProfileAdapterError({
				code: "MALFORMED_JSON",
				message: "Gateway response could not be parsed as JSON",
				retryable: false
			});
		}
		let patch;
		try {
			patch = decodeGatewayProfile(body);
		} catch (err) {
			if (err instanceof GatewayProfileError) throw new GatewayProfileAdapterError({
				code: "INVALID_GATEWAY_PROFILE",
				message: "Gateway profile data is malformed",
				retryable: false
			});
			throw new GatewayProfileAdapterError({
				code: "INVALID_GATEWAY_PROFILE",
				message: "Gateway profile data is malformed",
				retryable: false
			});
		}
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
			degradedReasons: snapshotMetadata.degradedReasons
		};
	}
	return {
		getProfile: fetchProfile,
		getProfileAuthScope: () => resolveAuthScope(),
		hasExplicitAuthScope: options.getAuthScope !== void 0,
		patchProfile: async (...args) => {
			const legacyResult = await legacyAdapter.patchProfile(...args);
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
				degradedReasons: snapshotMetadata.degradedReasons
			};
		},
		uploadAvatar: (...args) => legacyAdapter.uploadAvatar(...args),
		changePassword: (...args) => legacyAdapter.changePassword(...args),
		logout: (...args) => legacyAdapter.logout(...args)
	};
}

//#endregion
export { createGatewayProfileAdapter as n, createDefaultAdapter as r, GatewayProfileAdapterError as t };
//# sourceMappingURL=adapters-CHzN6_o9.js.map