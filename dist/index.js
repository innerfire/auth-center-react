"use client";


import { n as isAccountCenterError, r as createAccountCenterAuthScope, t as AccountCenterError } from "./error-DD3Y3R35.js";
import { n as createGatewayProfileAdapter, r as createDefaultAdapter, t as GatewayProfileAdapterError } from "./adapters-CHzN6_o9.js";
import { a as validateAvatarFile, n as blobToDataUrl, o as validateNickname, s as validatePasswordChange, t as AVATAR_PLACEHOLDER } from "./utils-B_hsVTc8.js";
import { a as shouldRetryProfileQuery, c as useLogout, d as useUploadAvatar, f as useIsMobile, i as removeAllProfileCache, l as usePatchProfile, n as cancelAllProfileQueries, o as useCapabilities, r as getProfileKey, s as useChangePassword, u as useProfile } from "./hooks-CFFuHxHH.js";
import { a as useOptionalAccountCenterAdapter, i as useAccountCenterAuth, n as AccountCenterProvider, o as useOptionalAccountCenterAuth, r as useAccountCenterAdapter, s as createDirectGatewayAdapter, t as AccountCenterCallback } from "./spa-Dz2OhLwA.js";
import { n as decodeGatewayProfile, t as GatewayProfileError } from "./gateway-profile-DwyoIRxY.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Input, Modal, Popover, message } from "antd";
import { CameraOutlined, EditOutlined, LockOutlined, LogoutOutlined, PictureOutlined, UserOutlined } from "@ant-design/icons";
import styled, { createGlobalStyle } from "styled-components";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

