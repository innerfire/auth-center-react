// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountCenterProvider, useAccountCenterAuth } from "../spa/provider";

function LogoutButton() {
  const { logout } = useAccountCenterAuth();
  return <button type="button" onClick={() => void logout()}>logout</button>;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("AccountCenterProvider unauthorized termination", () => {
  it("prefers the Gateway logout URL for unauthorized termination", async () => {
    const replace = vi.fn();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:3000", replace, assign },
    });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      redirectUrl: "https://casdoor.example.com/cas/server-owner/server-app/logout",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <AccountCenterProvider config={{
        casdoor: {
          authorizationEndpoint: "https://casdoor.example.com/login/oauth/authorize",
          tokenEndpoint: "/casdoor-spa/token",
          clientId: "public-client",
          applicationOwner: "built-in",
          applicationName: "genaiw-app",
          redirectUri: "http://localhost:3000/login/callback",
        },
        gateway: { baseUrl: "/gateway" },
        routes: { afterLogout: "/login" },
        storageKey: "provider-unauthorized-test",
      }}>
        <div>child</div>
      </AccountCenterProvider>,
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith(
      "https://casdoor.example.com/cas/server-owner/server-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dunauthorized%26auto%3D0",
    ));
    expect(fetchMock).toHaveBeenCalledWith("/gateway/v1/auth/logout", expect.objectContaining({
      method: "POST",
    }));
    expect(assign).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.length).toBeGreaterThan(0));
    view.unmount();
  });

  it("announces explicit exit and completes local logout when no token is available", async () => {
    const replace = vi.fn();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:3000", replace, assign },
    });
    const exitStarted = vi.fn();
    window.addEventListener("auth:exit-start", exitStarted, { once: true });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      remoteLogout: "browser_required",
      localLogoutRequired: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccountCenterProvider config={{
        casdoor: {
          authorizationEndpoint: "https://casdoor.example.com/login/oauth/authorize",
          tokenEndpoint: "/casdoor-spa/token",
          clientId: "public-client",
          applicationOwner: "built-in",
          applicationName: "genaiw-app",
          redirectUri: "http://localhost:3000/login/callback",
        },
        gateway: { baseUrl: "/gateway" },
        routes: { afterLogout: "/login" },
        storageKey: "provider-explicit-logout-test",
      }}>
        <LogoutButton />
      </AccountCenterProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(
      "https://casdoor.example.com/cas/built-in/genaiw-app/logout?service=http%3A%2F%2Flocalhost%3A3000%2Flogin%3Freason%3Dlogout%26auto%3D0",
    ));
    expect(exitStarted).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/gateway/v1/auth/logout", expect.objectContaining({
      method: "POST",
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }));
  });
});
