/**
 * Tests for utils: validateNickname, validatePasswordChange, validateAvatarFile.
 *
 * Covers Unicode user-visible characters, whitespace trimming, MIME types,
 * and the 5 MiB size boundary.
 */
import { describe, it, expect } from "vitest";
import {
  validateNickname,
  validatePasswordChange,
  validateAvatarFile,
  AVATAR_PLACEHOLDER,
  isMobileViewport,
} from "../utils";

// ─── validateNickname ───────────────────────────────────────────────

describe("validateNickname", () => {
  // Valid cases
  it("accepts 2-character string", () => {
    expect(validateNickname("AB")).toBeNull();
  });

  it("accepts 20-character string", () => {
    expect(validateNickname("A".repeat(20))).toBeNull();
  });

  it("accepts CJK characters", () => {
    expect(validateNickname("测试昵称")).toBeNull();
  });

  it("accepts emoji as user-visible characters", () => {
    expect(validateNickname("😎🔥")).toBeNull();
  });

  it("accepts mixed Latin + CJK + digits", () => {
    expect(validateNickname("用户abc123")).toBeNull();
  });

  it("accepts accented Latin (diacritics)", () => {
    expect(validateNickname("Ñoño")).toBeNull();
  });

  it("accepts two zero-width joiner emoji sequences as 2 grapheme clusters", () => {
    expect(validateNickname("👨‍👩‍👧‍👦👩‍💻")).toBeNull();
  });

  it("rejects one zero-width joiner emoji sequence as 1 grapheme cluster", () => {
    expect(validateNickname("👨‍👩‍👧‍👦")).toBe("昵称至少 2 个字符");
  });

  // Trimming
  it("trims leading/trailing whitespace before length check", () => {
    expect(validateNickname("  AB  ")).toBeNull();
  });

  it("rejects string that is only whitespace", () => {
    expect(validateNickname("   ")).toBe("昵称至少 2 个字符");
  });

  // Too short
  it("rejects single character", () => {
    expect(validateNickname("A")).toBe("昵称至少 2 个字符");
  });

  it("rejects empty string", () => {
    expect(validateNickname("")).toBe("昵称至少 2 个字符");
  });

  // Too long
  it("rejects 21 characters", () => {
    expect(validateNickname("A".repeat(21))).toBe("昵称最多 20 个字符");
  });

  it("rejects 50 characters", () => {
    expect(validateNickname("X".repeat(50))).toBe("昵称最多 20 个字符");
  });

  // Unicode edge cases
  it("treats 2 CJK characters as 2 (valid)", () => {
    expect(validateNickname("中文")).toBeNull();
  });

  it("treats 20 CJK characters as 20 (valid)", () => {
    expect(validateNickname("中".repeat(20))).toBeNull();
  });

  it("rejects 21 CJK characters", () => {
    expect(validateNickname("中".repeat(21))).toBe("昵称最多 20 个字符");
  });

  it("accepts Arabic characters", () => {
    expect(validateNickname("أحمد")).toBeNull();
  });
});

// ─── validatePasswordChange ─────────────────────────────────────────

describe("validatePasswordChange", () => {
  it("returns null on valid input", () => {
    expect(validatePasswordChange("oldPass1", "newPass2", "newPass2")).toBeNull();
  });

  it("rejects empty old password", () => {
    expect(validatePasswordChange("", "newPass1", "newPass1")).toBe("请输入原密码");
  });

  it("rejects password shorter than 8 chars", () => {
    expect(validatePasswordChange("oldPass1", "Ab1", "Ab1")).toBe("新密码至少 8 位");
  });

  it("rejects password without letters", () => {
    expect(validatePasswordChange("oldPass1", "12345678", "12345678")).toBe("新密码须包含字母和数字");
  });

  it("rejects password without digits", () => {
    expect(validatePasswordChange("oldPass1", "abcdefgh", "abcdefgh")).toBe("新密码须包含字母和数字");
  });

  it("rejects same as old password", () => {
    expect(validatePasswordChange("SamePw12", "SamePw12", "SamePw12")).toBe("新密码不能与原密码相同");
  });

  it("rejects mismatched confirm", () => {
    expect(validatePasswordChange("oldPass1", "newPass2", "newPass3")).toBe("两次输入的新密码不一致");
  });

  it("accepts password with mixed case + digits (exactly 8)", () => {
    expect(validatePasswordChange("oldPass1", "Abcdefg1", "Abcdefg1")).toBeNull();
  });

  it("accepts password with special chars + letters + digits", () => {
    expect(validatePasswordChange("oldPass1", "P@ssw0rd!", "P@ssw0rd!")).toBeNull();
  });
});

