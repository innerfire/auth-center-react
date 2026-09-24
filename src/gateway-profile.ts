/**
 * Gateway profile raw DTO → minimal patch decoder/mapper.
 *
 * This module provides runtime validation and mapping for the
 * nine-field profile DTO returned by GET /v1/auth/profile.
 *
 * Contract (GENAIWDE-5):
 * - All nine fields (username, displayName, firstName, lastName, bio,
 *   avatar, email, phone, organization) must exist as **own** string properties.
 * - Input is unknown; null/arrays/primitives/missing fields/wrong types → fail.
 * - Extra fields are ignored.
 * - All profile fields are mapped; displayName → nickname and avatar → avatarUrl.
 * - Only `value === ""` maps to null; all other strings (including whitespace)
 *   are preserved as-is — no trimming.
 * - capabilities/degradedReasons are NOT from this DTO; they come from
 *   the existing AccountProfile / old write chain, composed by the adapter layer.
 * - AccountProfile.subject is optional and never inferred from username.
 * - Error messages never contain payload values or sensitive field values.
 */

// ─── Gateway Profile DTO (internal) ─────────────────────────────

/**
 * Raw DTO from GET /v1/auth/profile.
 * All nine fields are mandatory strings.
 * @internal — consumers use `decodeGatewayProfile` instead.
 */
export interface GatewayProfileDTO {
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  bio: string;
  avatar: string;
  email: string;
  phone: string;
  organization: string;
}

// ─── Public result type ─────────────────────────────────────────

/**
 * AccountProfile-compatible patch produced by the Gateway profile decoder.
 * capabilities / degradedReasons are composed separately.
 */
export interface GatewayProfilePatch {
  username: string;
  nickname: string | null;
  firstName: string;
  lastName: string;
  bio: string;
  avatarUrl: string | null;
  email: string;
  phone: string;
  organization: string;
}

// ─── Error handling ─────────────────────────────────────────────

export class GatewayProfileError extends Error {
  readonly code: "INVALID_GATEWAY_PROFILE";

  constructor(message: string) {
    super(message);
    this.name = "GatewayProfileError";
    this.code = "INVALID_GATEWAY_PROFILE";
  }
}

// ─── Decoder ────────────────────────────────────────────────────

const REQUIRED_FIELDS: Array<keyof GatewayProfileDTO> = [
  "username",
  "displayName",
  "firstName",
  "lastName",
  "bio",
  "avatar",
  "email",
  "phone",
  "organization",
];

/**
 * Runtime decoder: validates input is an object whose nine required
 * fields are **own** string properties. Extra fields are ignored.
 * Prototype-only fields are rejected.
 *
 * @throws {GatewayProfileError} if input is not a valid GatewayProfileDTO
 * @internal — prefer `decodeGatewayProfile` for the combined entry point.
 */
export function decodeGatewayProfileDTO(input: unknown): GatewayProfileDTO {
  if (input === null || input === undefined || typeof input !== "object") {
    throw new GatewayProfileError("invalid_gateway_profile");
  }

  // Reject arrays
  if (Array.isArray(input)) {
    throw new GatewayProfileError("invalid_gateway_profile");
  }

  const obj = input as Record<string, unknown>;
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, field)) {
      missingFields.push(field);
    } else if (typeof obj[field] !== "string") {
      invalidFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new GatewayProfileError("invalid_gateway_profile");
  }

  if (invalidFields.length > 0) {
    throw new GatewayProfileError("invalid_gateway_profile");
  }

  // Return only the required fields (ignore extras)
  return {
    username: obj.username as string,
    displayName: obj.displayName as string,
    firstName: obj.firstName as string,
    lastName: obj.lastName as string,
    bio: obj.bio as string,
    avatar: obj.avatar as string,
    email: obj.email as string,
    phone: obj.phone as string,
    organization: obj.organization as string,
  };
}

// ─── Mapper (internal) ─────────────────────────────────────────

/**
 * Map a string value: empty string → null, everything else as-is.
 * No trimming — whitespace is preserved exactly.
 */
function toNullIfEmpty(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * Map a decoded GatewayProfileDTO to a minimal patch.
 * Maps the complete nine-field DTO into the AccountProfile-compatible shape.
 */
function mapGatewayProfileToAccountProfile(
  dto: GatewayProfileDTO,
): GatewayProfilePatch {
  return {
    username: dto.username,
    nickname: toNullIfEmpty(dto.displayName),
    firstName: dto.firstName,
    lastName: dto.lastName,
    bio: dto.bio,
    avatarUrl: toNullIfEmpty(dto.avatar),
    email: dto.email,
    phone: dto.phone,
    organization: dto.organization,
  };
}

// ─── Public entry point ─────────────────────────────────────────

/**
 * Decode raw unknown input and produce a minimal GatewayProfilePatch.
 *
 * This is the main entry point for consuming the Gateway /v1/auth/profile
 * response. It validates the DTO structure (own properties only, all nine
 * fields present as strings), then maps displayName → nickname and
 * avatar → avatarUrl.
 *
 * - `""` → `null` for nickname / avatarUrl
 * - All other strings (including whitespace) are preserved as-is
 * - capabilities / degradedReasons are NOT included — compose them
 *   from the existing AccountProfile in the adapter layer
 *
 * @param input - Raw unknown input from Gateway /v1/auth/profile
 * @returns GatewayProfilePatch (nickname + avatarUrl only)
 * @throws {GatewayProfileError} if input is not a valid GatewayProfileDTO
 */
export function decodeGatewayProfile(
  input: unknown,
): GatewayProfilePatch {
  const dto = decodeGatewayProfileDTO(input);
  return mapGatewayProfileToAccountProfile(dto);
}
