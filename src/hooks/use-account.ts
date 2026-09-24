import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import type {
  AccountCenterAdapter,
  AccountProfile,
  PasswordChangePayload,
  ProfilePatchPayload,
} from "../types";
import {
  createAccountCenterAuthScope,
  getAuthScopeId,
  type AccountCenterAuthScope,
} from "../auth-scope";
import { isAccountCenterError } from "../error";

// ─── Profile query key prefix ──────────────────────────────────

export const PROFILE_KEY = ["account-center", "profile"] as const;

// ─── Adapter scope (monotonic ID per adapter instance) ─────────

const adapterScope = new WeakMap<AccountCenterAdapter, number>();
let adapterIdCounter = 0;

function getAdapterId(adapter: AccountCenterAdapter): number {
  let id = adapterScope.get(adapter);
  if (id === undefined) {
    id = adapterIdCounter++;
    adapterScope.set(adapter, id);
  }
  return id;
}

// ─── Default auth scope (singleton for adapters without getProfileAuthScope) ──

const defaultAuthScope: AccountCenterAuthScope = createAccountCenterAuthScope();

// ─── Resolve current scope from adapter ────────────────────────

function resolveScope(adapter: AccountCenterAdapter): AccountCenterAuthScope {
  return adapter.getProfileAuthScope?.() ?? defaultAuthScope;
}

// ─── Query key construction ────────────────────────────────────

/**
 * Return a stable, non-sensitive query key for the given adapter + scope.
 *
 * Key shape: [...PROFILE_KEY, adapterId, scopeId]
 * Sensitive values (token, subject, email, hash) must NEVER enter a key.
 *
 * When no scope is provided, resolves via adapter.getProfileAuthScope?.()
 * or falls back to the default internal scope.
 */
export function getProfileKey(
  adapter: AccountCenterAdapter,
  scope?: AccountCenterAuthScope,
): readonly (string | number)[] {
  const adapterId = getAdapterId(adapter);
  const resolvedScope = scope ?? resolveScope(adapter);
  const scopeId = getAuthScopeId(resolvedScope);
  return [...PROFILE_KEY, adapterId, scopeId] as const;
}

/**
 * Build a full exact key array for a given adapter + scopeId pair.
 * Used for cleanup of old keys on adapter/scope change.
 */
function buildExactKey(
  adapter: AccountCenterAdapter,
  scopeId: number,
): readonly (string | number)[] {
  const adapterId = getAdapterId(adapter);
  return [...PROFILE_KEY, adapterId, scopeId] as const;
}

// ─── Cache helpers (GENAIWDE-7 §6) ────────────────────────────

/**
 * Cancel all in-flight profile queries (all adapters / scopes).
 * Safe to call at any time.
 */
export async function cancelAllProfileQueries(qc: QueryClient): Promise<void> {
  await qc.cancelQueries({ queryKey: PROFILE_KEY });
}

/**
 * Remove all profile cache entries (all adapters / scopes).
 * Safe to call at any time.
 */
export function removeAllProfileCache(qc: QueryClient): void {
  qc.removeQueries({ queryKey: PROFILE_KEY });
}

// ─── Retry logic (GENAIWDE-7 §5) ──────────────────────────────

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
export function shouldRetryProfileQuery(failureCount: number, error: unknown): boolean {
  if (!isAccountCenterError(error)) return false;

  // 401 never retries
  if (error.code === "UNAUTHORIZED") return false;

  // Only retry if retryable === true and failureCount < 2
  return error.retryable === true && failureCount < 2;
}

// ─── Hooks ─────────────────────────────────────────────────────

