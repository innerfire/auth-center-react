import { c as PasswordChangePayload, d as AccountCenterAuthScope, l as PasswordChangeResult, n as AccountCenterProps, r as AccountProfile, s as LogoutResult, t as AccountCenterAdapter, u as ProfilePatchPayload } from "./types-DN5cBx0E.js";
import * as react_jsx_runtime1 from "react/jsx-runtime";
import * as _tanstack_react_query0 from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";

//#region src/components/account-center.d.ts
declare function AccountCenter({
  themeColor,
  avatarSize,
  adapter: injectedAdapter,
  authScope
}: AccountCenterProps): react_jsx_runtime1.JSX.Element;
//#endregion
//#region src/components/avatar-image.d.ts
interface AvatarImageProps {
  src?: string | null;
  size?: number;
  themeColor?: string;
  className?: string;
}
declare function AvatarImage({
  src,
  size,
  themeColor,
  className
}: AvatarImageProps): react_jsx_runtime1.JSX.Element;
//#endregion
//#region src/hooks/use-account.d.ts
declare const PROFILE_KEY: readonly ["account-center", "profile"];
/**
 * Return a stable, non-sensitive query key for the given adapter + scope.
 *
 * Key shape: [...PROFILE_KEY, adapterId, scopeId]
 * Sensitive values (token, subject, email, hash) must NEVER enter a key.
 *
 * When no scope is provided, resolves via adapter.getProfileAuthScope?.()
 * or falls back to the default internal scope.
 */
declare function getProfileKey(adapter: AccountCenterAdapter, scope?: AccountCenterAuthScope): readonly (string | number)[];
/**
 * Cancel all in-flight profile queries (all adapters / scopes).
 * Safe to call at any time.
 */
declare function cancelAllProfileQueries(qc: QueryClient): Promise<void>;
/**
 * Remove all profile cache entries (all adapters / scopes).
 * Safe to call at any time.
 */
declare function removeAllProfileCache(qc: QueryClient): void;
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
declare function shouldRetryProfileQuery(failureCount: number, error: unknown): boolean;
/** Fetch the current user profile */
declare function useProfile(adapter: AccountCenterAdapter): _tanstack_react_query0.UseQueryResult<AccountProfile, unknown>;
/** Derive capabilities from the profile (they come in the same envelope) */
declare function useCapabilities(adapter: AccountCenterAdapter): {
  data: {
    avatarUpload: boolean;
    passwordChange: boolean;
  };
  isLoading: boolean;
};
/** PATCH nickname */
declare function usePatchProfile(adapter: AccountCenterAdapter): _tanstack_react_query0.UseMutationResult<AccountProfile, Error, ProfilePatchPayload, {
  queryKey: readonly (string | number)[];
}>;
/** Upload avatar blob */
declare function useUploadAvatar(adapter: AccountCenterAdapter): _tanstack_react_query0.UseMutationResult<{
  avatarUrl: string;
}, Error, Blob, {
  queryKey: readonly (string | number)[];
}>;
/** Change password */
declare function useChangePassword(adapter: AccountCenterAdapter): _tanstack_react_query0.UseMutationResult<PasswordChangeResult, Error, PasswordChangePayload, unknown>;
/** Logout */
declare function useLogout(adapter: AccountCenterAdapter): _tanstack_react_query0.UseMutationResult<LogoutResult, Error, void, unknown>;
//#endregion
//#region src/hooks/use-is-mobile.d.ts
/**
 * Returns true when viewport width < 768 (mobile breakpoint).
 * Updates reactively on resize.
 */
declare function useIsMobile(): boolean;
//#endregion
export { removeAllProfileCache as a, useChangePassword as c, useProfile as d, useUploadAvatar as f, getProfileKey as i, useLogout as l, AccountCenter as m, PROFILE_KEY as n, shouldRetryProfileQuery as o, AvatarImage as p, cancelAllProfileQueries as r, useCapabilities as s, useIsMobile as t, usePatchProfile as u };
//# sourceMappingURL=index-Dlfo2Wc9.d.ts.map