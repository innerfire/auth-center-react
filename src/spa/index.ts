"use client";

export {
  AccountCenterProvider,
  AccountCenterCallback,
  useAccountCenterAuth,
  useOptionalAccountCenterAuth,
  useAccountCenterAdapter,
} from "./provider";
export { createDirectGatewayAdapter } from "./direct-gateway-adapter";
export type { DirectGatewayAdapterOptions } from "./direct-gateway-adapter";
export type {
  AccountCenterAuthApi,
  AccountCenterAuthStatus,
  AccountCenterCasdoorConfig,
  AccountCenterGatewayConfig,
  AccountCenterRouteConfig,
  AccountCenterSpaConfig,
  AccountCenterTokenSet,
} from "./types";
