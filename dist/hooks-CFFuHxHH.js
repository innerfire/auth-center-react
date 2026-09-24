import { i as getAuthScopeId, n as isAccountCenterError, r as createAccountCenterAuthScope } from "./error-DD3Y3R35.js";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

//#region src/hooks/use-is-mobile.ts
/**
* Returns true when viewport width < 768 (mobile breakpoint).
* Updates reactively on resize.
*/
function useIsMobile() {
	const [mobile, setMobile] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.innerWidth < 768;
	});
	useEffect(() => {
		const mq = window.matchMedia("(max-width: 767px)");
		const handler = () => setMobile(mq.matches);
		handler();
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);
	return mobile;
}

//#endregion
//#region src/hooks/use-account.ts
const PROFILE_KEY = ["account-center", "profile"];
const adapterScope = /* @__PURE__ */ new WeakMap();
let adapterIdCounter = 0;
function getAdapterId(adapter) {
	let id = adapterScope.get(adapter);
	if (id === void 0) {
		id = adapterIdCounter++;
		adapterScope.set(adapter, id);
	}
	return id;
}
const defaultAuthScope = createAccountCenterAuthScope();
function resolveScope(adapter) {
	return adapter.getProfileAuthScope?.() ?? defaultAuthScope;
}
/**
* Return a stable, non-sensitive query key for the given adapter + scope.
*
* Key shape: [...PROFILE_KEY, adapterId, scopeId]
* Sensitive values (token, subject, email, hash) must NEVER enter a key.
*
* When no scope is provided, resolves via adapter.getProfileAuthScope?.()
* or falls back to the default internal scope.
*/
function getProfileKey(adapter, scope) {
	const adapterId = getAdapterId(adapter);
	const scopeId = getAuthScopeId(scope ?? resolveScope(adapter));
	return [
		...PROFILE_KEY,
		adapterId,
		scopeId
	];
}
/**
* Build a full exact key array for a given adapter + scopeId pair.
* Used for cleanup of old keys on adapter/scope change.
*/
function buildExactKey(adapter, scopeId) {
	const adapterId = getAdapterId(adapter);
	return [
		...PROFILE_KEY,
		adapterId,
		scopeId
	];
}
/**
* Cancel all in-flight profile queries (all adapters / scopes).
* Safe to call at any time.
*/
async function cancelAllProfileQueries(qc) {
	await qc.cancelQueries({ queryKey: PROFILE_KEY });
}
/**
* Remove all profile cache entries (all adapters / scopes).
* Safe to call at any time.
*/
function removeAllProfileCache(qc) {
	qc.removeQueries({ queryKey: PROFILE_KEY });
}
/**
* Decide whether to retry a failed profile query.
*
* Rules:
* - 401 (UNAUTHORIZED) never retries
* - Only retries when error.retryable === true AND failureCount < 2
* - Unknown errors (no .retryable) never retry
*
* @param failureCount - Number of previous retry attempts (0 = first failure)
* @param error - The error from the failed query
* @returns true if the query should be retried
*/
function shouldRetryProfileQuery(failureCount, error) {
	if (!isAccountCenterError(error)) return false;
	if (error.code === "UNAUTHORIZED") return false;
	return error.retryable === true && failureCount < 2;
}
/** Fetch the current user profile */
function useProfile(adapter) {
	const qc = useQueryClient();
	const scopeId = getAuthScopeId(resolveScope(adapter));
	const adapterId = getAdapterId(adapter);
	const queryKey = [
		...PROFILE_KEY,
		adapterId,
		scopeId
	];
	const prevAdapterRef = useRef(adapter);
	const prevScopeIdRef = useRef(scopeId);
	useEffect(() => {
		const prevAdapter = prevAdapterRef.current;
		const prevScopeId = prevScopeIdRef.current;
		if (prevAdapter !== adapter || prevScopeId !== scopeId) {
			const oldKey = buildExactKey(prevAdapter, prevScopeId);
			qc.cancelQueries({ queryKey: oldKey });
			qc.removeQueries({ queryKey: oldKey });
		}
		prevAdapterRef.current = adapter;
		prevScopeIdRef.current = scopeId;
	}, [
		adapter,
		scopeId,
		qc
	]);
	const query = useQuery({
		queryKey,
		queryFn: () => adapter.getProfile(),
		staleTime: adapter.hasExplicitAuthScope ? Infinity : 0,
		gcTime: adapter.hasExplicitAuthScope ? Infinity : 5 * 6e4,
		refetchOnMount: adapter.hasExplicitAuthScope ? false : true,
		refetchOnWindowFocus: adapter.hasExplicitAuthScope ? false : true,
		refetchOnReconnect: adapter.hasExplicitAuthScope ? false : true,
		retry: shouldRetryProfileQuery
	});
	const clearedUnauthorizedRef = useRef(false);
	useEffect(() => {
		if (query.error && isAccountCenterError(query.error) && query.error.code === "UNAUTHORIZED" && !clearedUnauthorizedRef.current) {
			clearedUnauthorizedRef.current = true;
			qc.removeQueries({ queryKey: PROFILE_KEY });
		}
		if (!query.error) clearedUnauthorizedRef.current = false;
	}, [query.error, qc]);
	return query;
}
/** Derive capabilities from the profile (they come in the same envelope) */
function useCapabilities(adapter) {
	const { data: profile } = useProfile(adapter);
	return {
		data: profile?.capabilities ?? {
			avatarUpload: false,
			passwordChange: false
		},
		isLoading: !profile
	};
}
/** PATCH nickname */
function usePatchProfile(adapter) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload) => adapter.patchProfile(payload),
		onMutate: () => {
			return { queryKey: getProfileKey(adapter, resolveScope(adapter)) };
		},
		onSuccess: (data, _variables, context) => {
			if (!context?.queryKey) return;
			const currentKey = getProfileKey(adapter);
			const capturedKey = context.queryKey;
			if (capturedKey.length === currentKey.length && capturedKey.every((v, i) => v === currentKey[i])) qc.setQueryData(capturedKey, data);
		}
	});
}
/** Upload avatar blob */
function useUploadAvatar(adapter) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (blob) => adapter.uploadAvatar(blob),
		onMutate: () => {
			return { queryKey: getProfileKey(adapter, resolveScope(adapter)) };
		},
		onSuccess: (data, _variables, context) => {
			if (!context?.queryKey) return;
			const currentKey = getProfileKey(adapter);
			const capturedKey = context.queryKey;
			if (capturedKey.length === currentKey.length && capturedKey.every((v, i) => v === currentKey[i])) qc.setQueryData(capturedKey, (old) => old ? {
				...old,
				avatarUrl: data.avatarUrl
			} : old);
		}
	});
}
/** Change password */
function useChangePassword(adapter) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload) => adapter.changePassword(payload),
		onSuccess: (result) => {
			if (result.ok && result.reauthRequired) qc.removeQueries({ queryKey: PROFILE_KEY });
		}
	});
}
/** Logout */
function useLogout(adapter) {
	const qc = useQueryClient();
	return useMutation({ mutationFn: async () => {
		await cancelAllProfileQueries(qc);
		removeAllProfileCache(qc);
		return adapter.logout();
	} });
}

//#endregion
export { shouldRetryProfileQuery as a, useLogout as c, useUploadAvatar as d, useIsMobile as f, removeAllProfileCache as i, usePatchProfile as l, cancelAllProfileQueries as n, useCapabilities as o, getProfileKey as r, useChangePassword as s, PROFILE_KEY as t, useProfile as u };
//# sourceMappingURL=hooks-CFFuHxHH.js.map