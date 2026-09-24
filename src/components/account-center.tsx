import React, { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, Modal, Popover } from "antd";
import { EditOutlined, LockOutlined, LogoutOutlined } from "@ant-design/icons";
import type { AccountCenterProps } from "../types";
import { createDefaultAdapter } from "../adapters/default-adapter";
import { AvatarImage } from "./avatar-image";
import { EditProfileModal } from "./edit-profile";
import { ChangePasswordModal } from "./change-password";
import { useLogout, useProfile } from "../hooks/use-account";
import { useIsMobile } from "../hooks/use-is-mobile";
import { useFocusTrap } from "../hooks/use-focus-trap";
import { useOptionalAccountCenterAdapter, useOptionalAccountCenterAuth } from "../spa/provider";
import { AccountCenterStyles, styles } from "./styles";

/**
 * AccountCenter — desktop Popover, mobile Bottom Sheet.
 *
 * Visual props (public surface):
 *   - `themeColor`  — accent colour forwarded to the trigger avatar ring.
 *   - `avatarSize`  — diameter of the trigger avatar in px (24–96, default 32).
 *
 * Optional functional prop:
 *   - `adapter`     — an `AccountCenterAdapter` whose `getProfile()` is called
 *                     to fetch the user profile. When omitted the component
 *                     first uses AccountCenterProvider's direct Gateway adapter,
 *                     then falls back to the legacy BFF adapter for compatibility.
 *
 * No `token` / `endpoint` / `headers` props — auth and routing are fully
 * encapsulated inside the adapter implementation.
 */
const DEFAULT_THEME = "#0075de";

