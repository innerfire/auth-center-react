import styled, { createGlobalStyle } from "styled-components";

/**
 * Stable, package-owned class names are required for Ant Design portals.
 * Every selector is namespaced so the injected stylesheet cannot match host UI.
 */
export const styles = {
  root: "ifac-root",
  trigger: "ifac-trigger",
  menu: "ifac-menu",
  summary: "ifac-summary",
  summaryText: "ifac-summary-text",
  nickname: "ifac-nickname",
  username: "ifac-username",
  actionGroup: "ifac-action-group",
  menuItem: "ifac-menu-item",
  divider: "ifac-divider",
  dangerItem: "ifac-danger-item",
  accountPopover: "ifac-account-popover",
  accountDrawer: "ifac-account-drawer",
  dialog: "ifac-dialog",
  confirmDialog: "ifac-confirm-dialog",
  cropperDialog: "ifac-cropper-dialog",
  mobileDialog: "ifac-mobile-dialog",
  formContent: "ifac-form-content",
  avatarEditor: "ifac-avatar-editor",
  field: "ifac-field",
  fieldLabel: "ifac-field-label",
  fieldHint: "ifac-field-hint",
  fieldError: "ifac-field-error",
  mobileDialogBody: "ifac-mobile-dialog-body",
  mobileDialogFooter: "ifac-mobile-dialog-footer",
  cropEmpty: "ifac-crop-empty",
  cropStage: "ifac-crop-stage",
  cropPreview: "ifac-crop-preview",
  cropMask: "ifac-crop-mask",
  zoomControl: "ifac-zoom-control",
} as const;

const avatarBase = `
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 50%;
`;

export const StyledAvatarImage = styled.img<{ $size: number }>`
  ${avatarBase}
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border: 0;
  object-fit: cover;
`;

export const StyledAvatarFallback = styled.span<{
  $size: number;
  $themeColor: string;
}>`
  ${avatarBase}
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  color: var(--ac-text-secondary, #615d59);
  background: var(--ac-surface-muted, #f6f5f4);
  border: 1px solid var(--ac-border, rgba(0, 0, 0, 0.1));
  font-size: ${({ $size }) => Math.max(14, $size * 0.46)}px;
  --ac-primary: ${({ $themeColor }) => $themeColor};
`;