//#region src/components/styles.ts
/**
* Stable, package-owned class names are required for Ant Design portals.
* Every selector is namespaced so the injected stylesheet cannot match host UI.
*/
const styles = {
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
	zoomControl: "ifac-zoom-control"
};
const avatarBase = `
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 50%;
`;
const StyledAvatarImage = styled.img`
  ${avatarBase}
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border: 0;
  object-fit: cover;
`;
const StyledAvatarFallback = styled.span`
  ${avatarBase}
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  color: var(--ac-text-secondary, #615d59);
  background: var(--ac-surface-muted, #f6f5f4);
  border: 1px solid var(--ac-border, rgba(0, 0, 0, 0.1));
  font-size: ${({ $size }) => Math.max(14, $size * .46)}px;
  --ac-primary: ${({ $themeColor }) => $themeColor};
`;
const AccountCenterStyles = createGlobalStyle`
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

//#endregion
//#region src/components/avatar-image.tsx
function AvatarImage({ src, size = 32, themeColor = "#0075de", className }) {
	const [failed, setFailed] = React.useState(false);
	React.useEffect(() => setFailed(false), [src]);
	if (!src || failed) return /* @__PURE__ */ jsx(StyledAvatarFallback, {
		role: "img",
		"aria-label": "用户头像",
		className,
		$size: size,
		$themeColor: themeColor,
		children: /* @__PURE__ */ jsx(UserOutlined, { "aria-hidden": true })
	});
	return /* @__PURE__ */ jsx(StyledAvatarImage, {
		src,
		alt: "用户头像",
		width: size,
		height: size,
		className,
		$size: size,
		onError: () => setFailed(true)
	});
}

//#endregion
//#region src/components/avatar-cropper.tsx
const OUTPUT_SIZE = 512;
function AvatarCropper({ open, onClose, onCropped }) {
	const fileInputRef = useRef(null);
	const [preview, setPreview] = useState(null);
	const [image, setImage] = useState(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({
		x: 0,
		y: 0
	});
	const [dragging, setDragging] = useState(false);
	const [cropping, setCropping] = useState(false);
	const dragStart = useRef({
		x: 0,
		y: 0,
		ox: 0,
		oy: 0
	});
	React.useEffect(() => {
		if (!open) return;
		setPreview(null);
		setImage(null);
		setScale(1);
		setOffset({
			x: 0,
			y: 0
		});
	}, [open]);
	const handleFile = useCallback(async (file) => {
		const validationError = validateAvatarFile(file);
		if (validationError) {
			message.error(validationError);
			return;
		}
		const dataUrl = await blobToDataUrl(file);
		const nextImage = new Image();
		nextImage.onload = () => {
			setImage(nextImage);
			setPreview(dataUrl);
		};
		nextImage.onerror = () => message.error("无法读取图片，请重新选择");
		nextImage.src = dataUrl;
	}, []);
	const getCroppedBlob = useCallback(async () => {
		if (!image) return null;
		const canvas = document.createElement("canvas");
		canvas.width = OUTPUT_SIZE;
		canvas.height = OUTPUT_SIZE;
		const context = canvas.getContext("2d");
		if (!context) return null;
		const imageAspect = image.naturalWidth / image.naturalHeight;
		let drawWidth;
		let drawHeight;
		if (imageAspect > 1) {
			drawHeight = OUTPUT_SIZE * scale;
			drawWidth = drawHeight * imageAspect;
		} else {
			drawWidth = OUTPUT_SIZE * scale;
			drawHeight = drawWidth / imageAspect;
		}
		const stageToOutput = OUTPUT_SIZE / 240;
		const x = (OUTPUT_SIZE - drawWidth) / 2 + offset.x * stageToOutput;
		const y = (OUTPUT_SIZE - drawHeight) / 2 + offset.y * stageToOutput;
		context.drawImage(image, x, y, drawWidth, drawHeight);
		return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
	}, [
		image,
		offset,
		scale
	]);
	const handleCrop = useCallback(async () => {
		setCropping(true);
		try {
			const blob = await getCroppedBlob();
			if (!blob) {
				message.error("裁剪失败，请重试");
				return;
			}
			onCropped(blob);
			onClose();
		} finally {
			setCropping(false);
		}
	}, [
		getCroppedBlob,
		onClose,
		onCropped
	]);
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("input", {
		ref: fileInputRef,
		type: "file",
		accept: "image/jpeg,image/png",
		hidden: true,
		onChange: (event) => {
			const file = event.target.files?.[0];
			if (file) handleFile(file);
			event.currentTarget.value = "";
		}
	}), /* @__PURE__ */ jsx(Modal, {
		title: "裁剪头像",
		open,
		onCancel: onClose,
		width: 420,
		destroyOnHidden: true,
		rootClassName: styles.cropperDialog,
		footer: [/* @__PURE__ */ jsx(Button, {
			onClick: onClose,
			children: "取消"
		}, "cancel"), /* @__PURE__ */ jsx(Button, {
			type: "primary",
			disabled: !image,
			loading: cropping,
			onClick: handleCrop,
			children: "确认裁剪"
		}, "crop")],
		children: !preview || !image ? /* @__PURE__ */ jsxs("div", {
			className: styles.cropEmpty,
			children: [
				/* @__PURE__ */ jsx(PictureOutlined, {
					"aria-hidden": true,
					style: {
						color: "#615d59",
						fontSize: 28
					}
				}),
				/* @__PURE__ */ jsx(Button, {
					type: "primary",
					onClick: () => fileInputRef.current?.click(),
					children: "选择图片"
				}),
				/* @__PURE__ */ jsx("p", {
					className: styles.fieldHint,
					children: "支持 JPG、PNG，文件不超过 2 MiB"
				})
			]
		}) : /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("div", {
			className: styles.cropStage,
			onPointerDown: (event) => {
				setDragging(true);
				dragStart.current = {
					x: event.clientX,
					y: event.clientY,
					ox: offset.x,
					oy: offset.y
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			},
			onPointerMove: (event) => {
				if (!dragging) return;
				setOffset({
					x: dragStart.current.ox + event.clientX - dragStart.current.x,
					y: dragStart.current.oy + event.clientY - dragStart.current.y
				});
			},
			onPointerUp: (event) => {
				setDragging(false);
				event.currentTarget.releasePointerCapture(event.pointerId);
			},
			onPointerCancel: () => setDragging(false),
			children: [/* @__PURE__ */ jsx("img", {
				src: preview,
				alt: "裁剪预览",
				draggable: false,
				className: styles.cropPreview,
				style: {
					width: image.naturalWidth,
					height: image.naturalHeight,
					transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`
				}
			}), /* @__PURE__ */ jsx("div", {
				className: styles.cropMask,
				"aria-hidden": true
			})]
		}), /* @__PURE__ */ jsxs("label", {
			className: styles.zoomControl,
			children: [/* @__PURE__ */ jsx("span", { children: "缩放" }), /* @__PURE__ */ jsx("input", {
				type: "range",
				min: .5,
				max: 3,
				step: .01,
				value: scale,
				onChange: (event) => setScale(Number.parseFloat(event.target.value)),
				"aria-label": "缩放比例"
			})]
		})] })
	})] });
}

