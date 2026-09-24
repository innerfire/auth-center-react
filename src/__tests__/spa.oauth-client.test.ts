// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountCenterAuthStore } from "../spa/auth-store";
import { AccountCenterOAuthClient } from "../spa/oauth-client";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  await vi.waitFor(() => expect(localStorage.length).toBeGreaterThan(0));
  vi.unstubAllGlobals();
});

function createClient(resourceUri?: string, organization?: string) {
  const store = createAccountCenterAuthStore(`oauth-test-${crypto.randomUUID()}`);
  const client = new AccountCenterOAuthClient({
    authorizationEndpoint: "https://casdoor.example.com/login/oauth/authorize",
    tokenEndpoint: "/casdoor-spa/api/login/oauth/access_token",
    clientId: "public-client",
    applicationOwner: "built-in",
    applicationName: "genaiw-app",
    redirectUri: `${window.location.origin}/login/callback`,
    ...(organization ? { organization } : {}),
  }, resourceUri, store, "oauth-test");
  return { store, client };
}

function mockLocationAssign() {
  const assign = vi.fn();
  const current = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: current.origin,
      href: current.href,
      pathname: current.pathname,
      assign,
      replace: vi.fn(),
    },
  });
  return { assign, restore: () => {
    Object.defineProperty(window, "location", { configurable: true, value: current });
  } };
}

describe("AccountCenterOAuthClient", () => {
  it("pins a configured sign-in organization onto the authorize URL", async () => {
    const location = mockLocationAssign();
    try {
      const { client } = createClient(undefined, "org-a");

      void client.login("/chat/agent-1");

      await vi.waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
      const url = new URL(location.assign.mock.calls[0]?.[0] as string);
      expect(url.searchParams.get("client_id")).toBe("public-client-org-org-a");
      expect(url.searchParams.has("organization")).toBe(false);
    } finally {
      location.restore();
    }
  });

  it("leaves the authorize URL organization unset for a shared application", async () => {
    const location = mockLocationAssign();
    try {
      const { client } = createClient();

      void client.login("/");

      await vi.waitFor(() => expect(location.assign).toHaveBeenCalledOnce());
      const url = new URL(location.assign.mock.calls[0]?.[0] as string);
      expect(url.searchParams.get("client_id")).toBe("public-client");
      expect(url.searchParams.has("organization")).toBe(false);
    } finally {
      location.restore();
    }
  });

  it("coalesces React StrictMode callback effects into one token exchange", async () => {
    const { store, client } = createClient();
    window.history.replaceState({}, "", "/login/callback?code=valid-code&state=valid-state");
    sessionStorage.setItem("oauth-test:pkce", JSON.stringify({
      state: "valid-state",
      verifier: "pkce-verifier",
      redirectTo: "/",
      createdAt: Date.now(),
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "callback-token",
      refresh_token: "callback-refresh",
      expires_in: 3600,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.all([client.handleCallback(), client.handleCallback()]))
      .resolves.toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("resource")).toBeNull();
    expect(store.getState().tokens?.accessToken).toBe("callback-token");
  });

  it("returns a still-valid access token without a network request", async () => {
    const { store, client } = createClient();
    store.getState().setTokens({
      accessToken: "valid-token",
      refreshToken: "refresh",
      tokenType: "Bearer",
      expiresAt: Date.now() + 120_000,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.getAccessToken()).resolves.toBe("valid-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired token once and persists the rotated token set", async () => {
    const { store, client } = createClient();
    store.getState().setTokens({
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      expiresAt: Date.now() - 1,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-token",
      refresh_token: "new-refresh",
      token_type: "Bearer",
      expires_in: 3600,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.all([client.getAccessToken(), client.getAccessToken()]))
      .resolves.toEqual(["new-token", "new-token"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("resource")).toBeNull();
    expect(body.get("client_secret")).toBeNull();
    expect(store.getState().tokens?.refreshToken).toBe("new-refresh");
  });

  it("sends the optional resource URI when explicitly configured", async () => {
    const { client } = createClient("urn:innerfire:platform-gateway");
    window.history.replaceState({}, "", "/login/callback?code=valid-code&state=valid-state");
    sessionStorage.setItem("oauth-test:pkce", JSON.stringify({
      state: "valid-state",
      verifier: "pkce-verifier",
      redirectTo: "/",
      createdAt: Date.now(),
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "callback-token",
      expires_in: 3600,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.handleCallback()).resolves.toBe(true);
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("resource")).toBe("urn:innerfire:platform-gateway");
  });

  it("clears authentication when refresh fails", async () => {
    const { store, client } = createClient();
    store.getState().setTokens({
      accessToken: "expired-token",
      refreshToken: "bad-refresh",
      tokenType: "Bearer",
      expiresAt: Date.now() - 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));

    await expect(client.getAccessToken()).rejects.toThrow("token exchange failed");
    expect(store.getState().tokens).toBeNull();
    expect(store.getState().status).toBe("unauthenticated");
  });
});
