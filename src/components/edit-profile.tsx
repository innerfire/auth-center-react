import React, { useCallback, useMemo, useState } from "react";
import { Button, Drawer, Input, Modal, message } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import type { AccountCenterAdapter, ProfilePatchPayload } from "../types";
import { AvatarImage } from "./avatar-image";
import { AvatarCropper } from "./avatar-cropper";
import { useIsMobile } from "../hooks/use-is-mobile";
import { usePatchProfile, useProfile, useUploadAvatar } from "../hooks/use-account";
import { styles } from "./styles";

interface EditProfileProps {
  open: boolean;
  onClose: () => void;
  adapter: AccountCenterAdapter;
  allowAvatarUpload: boolean;
}

type ProfileForm = {
  nickname: string;
  email: string;
};

const EMPTY_FORM: ProfileForm = { nickname: "", email: "" };

function formFromProfile(profile: ReturnType<typeof useProfile>["data"]): ProfileForm {
  return {
    nickname: profile?.nickname ?? "",
    email: profile?.email ?? "",
  };
}

function validateForm(form: ProfileForm): string | null {
  if ([...form.nickname.trim()].length > 100) return "显示名称不能超过 100 个字符";
  const email = form.email.trim();
  if ([...email].length > 254) return "邮箱不能超过 254 个字符";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "请输入完整的邮箱地址";
  return null;
}

export function EditProfileModal({
  open,
  onClose,
  adapter,
  allowAvatarUpload,
}: EditProfileProps) {
  const isMobile = useIsMobile();
  const { data: profile, refetch } = useProfile(adapter);
  const patchProfile = usePatchProfile(adapter);
  const uploadAvatar = useUploadAvatar(adapter);
  const saveLockRef = React.useRef(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const pendingPreview = useMemo(
    () => (pendingBlob ? URL.createObjectURL(pendingBlob) : null),
    [pendingBlob],
  );

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

  const updateField = useCallback((field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (saveLockRef.current) return;
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized: ProfileForm = {
      nickname: form.nickname.normalize("NFC").trim(),
      email: form.email.trim(),
    };
    const original = formFromProfile(profile);
    const changedFields = (Object.keys(normalized) as Array<keyof ProfileForm>)
      .reduce<ProfilePatchPayload>((result, field) => {
        if (normalized[field] !== original[field]) result[field] = normalized[field];
        return result;
      }, {});

    saveLockRef.current = true;
    try {
      if (pendingBlob) await uploadAvatar.mutateAsync(pendingBlob);
      if (Object.keys(changedFields).length > 0) await patchProfile.mutateAsync(changedFields);
      message.success("资料已更新");
      onClose();
    } catch (error: unknown) {
      await refetch();
      message.error(error instanceof Error ? error.message : "更新失败，请重试");
    } finally {
      saveLockRef.current = false;
    }
  }, [form, onClose, patchProfile, pendingBlob, profile, refetch, uploadAvatar]);

  const pending = patchProfile.isPending || uploadAvatar.isPending;
  const content = (
    <div className={styles.formContent}>
      <div className={styles.avatarEditor}>
        <AvatarImage src={pendingPreview ?? profile?.avatarUrl} size={64} />
        <div>
          <Button
            icon={<CameraOutlined />}
            onClick={() => setShowCropper(true)}
            aria-label="更换头像"
            disabled={!allowAvatarUpload}
            title={allowAvatarUpload ? undefined : "头像上传能力尚未启用"}
          >
            更换头像
          </Button>
          {!allowAvatarUpload && <p className={styles.fieldHint}>头像上传能力尚未启用</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="account-nickname">显示名称</label>
        <Input
          id="account-nickname"
          value={form.nickname}
          maxLength={100}
          autoComplete="nickname"
          onChange={(event) => updateField("nickname", event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="account-email">邮箱</label>
        <Input
          id="account-email"
          value={form.email}
          maxLength={254}
          autoComplete="email"
          onChange={(event) => updateField("email", event.target.value)}
        />
      </div>

      {formError && <p className={styles.fieldError} role="alert">{formError}</p>}
      <AvatarCropper
        open={allowAvatarUpload && showCropper}
        onClose={() => setShowCropper(false)}
        onCropped={(blob) => {
          setPendingBlob(blob);
          setShowCropper(false);
        }}
      />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        title="编辑资料"
        placement="bottom"
        size="80dvh"
        open={open}
        onClose={onClose}
        destroyOnHidden
        rootClassName={`${styles.dialog} ${styles.mobileDialog}`}
      >
        <div className={styles.mobileDialogBody}>
          {content}
          <div className={styles.mobileDialogFooter}>
            <Button type="primary" block loading={pending} onClick={handleSave}>保存</Button>
          </div>
        </div>
      </Drawer>
    );
  }

  return (
    <Modal
      title="编辑资料"
      open={open}
      width={480}
      onCancel={onClose}
      destroyOnHidden
      rootClassName={styles.dialog}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" loading={pending} onClick={handleSave}>保存</Button>,
      ]}
    >
      {content}
    </Modal>
  );
}
