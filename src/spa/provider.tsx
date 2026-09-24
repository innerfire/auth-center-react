"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStore } from "zustand";
import { createAccountCenterAuthScope, type AccountCenterAuthScope } from "../auth-scope";
import type { AccountCenterAdapter } from "../types";
import { createAccountCenterAuthStore } from "./auth-store";
import { validateAccountCenterSpaConfig } from "./config";
import { buildCasdoorLogoutUrl, createDirectGatewayAdapter } from "./direct-gateway-adapter";
import { AccountCenterOAuthClient } from "./oauth-client";
import type { AccountCenterAuthApi, AccountCenterSpaConfig } from "./types";

interface AccountCenterSpaContextValue extends AccountCenterAuthApi {
  adapter: AccountCenterAdapter;
}

const AccountCenterSpaContext = createContext<AccountCenterSpaContextValue | null>(null);

function localExitPath(afterLogout: string, reason: "logout" | "unauthorized"): string {
  const url = new URL(afterLogout, window.location.origin);
  url.searchParams.set("reason", reason);
  url.searchParams.set("auto", "0");
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface AccountCenterProviderProps {
  config: AccountCenterSpaConfig;
  children: React.ReactNode;
}

export function AccountCenterProvider({ config, children }: AccountCenterProviderProps) {
  const [resources] = useState(() => {
    validateAccountCenterSpaConfig(config);
    const storageKey = config.storageKey ?? `account-center:${config.casdoor.clientId}`;
    const store = createAccountCenterAuthStore(storageKey);
    const oauth = new AccountCenterOAuthClient(config.casdoor, config.gateway.resourceUri, store, storageKey);
    let authScope: AccountCenterAuthScope = createAccountCenterAuthScope();
    const adapter = createDirectGatewayAdapter({
      baseUrl: config.gateway.baseUrl,
      getAccessToken: () => oauth.getAccessToken(),
      clearTokens: () => oauth.clear(),
      getAuthScope: () => authScope,
      capabilities: config.capabilities,
      degradedReasons: config.degradedReasons,
      casdoorOrigin: new URL(config.casdoor.authorizationEndpoint).origin,
      casdoorApplicationOwner: config.casdoor.applicationOwner,
      casdoorApplicationName: config.casdoor.applicationName,
      afterLogoutPath: config.routes?.afterLogout ?? "/login",
    });
    return {
      store,
      oauth,
      adapter,
      rotateScope: () => { authScope = createAccountCenterAuthScope(); },
      queryClient: new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
    };
  });
  const status = useStore(resources.store, (state) => state.status);
  const previousTokenRef = useRef(resources.store.getState().tokens?.accessToken);
  const unauthorizedLogoutRef = useRef(false);

  useEffect(() => resources.store.subscribe((state) => {
    const accessToken = state.tokens?.accessToken;
    if (previousTokenRef.current !== accessToken) {
      previousTokenRef.current = accessToken;
      resources.rotateScope();
      resources.queryClient.clear();
    }
  }), [resources]);

  const login = useCallback(
    (redirectTo?: string) => resources.oauth.login(redirectTo ?? config.routes?.afterLogin ?? "/"),
    [config.routes?.afterLogin, resources.oauth],
  );

  const handleCallback = useCallback(() => resources.oauth.handleCallback(), [resources.oauth]);
  const getAccessToken = useCallback(() => resources.oauth.getAccessToken(), [resources.oauth]);

  const logout = useCallback(async () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("auth:exit-start", { detail: { reason: "logout" } }));
    let destination = localExitPath(config.routes?.afterLogout ?? "/login", "logout");
    try {
      const result = await resources.adapter.logout();
      destination = result.logoutUrl || destination;
    } catch {
      resources.oauth.clear();
    } finally {
      window.location.assign(destination);
    }
  }, [config.routes?.afterLogout, resources.adapter, resources.oauth]);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (unauthorizedLogoutRef.current) return;
      unauthorizedLogoutRef.current = true;
      window.dispatchEvent(new CustomEvent("auth:exit-start", { detail: { reason: "unauthorized" } }));
      let destination = localExitPath(config.routes?.afterLogout ?? "/login", "unauthorized");
      void resources.adapter.logout("unauthorized").then((result) => {
        destination = result.logoutUrl || destination;
      }).catch(() => {
        try {
          destination = buildCasdoorLogoutUrl(
            new URL(config.casdoor.authorizationEndpoint).origin,
            config.casdoor.applicationOwner,
            config.casdoor.applicationName,
            config.routes?.afterLogout ?? "/login",
            "unauthorized",
          );
        } catch {
          // Invalid front-channel configuration must not prevent local exit.
        }
      }).finally(() => {
        resources.oauth.clear();
        window.location.replace(destination);
      });
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [
    config.casdoor.applicationName,
    config.casdoor.applicationOwner,
    config.casdoor.authorizationEndpoint,
    config.routes?.afterLogout,
    resources.oauth,
  ]);

  const value = useMemo<AccountCenterSpaContextValue>(() => ({
    adapter: resources.adapter,
    status,
    login,
    logout,
    handleCallback,
    getAccessToken,
  }), [getAccessToken, handleCallback, login, logout, resources.adapter, status]);

  return (
    <AccountCenterSpaContext.Provider value={value}>
      <QueryClientProvider client={resources.queryClient}>{children}</QueryClientProvider>
    </AccountCenterSpaContext.Provider>
  );
}

export function useAccountCenterAuth(): AccountCenterAuthApi {
  const value = useContext(AccountCenterSpaContext);
  if (!value) throw new Error("useAccountCenterAuth must be used inside AccountCenterProvider");
  return value;
}

export function useOptionalAccountCenterAuth(): AccountCenterAuthApi | undefined {
  return useContext(AccountCenterSpaContext) ?? undefined;
}

export function useAccountCenterAdapter(): AccountCenterAdapter {
  const value = useContext(AccountCenterSpaContext);
  if (!value) throw new Error("useAccountCenterAdapter must be used inside AccountCenterProvider");
  return value.adapter;
}

export function useOptionalAccountCenterAdapter(): AccountCenterAdapter | undefined {
  return useContext(AccountCenterSpaContext)?.adapter;
}

export function AccountCenterCallback() {
  const { handleCallback } = useAccountCenterAuth();
  useEffect(() => {
    void handleCallback().catch(() => {
      window.location.replace("/login?error=oauth_callback_failed");
    });
  }, [handleCallback]);
  return null;
}
