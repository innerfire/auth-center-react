import type { AccountProfile } from "../types";

export interface AccountCenterTokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
}

export interface AccountCenterCasdoorConfig {
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

export interface AccountCenterGatewayConfig {
  /** Same-origin rewrite prefix, for example `/gateway`. */
  baseUrl: string;
  /** Optional RFC 8707 resource URI. Omit it when Casdoor client audiences are used directly. */
  resourceUri?: string;
}

export interface AccountCenterRouteConfig {
  afterLogin?: string;
  afterLogout?: string;
}

export interface AccountCenterSpaConfig {
  casdoor: AccountCenterCasdoorConfig;
  gateway: AccountCenterGatewayConfig;
  routes?: AccountCenterRouteConfig;
  storageKey?: string;
  capabilities?: AccountProfile["capabilities"];
  degradedReasons?: string[];
}

export type AccountCenterAuthStatus =
  | "hydrating"
  | "unauthenticated"
  | "authenticating"
  | "authenticated";

export interface AccountCenterAuthApi {
  status: AccountCenterAuthStatus;
  login(redirectTo?: string): Promise<never>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string>;
  handleCallback(): Promise<boolean>;
}