export const AccountCenterStyles = createGlobalStyle`
  .ifac-root {
    --ac-primary: #0075de;
    --ac-primary-active: color-mix(in srgb, var(--ac-primary) 82%, #000);
    --ac-surface: #fff;
    --ac-surface-muted: #f6f5f4;
    --ac-text: rgba(0, 0, 0, 0.95);
    --ac-text-secondary: #615d59;
    --ac-text-muted: #a39e98;
    --ac-border: rgba(0, 0, 0, 0.1);
    --ac-focus: #097fe8;
    --ac-danger: #d92d20;
    --ac-danger-hover: #b42318;
    display: inline-flex;
    color: var(--ac-text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }

  .ifac-trigger {
    display: inline-flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    color: inherit;
    background: transparent;
    cursor: pointer;
    transition: background-color 140ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .ifac-trigger:hover,
  .ifac-trigger[aria-expanded="true"] {
    background: var(--ac-surface-muted);
  }

  .ifac-trigger:active {
    background: color-mix(in srgb, var(--ac-surface-muted) 94%, #000);
  }

  .ifac-trigger:focus-visible {
    outline: 2px solid var(--ac-focus);
    outline-offset: 2px;
  }

  .ifac-menu {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 4px 0;
    color: var(--ac-text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }

  .ifac-summary {
    display: flex;
    min-height: 64px;
    box-sizing: border-box;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
  }

  .ifac-summary-text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .ifac-nickname {
    min-width: 0;
    max-width: 156px;
    overflow: hidden;
    color: var(--ac-text);
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ifac-username {
    min-width: 0;
    max-width: 156px;
    overflow: hidden;
    color: var(--ac-text-secondary);
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ifac-action-group {
    padding: 0;
  }

  .ifac-menu-item {
    display: flex;
    width: calc(100% - 8px);
    min-height: 44px;
    align-items: center;
    gap: 10px;
    margin: 0 4px;
    padding: 0 12px;
    border: 0;
    border-radius: 5px;
    color: var(--ac-text);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    text-align: left;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .ifac-menu-item .anticon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    font-size: 16px;
  }

  .ifac-menu-item:hover {
    background: var(--ac-surface-muted);
  }

  .ifac-menu-item:active {
    background: color-mix(in srgb, var(--ac-surface-muted) 94%, #000);
  }

  .ifac-menu-item:focus-visible {
    outline: 2px solid var(--ac-focus);
    outline-offset: -2px;
    background: var(--ac-surface-muted);
  }

  .ifac-menu-item:disabled {
    color: var(--ac-text-muted);
    background: transparent;
    cursor: not-allowed;
  }

  .ifac-divider {
    height: 1px;
    margin: 4px 16px;
    background: var(--ac-border);
  }

  .ifac-danger-item {
    color: var(--ac-danger);
  }

  .ifac-danger-item:hover,
  .ifac-danger-item:focus-visible {
    color: var(--ac-danger-hover);
  }

  .ifac-account-popover {
    --ac-surface: #fff;
    --ac-surface-muted: #f6f5f4;
    --ac-text: rgba(0, 0, 0, 0.95);
    --ac-text-secondary: #615d59;
    --ac-text-muted: #a39e98;
    --ac-border: rgba(0, 0, 0, 0.1);
    --ac-focus: #097fe8;
    --ac-danger: #d92d20;
    --ac-danger-hover: #b42318;
    width: 240px;
    max-width: calc(100vw - 32px);
  }

  .ifac-account-popover .ant-popover-inner {
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--ac-border);
    border-radius: 10px;
    background: var(--ac-surface);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.027), 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  .ifac-account-drawer {
    --ac-surface: #fff;
    --ac-surface-muted: #f6f5f4;
    --ac-text: rgba(0, 0, 0, 0.95);
    --ac-text-secondary: #615d59;
    --ac-text-muted: #a39e98;
    --ac-border: rgba(0, 0, 0, 0.1);
    --ac-focus: #097fe8;
    --ac-danger: #d92d20;
    --ac-danger-hover: #b42318;
  }

  .ifac-account-drawer .ant-drawer-mask,
  .ifac-mobile-dialog .ant-drawer-mask {
    background: rgba(0, 0, 0, 0.38);
  }

  .ifac-account-drawer .ant-drawer-content {
    max-height: 80dvh;
    overflow: hidden;
    border-top: 1px solid var(--ac-border);
    border-radius: 16px 16px 0 0;
    background: var(--ac-surface);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.04), 0 23px 52px rgba(0, 0, 0, 0.05);
  }

  .ifac-account-drawer .ant-drawer-body {
    overflow-y: auto;
    padding: 0 0 max(16px, env(safe-area-inset-bottom));
  }

  .ifac-account-drawer .ifac-menu-item {
    min-height: 48px;
  }

  .ifac-account-drawer .ifac-nickname,
  .ifac-account-drawer .ifac-username {
    max-width: calc(100vw - 112px);
  }

  .ifac-dialog,
  .ifac-confirm-dialog,
  .ifac-cropper-dialog {
    --ac-primary: #0075de;
    --ac-primary-active: #005bab;
    --ac-surface: #fff;
    --ac-surface-muted: #f6f5f4;
    --ac-text: rgba(0, 0, 0, 0.95);
    --ac-text-secondary: #615d59;
    --ac-text-muted: #a39e98;
    --ac-border: rgba(0, 0, 0, 0.1);
    --ac-focus: #097fe8;
    --ac-danger: #d92d20;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }

  .ifac-dialog .ant-modal-content,
  .ifac-confirm-dialog .ant-modal-content,
  .ifac-cropper-dialog .ant-modal-content {
    border: 1px solid var(--ac-border);
    border-radius: 12px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.04), 0 23px 52px rgba(0, 0, 0, 0.05);
  }

  .ifac-dialog .ant-modal-header,
  .ifac-cropper-dialog .ant-modal-header {
    margin-bottom: 20px;
  }

  .ifac-dialog .ant-modal-title,
  .ifac-cropper-dialog .ant-modal-title {
    color: var(--ac-text);
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
  }

  .ifac-dialog .ant-modal-body,
  .ifac-cropper-dialog .ant-modal-body {
    color: var(--ac-text);
    font-size: 14px;
    line-height: 20px;
  }

  .ifac-dialog .ant-modal-footer,
  .ifac-cropper-dialog .ant-modal-footer {
    margin-top: 20px;
  }

  .ifac-dialog .ant-input-affix-wrapper,
  .ifac-dialog .ant-input {
    min-height: 36px;
    border-color: var(--ac-border);
    border-radius: 4px;
  }

  .ifac-dialog .ant-input-affix-wrapper:focus-within,
  .ifac-dialog .ant-input:focus {
    border-color: var(--ac-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac-primary) 18%, transparent);
  }

  .ifac-dialog .ant-btn,
  .ifac-confirm-dialog .ant-btn,
  .ifac-cropper-dialog .ant-btn {
    min-height: 36px;
    border-radius: 4px;
    font-weight: 500;
  }

  .ifac-dialog .ant-btn-primary,
  .ifac-cropper-dialog .ant-btn-primary {
    background: var(--ac-primary);
  }

  .ifac-dialog .ant-btn-primary:hover,
  .ifac-cropper-dialog .ant-btn-primary:hover {
    background: var(--ac-primary-active);
  }

  .ifac-form-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .ifac-avatar-editor {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .ifac-field {
    display: flex;
    flex-direction: column;
  }

  .ifac-field-label {
    margin-bottom: 4px;
    color: var(--ac-text);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
  }

  .ifac-field-hint,
  .ifac-field-error {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 16px;
  }

  .ifac-field-hint {
    color: var(--ac-text-secondary);
  }

  .ifac-field-error {
    color: var(--ac-danger);
  }

  .ifac-mobile-dialog .ant-drawer-content {
    border-top: 1px solid var(--ac-border);
    border-radius: 16px 16px 0 0;
    background: var(--ac-surface);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.04), 0 23px 52px rgba(0, 0, 0, 0.05);
  }

  .ifac-mobile-dialog .ant-drawer-header {
    min-height: 56px;
    padding: 16px;
    border-bottom: 1px solid var(--ac-border);
  }

  .ifac-mobile-dialog .ant-drawer-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
  }

  .ifac-mobile-dialog .ant-drawer-body {
    display: flex;
    flex-direction: column;
    padding: 20px 16px max(16px, env(safe-area-inset-bottom));
  }

  .ifac-mobile-dialog-body {
    display: flex;
    min-height: 100%;
    flex: 1;
    flex-direction: column;
  }

  .ifac-mobile-dialog-footer {
    position: sticky;
    bottom: calc(-1 * max(16px, env(safe-area-inset-bottom)));
    margin: auto -16px calc(-1 * max(16px, env(safe-area-inset-bottom)));
    padding: 12px 16px max(16px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--ac-border);
    background: var(--ac-surface);
  }

  .ifac-crop-empty {
    display: flex;
    height: 320px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 1px dashed var(--ac-border);
    border-radius: 8px;
    background: var(--ac-surface-muted);
  }

  .ifac-crop-stage {
    position: relative;
    width: 100%;
    height: 320px;
    overflow: hidden;
    border: 1px solid var(--ac-border);
    border-radius: 8px;
    background: var(--ac-surface-muted);
    cursor: grab;
    touch-action: none;
  }

  .ifac-crop-stage:active {
    cursor: grabbing;
  }

  .ifac-crop-preview {
    position: absolute;
    left: 50%;
    top: 50%;
    max-width: none;
    user-select: none;
    pointer-events: none;
  }

  .ifac-crop-mask {
    position: absolute;
    z-index: 1;
    left: 50%;
    top: 50%;
    width: min(240px, calc(100% - 40px));
    aspect-ratio: 1;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .ifac-zoom-control {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    color: var(--ac-text-secondary);
    font-size: 12px;
    line-height: 16px;
  }

  .ifac-zoom-control input {
    accent-color: var(--ac-primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .ifac-trigger,
    .ifac-menu-item {
      transition: none;
    }
  }
`;
