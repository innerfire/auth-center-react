/**
 * Tests for Gateway profile decoder/mapper (GENAIWDE-5).
 *
 * Covers:
 *  - Runtime validation of the nine-field GatewayProfileDTO
 *  - Own-property-only semantics (prototype-only fields rejected)
 *  - Minimal patch mapping: displayName → nickname, avatar → avatarUrl
 *  - Empty-string → null; whitespace preserved as-is (no trim)
 *  - Sensitive data never leaks into error messages
 */
import { describe, it, expect } from "vitest";
import {
  decodeGatewayProfileDTO,
  decodeGatewayProfile,
  GatewayProfileError,
} from "../gateway-profile";
import type { GatewayProfileDTO } from "../gateway-profile";

// ─── Helpers ────────────────────────────────────────────────────

const VALID_DTO: GatewayProfileDTO = {
  username: "johndoe",
  displayName: "John Doe",
  firstName: "John",
  lastName: "Doe",
  bio: "Software developer",
  avatar: "https://casdoor.example.com/files/avatar.png",
  email: "johndoe@example.com",
  phone: "+1234567890",
  organization: "org-demo",
};

function makeValidDto(overrides: Partial<GatewayProfileDTO> = {}): GatewayProfileDTO {
  return { ...VALID_DTO, ...overrides };
}

// ─── decodeGatewayProfileDTO ────────────────────────────────────

describe("decodeGatewayProfileDTO", () => {
  it("decodes a valid DTO", () => {
    const result = decodeGatewayProfileDTO(VALID_DTO);
    expect(result).toEqual(VALID_DTO);
  });

  it("ignores extra fields", () => {
    const input = { ...VALID_DTO, extraField: "ignored", anotherExtra: 123 };
    const result = decodeGatewayProfileDTO(input);
    expect(result).toEqual(VALID_DTO);
  });

  // ── Null/undefined/primitives ──────────────────────────────────

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "string"],
    ["number", 123],
    ["boolean", true],
    ["empty array", []],
    ["array of objects", [VALID_DTO]],
  ])("rejects %s", (_label, input) => {
    expect(() => decodeGatewayProfileDTO(input)).toThrow(GatewayProfileError);
  });

  // ── Missing fields ────────────────────────────────────────────

  const ALL_FIELDS: Array<keyof GatewayProfileDTO> = [
    "username", "displayName", "firstName", "lastName",
    "bio", "avatar", "email", "phone", "organization",
  ];

  it.each(ALL_FIELDS.map((f) => [f, f] as [keyof GatewayProfileDTO, string]))(
    "rejects object missing %s",
    (field) => {
      // Build object without the target field (intentional destructuring)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [field]: _omitted, ...rest } = VALID_DTO;
      expect(() => decodeGatewayProfileDTO(rest)).toThrow(GatewayProfileError);
    },
  );

  it("rejects object missing multiple fields", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { username: _u, displayName: _d, email: _e, ...rest } = VALID_DTO;
    expect(() => decodeGatewayProfileDTO(rest)).toThrow(GatewayProfileError);
  });

  // ── Wrong types ───────────────────────────────────────────────

  it.each([
    ["username", { username: 42 }],
    ["displayName", { displayName: null }],
    ["firstName", { firstName: undefined }],
    ["avatar", { avatar: 42 }],
    ["organization", { organization: {} }],
    ["bio", { bio: [] }],
    ["email", { email: true }],
    ["phone", { phone: 0 }],
    ["lastName", { lastName: () => {} }],
  ] as const)("rejects non-string %s", (field, override) => {
    expect(() =>
      decodeGatewayProfileDTO(makeValidDto(override as Record<string, unknown>)),
    ).toThrow(GatewayProfileError);
  });

  // ── Own properties only (issue 3) ─────────────────────────────

  it("rejects object with fields only on prototype chain", () => {
    const proto = Object.assign(Object.create(null), VALID_DTO);
    const child = Object.create(proto);
    // child has NO own properties
    expect(() => decodeGatewayProfileDTO(child)).toThrow(GatewayProfileError);
  });

  it("rejects object with prototype-inherited fields even if some are own", () => {
    const proto = { email: "proto@test.com", phone: "000", bio: "p", organization: "o" };
    const child = Object.create(proto);
    // Provide remaining fields as own properties
    child.username = "u";
    child.displayName = "d";
    child.firstName = "f";
    child.lastName = "l";
    child.avatar = "a";
    // email, phone, bio, organization are only on prototype → should fail
    expect(() => decodeGatewayProfileDTO(child)).toThrow(GatewayProfileError);
  });

  // ── Error properties ──────────────────────────────────────────

  it("error has correct code and name", () => {
    try {
      decodeGatewayProfileDTO(null);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GatewayProfileError);
      expect((e as GatewayProfileError).code).toBe("INVALID_GATEWAY_PROFILE");
      expect((e as GatewayProfileError).name).toBe("GatewayProfileError");
    }
  });

  // ── Empty strings are valid at DTO level ──────────────────────

  it("accepts empty strings at DTO level", () => {
    const dto = makeValidDto({ displayName: "", avatar: "", bio: "" });
    const result = decodeGatewayProfileDTO(dto);
    expect(result.displayName).toBe("");
    expect(result.avatar).toBe("");
    expect(result.bio).toBe("");
  });

  it("accepts whitespace-only strings at DTO level (preserved as-is)", () => {
    const dto = makeValidDto({ displayName: "  ", avatar: "\t" });
    const result = decodeGatewayProfileDTO(dto);
    expect(result.displayName).toBe("  ");
    expect(result.avatar).toBe("\t");
  });
});