//#endregion
//#region src/components/edit-profile.tsx
const EMPTY_FORM = {
	nickname: "",
	email: ""
};
function formFromProfile(profile) {
	return {
		nickname: profile?.nickname ?? "",
		email: profile?.email ?? ""
	};
}
function validateForm(form) {
	if ([...form.nickname.trim()].length > 100) return "显示名称不能超过 100 个字符";
	const email = form.email.trim();
	if ([...email].length > 254) return "邮箱不能超过 254 个字符";
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "请输入完整的邮箱地址";
	return null;
}
function EditProfileModal({ open, onClose, adapter, allowAvatarUpload }) {
	const isMobile = useIsMobile();
	const { data: profile, refetch } = useProfile(adapter);
	const patchProfile = usePatchProfile(adapter);
	const uploadAvatar = useUploadAvatar(adapter);
	const saveLockRef = React.useRef(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [formError, setFormError] = useState(null);
	const [showCropper, setShowCropper] = useState(false);
	const [pendingBlob, setPendingBlob] = useState(null);
	const pendingPreview = useMemo(() => pendingBlob ? URL.createObjectURL(pendingBlob) : null, [pendingBlob]);
	React.useEffect(() => () => {
		if (pendingPreview) URL.revokeObjectURL(pendingPreview);
	}, [pendingPreview]);
	React.useEffect(() => {
		if (!open) return;
		setForm(formFromProfile(profile));
		setFormError(null);
		setPendingBlob(null);
		setShowCropper(false);
	}, [open, profile]);
	const updateField = useCallback((field, value) => {
		setForm((current) => ({
			...current,
			[field]: value
		}));
		setFormError(null);
	}, []);
	const handleSave = useCallback(async () => {
		if (saveLockRef.current) return;
		const validationError = validateForm(form);
		if (validationError) {
			setFormError(validationError);
			return;
		}
		const normalized = {
			nickname: form.nickname.normalize("NFC").trim(),
			email: form.email.trim()
		};
		const original = formFromProfile(profile);
		const changedFields = Object.keys(normalized).reduce((result, field) => {
			if (normalized[field] !== original[field]) result[field] = normalized[field];
			return result;
		}, {});
		saveLockRef.current = true;
		try {
			if (pendingBlob) await uploadAvatar.mutateAsync(pendingBlob);
			if (Object.keys(changedFields).length > 0) await patchProfile.mutateAsync(changedFields);
			message.success("资料已更新");
			onClose();
		} catch (error) {
			await refetch();
			message.error(error instanceof Error ? error.message : "更新失败，请重试");
		} finally {
			saveLockRef.current = false;
		}
	}, [
		form,
		onClose,
		patchProfile,
		pendingBlob,
		profile,
		refetch,
		uploadAvatar
	]);
	const pending = patchProfile.isPending || uploadAvatar.isPending;
	const content = /* @__PURE__ */ jsxs("div", {
		className: styles.formContent,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: styles.avatarEditor,
				children: [/* @__PURE__ */ jsx(AvatarImage, {
					src: pendingPreview ?? profile?.avatarUrl,
					size: 64
				}), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx(Button, {
					icon: /* @__PURE__ */ jsx(CameraOutlined, {}),
					onClick: () => setShowCropper(true),
					"aria-label": "更换头像",
					disabled: !allowAvatarUpload,
					title: allowAvatarUpload ? void 0 : "头像上传能力尚未启用",
					children: "更换头像"
				}), !allowAvatarUpload && /* @__PURE__ */ jsx("p", {
					className: styles.fieldHint,
					children: "头像上传能力尚未启用"
				})] })]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: styles.field,
				children: [/* @__PURE__ */ jsx("label", {
					className: styles.fieldLabel,
					htmlFor: "account-nickname",
					children: "显示名称"
				}), /* @__PURE__ */ jsx(Input, {
					id: "account-nickname",
					value: form.nickname,
					maxLength: 100,
					autoComplete: "nickname",
					onChange: (event) => updateField("nickname", event.target.value)
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: styles.field,
				children: [/* @__PURE__ */ jsx("label", {
					className: styles.fieldLabel,
					htmlFor: "account-email",
					children: "邮箱"
				}), /* @__PURE__ */ jsx(Input, {
					id: "account-email",
					value: form.email,
					maxLength: 254,
					autoComplete: "email",
					onChange: (event) => updateField("email", event.target.value)
				})]
			}),
			formError && /* @__PURE__ */ jsx("p", {
				className: styles.fieldError,
				role: "alert",
				children: formError
			}),
			/* @__PURE__ */ jsx(AvatarCropper, {
				open: allowAvatarUpload && showCropper,
				onClose: () => setShowCropper(false),
				onCropped: (blob) => {
					setPendingBlob(blob);
					setShowCropper(false);
				}
			})
		]
	});
	if (isMobile) return /* @__PURE__ */ jsx(Drawer, {
		title: "编辑资料",
		placement: "bottom",
		size: "80dvh",
		open,
		onClose,
		destroyOnHidden: true,
		rootClassName: `${styles.dialog} ${styles.mobileDialog}`,
		children: /* @__PURE__ */ jsxs("div", {
			className: styles.mobileDialogBody,
			children: [content, /* @__PURE__ */ jsx("div", {
				className: styles.mobileDialogFooter,
				children: /* @__PURE__ */ jsx(Button, {
					type: "primary",
					block: true,
					loading: pending,
					onClick: handleSave,
					children: "保存"
				})
			})]
		})
	});
	return /* @__PURE__ */ jsx(Modal, {
		title: "编辑资料",
		open,
		width: 480,
		onCancel: onClose,
		destroyOnHidden: true,
		rootClassName: styles.dialog,
		footer: [/* @__PURE__ */ jsx(Button, {
			onClick: onClose,
			children: "取消"
		}, "cancel"), /* @__PURE__ */ jsx(Button, {
			type: "primary",
			loading: pending,
			onClick: handleSave,
			children: "保存"
		}, "save")],
		children: content
	});
}

