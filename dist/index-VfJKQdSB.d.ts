import { d as AccountCenterAuthScope, r as AccountProfile, s as LogoutResult, t as AccountCenterAdapter } from "./types-DN5cBx0E.js";
import React from "react";
import * as react_jsx_runtime0 from "react/jsx-runtime";

//#region src/spa/types.d.ts
interface AccountCenterTokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
}
interface AccountCenterCasdoorConfig {
  /** Public browser authorization endpoint, usually `${endpoint}/login/oauth/authorize`. */
  authorizationEndpoint: string;
  /** Explicitly allow a plain HTTP public authorization endpoint outside localhost. */
  allowInsecureHttp?: boolean;
  /** Same-origin rewrite for Casdoor's token endpoint. */
  tokenEndpoint: string;
  /** Public OAuth client id. Never configure a client secret in a SPA. */
  clientId: string;
  /** Casdoor owner segment used by this application's front-channel logout. */
  applicationOwner: string;
  /** Casdoor application name used by this application's front-channel logout. */
  applicationName: string;
  /**
   * Sign-in organization for a per-organization application.
   * When set, the authorize client id becomes `{clientId}-org-{organization}`.
   * Omit it to keep the original client id unchanged.
   */
  organization?: string;
  redirectUri: string;
  scopes?: string[];
}
interface AccountCenterGatewayConfig {
  /** Same-origin rewrite prefix, for example `/gateway`. */
  baseUrl: string;
  /** Optional RFC 8707 resource URI. Omit it when Casdoor client audiences are used directly. */
  resourceUri?: string;
}
interface AccountCenterRouteConfig {
  afterLogin?: string;
  afterLogout?: string;
}
interface AccountCenterSpaConfig {
  casdoor: AccountCenterCasdoorConfig;
  gateway: AccountCenterGatewayConfig;
  routes?: AccountCenterRouteConfig;
  storageKey?: string;
  capabilities?: AccountProfile["capabilities"];
  degradedReasons?: string[];
}
type AccountCenterAuthStatus = "hydrating" | "unauthenticated" | "authenticating" | "authenticated";
interface AccountCenterAuthApi {
  status: AccountCenterAuthStatus;
  login(redirectTo?: string): Promise<never>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  handleCallback(): Promise<boolean>;
}
//#endregion
//#region src/spa/provider.d.ts
interface AccountCenterProviderProps {
  config: AccountCenterSpaConfig;
  children: React.ReactNode;
}
declare function AccountCenterProvider({
  config,
  children
}: AccountCenterProviderProps): react_jsx_runtime0.JSX.Element;
declare function useAccountCenterAuth(): AccountCenterAuthApi;
declare function useOptionalAccountCenterAuth(): AccountCenterAuthApi | undefined;
declare function useAccountCenterAdapter(): AccountCenterAdapter;
declare function AccountCenterCallback(): null;
//#endregion
//#region src/spa/direct-gateway-adapter.d.ts
type LogoutReason = "logout" | "unauthorized";
interface DirectGatewayAdapterOptions {
  baseUrl: string;
  getAccessToken(): Promise<string>;
  clearTokens(): void;
  getAuthScope?: () => AccountCenterAuthScope;
  capabilities?: AccountProfile["capabilities"];
  degradedReasons?: string[];
  /** Trusted Casdoor public origin used to construct front-channel logout. */
  casdoorOrigin: string;
  /** Application-owned Casdoor logout path segments. */
  casdoorApplicationOwner: string;
  casdoorApplicationName: string;
  /** Same-origin route that Casdoor returns to after a successful logout. */
  afterLogoutPath?: string;
}
declare function createDirectGatewayAdapter(options: DirectGatewayAdapterOptions): AccountCenterAdapter & {
  logout(reason?: LogoutReason): Promise<LogoutResult>;
};
//#endregion
export { useAccountCenterAdapter as a, AccountCenterAuthApi as c, AccountCenterGatewayConfig as d, AccountCenterRouteConfig as f, AccountCenterProvider as i, AccountCenterAuthStatus as l, AccountCenterTokenSet as m, createDirectGatewayAdapter as n, useAccountCenterAuth as o, AccountCenterSpaConfig as p, AccountCenterCallback as r, useOptionalAccountCenterAuth as s, DirectGatewayAdapterOptions as t, AccountCenterCasdoorConfig as u };
//# sourceMappingURL=index-VfJKQdSB.d.ts.map