// ─── decodeGatewayProfile (combined entry) ──────────────────────

describe("decodeGatewayProfile", () => {
  it("decodes and maps valid input", () => {
    const result = decodeGatewayProfile(VALID_DTO);
    expect(result.nickname).toBe("John Doe");
    expect(result.avatarUrl).toBe(
      "https://casdoor.example.com/files/avatar.png",
    );
  });

  it("rejects invalid input", () => {
    expect(() => decodeGatewayProfile(null)).toThrow(GatewayProfileError);
  });

  // ── Mapping: complete nine-field profile ──────────────────────

  it("returns the complete AccountProfile-compatible field set", () => {
    const result = decodeGatewayProfile(VALID_DTO);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      "avatarUrl", "bio", "email", "firstName", "lastName", "nickname",
      "organization", "phone", "username",
    ]);
  });

  it("does NOT include capabilities or degradedReasons", () => {
    const result = decodeGatewayProfile(VALID_DTO);
    expect(result).not.toHaveProperty("capabilities");
    expect(result).not.toHaveProperty("degradedReasons");
  });

  it("does NOT include subject", () => {
    const result = decodeGatewayProfile(VALID_DTO);
    expect(result).not.toHaveProperty("subject");
  });

  it("preserves contact, biography, organization and name fields", () => {
    const result = decodeGatewayProfile(VALID_DTO);
    expect(result).toMatchObject({
      email: VALID_DTO.email,
      phone: VALID_DTO.phone,
      bio: VALID_DTO.bio,
      organization: VALID_DTO.organization,
      username: VALID_DTO.username,
      firstName: VALID_DTO.firstName,
      lastName: VALID_DTO.lastName,
    });
  });

  // ── Empty string → null (issue 4) ─────────────────────────────

  it('maps displayName "" to null', () => {
    const result = decodeGatewayProfile(makeValidDto({ displayName: "" }));
    expect(result.nickname).toBeNull();
  });

  it('maps avatar "" to null', () => {
    const result = decodeGatewayProfile(makeValidDto({ avatar: "" }));
    expect(result.avatarUrl).toBeNull();
  });

  // ── Whitespace preserved as-is, no trimming (issue 4) ─────────

  it("preserves whitespace-only displayName as-is (does NOT map to null)", () => {
    const result = decodeGatewayProfile(makeValidDto({ displayName: "   " }));
    expect(result.nickname).toBe("   ");
  });

  it("preserves tab-only avatar as-is", () => {
    const result = decodeGatewayProfile(makeValidDto({ avatar: "\t" }));
    expect(result.avatarUrl).toBe("\t");
  });

  it("preserves leading/trailing whitespace in displayName", () => {
    const result = decodeGatewayProfile(makeValidDto({ displayName: "  John  " }));
    expect(result.nickname).toBe("  John  ");
  });

  it("preserves leading/trailing whitespace in avatar", () => {
    const result = decodeGatewayProfile(
      makeValidDto({ avatar: "  https://example.com/av.jpg  " }),
    );
    expect(result.avatarUrl).toBe("  https://example.com/av.jpg  ");
  });

  it("preserves mixed whitespace displayName", () => {
    const result = decodeGatewayProfile(makeValidDto({ displayName: "\n\t " }));
    expect(result.nickname).toBe("\n\t ");
  });

  it("handles normal non-empty values", () => {
    const dto = makeValidDto({
      displayName: "张三",
      avatar: "https://cdn.example.com/avatar.jpg",
    });
    const result = decodeGatewayProfile(dto);
    expect(result.nickname).toBe("张三");
    expect(result.avatarUrl).toBe("https://cdn.example.com/avatar.jpg");
  });

  it("handles extra fields by ignoring them", () => {
    const input = { ...VALID_DTO, secret: "hidden", password: "123" };
    const result = decodeGatewayProfile(input);
    expect(result).not.toHaveProperty("secret");
    expect(result).not.toHaveProperty("password");
  });
});

