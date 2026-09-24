// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDirectGatewayAdapter } from "../spa/direct-gateway-adapter";

const PROFILE = {
  username: "alice",
  displayName: "Alice",
  firstName: "",
  lastName: "",
  bio: "",
  avatar: "https://cdn.example.com/avatar.png",
  email: "alice@example.com",
  phone: "",
  organization: "org",
};

afterEach(() => vi.unstubAllGlobals());

describe("DirectGatewayAdapter", () => {
  it("reads a Gateway profile with a Bearer token through the rewrite prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(PROFILE), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: vi.fn().mockResolvedValue("access-token"),
      clearTokens: vi.fn(),
      capabilities: { avatarUpload: true, passwordChange: true },
    });

    await expect(adapter.getProfile()).resolves.toMatchObject({
      username: "alice",
      nickname: "Alice",
      email: "alice@example.com",
    });
    expect(fetchMock).toHaveBeenCalledWith("/gateway/v1/auth/profile", expect.objectContaining({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
    }));
  });

  it("maps nickname to displayName and never sends read-only fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(PROFILE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "token",
      clearTokens: vi.fn(),
    });

    await adapter.patchProfile({ nickname: "New Name", email: "new@example.com" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: "New Name",
      email: "new@example.com",
    });
  });

  it("clears persisted tokens on a Gateway 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const clearTokens = vi.fn();
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized, { once: true });
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "expired",
      clearTokens,
    });

    await expect(adapter.getProfile()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(clearTokens).toHaveBeenCalledOnce();
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("accepts only 204 for password success and lets the reauth flow perform logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const clearTokens = vi.fn();
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "token",
      clearTokens,
    });

    await expect(adapter.changePassword({ oldPassword: "old", newPassword: "new" }))
      .resolves.toEqual({ ok: true, reauthRequired: true });
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it("falls back to the app-owned Casdoor application when Gateway omits redirectUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      remoteLogout: "completed",
      localLogoutRequired: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const clearTokens = vi.fn();
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "admin",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "access-token",
      clearTokens,
    });

    await expect(adapter.logout()).resolves.toEqual({
      logoutUrl: "https://casdoor.example.com/cas/admin/genaiw-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dlogout%26auto%3D0",
    });
    expect(fetchMock).toHaveBeenCalledWith("/gateway/v1/auth/logout", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
    }));
    expect(clearTokens).toHaveBeenCalledOnce();
  });

  it("prefers a valid Gateway redirectUrl and appends the current-origin login service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      redirectUrl: "https://casdoor.example.com/cas/server-owner/server-app/logout",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const clearTokens = vi.fn();
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "fallback-owner",
      casdoorApplicationName: "fallback-app",
      getAccessToken: async () => "access-token",
      clearTokens,
    });

    await expect(adapter.logout()).resolves.toEqual({
      logoutUrl: "https://casdoor.example.com/cas/server-owner/server-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dlogout%26auto%3D0",
    });
    expect(clearTokens).toHaveBeenCalledOnce();
  });

  it("falls back when Gateway returns an untrusted redirectUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      redirectUrl: "https://evil.example/cas/admin/genaiw-app/logout",
    })));
    const clearTokens = vi.fn();
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "access-token",
      clearTokens,
    });

    await expect(adapter.logout()).resolves.toEqual({
      logoutUrl: "https://casdoor.example.com/cas/built-in/genaiw-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dlogout%26auto%3D0",
    });
    expect(clearTokens).toHaveBeenCalledOnce();
  });

  it("clears the local session without emitting another unauthorized event when remote logout returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const clearTokens = vi.fn();
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized, { once: true });
    const adapter = createDirectGatewayAdapter({
      baseUrl: "/gateway",
      casdoorOrigin: "https://casdoor.example.com",
      casdoorApplicationOwner: "built-in",
      casdoorApplicationName: "genaiw-app",
      getAccessToken: async () => "invalid-token",
      clearTokens,
    });

    await expect(adapter.logout()).resolves.toEqual({
      logoutUrl: "https://casdoor.example.com/cas/built-in/genaiw-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dlogout%26auto%3D0",
    });
    expect(clearTokens).toHaveBeenCalledOnce();
    expect(unauthorized).not.toHaveBeenCalled();
  });
});
