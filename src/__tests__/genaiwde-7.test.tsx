/**
 * Tests for GENAIWDE-7: Auth scope, status classification, retry, cache management.
 *
 * Strategy: table-driven where possible, real QueryClient for cache tests.
 * Covers:
 *  - Status classification table
 *  - shouldRetryProfileQuery matrix
 *  - 401 onUnauthorized dedup (same scope, new scope, reject)
 *  - Real QueryClient scope A→B: no old data, old key deleted
 *  - 401/logout/password reauth clear prefix
 *  - 403/404/422 do NOT call onUnauthorized
 *  - 429/5xx/network有限重试
 *  - Unknown error no retry
 *  - Legacy patch projection (metadata, no subject)
 *  - Gateway failure never calls legacy GET
 *  - Key no sensitive values
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createGatewayProfileAdapter, GatewayProfileAdapterError } from "../adapters/gateway-profile-adapter";
import {
  useProfile,
  useLogout,
  useChangePassword,
  getProfileKey,
  shouldRetryProfileQuery,
  removeAllProfileCache,
  PROFILE_KEY,
} from "../hooks/use-account";
import { createAccountCenterAuthScope } from "../auth-scope";
import { AccountCenterError, isAccountCenterError } from "../error";
import type { AccountCenterAdapter, AccountProfile } from "../types";

// ─── Mock Data ──────────────────────────────────────────────────────

const VALID_GATEWAY_PROFILE_DTO = {
  username: "user123",
  displayName: "Test User",
  firstName: "Test",
  lastName: "User",
  bio: "Test bio",
  avatar: "https://example.com/avatar.jpg",
  email: "test@example.com",
  phone: "+1234567890",
  organization: "Test Org",
};

const METADATA: Pick<AccountProfile, "capabilities" | "degradedReasons"> = {
  capabilities: { avatarUpload: true, passwordChange: false },
  degradedReasons: ["gateway_profile_only"],
};

const PROFILE_A: AccountProfile = {
  subject: "adapter-a-user",
  nickname: "Adapter A User",
  avatarUrl: "https://a.example.com/avatar.jpg",
  capabilities: { avatarUpload: true, passwordChange: false },
  degradedReasons: ["from_a"],
};

const PROFILE_B: AccountProfile = {
  subject: "adapter-b-user",
  nickname: "Adapter B User",
  avatarUrl: "https://b.example.com/avatar.jpg",
  capabilities: { avatarUpload: false, passwordChange: true },
  degradedReasons: ["from_b"],
};

// ─── Helpers ────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn> & typeof globalThis.fetch;

function makeFetchMock(
  responseBody: unknown,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" },
): FetchMock {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => responseBody,
  })) as unknown as FetchMock;
}

function makeLegacyAdapter(overrides: Partial<AccountCenterAdapter> = {}): AccountCenterAdapter {
  return {
    getProfile: vi.fn(),
    patchProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// ─── §4 Status Classification Table ─────────────────────────────────

describe("Status classification (§4)", () => {
  const STATUS_TABLE: Array<[number, string, boolean]> = [
    [401, "UNAUTHORIZED", false],
    [403, "FORBIDDEN", false],
    [404, "NOT_FOUND", false],
    [422, "INVALID_REQUEST", false],
    [429, "RATE_LIMITED", true],
    [500, "UPSTREAM_ERROR", true],
    [502, "UPSTREAM_ERROR", true],
    [503, "UPSTREAM_ERROR", true],
    [599, "UPSTREAM_ERROR", true],
    [418, "UPSTREAM_ERROR", false],  // other non-2xx
    [301, "UPSTREAM_ERROR", false],  // redirect
  ];

  it.each(STATUS_TABLE)(
    "status %d → code=%s retryable=%s",
    async (status, expectedCode, expectedRetryable) => {
      const fetch = makeFetchMock({ error: "bad" }, status);
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken: async () => "token",
        legacyAdapter: makeLegacyAdapter(),
        profileMetadata: METADATA,
      });

      try {
        await adapter.getProfile();
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toMatchObject({
          name: "GatewayProfileAdapterError",
          code: expectedCode,
          retryable: expectedRetryable,
        });
      }
    },
  );

  it("network error → NETWORK_ERROR retryable=true", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("fail"); }) as unknown as FetchMock;
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
    });

    try {
      await adapter.getProfile();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "NETWORK_ERROR",
        retryable: true,
      });
    }
  });

  it("fixed messages never expose body/statusText/URL", async () => {
    const fetch = makeFetchMock({ secret: "data" }, 500);
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
    });

    try {
      await adapter.getProfile();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("secret");
      expect(msg).not.toContain("data");
      expect(msg).not.toContain("/gateway");
    }
  });
});

// ─── §5 shouldRetryProfileQuery Matrix ──────────────────────────────

describe("shouldRetryProfileQuery (§5)", () => {
  const MATRIX: Array<{ label: string; error: Error; failureCount: number; expected: boolean }> = [
    {
      label: "retryable error at count 0 → retry",
      error: new AccountCenterError({ code: "NETWORK_ERROR", message: "fail", retryable: true }),
      failureCount: 0,
      expected: true,
    },
    {
      label: "retryable error at count 1 → retry",
      error: new AccountCenterError({ code: "RATE_LIMITED", message: "slow", retryable: true }),
      failureCount: 1,
      expected: true,
    },
    {
      label: "retryable error at count 2 → no retry",
      error: new AccountCenterError({ code: "NETWORK_ERROR", message: "fail", retryable: true }),
      failureCount: 2,
      expected: false,
    },
    {
      label: "401 at count 0 → no retry",
      error: new AccountCenterError({ code: "UNAUTHORIZED", message: "auth", retryable: false }),
      failureCount: 0,
      expected: false,
    },
    {
      label: "non-retryable error → no retry",
      error: new AccountCenterError({ code: "FORBIDDEN", message: "denied", retryable: false }),
      failureCount: 0,
      expected: false,
    },
    {
      label: "unknown Error → no retry",
      error: new Error("something weird"),
      failureCount: 0,
      expected: false,
    },
    {
      label: "unknown Error at count 1 → no retry",
      error: new Error("something weird"),
      failureCount: 1,
      expected: false,
    },
    {
      label: "GatewayProfileAdapterError UNAUTHORIZED → no retry",
      error: new GatewayProfileAdapterError({ code: "UNAUTHORIZED", message: "auth", retryable: false, status: 401 }),
      failureCount: 0,
      expected: false,
    },
    {
      label: "GatewayProfileAdapterError retryable at count 0 → retry",
      error: new GatewayProfileAdapterError({ code: "NETWORK_ERROR", message: "net", retryable: true }),
      failureCount: 0,
      expected: true,
    },
  ];

  it.each(MATRIX.map((m) => [m.label, m] as [string, typeof MATRIX[0]]))(
    "%s",
    (_label, { error, failureCount, expected }) => {
      expect(shouldRetryProfileQuery(failureCount, error)).toBe(expected);
    },
  );
});

// ─── §3 onUnauthorized 401 Dedup ───────────────────────────────────

describe("onUnauthorized 401 dedup (§3)", () => {
  it("same scope: concurrent 401 triggers callback only once", async () => {
    const onUnauthorized = vi.fn();
    const scope = createAccountCenterAuthScope();
    const fetch = makeFetchMock({}, 401);
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
      getAuthScope: () => scope,
      onUnauthorized,
    });

    // Fire two concurrent requests
    const [r1, r2] = await Promise.allSettled([adapter.getProfile(), adapter.getProfile()]);

    expect(r1.status).toBe("rejected");
    expect(r2.status).toBe("rejected");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("new scope: callback triggered again", async () => {
    const onUnauthorized = vi.fn();
    const scopeA = createAccountCenterAuthScope();
    const scopeB = createAccountCenterAuthScope();

    let currentScope = scopeA;
    const fetch = makeFetchMock({}, 401);
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
      getAuthScope: () => currentScope,
      onUnauthorized,
    });

    // First request with scope A
    try { await adapter.getProfile(); } catch { /* expected */ }
    expect(onUnauthorized).toHaveBeenCalledOnce();

    // Switch to scope B
    currentScope = scopeB;
    try { await adapter.getProfile(); } catch { /* expected */ }
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it("callback reject is swallowed, 401 still thrown", async () => {
    const onUnauthorized = vi.fn().mockRejectedValue(new Error("callback boom"));
    const scope = createAccountCenterAuthScope();
    const fetch = makeFetchMock({}, 401);
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
      getAuthScope: () => scope,
      onUnauthorized,
    });

    try {
      await adapter.getProfile();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toMatchObject({ code: "UNAUTHORIZED", retryable: false });
    }
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("no error/token/profile passed to callback", async () => {
    const onUnauthorized = vi.fn();
    const scope = createAccountCenterAuthScope();
    const fetch = makeFetchMock({}, 401);
    const adapter = createGatewayProfileAdapter({
      fetchFn: fetch,
      getAccessToken: async () => "token-abc",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: METADATA,
      getAuthScope: () => scope,
      onUnauthorized,
    });

    try { await adapter.getProfile(); } catch { /* expected */ }

    expect(onUnauthorized).toHaveBeenCalledOnce();
    const callArgs = onUnauthorized.mock.calls[0];
    expect(callArgs).toHaveLength(0); // no arguments
  });

  it("403/404/422 do NOT trigger onUnauthorized", async () => {
    const onUnauthorized = vi.fn();
    const scope = createAccountCenterAuthScope();

    for (const status of [403, 404, 422]) {
      const fetch = makeFetchMock({}, status);
      const a = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken: async () => "token",
        legacyAdapter: makeLegacyAdapter(),
        profileMetadata: METADATA,
        getAuthScope: () => scope,
        onUnauthorized,
      });
      try { await a.getProfile(); } catch { /* expected */ }
    }

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("403/404/422 do NOT clear existing profile data", async () => {
    const { queryClient, wrapper } = createWrapper();
    const scope = createAccountCenterAuthScope();

    for (const status of [403, 404, 422]) {
      const adapter: AccountCenterAdapter = {
        getProfile: vi.fn(async () => {
          throw new GatewayProfileAdapterError({
            code: `ERROR_${status}`,
            message: `HTTP ${status}`,
            retryable: false,
            status,
          });
        }),
        patchProfile: vi.fn(),
        uploadAvatar: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
        getProfileAuthScope: () => scope,
      };

      // Seed stale profile data so mounting performs a failing refetch while
      // retaining the previous safe value.
      queryClient.setQueryData(getProfileKey(adapter, scope), PROFILE_A, { updatedAt: 1 });

      const { result, unmount } = renderHook(() => useProfile(adapter), { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));

      // Profile data should still be in cache (not cleared by non-401 errors)
      const data = queryClient.getQueryData(getProfileKey(adapter, scope));
      expect(data).toEqual(PROFILE_A);

      unmount();
    }
  });
});

