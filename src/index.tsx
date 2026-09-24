"use client";

/**
 * @innerfire/auth-center-react — public API surface.
 *
 * Usage:
 *   import { AccountCenter, createDefaultAdapter } from "@innerfire/auth-center-react";
 *
 *   const adapter = createDefaultAdapter(fetch);
 *   <AccountCenter adapter={adapter} themeColor="#0075de" avatarSize={32} />
 */

// ─── Types ──────────────────────────────────────────────────────
export type {
  AccountProfile,
  PasswordChangePayload,
  PasswordChangeResult,
  ProfilePatchPayload,
  AccountCenterAdapter,
  AccountCenterProps,
} from "./types";

// ─── Auth scope (GENAIWDE-7) ──────────────────────────────────
export type { AccountCenterAuthScope } from "./auth-scope";
export { createAccountCenterAuthScope } from "./auth-scope";

// ─── Error (GENAIWDE-7) ───────────────────────────────────────
export { AccountCenterError, isAccountCenterError } from "./error";

// ─── Components ─────────────────────────────────────────────────
export { AccountCenter, AvatarImage } from "./components";
export {
  AccountCenterProvider,
  AccountCenterCallback,
  useAccountCenterAuth,
  useOptionalAccountCenterAuth,
  useAccountCenterAdapter,
  createDirectGatewayAdapter,
} from "./spa";
export type {
  AccountCenterAuthApi,
  AccountCenterAuthStatus,
  AccountCenterCasdoorConfig,
  AccountCenterGatewayConfig,
  AccountCenterRouteConfig,
  AccountCenterSpaConfig,
  AccountCenterTokenSet,
  DirectGatewayAdapterOptions,
} from "./spa";

// ─── Adapter ────────────────────────────────────────────────────
export { createDefaultAdapter } from "./adapters";
export type { DefaultAdapterOptions } from "./adapters";

// ─── Gateway Profile (GENAIWDE-5) ──────────────────────────────
// Public: safe combined entry + result/error types.
// Raw decoder, raw mapper, and CapabilityMetadata are intentionally
// not exported — callers must use `decodeGatewayProfile`.
export type { GatewayProfilePatch } from "./gateway-profile";
export {
  GatewayProfileError,
  decodeGatewayProfile,
} from "./gateway-profile";

// ─── Gateway Profile Adapter (GENAIWDE-6) ──────────────────────
// Public: factory + error class + options type.
// Raw decoder/mapper are intentionally not exported.
export {
  createGatewayProfileAdapter,
  GatewayProfileAdapterError,
} from "./adapters/gateway-profile-adapter";
export type { GatewayProfileAdapterOptions } from "./adapters/gateway-profile-adapter";

// ─── Hooks ──────────────────────────────────────────────────────
export {
  useProfile,
  useCapabilities,
  usePatchProfile,
  useUploadAvatar,
  useChangePassword,
  useLogout,
  useIsMobile,
  getProfileKey,
  shouldRetryProfileQuery,
  cancelAllProfileQueries,
  removeAllProfileCache,
} from "./hooks";

// ─── Utils ──────────────────────────────────────────────────────
export {
  validateNickname,
  validatePasswordChange,
  validateAvatarFile,
  AVATAR_PLACEHOLDER,
} from "./utils";
