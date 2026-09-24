/**
 * Real TanStack Query integration tests for adapter-scoped cache isolation.
 *
 * These tests use a real QueryClient (not mocked) to prove:
 * 1. Adapter A cached → switch to Adapter B → B is called and B data returned
 * 2. A/B query keys are isolated — stale cache from A does not leak to B
 * 3. Mutation via usePatchProfile updates the correct adapter key
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfile, usePatchProfile, getProfileKey } from "../hooks/use-account";
import type { AccountCenterAdapter, AccountProfile } from "../types";

// ─── Mock data ──────────────────────────────────────────────────────

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

function makeAdapter(profile: AccountProfile): AccountCenterAdapter {
  const getProfileFn = vi.fn().mockResolvedValue(profile);
  return {
    getProfile: getProfileFn,
    patchProfile: vi.fn().mockResolvedValue(profile),
    uploadAvatar: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
  };
}

// ─── Test wrapper ───────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("useProfile cache isolation (real TanStack Query)", () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    const w = createWrapper();
    queryClient = w.queryClient;
    wrapper = w.wrapper;
  });

  it("getProfileKey produces different keys for different adapter instances", () => {
    const adapterA = makeAdapter(PROFILE_A);
    const adapterB = makeAdapter(PROFILE_B);

    const keyA = getProfileKey(adapterA);
    const keyB = getProfileKey(adapterB);

    expect(keyA).not.toEqual(keyB);
    // Both retain the public PROFILE_KEY prefix; only the opaque scope differs.
    expect(keyA.slice(0, 2)).toEqual(["account-center", "profile"]);
    expect(keyB.slice(0, 2)).toEqual(["account-center", "profile"]);
    expect(keyA[2]).not.toBe(keyB[2]);
  });

  it("getProfileKey is stable for the same adapter instance", () => {
    const adapter = makeAdapter(PROFILE_A);
    const key1 = getProfileKey(adapter);
    const key2 = getProfileKey(adapter);
    expect(key1).toEqual(key2);
  });

  it("getProfileKey never contains token, subject, or email", () => {
    const adapter = makeAdapter(PROFILE_A);
    const key = getProfileKey(adapter);
    const keyStr = JSON.stringify(key);
    expect(keyStr).not.toContain("token");
    expect(keyStr).not.toContain("adapter-a-user");
    expect(keyStr).not.toContain("@example.com");
  });

  it("adapter A cached, then switch to B → B is called and returns B data", async () => {
    const adapterA = makeAdapter(PROFILE_A);
    const adapterB = makeAdapter(PROFILE_B);

    // Render with adapter A
    const { result, unmount } = renderHook(() => useProfile(adapterA), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.nickname).toBe("Adapter A User");
    expect(adapterA.getProfile).toHaveBeenCalledTimes(1);

    unmount();

    // Render with adapter B — must call B's getProfile, not return A's cached data
    const { result: resultB } = renderHook(() => useProfile(adapterB), { wrapper });

    await waitFor(() => {
      expect(resultB.current.isSuccess).toBe(true);
    });
    expect(resultB.current.data?.nickname).toBe("Adapter B User");
    expect(adapterB.getProfile).toHaveBeenCalledTimes(1);
    // A's data must not leak into B's key
    expect(resultB.current.data?.subject).toBe("adapter-b-user");
  });

  it("adapter B mutation updates only B's cache key", async () => {
    const adapterA = makeAdapter(PROFILE_A);
    const adapterB = makeAdapter(PROFILE_B);

    const updatedProfile: AccountProfile = {
      ...PROFILE_B,
      nickname: "B Updated",
    };
    adapterB.patchProfile = vi.fn().mockResolvedValue(updatedProfile);

    // Seed adapter A cache
    await queryClient.setQueryData(getProfileKey(adapterA), PROFILE_A);
    // Seed adapter B cache
    await queryClient.setQueryData(getProfileKey(adapterB), PROFILE_B);

    // Use the hook
    const { result } = renderHook(
      () => ({
        profile: useProfile(adapterB),
        patch: usePatchProfile(adapterB),
      }),
      { wrapper },
    );

    // Trigger mutation
    await act(async () => {
      await result.current.patch.mutateAsync({ nickname: "B Updated" });
    });

    // Adapter B cache updated
    const bData = queryClient.getQueryData<AccountProfile>(getProfileKey(adapterB));
    expect(bData?.nickname).toBe("B Updated");

    // Adapter A cache untouched
    const aData = queryClient.getQueryData<AccountProfile>(getProfileKey(adapterA));
    expect(aData?.nickname).toBe("Adapter A User");
  });
});