// ─── §2 Scope A→B Cache Isolation (Real QueryClient) ───────────────

describe("Scope A→B cache isolation (real QueryClient, §2)", () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it("getProfileKey includes scopeId in key", () => {
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    } as AccountCenterAdapter;
    const scope = createAccountCenterAuthScope();
    const key = getProfileKey(adapter, scope);

    expect(key.slice(0, 2)).toEqual(["account-center", "profile"]);
    expect(typeof key[2]).toBe("number"); // adapterId
    expect(typeof key[3]).toBe("number"); // scopeId
  });

  it("different scopes produce different keys for same adapter", () => {
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    } as AccountCenterAdapter;
    const scopeA = createAccountCenterAuthScope();
    const scopeB = createAccountCenterAuthScope();

    const keyA = getProfileKey(adapter, scopeA);
    const keyB = getProfileKey(adapter, scopeB);

    expect(keyA[2]).toBe(keyB[2]); // same adapterId
    expect(keyA[3]).not.toBe(keyB[3]); // different scopeId
  });

  it("scope switch: no old data, old key deleted", async () => {
    const getProfileA = vi.fn().mockResolvedValue(PROFILE_A);
    const getProfileB = vi.fn().mockResolvedValue(PROFILE_B);
    const scopeA = createAccountCenterAuthScope();
    const scopeB = createAccountCenterAuthScope();

    const adapter: AccountCenterAdapter = {
      getProfile: getProfileA,
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      getProfileAuthScope: () => scopeA,
    };

    // Single mounted hook — rerender to prove scope switch (no unmount+gcTime=0)
    const { result, rerender } = renderHook(
      ({ adapter: a }: { adapter: AccountCenterAdapter }) => useProfile(a),
      {
        wrapper,
        initialProps: { adapter } as { adapter: AccountCenterAdapter },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.nickname).toBe("Adapter A User");

    // Verify old key exists in cache
    const keyA = getProfileKey(adapter, scopeA);
    expect(queryClient.getQueryData(keyA)).toBeDefined();

    // Switch to scope B (same adapter instance, different scope)
    adapter.getProfile = getProfileB;
    adapter.getProfileAuthScope = () => scopeB;

    await act(async () => {
      rerender({ adapter });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.nickname).toBe("Adapter B User");

    // Old exact key should be removed (explicitly, not via GC)
    expect(queryClient.getQueryData(keyA)).toBeUndefined();
  });

  it("no stale data from old scope displayed", async () => {
    const scopeA = createAccountCenterAuthScope();
    const scopeB = createAccountCenterAuthScope();

    const adapter: AccountCenterAdapter = {
      getProfile: vi.fn().mockResolvedValue(PROFILE_A),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      getProfileAuthScope: () => scopeA,
    };

    const { result, unmount } = renderHook(() => useProfile(adapter), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.nickname).toBe("Adapter A User");
    unmount();

    // Switch to scope B
    adapter.getProfile = vi.fn().mockResolvedValue(PROFILE_B);
    adapter.getProfileAuthScope = () => scopeB;

    const { result: resultB } = renderHook(() => useProfile(adapter), { wrapper });
    // Before B loads, data should not be A's data
    await waitFor(() => expect(resultB.current.isSuccess).toBe(true));
    expect(resultB.current.data?.nickname).toBe("Adapter B User");
    expect(resultB.current.data?.subject).toBe("adapter-b-user");
  });
});

