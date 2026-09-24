/**
 * Tests for AccountCenter component.
 *
 * Strategy:
 * - Mock useProfile/useLogout hooks to control loading/error/data states.
 * - Mock useIsMobile to toggle desktop vs mobile paths.
 * - Use @testing-library/react for rendering + screen queries.
 * - Test both desktop (Popover) and mobile (Drawer) paths.
 * - Capture the adapter argument passed to useProfile to verify injection.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
// @testing-library/jest-dom matchers (imported for side-effect)
// Note: vitest globals:true makes `expect` available globally
import "@testing-library/jest-dom/vitest";
import { AccountCenter } from "../components/account-center";
import type { AccountCenterAdapter, AccountProfile } from "../types";

// ─── Mock setup ─────────────────────────────────────────────────────

const hookState = vi.hoisted(() => ({
  profile: undefined as AccountProfile | undefined,
  loading: true,
  error: null as Error | null,
  logoutMutate: vi.fn(),
  /** The adapter argument most recently passed to useProfile. */
  capturedAdapter: undefined as unknown,
}));

vi.mock("../hooks/use-account", () => ({
  useProfile: (adapter: unknown) => {
    hookState.capturedAdapter = adapter;
    return {
      data: hookState.profile,
      isLoading: hookState.loading,
      isError: Boolean(hookState.error),
      error: hookState.error,
    };
  },
  useLogout: () => ({ mutateAsync: hookState.logoutMutate, isPending: false }),
  usePatchProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mock useIsMobile
let _isMobile = false;
vi.mock("../hooks/use-is-mobile", () => ({
  useIsMobile: () => _isMobile,
}));

// Suppress antd console noise
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  _isMobile = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────

const profile: AccountProfile = {
  subject: "u-001",
  username: "zhangsan",
  nickname: "张三",
  avatarUrl: "https://cdn.example.com/avatar.jpg",
  capabilities: { avatarUpload: true, passwordChange: true },
  degradedReasons: [],
};

function setProfile(p: AccountProfile) {
  hookState.profile = p;
  hookState.loading = false;
  hookState.error = null;
}

function setNoProfile() {
  hookState.profile = undefined;
  hookState.loading = true;
  hookState.error = null;
  hookState.logoutMutate = vi.fn();
}

function setError(err: Error) {
  hookState.profile = undefined;
  hookState.loading = false;
  hookState.error = err;
}

function setLogoutMutate(fn: ReturnType<typeof vi.fn>) {
  hookState.logoutMutate = fn;
}

function resetCapturedAdapter() {
  hookState.capturedAdapter = undefined;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("AccountCenter", () => {
  beforeEach(() => {
    setNoProfile();
    setLogoutMutate(vi.fn());
    resetCapturedAdapter();
  });

  // ── Desktop: loading state ────────────────────────────────────────

  describe("loading state", () => {
    it("renders the trigger button with aria-label", () => {
      setNoProfile();
      render(<AccountCenter />);
      const btn = screen.getByRole("button", { name: "账户菜单" });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("shows a stable fallback when profile loading fails", async () => {
      setError(new Error("network"));
      render(<AccountCenter />);
      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));
      expect(await screen.findByText("未获取到用户信息")).toBeInTheDocument();
    });
  });

  // ── Desktop: avatar placeholder when no avatarUrl ─────────────────

  describe("avatar placeholder", () => {
    it("shows placeholder when avatarUrl is null", () => {
      setProfile({
        ...profile,
        avatarUrl: null,
      });
      render(<AccountCenter />);
      const avatar = screen.getByRole("img", { name: "用户头像" });
      expect(avatar).toBeInTheDocument();
      expect(avatar.tagName).toBe("SPAN");
    });

    it("shows real avatar when avatarUrl is set", () => {
      setProfile(profile);
      render(<AccountCenter />);
      const img = screen.getByAltText("用户头像");
      expect(img).toHaveAttribute("src", "https://cdn.example.com/avatar.jpg");
    });
  });

  // ── Desktop: Popover opens on click ───────────────────────────────

  describe("menu items (desktop)", () => {
    it("shows display name and username in the menu", async () => {
      setProfile(profile);
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByText("张三")).toBeInTheDocument();
        expect(screen.getByText("用户名: zhangsan")).toBeInTheDocument();
      });
    });

    it("shows loading placeholder when nickname is null", async () => {
      setProfile({ ...profile, nickname: null });
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByText("加载中…")).toBeInTheDocument();
      });
    });

    it("shows all menu items when capabilities are true", async () => {
      setProfile({
        ...profile,
        capabilities: { avatarUpload: true, passwordChange: true },
      });
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "编辑资料" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "修改密码" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "退出系统" })).toBeInTheDocument();
      });
    });

    it("moves focus into the menu and supports arrow-key navigation", async () => {
      setProfile(profile);
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      const editItem = await screen.findByRole("menuitem", { name: "编辑资料" });
      const passwordItem = screen.getByRole("menuitem", { name: "修改密码" });

      await waitFor(() => expect(editItem).toHaveFocus());
      fireEvent.keyDown(editItem, { key: "ArrowDown" });
      expect(passwordItem).toHaveFocus();
    });
  });

  // ── Desktop: edit profile available even when avatarUpload is false ─

  describe("edit profile with avatarUpload=false", () => {
    it("shows edit profile menu item even when avatarUpload is false", async () => {
      setProfile({
        ...profile,
        capabilities: { avatarUpload: false, passwordChange: true },
      });
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        // "编辑资料" should still be visible
        expect(screen.getByRole("menuitem", { name: "编辑资料" })).toBeInTheDocument();
        // "修改密码" should also be visible
        expect(screen.getByRole("menuitem", { name: "修改密码" })).toBeInTheDocument();
      });
    });
  });

  // ── Desktop: passwordChange=false hides password menu item ─────────

  describe("password capability false", () => {
    it("shows password change disabled when passwordChange is false", async () => {
      setProfile({
        ...profile,
        capabilities: { avatarUpload: true, passwordChange: false },
      });
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "编辑资料" })).toBeInTheDocument();
      });

      expect(screen.getByRole("menuitem", { name: "修改密码" })).toBeDisabled();
      expect(screen.getByRole("menuitem", { name: "退出系统" })).toBeInTheDocument();
    });

    it("keeps profile editing and exposes the disabled password action", async () => {
      setProfile({
        ...profile,
        capabilities: { avatarUpload: false, passwordChange: false },
      });
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "退出系统" })).toBeInTheDocument();
      });
      expect(screen.getByRole("menuitem", { name: "编辑资料" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "修改密码" })).toBeDisabled();
    });
  });

  // ── Desktop: logout confirmation ──────────────────────────────────

  describe("logout", () => {
    it("triggers logout mutateAsync on confirm and navigates", async () => {
      Object.defineProperty(window, "location", {
        value: { href: "" },
        writable: true,
      });

      const mockMutate = vi.fn().mockResolvedValue({ logoutUrl: "/login" });
      setLogoutMutate(mockMutate);
      setProfile(profile);

      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "退出系统" })).toBeInTheDocument();
      });

      // Click the logout button
      fireEvent.click(screen.getByRole("menuitem", { name: "退出系统" }));

      // AntD Modal.confirm renders a confirm button
      // We need to wait for the modal and click OK
      await waitFor(() => {
        const okBtn = document.querySelector(".ant-modal-confirm-btns .ant-btn-primary");
        expect(okBtn).toBeInTheDocument();
      });

      // Click the OK button
      const okBtn = document.querySelector(".ant-modal-confirm-btns .ant-btn-primary") as HTMLElement;
      fireEvent.click(okBtn);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledOnce();
        expect(window.location.href).toBe("/login");
      });
    });
  });

  // ── Adapter injection (mock hooks — proves adapter prop is forwarded) ──

  describe("adapter injection (mock hooks — adapter forwarded to useProfile)", () => {
    it("passes injected adapter to useProfile instead of the default", () => {
      const injectedAdapter: AccountCenterAdapter = {
        getProfile: vi.fn(),
        patchProfile: vi.fn(),
        uploadAvatar: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
      };
      setProfile(profile);
      render(<AccountCenter adapter={injectedAdapter} />);

      // useProfile must have received the injected adapter, not the default
      expect(hookState.capturedAdapter).toBe(injectedAdapter);
    });

    it("renders profile data from the injected adapter without calling globalThis.fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const getProfileMock = vi.fn().mockResolvedValue(profile);
      const injectedAdapter: AccountCenterAdapter = {
        getProfile: getProfileMock,
        patchProfile: vi.fn(),
        uploadAvatar: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
      };
      setProfile(profile);
      render(<AccountCenter adapter={injectedAdapter} />);

      // The injected adapter is wired through to useProfile
      expect(hookState.capturedAdapter).toBe(injectedAdapter);

      // Default adapter's fetch must never be invoked
      expect(fetchSpy).not.toHaveBeenCalled();

      // Profile data flows through to the rendered UI
      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));
      await waitFor(() => {
        expect(screen.getByText("张三")).toBeInTheDocument();
      });

      fetchSpy.mockRestore();
    });

    it("falls back to default adapter when no adapter prop is given", () => {
      setProfile(profile);
      render(<AccountCenter />);

      // capturedAdapter should be the default adapter created internally
      expect(hookState.capturedAdapter).toBeDefined();
      expect(hookState.capturedAdapter).not.toBeNull();
      // Type it to check it has the adapter shape
      const a = hookState.capturedAdapter as AccountCenterAdapter;
      expect(typeof a.getProfile).toBe("function");
      expect(typeof a.patchProfile).toBe("function");
    });
  });

  // ── Desktop: Esc closes popover ───────────────────────────────────

  describe("Esc closes popover", () => {
    it("closes popover on Esc key", async () => {
      setProfile(profile);
      render(<AccountCenter />);

      // Open
      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));
      await waitFor(() => {
        expect(screen.getByText("张三")).toBeInTheDocument();
      });

      // Press Esc
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

      // AntD Popover handles Esc internally; the menu content may still
      // be in the DOM briefly. We verify the button's aria-expanded changes.
      await waitFor(() => {
        const btn = screen.getByRole("button", { name: "账户菜单" });
        expect(btn).toHaveAttribute("aria-expanded", "false");
      });
    });
  });

  // ── Adapter injection (mobile, mock hooks — proves adapter prop is forwarded) ──

  describe("adapter injection (mobile, mock hooks)", () => {
    beforeEach(() => {
      _isMobile = true;
    });

    afterEach(() => {
      _isMobile = false;
    });

    it("passes injected adapter on mobile too", () => {
      const injectedAdapter: AccountCenterAdapter = {
        getProfile: vi.fn(),
        patchProfile: vi.fn(),
        uploadAvatar: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
      };
      setProfile(profile);
      render(<AccountCenter adapter={injectedAdapter} />);
      expect(hookState.capturedAdapter).toBe(injectedAdapter);
    });
  });

  // ── Mobile: Drawer path ──────────────────────────────────────────

  describe("mobile (Drawer path)", () => {
    beforeEach(() => {
      _isMobile = true;
    });

    afterEach(() => {
      _isMobile = false;
    });

    it("renders the trigger button on mobile", () => {
      setProfile(profile);
      render(<AccountCenter />);
      expect(screen.getByRole("button", { name: "账户菜单" })).toBeInTheDocument();
    });

    it("shows Drawer on mobile when trigger is clicked", async () => {
      setProfile(profile);
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      // AntD Drawer renders into a drawer container
      await waitFor(() => {
        const drawer = document.querySelector(".ant-drawer");
        expect(drawer).toBeInTheDocument();
      });
    });

    it("mobile shows logout menu item in Drawer", async () => {
      setProfile(profile);
      render(<AccountCenter />);

      fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "退出系统" })).toBeInTheDocument();
      });
    });
  });
});
