import { r as createAccountCenterAuthScope, t as AccountCenterError } from "./error-DD3Y3R35.js";
import { n as decodeGatewayProfile } from "./gateway-profile-DwyoIRxY.js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { jsx } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";

//#region src/spa/encrypted-storage.ts
const DATABASE_NAME = "account-center-vault";
const DATABASE_VERSION = 1;
const KEY_STORE = "keys";
const CIPHER_PREFIX = "account-center:cipher:";
const keyPromises = /* @__PURE__ */ new Map();
function bytesToBase64(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
function base64ToBytes(value) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}
function openVault() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(KEY_STORE)) request.result.createObjectStore(KEY_STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(/* @__PURE__ */ new Error("Unable to open the account token vault"));
	});
}
async function readKey(database, keyName) {
	return new Promise((resolve, reject) => {
		const request = database.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get(keyName);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(/* @__PURE__ */ new Error("Unable to read the account token key"));
	});
}
async function writeKey(database, keyName, key) {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(KEY_STORE, "readwrite");
		transaction.objectStore(KEY_STORE).put(key, keyName);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(/* @__PURE__ */ new Error("Unable to persist the account token key"));
	});
}
async function loadEncryptionKey(keyName) {
	const database = await openVault();
	try {
		const existing = await readKey(database, keyName);
		if (existing) return existing;
		const created = await crypto.subtle.generateKey({
			name: "AES-GCM",
			length: 256
		}, false, ["encrypt", "decrypt"]);
		await writeKey(database, keyName, created);
		return created;
	} finally {
		database.close();
	}
}
function getEncryptionKey(keyName) {
	const existing = keyPromises.get(keyName);
	if (existing) return existing;
	const pending = loadEncryptionKey(keyName).catch((error) => {
		keyPromises.delete(keyName);
		throw error;
	});
	keyPromises.set(keyName, pending);
	return pending;
}
/**
* Zustand StateStorage backed by AES-GCM ciphertext in localStorage.
* The non-extractable AES key is stored separately as a CryptoKey in IndexedDB.
* This protects tokens at rest, but cannot protect them from executing XSS.
*/
function createEncryptedStateStorage(vaultName) {
	const storageKey = `${CIPHER_PREFIX}${vaultName}`;
	let writeChain = Promise.resolve();
	return {
		async getItem() {
			if (typeof window === "undefined") return null;
			const serialized = window.localStorage.getItem(storageKey);
			if (!serialized) return null;
			try {
				const record = JSON.parse(serialized);
				if (record.version !== 1) return null;
				const key = await getEncryptionKey(vaultName);
				const plaintext = await crypto.subtle.decrypt({
					name: "AES-GCM",
					iv: base64ToBytes(record.iv)
				}, key, base64ToBytes(record.ciphertext));
				return new TextDecoder().decode(plaintext);
			} catch {
				if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
				return null;
			}
		},
		async setItem(_name, value) {
			if (typeof window === "undefined") return;
			writeChain = writeChain.catch(() => void 0).then(async () => {
				const key = await getEncryptionKey(vaultName);
				const iv = crypto.getRandomValues(new Uint8Array(12));
				const ciphertext = await crypto.subtle.encrypt({
					name: "AES-GCM",
					iv
				}, key, new TextEncoder().encode(value));
				const record = {
					version: 1,
					iv: bytesToBase64(iv),
					ciphertext: bytesToBase64(new Uint8Array(ciphertext))
				};
				window.localStorage.setItem(storageKey, JSON.stringify(record));
			});
			await writeChain;
		},
		async removeItem() {
			writeChain = writeChain.catch(() => void 0).then(() => {
				if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
			});
			await writeChain;
		}
	};
}

//#endregion
//#region src/spa/auth-store.ts
function createAccountCenterAuthStore(storageKey) {
	return createStore()(persist((set) => ({
		status: "hydrating",
		tokens: null,
		setStatus: (status) => set({ status }),
		setTokens: (tokens) => set({
			tokens,
			status: "authenticated"
		}),
		clearTokens: () => set({
			tokens: null,
			status: "unauthenticated"
		}),
		finishHydration: () => set((state) => ({
			status: state.tokens && (state.tokens.expiresAt > Date.now() || state.tokens.refreshToken) ? "authenticated" : "unauthenticated",
			tokens: state.tokens && (state.tokens.expiresAt > Date.now() || state.tokens.refreshToken) ? state.tokens : null
		}))
	}), {
		name: storageKey,
		storage: createJSONStorage(() => createEncryptedStateStorage(storageKey)),
		partialize: (state) => ({ tokens: state.tokens }),
		onRehydrateStorage: (initialState) => (rehydratedState) => {
			(rehydratedState ?? initialState).finishHydration();
		}
	}));
}