// ─── §6 Cache Clearing ──────────────────────────────────────────────

describe("Cache clearing (§6)", () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    const w = createWrapper();
    queryClient = w.queryClient;
    wrapper = w.wrapper;
  });

  it("401 clears the profile prefix without triggering a refetch loop", async () => {
    const scope = createAccountCenterAuthScope();
    const getProfile = vi.fn().mockRejectedValue(new GatewayProfileAdapterError({
      code: "UNAUTHORIZED",
      message: "Gateway authentication failed",
      retryable: false,
      status: 401,
    }));
    const adapter = {
      getProfile,
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      getProfileAuthScope: () => scope,
    } as AccountCenterAdapter;
    const otherAdapter = makeLegacyAdapter();
    queryClient.setQueryData(getProfileKey(otherAdapter), PROFILE_A);

    const { result } = renderHook(() => useProfile(adapter), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => {
      expect(queryClient.getQueriesData({ queryKey: PROFILE_KEY })).toHaveLength(0);
    });
    expect(getProfile).toHaveBeenCalledOnce();
  });

  it("useLogout clears all PROFILE_KEY prefix before request", async () => {
    const logoutFn = vi.fn().mockResolvedValue({ logoutUrl: "/login" });
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: logoutFn,
    } as AccountCenterAdapter;

    // Seed profile cache
    await queryClient.setQueryData(
      getProfileKey(adapter, createAccountCenterAuthScope()),
      PROFILE_A,
    );

    const { result } = renderHook(() => useLogout(adapter), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(logoutFn).toHaveBeenCalledOnce();
    // All profile cache should be cleared
    const caches = queryClient.getQueriesData({ queryKey: PROFILE_KEY });
    expect(caches).toHaveLength(0);
  });

  it("useLogout clears cache even on failure", async () => {
    const logoutFn = vi.fn().mockRejectedValue(new Error("network"));
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: logoutFn,
    } as AccountCenterAdapter;

    // Seed profile cache
    await queryClient.setQueryData(
      getProfileKey(adapter, createAccountCenterAuthScope()),
      PROFILE_A,
    );

    const { result } = renderHook(() => useLogout(adapter), { wrapper });

    try {
      await act(async () => {
        await result.current.mutateAsync();
      });
    } catch { /* expected */ }

    // Cache should still be cleared despite failure
    const caches = queryClient.getQueriesData({ queryKey: PROFILE_KEY });
    expect(caches).toHaveLength(0);
  });

  it("useChangePassword clears cache on success + reauthRequired", async () => {
    const changePasswordFn = vi.fn().mockResolvedValue({ ok: true, reauthRequired: true });
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: changePasswordFn,
      logout: vi.fn(),
    } as AccountCenterAdapter;

    await queryClient.setQueryData(
      getProfileKey(adapter, createAccountCenterAuthScope()),
      PROFILE_A,
    );

    const { result } = renderHook(() => useChangePassword(adapter), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ oldPassword: "old", newPassword: "NewPass1" });
    });

    const caches = queryClient.getQueriesData({ queryKey: PROFILE_KEY });
    expect(caches).toHaveLength(0);
  });

  it("useChangePassword does NOT clear cache when reauthRequired=false", async () => {
    const changePasswordFn = vi.fn().mockResolvedValue({ ok: true, reauthRequired: false });
    const scope = createAccountCenterAuthScope();
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: changePasswordFn,
      logout: vi.fn(),
      getProfileAuthScope: () => scope,
    } as AccountCenterAdapter;

    await queryClient.setQueryData(getProfileKey(adapter, scope), PROFILE_A);

    const { result } = renderHook(() => useChangePassword(adapter), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ oldPassword: "old", newPassword: "NewPass1" });
    });

    // Cache should still have data
    const data = queryClient.getQueryData(getProfileKey(adapter, scope));
    expect(data).toBeDefined();
  });
});