function getRelativeLuminance(hex: string): number {
  const values = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function resolveThemeColor(value: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return DEFAULT_THEME;
  const contrastOnWhite = 1.05 / (getRelativeLuminance(value) + 0.05);
  return contrastOnWhite >= 4.5 ? value : DEFAULT_THEME;
}

export function AccountCenter({
  themeColor = DEFAULT_THEME,
  avatarSize = 32,
  adapter: injectedAdapter,
  authScope,
}: AccountCenterProps) {
  const safeThemeColor = resolveThemeColor(themeColor);
  const safeAvatarSize =
    Number.isInteger(avatarSize) && avatarSize >= 24 && avatarSize <= 96
      ? avatarSize
      : 32;

  // §6: When no adapter is given, create a default adapter.
  //      If authScope is provided, pass it via options so the adapter
  //      marks hasExplicitAuthScope and uses it for query keying.
  const scopeForDefault = React.useMemo(
    () => (authScope ? { getAuthScope: () => authScope } : undefined),
    [authScope],
  );
  const defaultAdapter = React.useMemo(
    () => createDefaultAdapter(globalThis.fetch.bind(globalThis), scopeForDefault),
    [scopeForDefault],
  );
  const providerAdapter = useOptionalAccountCenterAdapter();
  const providerAuth = useOptionalAccountCenterAuth();
  const adapter = injectedAdapter ?? providerAdapter ?? defaultAdapter;
  const isMobile = useIsMobile();
  const { data: profile, isError: profileError, isLoading: profileLoading } =
    useProfile(adapter);
  const logout = useLogout(adapter);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { containerRef, handleKeyDown } = useFocusTrap(menuOpen);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const focusTimer = window.setTimeout(() => {
      containerRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    }, 0);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const handleRouteChange = () => closeMenu();
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, [closeMenu, containerRef, menuOpen]);

  const openEdit = useCallback(() => {
    closeMenu(false);
    setEditOpen(true);
  }, [closeMenu]);

  const openPassword = useCallback(() => {
    closeMenu(false);
    setPasswordOpen(true);
  }, [closeMenu]);

  const handleLogout = useCallback(() => {
    closeMenu(false);
    Modal.confirm({
      title: "确认退出",
      content: "退出后需要重新登录才能继续使用。",
      okText: "退出系统",
      cancelText: "取消",
      focusable: { autoFocusButton: "cancel" },
      centered: true,
      rootClassName: styles.confirmDialog,
      okButtonProps: {
        danger: true,
        loading: logout.isPending,
      },
      onOk: async () => {
        if (providerAuth) {
          await providerAuth.logout();
          return;
        }
        const result = await logout.mutateAsync();
        if (result?.logoutUrl) window.location.href = result.logoutUrl;
      },
      afterClose: () => triggerRef.current?.focus(),
    });
  }, [closeMenu, logout, providerAuth]);

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      handleKeyDown(event);
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not([disabled])',
        ),
      );
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Home") return items[0].focus();
      if (event.key === "End") return items[items.length - 1].focus();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(current + delta + items.length) % items.length].focus();
    },
    [handleKeyDown],
  );

  const summaryLabel =
    profile?.nickname?.trim() ||
    (profileError ? "未获取到用户信息" : "加载中…");
  const profileActionDisabled = profileLoading || profileError || !profile;

  const menu = (
    <div
      ref={containerRef}
      className={styles.menu}
      onKeyDown={handleMenuKeyDown}
      role="menu"
      aria-label="账户操作"
    >
      <div className={styles.summary}>
        <AvatarImage
          src={profile?.avatarUrl}
          size={40}
          themeColor={safeThemeColor}
        />
        <span className={styles.summaryText}>
          <span className={styles.nickname} title={summaryLabel}>
            {summaryLabel}
          </span>
          {profile?.username && (
            <span className={styles.username} title={`用户名: ${profile.username}`}>
              用户名: {profile.username}
            </span>
          )}
        </span>
      </div>

      <div className={styles.divider} role="separator" />

      <div className={styles.actionGroup}>
        <button
          type="button"
          role="menuitem"
          onClick={openEdit}
          className={styles.menuItem}
          disabled={profileActionDisabled}
        >
          <EditOutlined aria-hidden />
          <span>编辑资料</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={openPassword}
          className={styles.menuItem}
          disabled={profileActionDisabled || profile?.capabilities?.passwordChange === false}
          title={profile?.capabilities?.passwordChange === false ? "密码修改功能尚未启用" : undefined}
        >
          <LockOutlined aria-hidden />
          <span>修改密码</span>
        </button>
      </div>

      <div className={styles.divider} role="separator" />

      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        className={`${styles.menuItem} ${styles.dangerItem}`}
      >
        <LogoutOutlined aria-hidden />
        <span>退出系统</span>
      </button>
    </div>
  );

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => {
        if (isMobile) setMenuOpen((open) => !open);
      }}
      className={styles.trigger}
      aria-label="账户菜单"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      style={
        {
          "--ac-avatar-size": `${safeAvatarSize}px`,
          "--ac-primary": safeThemeColor,
        } as React.CSSProperties
      }
    >
      <AvatarImage
        src={profile?.avatarUrl}
        size={safeAvatarSize}
        themeColor={safeThemeColor}
      />
    </button>
  );

  return (
    <div
      className={styles.root}
      style={{ "--ac-primary": safeThemeColor } as React.CSSProperties}
    >
      <AccountCenterStyles />
      {isMobile ? (
        <>
          {trigger}
          <Drawer
            placement="bottom"
            size="min(80dvh, 260px)"
            open={menuOpen}
            onClose={() => closeMenu()}
            closable={false}
            destroyOnHidden
            rootClassName={styles.accountDrawer}
            aria-label="账户菜单"
          >
            {menu}
          </Drawer>
        </>
      ) : (
        <Popover
          content={menu}
          trigger="click"
          open={menuOpen}
          onOpenChange={(open) => (open ? setMenuOpen(true) : closeMenu())}
          placement="bottomRight"
          arrow={false}
          rootClassName={styles.accountPopover}
        >
          {trigger}
        </Popover>
      )}

      <EditProfileModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          triggerRef.current?.focus();
        }}
        adapter={adapter}
        allowAvatarUpload={profile?.capabilities?.avatarUpload === true}
      />
      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false);
          triggerRef.current?.focus();
        }}
        adapter={adapter}
      />
    </div>
  );
}