// ─── validateAvatarFile ─────────────────────────────────────────────

describe("validateAvatarFile", () => {
  const makeFile = (type: string, size: number): File => {
    const buf = new Uint8Array(size);
    return new File([buf], "test.jpg", { type });
  };

  // Allowed MIME types
  it("accepts image/jpeg", () => {
    expect(validateAvatarFile(makeFile("image/jpeg", 100))).toBeNull();
  });

  it("accepts image/png", () => {
    expect(validateAvatarFile(makeFile("image/png", 100))).toBeNull();
  });

  it("rejects image/webp", () => {
    expect(validateAvatarFile(makeFile("image/webp", 100))).toBe("仅支持 JPG / PNG 格式");
  });

  // Disallowed MIME types
  it("rejects image/gif", () => {
    expect(validateAvatarFile(makeFile("image/gif", 100))).toBe("仅支持 JPG / PNG 格式");
  });

  it("rejects image/svg+xml", () => {
    expect(validateAvatarFile(makeFile("image/svg+xml", 100))).toBe("仅支持 JPG / PNG 格式");
  });

  it("rejects application/pdf", () => {
    expect(validateAvatarFile(makeFile("application/pdf", 100))).toBe("仅支持 JPG / PNG 格式");
  });

  it("rejects empty MIME type", () => {
    expect(validateAvatarFile(makeFile("", 100))).toBe("仅支持 JPG / PNG 格式");
  });

  // Size boundary: 2 MiB
  it("accepts exactly 2 MiB", () => {
    expect(validateAvatarFile(makeFile("image/jpeg", 2 * 1024 * 1024))).toBeNull();
  });

  it("rejects 2 MiB + 1 byte", () => {
    expect(validateAvatarFile(makeFile("image/jpeg", 2 * 1024 * 1024 + 1))).toBe(
      "文件大小不能超过 2 MiB",
    );
  });

  it("accepts 1 byte file", () => {
    expect(validateAvatarFile(makeFile("image/png", 1))).toBeNull();
  });

  it("rejects a 10 MiB JPEG", () => {
    expect(validateAvatarFile(makeFile("image/jpeg", 10 * 1024 * 1024))).toBe(
      "文件大小不能超过 2 MiB",
    );
  });
});

// ─── AVATAR_PLACEHOLDER ─────────────────────────────────────────────

describe("AVATAR_PLACEHOLDER", () => {
  it("is a data URI string", () => {
    expect(AVATAR_PLACEHOLDER).toMatch(/^data:image\/svg\+xml/);
  });

  it("is a non-empty string", () => {
    expect(AVATAR_PLACEHOLDER.length).toBeGreaterThan(0);
  });
});

// ─── isMobileViewport ───────────────────────────────────────────────

describe("isMobileViewport", () => {
  it("returns false when window.innerWidth >= 768", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    expect(isMobileViewport()).toBe(false);
  });

  it("returns true when window.innerWidth < 768", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    expect(isMobileViewport()).toBe(true);
  });

  it("returns false at exactly 768px", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, writable: true });
    expect(isMobileViewport()).toBe(false);
  });
});