// ─── §7 Legacy Patch Projection ─────────────────────────────────────

describe("Legacy patch projection (§7)", () => {
  it("projects only nickname/avatarUrl and re-attaches snapshot metadata", async () => {
    const legacyResult: AccountProfile = {
      subject: "should-not-leak",
      nickname: "New Name",
      avatarUrl: "https://cdn.example.com/new.jpg",
      capabilities: { avatarUpload: true, passwordChange: true }, // legacy has different capabilities
      degradedReasons: ["legacy-reason"],
    };

    const adapter = createGatewayProfileAdapter({
      fetchFn: makeFetchMock(VALID_GATEWAY_PROFILE_DTO),
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter({
        patchProfile: vi.fn().mockResolvedValue(legacyResult),
      }),
      profileMetadata: METADATA,
    });

    const result = await adapter.patchProfile({ nickname: "New Name" });

    // Only nickname and avatarUrl from legacy
    expect(result.nickname).toBe("New Name");
    expect(result.avatarUrl).toBe("https://cdn.example.com/new.jpg");

    // Metadata from snapshot, NOT from legacy
    expect(result.capabilities).toEqual(METADATA.capabilities);
    expect(result.degradedReasons).toEqual(METADATA.degradedReasons);

    // subject must never appear
    expect(result).not.toHaveProperty("subject");
  });

  it("metadata snapshot is independent of caller mutation after construction", async () => {
    const meta = { capabilities: { avatarUpload: true, passwordChange: false }, degradedReasons: ["a"] };
    const adapter = createGatewayProfileAdapter({
      fetchFn: makeFetchMock(VALID_GATEWAY_PROFILE_DTO),
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter(),
      profileMetadata: meta,
    });

    // Mutate the original metadata after construction
    meta.capabilities.avatarUpload = false;
    meta.degradedReasons.push("mutated");

    const result = await adapter.getProfile();

    // Adapter should have snapshotted the original values
    expect(result.capabilities.avatarUpload).toBe(true);
    expect(result.degradedReasons).toEqual(["a"]);
  });

  it("Gateway failure never calls legacyAdapter.getProfile", async () => {
    const legacyGetProfile = vi.fn();
    const adapter = createGatewayProfileAdapter({
      fetchFn: makeFetchMock({}, 401),
      getAccessToken: async () => "token",
      legacyAdapter: makeLegacyAdapter({ getProfile: legacyGetProfile }),
      profileMetadata: METADATA,
    });

    try { await adapter.getProfile(); } catch { /* expected */ }
    expect(legacyGetProfile).not.toHaveBeenCalled();
  });
});