// ─── Sensitive sentinel tests (issue 6) ─────────────────────────

describe("sensitive data never leaks into error messages", () => {
  const SENSITIVE_VALUES = {
    email: "john_secret@example.com",
    phone: "+1-555-0123-SECRET",
    bio: "Confidential biography data",
    organization: "classified-org",
  };

  it("error message does not contain sensitive values from malformed object", () => {
    // Valid structure but one field wrong type → triggers error
    const input = makeValidDto({ email: SENSITIVE_VALUES.email as unknown as string });
    // Override email to be non-string so it fails validation
    const bad = { ...input, email: 42 };
    try {
      decodeGatewayProfileDTO(bad);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GatewayProfileError);
      const msg = (e as GatewayProfileError).message;
      expect(msg).not.toContain(SENSITIVE_VALUES.email);
      expect(msg).not.toContain(SENSITIVE_VALUES.phone);
      expect(msg).not.toContain(SENSITIVE_VALUES.bio);
      expect(msg).not.toContain(SENSITIVE_VALUES.organization);
    }
  });

  it("error for non-object input does not reveal any field values", () => {
    try {
      decodeGatewayProfileDTO({ email: SENSITIVE_VALUES.email });
      expect.fail("should have thrown");
    } catch (e) {
      const msg = (e as GatewayProfileError).message;
      expect(msg).not.toContain(SENSITIVE_VALUES.email);
      expect(msg).not.toContain("john_secret");
    }
  });

  it("error for prototype-only fields does not contain sensitive values", () => {
    const proto = Object.assign(Object.create(null), {
      ...VALID_DTO,
      email: SENSITIVE_VALUES.email,
      phone: SENSITIVE_VALUES.phone,
      bio: SENSITIVE_VALUES.bio,
      organization: SENSITIVE_VALUES.organization,
    });
    const child = Object.create(proto);
    try {
      decodeGatewayProfileDTO(child);
      expect.fail("should have thrown");
    } catch (e) {
      const msg = (e as GatewayProfileError).message;
      expect(msg).not.toContain(SENSITIVE_VALUES.email);
      expect(msg).not.toContain(SENSITIVE_VALUES.phone);
      expect(msg).not.toContain(SENSITIVE_VALUES.bio);
      expect(msg).not.toContain(SENSITIVE_VALUES.organization);
    }
  });
});

// ─── GatewayProfileError class ──────────────────────────────────

describe("GatewayProfileError", () => {
  it("is an instance of Error", () => {
    const error = new GatewayProfileError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const error = new GatewayProfileError("test");
    expect(error.name).toBe("GatewayProfileError");
  });

  it("has correct code", () => {
    const error = new GatewayProfileError("test");
    expect(error.code).toBe("INVALID_GATEWAY_PROFILE");
  });
});