//#endregion
//#region src/components/change-password.tsx
function ChangePasswordModal({ open, onClose, adapter }) {
	const isMobile = useIsMobile();
	const changePassword = useChangePassword(adapter);
	const submitLockRef = useRef(false);
	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState(null);
	React.useEffect(() => {
		if (!open) return;
		setOldPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setError(null);
	}, [open]);
	const handleSubmit = useCallback(async () => {
		if (submitLockRef.current) return;
		const validationError = validatePasswordChange(oldPassword, newPassword, confirmPassword);
		if (validationError) {
			setError(validationError);
			return;
		}
		setError(null);
		submitLockRef.current = true;
		try {
			if ((await changePassword.mutateAsync({
				oldPassword,
				newPassword
			})).ok) {
				message.success("密码已修改，请重新登录");
				const logoutResult = await adapter.logout();
				window.location.href = logoutResult.logoutUrl;
			}
		} catch (submitError) {
			if (isAccountCenterError(submitError) && (submitError.status === 502 || submitError.status === 504)) {
				message.error("密码修改结果暂时无法确认，请使用新密码尝试重新登录，且不要自动重试");
				return;
			}
			message.error(submitError instanceof Error ? submitError.message : "修改失败，请重试");
		} finally {
			submitLockRef.current = false;
		}
	}, [
		adapter,
		changePassword,
		confirmPassword,
		newPassword,
		oldPassword
	]);
	const content = /* @__PURE__ */ jsxs("div", {
		className: styles.formContent,
		children: [
			/* @__PURE__ */ jsx(PasswordField, {
				id: "account-old-password",
				label: "原密码",
				value: oldPassword,
				onChange: setOldPassword,
				autoComplete: "current-password"
			}),
			/* @__PURE__ */ jsx(PasswordField, {
				id: "account-new-password",
				label: "新密码",
				value: newPassword,
				onChange: setNewPassword,
				autoComplete: "new-password"
			}),
			/* @__PURE__ */ jsx(PasswordField, {
				id: "account-confirm-password",
				label: "确认新密码",
				value: confirmPassword,
				onChange: setConfirmPassword,
				autoComplete: "new-password"
			}),
			error && /* @__PURE__ */ jsx("p", {
				className: styles.fieldError,
				role: "alert",
				"aria-live": "assertive",
				children: error
			})
		]
	});
	if (isMobile) return /* @__PURE__ */ jsx(Drawer, {
		title: "修改密码",
		placement: "bottom",
		size: "80dvh",
		open,
		onClose,
		destroyOnHidden: true,
		rootClassName: `${styles.dialog} ${styles.mobileDialog}`,
		children: /* @__PURE__ */ jsxs("div", {
			className: styles.mobileDialogBody,
			children: [content, /* @__PURE__ */ jsx("div", {
				className: styles.mobileDialogFooter,
				children: /* @__PURE__ */ jsx(Button, {
					type: "primary",
					block: true,
					loading: changePassword.isPending,
					onClick: handleSubmit,
					children: "确认修改"
				})
			})]
		})
	});
	return /* @__PURE__ */ jsx(Modal, {
		title: "修改密码",
		open,
		width: 480,
		onCancel: onClose,
		destroyOnHidden: true,
		rootClassName: styles.dialog,
		footer: [/* @__PURE__ */ jsx(Button, {
			onClick: onClose,
			children: "取消"
		}, "cancel"), /* @__PURE__ */ jsx(Button, {
			type: "primary",
			loading: changePassword.isPending,
			onClick: handleSubmit,
			children: "确认修改"
		}, "submit")],
		children: content
	});
}
function PasswordField({ id, label, value, onChange, autoComplete }) {
	return /* @__PURE__ */ jsxs("div", {
		className: styles.field,
		children: [/* @__PURE__ */ jsx("label", {
			className: styles.fieldLabel,
			htmlFor: id,
			children: label
		}), /* @__PURE__ */ jsx(Input.Password, {
			id,
			value,
			onChange: (event) => onChange(event.target.value),
			prefix: /* @__PURE__ */ jsx(LockOutlined, { "aria-hidden": true }),
			autoComplete
		})]
	});
}