// ─── Key Safety ─────────────────────────────────────────────────────

describe("Key safety", () => {
  it("PROFILE_KEY contains no sensitive values", () => {
    const keyStr = JSON.stringify(PROFILE_KEY);
    expect(keyStr).not.toContain("token");
    expect(keyStr).not.toContain("email");
    expect(keyStr).not.toContain("hash");
  });

  it("getProfileKey contains no sensitive values", () => {
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    } as AccountCenterAdapter;
    const scope = createAccountCenterAuthScope();
    const key = getProfileKey(adapter, scope);
    const keyStr = JSON.stringify(key);
    expect(keyStr).not.toContain("token");
    expect(keyStr).not.toContain("email");
    expect(keyStr).not.toContain("hash");
    // Keys are only numbers and strings from PROFILE_KEY prefix
    expect(key.slice(0, 2)).toEqual(["account-center", "profile"]);
    expect(typeof key[2]).toBe("number");
    expect(typeof key[3]).toBe("number");
  });

  it("auth scope is a frozen empty object", () => {
    const scope = createAccountCenterAuthScope();
    expect(typeof scope).toBe("object");
    expect(Object.keys(scope)).toHaveLength(0);
    expect(Object.isFrozen(scope)).toBe(true);
  });
});

// ─── AccountCenterError / isAccountCenterError ──────────────────────

