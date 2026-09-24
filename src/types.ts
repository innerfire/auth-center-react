/**
 * @innerfire/auth-center-react — public types & adapter interface.
 *
 * The package is framework-agnostic at its core: all network & auth
 * behaviour is injected through the adapter so the consumer (apps/app)
 * keeps full control of credentials and routing.
 *
 * BFF envelope:
 *   Success → { data: T }
 *   Error   → { error: { code, message, retryable } }
 */

// ─── BFF Envelope ───────────────────────────────────────────────────
export interface ApiEnvelopeSuccess<T> {
  data: T;
}

export interface ApiEnvelopeError {
  error: { code: string; message: string; retryable: boolean };
}

export type ApiEnvelope<T> = ApiEnvelopeSuccess<T> | ApiEnvelopeError;

// ─── Profile ────────────────────────────────────────────────────
export interface AccountProfile {
  /** Casdoor subject / user-id (optional for Gateway profile compatibility) */
  subject?: string;
  /** Read-only login name from the Gateway profile DTO. */
  username?: string;
  /** Display nickname; maps to Gateway displayName. */
  nickname: string | null;
  /** Editable first name. */
  firstName?: string;
  /** Editable last name. */
  lastName?: string;
  /** Editable biography. */
  bio?: string;
  /** Editable email address. */
  email?: string;
  /** Editable phone number. */
  phone?: string;
  /** Read-only organization identifier. */
  organization?: string;
  /** Absolute avatar URL — null when unset */
  avatarUrl: string | null;
  /** Capability flags from server */
  capabilities: {
    avatarUpload: boolean;
    passwordChange: boolean;
  };
  /** Reasons the UI should hide certain features */
  degradedReasons: string[];
}

// ─── Password change request ────────────────────────────────────────
export interface PasswordChangePayload {
  oldPassword: string;
  newPassword: string;
}

export interface PasswordChangeResult {
  ok: boolean;
  /** When true the caller MUST clear local auth state & redirect to login */
  reauthRequired?: boolean;
  message?: string;
}

// ─── Profile patch request ──────────────────────────────────────────
export interface ProfilePatchPayload {
  nickname?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  email?: string;
  phone?: string;
}

// ─── Logout result ──────────────────────────────────────────────────
export interface LogoutResult {
  logoutUrl: string;
}

// ─── Auth scope (GENAIWDE-7) ────────────────────────────────────
import type { AccountCenterAuthScope } from "./auth-scope";

// ─── Adapter contract ───────────────────────────────────────────────
export interface AccountCenterAdapter {
  /** Read the authenticated user's profile. */
  getProfile(): Promise<AccountProfile>;

  /**
   * Optional lifecycle hook: return the current auth scope.
   * Used by hooks to key profile queries by auth state.
   * When omitted, hooks use a default internal scope.
   */
  getProfileAuthScope?: () => AccountCenterAuthScope;

  /**
   * Capability marker: true when the adapter has an explicit,
   * externally-provided auth scope that the host controls.
   *
   * When present and true, the profile query uses staleTime=5min.
   * When absent or false, staleTime=0 to avoid stale static cache.
   *
   * This is a data marker, not a function — no guessing about
   * internal behavior. The default adapter marks this when the
   * host provides a scope via options.
   */
  readonly hasExplicitAuthScope?: boolean;

  /** Apply an allowed partial profile update. */
  patchProfile(payload: ProfilePatchPayload): Promise<AccountProfile>;

  /** Upload a JPEG/PNG avatar. */
  uploadAvatar(blob: Blob): Promise<{ avatarUrl: string }>;

  /** Change the current user's password. */
  changePassword(payload: PasswordChangePayload): Promise<PasswordChangeResult>;

  /** End the account session and return the browser logout destination. */
  logout(): Promise<LogoutResult>;
}

// ─── Visual props (public surface — NO className / style / slot) ────
export interface AccountCenterProps {
  /** Theme / accent colour forwarded to the trigger avatar ring */
  themeColor?: string;
  /** Diameter of the trigger avatar in px (default 32) */
  avatarSize?: number;
  /** Injected adapter. When omitted the component uses its built-in default. */
  adapter?: AccountCenterAdapter;

  /**
   * Optional opaque auth scope for the default adapter.
   *
   * When provided AND no `adapter` prop is given, the built-in default
   * adapter uses this scope for cache keying and auth-aware behaviour.
   * Must be created via `createAccountCenterAuthScope()` — raw strings,
   * tokens, subjects, or plain objects are NOT accepted.
   *
   * Documented safety rule:
   *   When the host switches the authenticated user/subject,
   *   it MUST rotate (destroy + recreate) this scope object.
   */
  authScope?: AccountCenterAuthScope;
}
