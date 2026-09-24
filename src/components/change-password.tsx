import React, { useCallback, useRef, useState } from "react";
import { Button, Drawer, Input, Modal, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import type { AccountCenterAdapter } from "../types";
import { useChangePassword } from "../hooks/use-account";
import { useIsMobile } from "../hooks/use-is-mobile";
import { validatePasswordChange } from "../utils";
import { isAccountCenterError } from "../error";
import { styles } from "./styles";

interface ChangePasswordProps {
  open: boolean;
  onClose: () => void;
  adapter: AccountCenterAdapter;
}

export function ChangePasswordModal({
  open,
  onClose,
  adapter,
}: ChangePasswordProps) {
  const isMobile = useIsMobile();
  const changePassword = useChangePassword(adapter);
  const submitLockRef = useRef(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (submitLockRef.current) return;
    const validationError = validatePasswordChange(
      oldPassword,
      newPassword,
      confirmPassword,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    submitLockRef.current = true;
    try {
      const result = await changePassword.mutateAsync({
        oldPassword,
        newPassword,
      });
      if (result.ok) {
        message.success("密码已修改，请重新登录");
        const logoutResult = await adapter.logout();
        window.location.href = logoutResult.logoutUrl;
      }
    } catch (submitError: unknown) {
      if (isAccountCenterError(submitError)
        && (submitError.status === 502 || submitError.status === 504)) {
        message.error("密码修改结果暂时无法确认，请使用新密码尝试重新登录，且不要自动重试");
        return;
      }
      message.error(
        submitError instanceof Error
          ? submitError.message
          : "修改失败，请重试",
      );
    } finally {
      submitLockRef.current = false;
    }
  }, [
    adapter,
    changePassword,
    confirmPassword,
    newPassword,
    oldPassword,
  ]);

  const content = (
    <div className={styles.formContent}>
      <PasswordField
        id="account-old-password"
        label="原密码"
        value={oldPassword}
        onChange={setOldPassword}
        autoComplete="current-password"
      />
      <PasswordField
        id="account-new-password"
        label="新密码"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
      />
      <PasswordField
        id="account-confirm-password"
        label="确认新密码"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
      />
      {error && (
        <p className={styles.fieldError} role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        title="修改密码"
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
            <Button
              type="primary"
              block
              loading={changePassword.isPending}
              onClick={handleSubmit}
            >
              确认修改
            </Button>
          </div>
        </div>
      </Drawer>
    );
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      width={480}
      onCancel={onClose}
      destroyOnHidden
      rootClassName={styles.dialog}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={changePassword.isPending}
          onClick={handleSubmit}
        >
          确认修改
        </Button>,
      ]}
    >
      {content}
    </Modal>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: PasswordFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <Input.Password
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        prefix={<LockOutlined aria-hidden />}
        autoComplete={autoComplete}
      />
    </div>
  );
}