describe("AccountCenterError / isAccountCenterError (§8)", () => {
  it("creates error with code, message, retryable", () => {
    const err = new AccountCenterError({
      code: "CUSTOM",
      message: "something",
      retryable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AccountCenterError);
    expect(err.name).toBe("AccountCenterError");
    expect(err.code).toBe("CUSTOM");
    expect(err.retryable).toBe(true);
  });

  it("isAccountCenterError returns true for AccountCenterError", () => {
    const err = new AccountCenterError({ code: "X", message: "y", retryable: false });
    expect(isAccountCenterError(err)).toBe(true);
  });

  it("isAccountCenterError returns false for plain Error", () => {
    expect(isAccountCenterError(new Error("plain"))).toBe(false);
  });

  it("isAccountCenterError returns false for null/undefined/strings", () => {
    expect(isAccountCenterError(null)).toBe(false);
    expect(isAccountCenterError(undefined)).toBe(false);
    expect(isAccountCenterError("error")).toBe(false);
  });

  it("code is string (not narrowed to closed union)", () => {
    const err = new AccountCenterError({
      code: "ARBITRARY_NEW_CODE",
      message: "extensible",
      retryable: false,
    });
    // TypeScript allows any string code
    expect(err.code).toBe("ARBITRARY_NEW_CODE");
  });
});

// ─── Auth Scope Factory ─────────────────────────────────────────────

describe("createAccountCenterAuthScope", () => {
  it("creates distinct scope objects", () => {
    const s1 = createAccountCenterAuthScope();
    const s2 = createAccountCenterAuthScope();
    expect(s1).not.toBe(s2);
  });

  it("scope is frozen", () => {
    const s = createAccountCenterAuthScope();
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("scope has no enumerable own properties", () => {
    const s = createAccountCenterAuthScope();
    expect(Object.keys(s)).toHaveLength(0);
  });
});

// ─── cancelAllProfileQueries / removeAllProfileCache ────────────────

describe("Cache helper functions", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  it("removeAllProfileCache removes all profile queries", async () => {
    const adapter = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    } as AccountCenterAdapter;

    await queryClient.setQueryData(getProfileKey(adapter), PROFILE_A);

    let caches = queryClient.getQueriesData({ queryKey: PROFILE_KEY });
    expect(caches.length).toBeGreaterThan(0);

    removeAllProfileCache(queryClient);

    caches = queryClient.getQueriesData({ queryKey: PROFILE_KEY });
    expect(caches).toHaveLength(0);
  });
});