//#endregion
//#region src/spa/config.ts
function isSafeCasdoorPathSegment(value) {
	return value.trim() === value && value !== "" && value !== "." && value !== ".." && !/[\\/?#\u0000-\u001f\u007f]/u.test(value);
}
function validateAccountCenterSpaConfig(config) {
	const authorization = new URL(config.casdoor.authorizationEndpoint);
	const callback = new URL(config.casdoor.redirectUri);
	if (!config.casdoor.clientId.trim()) throw new Error("account-center casdoor.clientId is required");
	if (!isSafeCasdoorPathSegment(config.casdoor.applicationOwner)) throw new Error("account-center casdoor.applicationOwner must be a safe path segment");
	if (!isSafeCasdoorPathSegment(config.casdoor.applicationName)) throw new Error("account-center casdoor.applicationName must be a safe path segment");
	if (config.casdoor.organization !== void 0 && !isSafeCasdoorPathSegment(config.casdoor.organization)) throw new Error("account-center casdoor.organization must be a safe path segment");
	const resourceUri = config.gateway.resourceUri?.trim();
	if (resourceUri) {
		if (new URL(resourceUri).hash) throw new Error("account-center gateway.resourceUri must not contain a fragment");
	}
	if (!config.casdoor.tokenEndpoint.startsWith("/")) throw new Error("account-center casdoor.tokenEndpoint must use a same-origin rewrite path");
	if (!config.gateway.baseUrl.startsWith("/")) throw new Error("account-center gateway.baseUrl must use a same-origin rewrite path");
	const afterLogout = config.routes?.afterLogout ?? "/login";
	if (!afterLogout.startsWith("/") || afterLogout.startsWith("//")) throw new Error("account-center routes.afterLogout must be a same-origin path");
	if (authorization.protocol !== "https:") {
		if (authorization.protocol !== "http:") throw new Error("account-center authorizationEndpoint must use HTTP or HTTPS");
		if (authorization.hostname !== "localhost" && !config.casdoor.allowInsecureHttp) throw new Error("account-center authorizationEndpoint must use HTTPS outside localhost");
	}
	if (callback.protocol !== "https:" && callback.hostname !== "localhost" && !callback.hostname.endsWith(".localhost")) throw new Error("account-center redirectUri must use HTTPS outside localhost");
}

//#endregion
//#region src/spa/direct-gateway-adapter.ts
function joinUrl(baseUrl, path) {
	return `${baseUrl.replace(/\/+$/u, "")}/${path.replace(/^\/+/, "")}`;
}
function profileFromGateway(body, capabilities, degradedReasons) {
	const patch = decodeGatewayProfile(body);
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
		capabilities,
		degradedReasons
	};
}
function errorCodeForStatus(status) {
	if (status === 401) return "UNAUTHORIZED";
	if (status === 403) return "FORBIDDEN";
	if (status === 404) return "NOT_FOUND";
	if (status === 413) return "PAYLOAD_TOO_LARGE";
	if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
	if (status === 422) return "FAILED_PRECONDITION";
	if (status === 429) return "RATE_LIMITED";
	if (status >= 500) return "UPSTREAM_ERROR";
	return "INVALID_REQUEST";
}
function buildCasdoorLogoutUrl(casdoorOrigin, applicationOwner, applicationName, afterLogoutPath, reason = "logout") {
	if (typeof window === "undefined") throw new AccountCenterError({
		code: "BROWSER_REQUIRED",
		message: "退出操作需要浏览器环境",
		retryable: false
	});
	const logoutUrl = new URL(`/cas/${encodeURIComponent(applicationOwner)}/${encodeURIComponent(applicationName)}/logout`, casdoorOrigin);
	const serviceUrl = new URL(afterLogoutPath, window.location.origin);
	serviceUrl.searchParams.set("reason", reason);
	serviceUrl.searchParams.set("auto", "0");
	logoutUrl.searchParams.set("service", serviceUrl.toString());
	return logoutUrl.toString();
}
function buildGatewayLogoutUrl(body, casdoorOrigin, afterLogoutPath, reason) {
	const redirectUrl = body?.redirectUrl;
	if (typeof redirectUrl !== "string") return void 0;
	let logoutUrl;
	try {
		logoutUrl = new URL(redirectUrl);
	} catch {
		return;
	}
	if (logoutUrl.origin !== casdoorOrigin || logoutUrl.search !== "" || logoutUrl.hash !== "" || !/^\/cas\/[^/?#]+\/[^/?#]+\/logout$/u.test(logoutUrl.pathname) || /%2f|%5c/iu.test(logoutUrl.pathname)) return;
	const serviceUrl = new URL(afterLogoutPath, window.location.origin);
	serviceUrl.searchParams.set("reason", reason);
	serviceUrl.searchParams.set("auto", "0");
	logoutUrl.searchParams.set("service", serviceUrl.toString());
	return logoutUrl.toString();
}
async function gatewayError(response) {
	let upstreamCode;
	try {
		const body = await response.json();
		if (typeof body.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(body.code)) upstreamCode = body.code;
	} catch {}
	const code = upstreamCode ?? errorCodeForStatus(response.status);
	const uncertainPasswordResult = response.status === 502 || response.status === 504;
	return new AccountCenterError({
		code,
		message: uncertainPasswordResult ? "请求结果不确定，请勿自动重试" : "账户服务请求失败",
		retryable: !uncertainPasswordResult && (response.status === 429 || response.status === 503),
		status: response.status
	});
}
function createDirectGatewayAdapter(options) {
	const capabilities = Object.freeze({
		avatarUpload: options.capabilities?.avatarUpload ?? false,
		passwordChange: options.capabilities?.passwordChange ?? true
	});
	const degradedReasons = Object.freeze([...options.degradedReasons ?? []]);
	const fallbackScope = createAccountCenterAuthScope();
	async function request(path, init, notifyUnauthorized = true, allowMissingToken = false) {
		let accessToken;
		try {
			accessToken = await options.getAccessToken();
		} catch (error) {
			if (!allowMissingToken) throw error;
		}
		let response;
		try {
			response = await fetch(joinUrl(options.baseUrl, path), {
				...init,
				headers: {
					Accept: "application/json",
					...init.headers,
					...accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
				},
				credentials: "omit",
				cache: "no-store"
			});
		} catch {
			throw new AccountCenterError({
				code: "NETWORK",
				message: "账户服务网络请求失败",
				retryable: true
			});
		}
		if (response.status === 401 && notifyUnauthorized) {
			if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth:unauthorized"));
			options.clearTokens();
		}
		if (!response.ok) throw await gatewayError(response);
		return response;
	}
	async function readProfile(response) {
		let body;
		try {
			body = await response.json();
		} catch {
			throw new AccountCenterError({
				code: "INVALID_RESPONSE",
				message: "账户服务返回了无效资料",
				retryable: false
			});
		}
		try {
			return profileFromGateway(body, capabilities, [...degradedReasons]);
		} catch {
			throw new AccountCenterError({
				code: "INVALID_RESPONSE",
				message: "账户服务返回了无效资料",
				retryable: false
			});
		}
	}
	return {
		getProfileAuthScope: () => options.getAuthScope?.() ?? fallbackScope,
		hasExplicitAuthScope: options.getAuthScope !== void 0,
		async getProfile() {
			return readProfile(await request("/v1/auth/profile", { method: "GET" }));
		},
		async patchProfile(payload) {
			const gatewayPayload = {};
			if (payload.nickname !== void 0) gatewayPayload.displayName = payload.nickname;
			if (payload.firstName !== void 0) gatewayPayload.firstName = payload.firstName;
			if (payload.lastName !== void 0) gatewayPayload.lastName = payload.lastName;
			if (payload.bio !== void 0) gatewayPayload.bio = payload.bio;
			if (payload.email !== void 0) gatewayPayload.email = payload.email;
			if (payload.phone !== void 0) gatewayPayload.phone = payload.phone;
			return readProfile(await request("/v1/auth/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(gatewayPayload)
			}));
		},
		async uploadAvatar(blob) {
			const formData = new FormData();
			formData.append("file", blob, blob.type === "image/png" ? "avatar.png" : "avatar.jpg");
			return { avatarUrl: (await readProfile(await request("/v1/auth/avatar", {
				method: "POST",
				body: formData
			}))).avatarUrl ?? "" };
		},
		async changePassword(payload) {
			if ((await request("/v1/auth/password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			})).status !== 204) throw new AccountCenterError({
				code: "INVALID_RESPONSE",
				message: "密码服务返回了无效响应",
				retryable: false
			});
			return {
				ok: true,
				reauthRequired: true
			};
		},
		async logout(reason = "logout") {
			const fallbackLogoutUrl = buildCasdoorLogoutUrl(options.casdoorOrigin, options.casdoorApplicationOwner, options.casdoorApplicationName, options.afterLogoutPath ?? "/login", reason);
			let logoutUrl = fallbackLogoutUrl;
			try {
				logoutUrl = buildGatewayLogoutUrl(await (await request("/v1/auth/logout", { method: "POST" }, false, true)).json(), options.casdoorOrigin, options.afterLogoutPath ?? "/login", reason) ?? fallbackLogoutUrl;
			} catch {} finally {
				options.clearTokens();
			}
			return { logoutUrl };
		}
	};
}

//#endregion
//#region src/spa/oauth-client.ts
const PENDING_TTL = 10 * 6e4;
function randomBase64Url(byteLength) {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
async function sha256Base64Url(value) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	let binary = "";
	for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
function parseTokenResponse(body, previousRefreshToken) {
	if (typeof body.access_token !== "string" || !body.access_token.trim()) throw new Error("Casdoor returned an invalid access token response");
	const expiresIn = typeof body.expires_in === "number" && Number.isFinite(body.expires_in) ? Math.max(0, body.expires_in) : 3600;
	return {
		accessToken: body.access_token,
		refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : previousRefreshToken,
		idToken: typeof body.id_token === "string" ? body.id_token : void 0,
		tokenType: typeof body.token_type === "string" ? body.token_type : "Bearer",
		expiresAt: Date.now() + expiresIn * 1e3,
		scope: typeof body.scope === "string" ? body.scope : void 0
	};
}
async function readTokenResponse(response, previousRefreshToken) {
	if (!response.ok) throw new Error("Casdoor token exchange failed");
	let body;
	try {
		body = await response.json();
	} catch {
		throw new Error("Casdoor returned an invalid token response");
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Casdoor returned an invalid token response");
	return parseTokenResponse(body, previousRefreshToken);
}
var AccountCenterOAuthClient = class {
	constructor(config, resourceUri, store, storageKey) {
		this.config = config;
		this.resourceUri = resourceUri;
		this.store = store;
		this.callbackPromise = null;
		this.loginPromise = null;
		this.refreshPromise = null;
		this.pendingKey = `${storageKey}:pkce`;
	}
	login(redirectTo = "/") {
		if (!this.loginPromise) this.loginPromise = this.startLogin(redirectTo).catch((error) => {
			this.loginPromise = null;
			throw error;
		});
		return this.loginPromise;
	}
	async startLogin(redirectTo) {
		if (typeof window === "undefined") throw new Error("Login requires a browser environment");
		const verifier = randomBase64Url(64);
		const state = randomBase64Url(32);
		const challenge = await sha256Base64Url(verifier);
		const pending = {
			state,
			verifier,
			redirectTo: redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/",
			createdAt: Date.now()
		};
		window.sessionStorage.setItem(this.pendingKey, JSON.stringify(pending));
		const authorizeUrl = new URL(this.config.authorizationEndpoint);
		const organization = this.config.organization?.trim();
		const clientId = organization ? `${this.config.clientId}-org-${organization}` : this.config.clientId;
		authorizeUrl.searchParams.set("client_id", clientId);
		const resourceUri = this.resourceUri?.trim();
		if (resourceUri) authorizeUrl.searchParams.set("resource", resourceUri);
		authorizeUrl.searchParams.set("response_type", "code");
		authorizeUrl.searchParams.set("redirect_uri", this.config.redirectUri);
		authorizeUrl.searchParams.set("scope", (this.config.scopes ?? [
			"openid",
			"profile",
			"email"
		]).join(" "));
		authorizeUrl.searchParams.set("state", state);
		authorizeUrl.searchParams.set("code_challenge", challenge);
		authorizeUrl.searchParams.set("code_challenge_method", "S256");
		window.location.assign(authorizeUrl.toString());
		return await new Promise(() => void 0);
	}
	handleCallback() {
		if (!this.callbackPromise) this.callbackPromise = this.processCallback();
		return this.callbackPromise;
	}
	async processCallback() {
		if (typeof window === "undefined") return false;
		const callback = new URL(this.config.redirectUri);
		if (window.location.origin !== callback.origin || window.location.pathname !== callback.pathname) return false;
		const current = new URL(window.location.href);
		const code = current.searchParams.get("code");
		const returnedState = current.searchParams.get("state");
		if (!code || !returnedState) return false;
		const rawPending = window.sessionStorage.getItem(this.pendingKey);
		window.sessionStorage.removeItem(this.pendingKey);
		if (!rawPending) throw new Error("Missing OAuth login state");
		let pending;
		try {
			pending = JSON.parse(rawPending);
		} catch {
			throw new Error("Invalid OAuth login state");
		}
		if (pending.state !== returnedState || typeof pending.verifier !== "string" || Date.now() - pending.createdAt > PENDING_TTL) throw new Error("Invalid or expired OAuth login state");
		this.store.getState().setStatus("authenticating");
		try {
			const form = new URLSearchParams({
				grant_type: "authorization_code",
				client_id: this.config.clientId,
				code,
				redirect_uri: this.config.redirectUri,
				code_verifier: pending.verifier
			});
			const resourceUri = this.resourceUri?.trim();
			if (resourceUri) form.set("resource", resourceUri);
			const tokens = await readTokenResponse(await fetch(this.config.tokenEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json"
				},
				body: form,
				credentials: "same-origin",
				cache: "no-store"
			}));
			this.store.getState().setTokens(tokens);
			window.location.replace(pending.redirectTo);
			return true;
		} catch (error) {
			this.store.getState().clearTokens();
			throw error;
		}
	}
	async getAccessToken() {
		const tokens = this.store.getState().tokens;
		if (!tokens) throw new Error("Authentication required");
		if (tokens.expiresAt - 3e4 > Date.now()) return tokens.accessToken;
		if (!tokens.refreshToken) {
			this.store.getState().clearTokens();
			throw new Error("Authentication expired");
		}
		if (!this.refreshPromise) this.refreshPromise = this.refresh(tokens.refreshToken).finally(() => {
			this.refreshPromise = null;
		});
		return this.refreshPromise;
	}
	clear() {
		if (typeof window !== "undefined") window.sessionStorage.removeItem(this.pendingKey);
		this.store.getState().clearTokens();
	}
	async refresh(refreshToken) {
		const form = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: this.config.clientId,
			refresh_token: refreshToken
		});
		const resourceUri = this.resourceUri?.trim();
		if (resourceUri) form.set("resource", resourceUri);
		try {
			const tokens = await readTokenResponse(await fetch(this.config.tokenEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json"
				},
				body: form,
				credentials: "same-origin",
				cache: "no-store"
			}), refreshToken);
			this.store.getState().setTokens(tokens);
			return tokens.accessToken;
		} catch (error) {
			this.store.getState().clearTokens();
			throw error;
		}
	}
};

