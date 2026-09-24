//#region src/gateway-profile.d.ts
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
/**
 * Raw DTO from GET /v1/auth/profile.
 * All nine fields are mandatory strings.
 * @internal — consumers use `decodeGatewayProfile` instead.
 */
interface GatewayProfileDTO {
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
/**
 * AccountProfile-compatible patch produced by the Gateway profile decoder.
 * capabilities / degradedReasons are composed separately.
 */
interface GatewayProfilePatch {
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
declare class GatewayProfileError extends Error {
  readonly code: "INVALID_GATEWAY_PROFILE";
  constructor(message: string);
}
/**
 * Runtime decoder: validates input is an object whose nine required
 * fields are **own** string properties. Extra fields are ignored.
 * Prototype-only fields are rejected.
 *
 * @throws {GatewayProfileError} if input is not a valid GatewayProfileDTO
 * @internal — prefer `decodeGatewayProfile` for the combined entry point.
 */
declare function decodeGatewayProfileDTO(input: unknown): GatewayProfileDTO;
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
declare function decodeGatewayProfile(input: unknown): GatewayProfilePatch;
//#endregion
export { decodeGatewayProfileDTO as a, decodeGatewayProfile as i, GatewayProfileError as n, GatewayProfilePatch as r, GatewayProfileDTO as t };
//# sourceMappingURL=gateway-profile-CRl_h4Ya.d.ts.map