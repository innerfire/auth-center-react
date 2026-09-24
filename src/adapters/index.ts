export { createDefaultAdapter } from "./default-adapter";
export type { DefaultAdapterOptions } from "./default-adapter";
export { createGatewayProfileAdapter } from "./gateway-profile-adapter";
export type { GatewayProfileAdapterOptions } from "./gateway-profile-adapter";
export { GatewayProfileAdapterError } from "./gateway-profile-adapter";

// GENAIWDE-7: auth scope + error re-exports for convenience
export { createAccountCenterAuthScope } from "../auth-scope";
export type { AccountCenterAuthScope } from "../auth-scope";
export { AccountCenterError, isAccountCenterError } from "../error";