//#endregion
//#region src/hooks/use-focus-trap.ts
/**
* Trap keyboard focus inside a container element.
* Returns a ref to attach to the container and an `active` setter.
*/
function useFocusTrap(active) {
	const containerRef = useRef(null);
	const previousFocusRef = useRef(null);
	useEffect(() => {
		if (!active) return;
		previousFocusRef.current = document.activeElement;
		const el = containerRef.current;
		if (el) (el.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])") ?? el).focus();
		return () => {
			previousFocusRef.current?.focus();
		};
	}, [active]);
	return {
		containerRef,
		handleKeyDown: useCallback((e) => {
			if (!active || e.key !== "Tab") return;
			const el = containerRef.current;
			if (!el) return;
			const focusable = Array.from(el.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"));
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}, [active])
	};
}

//#endregion
//#region src/components/account-center.tsx
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
function getRelativeLuminance(hex) {
	const values = [
		1,
		3,
		5
	].map((start) => {
		const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
		return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
	});
	return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function resolveThemeColor(value) {
	if (!/^#[0-9a-f]{6}$/i.test(value)) return DEFAULT_THEME;
	return 1.05 / (getRelativeLuminance(value) + .05) >= 4.5 ? value : DEFAULT_THEME;
}
function AccountCenter({ themeColor = DEFAULT_THEME, avatarSize = 32, adapter: injectedAdapter, authScope }) {
	const safeThemeColor = resolveThemeColor(themeColor);
	const safeAvatarSize = Number.isInteger(avatarSize) && avatarSize >= 24 && avatarSize <= 96 ? avatarSize : 32;
	const scopeForDefault = React.useMemo(() => authScope ? { getAuthScope: () => authScope } : void 0, [authScope]);
	const defaultAdapter = React.useMemo(() => createDefaultAdapter(globalThis.fetch.bind(globalThis), scopeForDefault), [scopeForDefault]);
	const providerAdapter = useOptionalAccountCenterAdapter();
	const providerAuth = useOptionalAccountCenterAuth();
	const adapter = injectedAdapter ?? providerAdapter ?? defaultAdapter;
	const isMobile = useIsMobile();
	const { data: profile, isError: profileError, isLoading: profileLoading } = useProfile(adapter);
	const logout = useLogout(adapter);
	const [menuOpen, setMenuOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [passwordOpen, setPasswordOpen] = useState(false);
	const triggerRef = useRef(null);
	const { containerRef, handleKeyDown } = useFocusTrap(menuOpen);
	const closeMenu = useCallback((restoreFocus = true) => {
		setMenuOpen(false);
		if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
	}, []);
	useEffect(() => {
		if (!menuOpen) return;
		const focusTimer = window.setTimeout(() => {
			containerRef.current?.querySelector("[role=\"menuitem\"]:not([disabled])")?.focus();
		}, 0);
		const handleEscape = (event) => {
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
	}, [
		closeMenu,
		containerRef,
		menuOpen
	]);
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
				loading: logout.isPending
			},
			onOk: async () => {
				if (providerAuth) {
					await providerAuth.logout();
					return;
				}
				const result = await logout.mutateAsync();
				if (result?.logoutUrl) window.location.href = result.logoutUrl;
			},
			afterClose: () => triggerRef.current?.focus()
		});
	}, [
		closeMenu,
		logout,
		providerAuth
	]);
	const handleMenuKeyDown = useCallback((event) => {
		handleKeyDown(event);
		if (![
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(event.key)) return;
		const items = Array.from(event.currentTarget.querySelectorAll("[role=\"menuitem\"]:not([disabled])"));
		if (!items.length) return;
		event.preventDefault();
		const current = items.indexOf(document.activeElement);
		if (event.key === "Home") return items[0].focus();
		if (event.key === "End") return items[items.length - 1].focus();
		items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
	}, [handleKeyDown]);
	const summaryLabel = profile?.nickname?.trim() || (profileError ? "未获取到用户信息" : "加载中…");
	const profileActionDisabled = profileLoading || profileError || !profile;
	const menu = /* @__PURE__ */ jsxs("div", {
		ref: containerRef,
		className: styles.menu,
		onKeyDown: handleMenuKeyDown,
		role: "menu",
		"aria-label": "账户操作",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: styles.summary,
				children: [/* @__PURE__ */ jsx(AvatarImage, {
					src: profile?.avatarUrl,
					size: 40,
					themeColor: safeThemeColor
				}), /* @__PURE__ */ jsxs("span", {
					className: styles.summaryText,
					children: [/* @__PURE__ */ jsx("span", {
						className: styles.nickname,
						title: summaryLabel,
						children: summaryLabel
					}), profile?.username && /* @__PURE__ */ jsxs("span", {
						className: styles.username,
						title: `用户名: ${profile.username}`,
						children: ["用户名: ", profile.username]
					})]
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: styles.divider,
				role: "separator"
			}),
			/* @__PURE__ */ jsxs("div", {
				className: styles.actionGroup,
				children: [/* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: openEdit,
					className: styles.menuItem,
					disabled: profileActionDisabled,
					children: [/* @__PURE__ */ jsx(EditOutlined, { "aria-hidden": true }), /* @__PURE__ */ jsx("span", { children: "编辑资料" })]
				}), /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: openPassword,
					className: styles.menuItem,
					disabled: profileActionDisabled || profile?.capabilities?.passwordChange === false,
					title: profile?.capabilities?.passwordChange === false ? "密码修改功能尚未启用" : void 0,
					children: [/* @__PURE__ */ jsx(LockOutlined, { "aria-hidden": true }), /* @__PURE__ */ jsx("span", { children: "修改密码" })]
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: styles.divider,
				role: "separator"
			}),
			/* @__PURE__ */ jsxs("button", {
				type: "button",
				role: "menuitem",
				onClick: handleLogout,
				className: `${styles.menuItem} ${styles.dangerItem}`,
				children: [/* @__PURE__ */ jsx(LogoutOutlined, { "aria-hidden": true }), /* @__PURE__ */ jsx("span", { children: "退出系统" })]
			})
		]
	});
	const trigger = /* @__PURE__ */ jsx("button", {
		ref: triggerRef,
		type: "button",
		onClick: () => {
			if (isMobile) setMenuOpen((open) => !open);
		},
		className: styles.trigger,
		"aria-label": "账户菜单",
		"aria-haspopup": "menu",
		"aria-expanded": menuOpen,
		style: {
			"--ac-avatar-size": `${safeAvatarSize}px`,
			"--ac-primary": safeThemeColor
		},
		children: /* @__PURE__ */ jsx(AvatarImage, {
			src: profile?.avatarUrl,
			size: safeAvatarSize,
			themeColor: safeThemeColor
		})
	});
	return /* @__PURE__ */ jsxs("div", {
		className: styles.root,
		style: { "--ac-primary": safeThemeColor },
		children: [
			/* @__PURE__ */ jsx(AccountCenterStyles, {}),
			isMobile ? /* @__PURE__ */ jsxs(Fragment, { children: [trigger, /* @__PURE__ */ jsx(Drawer, {
				placement: "bottom",
				size: "min(80dvh, 260px)",
				open: menuOpen,
				onClose: () => closeMenu(),
				closable: false,
				destroyOnHidden: true,
				rootClassName: styles.accountDrawer,
				"aria-label": "账户菜单",
				children: menu
			})] }) : /* @__PURE__ */ jsx(Popover, {
				content: menu,
				trigger: "click",
				open: menuOpen,
				onOpenChange: (open) => open ? setMenuOpen(true) : closeMenu(),
				placement: "bottomRight",
				arrow: false,
				rootClassName: styles.accountPopover,
				children: trigger
			}),
			/* @__PURE__ */ jsx(EditProfileModal, {
				open: editOpen,
				onClose: () => {
					setEditOpen(false);
					triggerRef.current?.focus();
				},
				adapter,
				allowAvatarUpload: profile?.capabilities?.avatarUpload === true
			}),
			/* @__PURE__ */ jsx(ChangePasswordModal, {
				open: passwordOpen,
				onClose: () => {
					setPasswordOpen(false);
					triggerRef.current?.focus();
				},
				adapter
			})
		]
	});
}

//#endregion
export { AVATAR_PLACEHOLDER, AccountCenter, AccountCenterCallback, AccountCenterError, AccountCenterProvider, AvatarImage, GatewayProfileAdapterError, GatewayProfileError, cancelAllProfileQueries, createAccountCenterAuthScope, createDefaultAdapter, createDirectGatewayAdapter, createGatewayProfileAdapter, decodeGatewayProfile, getProfileKey, isAccountCenterError, removeAllProfileCache, shouldRetryProfileQuery, useAccountCenterAdapter, useAccountCenterAuth, useCapabilities, useChangePassword, useIsMobile, useLogout, useOptionalAccountCenterAuth, usePatchProfile, useProfile, useUploadAvatar, validateAvatarFile, validateNickname, validatePasswordChange };
//# sourceMappingURL=index.js.map