/** Fetch the current user profile */
export function useProfile(adapter: AccountCenterAdapter) {
  const qc = useQueryClient();

  // Resolve current scope on each render
  const scope = resolveScope(adapter);
  const scopeId = getAuthScopeId(scope);
  const adapterId = getAdapterId(adapter);
  const queryKey = [...PROFILE_KEY, adapterId, scopeId] as const;

  // §3: Track previous adapter + scope and clean up old exact key on change.
  //      Both adapter and scope changes are handled: cancel + remove the old key.
  const prevAdapterRef = useRef(adapter);
  const prevScopeIdRef = useRef(scopeId);
  useEffect(() => {
    const prevAdapter = prevAdapterRef.current;
    const prevScopeId = prevScopeIdRef.current;

    const adapterChanged = prevAdapter !== adapter;
    const scopeChanged = prevScopeId !== scopeId;

    if (adapterChanged || scopeChanged) {
      // Cancel and remove old exact key — no stale data from old adapter/scope
      const oldKey = buildExactKey(prevAdapter, prevScopeId);
      qc.cancelQueries({ queryKey: oldKey });
      qc.removeQueries({ queryKey: oldKey });
    }

    prevAdapterRef.current = adapter;
    prevScopeIdRef.current = scopeId;
  }, [adapter, scopeId, qc]);

  // The auth-scoped QueryClient is the package-level profile store.
  // An explicit scope guarantees that cache entries cannot cross principals,
  // so data remains fresh until a mutation updates it or auth/logout clears it.
  const staleTime = adapter.hasExplicitAuthScope ? Infinity : 0;

  const query = useQuery({
    queryKey,
    queryFn: () => adapter.getProfile(),
    staleTime,
    gcTime: adapter.hasExplicitAuthScope ? Infinity : 5 * 60_000,
    refetchOnMount: adapter.hasExplicitAuthScope ? false : true,
    refetchOnWindowFocus: adapter.hasExplicitAuthScope ? false : true,
    refetchOnReconnect: adapter.hasExplicitAuthScope ? false : true,
    retry: shouldRetryProfileQuery,
  });

  // GENAIWDE-7 §6: on401, clear all profile cache
  // Guard: only clear once per error to prevent refetch loops from removeQueries
  const clearedUnauthorizedRef = useRef(false);
  useEffect(() => {
    if (query.error && isAccountCenterError(query.error) && query.error.code === "UNAUTHORIZED" && !clearedUnauthorizedRef.current) {
      clearedUnauthorizedRef.current = true;
      qc.removeQueries({ queryKey: PROFILE_KEY });
    }
    if (!query.error) {
      clearedUnauthorizedRef.current = false;
    }
  }, [query.error, qc]);

  return query;
}

/** Derive capabilities from the profile (they come in the same envelope) */
export function useCapabilities(adapter: AccountCenterAdapter) {
  const { data: profile } = useProfile(adapter);
  return {
    data: profile?.capabilities ?? { avatarUpload: false, passwordChange: false },
    isLoading: !profile,
  };
}

/** PATCH nickname */
export function usePatchProfile(adapter: AccountCenterAdapter) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfilePatchPayload) => adapter.patchProfile(payload),
    // §2: Capture full query key at mutation start via onMutate context.
    //      onSuccess writes ONLY to the captured key (mutation-start scope).
    //      If scope changed by the time onSuccess fires, key won't match
    //      current scope → no cache write (avoids polluting new scope cache).
    onMutate: () => {
      const scope = resolveScope(adapter);
      return { queryKey: getProfileKey(adapter, scope) };
    },
    onSuccess: (data: AccountProfile, _variables, context) => {
      if (!context?.queryKey) return;
      // §2: Only write if captured key still matches current key.
      //      If scope has changed, captured key ≠ current key → skip write.
      const currentKey = getProfileKey(adapter);
      const capturedKey = context.queryKey;
      const keysMatch =
        capturedKey.length === currentKey.length &&
        capturedKey.every((v, i) => v === currentKey[i]);
      if (keysMatch) {
        qc.setQueryData(capturedKey, data);
      }
      // If scope changed → write nothing (no pollution of new scope cache)
    },
  });
}

/** Upload avatar blob */
export function useUploadAvatar(adapter: AccountCenterAdapter) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => adapter.uploadAvatar(blob),
    // §2: Same pattern as usePatchProfile — capture key at mutation start
    onMutate: () => {
      const scope = resolveScope(adapter);
      return { queryKey: getProfileKey(adapter, scope) };
    },
    onSuccess: (data: { avatarUrl: string }, _variables, context) => {
      if (!context?.queryKey) return;
      // §2: Only write if captured key still matches current key
      const currentKey = getProfileKey(adapter);
      const capturedKey = context.queryKey;
      const keysMatch =
        capturedKey.length === currentKey.length &&
        capturedKey.every((v, i) => v === currentKey[i]);
      if (keysMatch) {
        qc.setQueryData(capturedKey, (old: AccountProfile | undefined) =>
          old ? { ...old, avatarUrl: data.avatarUrl } : old,
        );
      }
      // If scope changed → write nothing
    },
  });
}

/** Change password */
export function useChangePassword(adapter: AccountCenterAdapter) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PasswordChangePayload) => adapter.changePassword(payload),
    onSuccess: (result) => {
      // GENAIWDE-7 §6: success + reauthRequired → clear all profile cache
      if (result.ok && result.reauthRequired) {
        qc.removeQueries({ queryKey: PROFILE_KEY });
      }
    },
  });
}

/** Logout */
export function useLogout(adapter: AccountCenterAdapter) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // GENAIWDE-7 §6: clear all profile cache BEFORE request (fail no restore)
      await cancelAllProfileQueries(qc);
      removeAllProfileCache(qc);
      return adapter.logout();
    },
  });
}