//#endregion
//#region src/spa/provider.tsx
const AccountCenterSpaContext = createContext(null);
function localExitPath(afterLogout, reason) {
	const url = new URL(afterLogout, window.location.origin);
	url.searchParams.set("reason", reason);
	url.searchParams.set("auto", "0");
	return `${url.pathname}${url.search}${url.hash}`;
}
function AccountCenterProvider({ config, children }) {
	const [resources] = useState(() => {
		validateAccountCenterSpaConfig(config);
		const storageKey = config.storageKey ?? `account-center:${config.casdoor.clientId}`;
		const store = createAccountCenterAuthStore(storageKey);
		const oauth = new AccountCenterOAuthClient(config.casdoor, config.gateway.resourceUri, store, storageKey);
		let authScope = createAccountCenterAuthScope();
		return {
			store,
			oauth,
			adapter: createDirectGatewayAdapter({
				baseUrl: config.gateway.baseUrl,
				getAccessToken: () => oauth.getAccessToken(),
				clearTokens: () => oauth.clear(),
				getAuthScope: () => authScope,
				capabilities: config.capabilities,
				degradedReasons: config.degradedReasons,
				casdoorOrigin: new URL(config.casdoor.authorizationEndpoint).origin,
				casdoorApplicationOwner: config.casdoor.applicationOwner,
				casdoorApplicationName: config.casdoor.applicationName,
				afterLogoutPath: config.routes?.afterLogout ?? "/login"
			}),
			rotateScope: () => {
				authScope = createAccountCenterAuthScope();
			},
			queryClient: new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
		};
	});
	const status = useStore(resources.store, (state) => state.status);
	const previousTokenRef = useRef(resources.store.getState().tokens?.accessToken);
	const unauthorizedLogoutRef = useRef(false);
	useEffect(() => resources.store.subscribe((state) => {
		const accessToken = state.tokens?.accessToken;
		if (previousTokenRef.current !== accessToken) {
			previousTokenRef.current = accessToken;
			resources.rotateScope();
			resources.queryClient.clear();
		}
	}), [resources]);
	const login = useCallback((redirectTo) => resources.oauth.login(redirectTo ?? config.routes?.afterLogin ?? "/"), [config.routes?.afterLogin, resources.oauth]);
	const handleCallback = useCallback(() => resources.oauth.handleCallback(), [resources.oauth]);
	const getAccessToken = useCallback(() => resources.oauth.getAccessToken(), [resources.oauth]);
	const logout = useCallback(async () => {
		if (typeof window === "undefined") return;
		window.dispatchEvent(new CustomEvent("auth:exit-start", { detail: { reason: "logout" } }));
		let destination = localExitPath(config.routes?.afterLogout ?? "/login", "logout");
		try {
			destination = (await resources.adapter.logout()).logoutUrl || destination;
		} catch {
			resources.oauth.clear();
		} finally {
			window.location.assign(destination);
		}
	}, [
		config.routes?.afterLogout,
		resources.adapter,
		resources.oauth
	]);
	useEffect(() => {
		const handleUnauthorized = () => {
			if (unauthorizedLogoutRef.current) return;
			unauthorizedLogoutRef.current = true;
			window.dispatchEvent(new CustomEvent("auth:exit-start", { detail: { reason: "unauthorized" } }));
			let destination = localExitPath(config.routes?.afterLogout ?? "/login", "unauthorized");
			resources.adapter.logout("unauthorized").then((result) => {
				destination = result.logoutUrl || destination;
			}).catch(() => {
				try {
					destination = buildCasdoorLogoutUrl(new URL(config.casdoor.authorizationEndpoint).origin, config.casdoor.applicationOwner, config.casdoor.applicationName, config.routes?.afterLogout ?? "/login", "unauthorized");
				} catch {}
			}).finally(() => {
				resources.oauth.clear();
				window.location.replace(destination);
			});
		};
		window.addEventListener("auth:unauthorized", handleUnauthorized);
		return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
	}, [
		config.casdoor.applicationName,
		config.casdoor.applicationOwner,
		config.casdoor.authorizationEndpoint,
		config.routes?.afterLogout,
		resources.oauth
	]);
	const value = useMemo(() => ({
		adapter: resources.adapter,
		status,
		login,
		logout,
		handleCallback,
		getAccessToken
	}), [
		getAccessToken,
		handleCallback,
		login,
		logout,
		resources.adapter,
		status
	]);
	return /* @__PURE__ */ jsx(AccountCenterSpaContext.Provider, {
		value,
		children: /* @__PURE__ */ jsx(QueryClientProvider, {
			client: resources.queryClient,
			children
		})
	});
}
function useAccountCenterAuth() {
	const value = useContext(AccountCenterSpaContext);
	if (!value) throw new Error("useAccountCenterAuth must be used inside AccountCenterProvider");
	return value;
}
function useOptionalAccountCenterAuth() {
	return useContext(AccountCenterSpaContext) ?? void 0;
}
function useAccountCenterAdapter() {
	const value = useContext(AccountCenterSpaContext);
	if (!value) throw new Error("useAccountCenterAdapter must be used inside AccountCenterProvider");
	return value.adapter;
}
function useOptionalAccountCenterAdapter() {
	return useContext(AccountCenterSpaContext)?.adapter;
}
function AccountCenterCallback() {
	const { handleCallback } = useAccountCenterAuth();
	useEffect(() => {
		handleCallback().catch(() => {
			window.location.replace("/login?error=oauth_callback_failed");
		});
	}, [handleCallback]);
	return null;
}

//#endregion
export { useOptionalAccountCenterAdapter as a, useAccountCenterAuth as i, AccountCenterProvider as n, useOptionalAccountCenterAuth as o, useAccountCenterAdapter as r, createDirectGatewayAdapter as s, AccountCenterCallback as t };
//# sourceMappingURL=spa-Dz2OhLwA.js.map