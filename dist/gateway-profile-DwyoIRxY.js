//#region src/gateway-profile.ts
var GatewayProfileError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "GatewayProfileError";
		this.code = "INVALID_GATEWAY_PROFILE";
	}
};
const REQUIRED_FIELDS = [
	"username",
	"displayName",
	"firstName",
	"lastName",
	"bio",
	"avatar",
	"email",
	"phone",
	"organization"
];
/**
* Runtime decoder: validates input is an object whose nine required
* fields are **own** string properties. Extra fields are ignored.
* Prototype-only fields are rejected.
*
* @throws {GatewayProfileError} if input is not a valid GatewayProfileDTO
* @internal — prefer `decodeGatewayProfile` for the combined entry point.
*/
function decodeGatewayProfileDTO(input) {
	if (input === null || input === void 0 || typeof input !== "object") throw new GatewayProfileError("invalid_gateway_profile");
	if (Array.isArray(input)) throw new GatewayProfileError("invalid_gateway_profile");
	const obj = input;
	const missingFields = [];
	const invalidFields = [];
	for (const field of REQUIRED_FIELDS) if (!Object.prototype.hasOwnProperty.call(obj, field)) missingFields.push(field);
	else if (typeof obj[field] !== "string") invalidFields.push(field);
	if (missingFields.length > 0) throw new GatewayProfileError("invalid_gateway_profile");
	if (invalidFields.length > 0) throw new GatewayProfileError("invalid_gateway_profile");
	return {
		username: obj.username,
		displayName: obj.displayName,
		firstName: obj.firstName,
		lastName: obj.lastName,
		bio: obj.bio,
		avatar: obj.avatar,
		email: obj.email,
		phone: obj.phone,
		organization: obj.organization
	};
}
/**
* Map a string value: empty string → null, everything else as-is.
* No trimming — whitespace is preserved exactly.
*/
function toNullIfEmpty(value) {
	return value === "" ? null : value;
}
/**
* Map a decoded GatewayProfileDTO to a minimal patch.
* Maps the complete nine-field DTO into the AccountProfile-compatible shape.
*/
function mapGatewayProfileToAccountProfile(dto) {
	return {
		username: dto.username,
		nickname: toNullIfEmpty(dto.displayName),
		firstName: dto.firstName,
		lastName: dto.lastName,
		bio: dto.bio,
		avatarUrl: toNullIfEmpty(dto.avatar),
		email: dto.email,
		phone: dto.phone,
		organization: dto.organization
	};
}
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
function decodeGatewayProfile(input) {
	return mapGatewayProfileToAccountProfile(decodeGatewayProfileDTO(input));
}

//#endregion
export { decodeGatewayProfile as n, decodeGatewayProfileDTO as r, GatewayProfileError as t };
//# sourceMappingURL=gateway-profile-DwyoIRxY.js.map