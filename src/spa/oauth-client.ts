import type { AccountCenterAuthStore } from "./auth-store";
import type { AccountCenterCasdoorConfig, AccountCenterTokenSet } from "./types";

interface PendingAuthorization {
  state: string;
  verifier: string;
  redirectTo: string;
  createdAt: number;
}

interface OAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

const PENDING_TTL = 10 * 60_000;

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function parseTokenResponse(body: OAuthTokenResponse, previousRefreshToken?: string): AccountCenterTokenSet {
  if (typeof body.access_token !== "string" || !body.access_token.trim()) {
    throw new Error("Casdoor returned an invalid access token response");
  }
  const expiresIn = typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
    ? Math.max(0, body.expires_in)
    : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : previousRefreshToken,
    idToken: typeof body.id_token === "string" ? body.id_token : undefined,
    tokenType: typeof body.token_type === "string" ? body.token_type : "Bearer",
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof body.scope === "string" ? body.scope : undefined,
  };
}

async function readTokenResponse(response: Response, previousRefreshToken?: string): Promise<AccountCenterTokenSet> {
  if (!response.ok) throw new Error("Casdoor token exchange failed");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Casdoor returned an invalid token response");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Casdoor returned an invalid token response");
  }
  return parseTokenResponse(body as OAuthTokenResponse, previousRefreshToken);
}

export class AccountCenterOAuthClient {
  private readonly pendingKey: string;
  private callbackPromise: Promise<boolean> | null = null;
  private loginPromise: Promise<never> | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    private readonly config: AccountCenterCasdoorConfig,
    private readonly resourceUri: string | undefined,
    private readonly store: AccountCenterAuthStore,
    storageKey: string,
  ) {
    this.pendingKey = `${storageKey}:pkce`;
  }

  login(redirectTo = "/"): Promise<never> {
    if (!this.loginPromise) {
      this.loginPromise = this.startLogin(redirectTo).catch((error) => {
        this.loginPromise = null;
        throw error;
      });
    }
    return this.loginPromise;
  }

  private async startLogin(redirectTo: string): Promise<never> {
    if (typeof window === "undefined") throw new Error("Login requires a browser environment");
    const verifier = randomBase64Url(64);
    const state = randomBase64Url(32);
    const challenge = await sha256Base64Url(verifier);
    const pending: PendingAuthorization = {
      state,
      verifier,
      redirectTo: redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/",
      createdAt: Date.now(),
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
    authorizeUrl.searchParams.set("scope", (this.config.scopes ?? ["openid", "profile", "email"]).join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    window.location.assign(authorizeUrl.toString());
    return await new Promise<never>(() => undefined);
  }

  handleCallback(): Promise<boolean> {
    if (!this.callbackPromise) this.callbackPromise = this.processCallback();
    return this.callbackPromise;
  }

  private async processCallback(): Promise<boolean> {
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

    let pending: PendingAuthorization;
    try {
      pending = JSON.parse(rawPending) as PendingAuthorization;
    } catch {
      throw new Error("Invalid OAuth login state");
    }
    if (
      pending.state !== returnedState
      || typeof pending.verifier !== "string"
      || Date.now() - pending.createdAt > PENDING_TTL
    ) {
      throw new Error("Invalid or expired OAuth login state");
    }

    this.store.getState().setStatus("authenticating");
    try {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: pending.verifier,
      });
      const resourceUri = this.resourceUri?.trim();
      if (resourceUri) form.set("resource", resourceUri);
      const response = await fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form,
        credentials: "same-origin",
        cache: "no-store",
      });
      const tokens = await readTokenResponse(response);
      this.store.getState().setTokens(tokens);
      window.location.replace(pending.redirectTo);
      return true;
    } catch (error) {
      this.store.getState().clearTokens();
      throw error;
    }
  }

  async getAccessToken(): Promise<string> {
    const tokens = this.store.getState().tokens;
    if (!tokens) throw new Error("Authentication required");
    if (tokens.expiresAt - 30_000 > Date.now()) return tokens.accessToken;
    if (!tokens.refreshToken) {
      this.store.getState().clearTokens();
      throw new Error("Authentication expired");
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh(tokens.refreshToken).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  clear(): void {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(this.pendingKey);
    this.store.getState().clearTokens();
  }

  private async refresh(refreshToken: string): Promise<string> {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });
    const resourceUri = this.resourceUri?.trim();
    if (resourceUri) form.set("resource", resourceUri);
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form,
        credentials: "same-origin",
        cache: "no-store",
      });
      const tokens = await readTokenResponse(response, refreshToken);
      this.store.getState().setTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      this.store.getState().clearTokens();
      throw error;
    }
  }
}
