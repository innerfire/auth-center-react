import type { AccountCenterSpaConfig } from "./types";

function isSafeCasdoorPathSegment(value: string): boolean {
  return value.trim() === value
    && value !== ""
    && value !== "."
    && value !== ".."
    && !/[\\/?#\u0000-\u001f\u007f]/u.test(value);
}

export function validateAccountCenterSpaConfig(config: AccountCenterSpaConfig): void {
  const authorization = new URL(config.casdoor.authorizationEndpoint);
  const callback = new URL(config.casdoor.redirectUri);
  if (!config.casdoor.clientId.trim()) throw new Error("account-center casdoor.clientId is required");
  if (!isSafeCasdoorPathSegment(config.casdoor.applicationOwner)) {
    throw new Error("account-center casdoor.applicationOwner must be a safe path segment");
  }
  if (!isSafeCasdoorPathSegment(config.casdoor.applicationName)) {
    throw new Error("account-center casdoor.applicationName must be a safe path segment");
  }
  if (config.casdoor.organization !== undefined && !isSafeCasdoorPathSegment(config.casdoor.organization)) {
    throw new Error("account-center casdoor.organization must be a safe path segment");
  }
  const resourceUri = config.gateway.resourceUri?.trim();
  if (resourceUri) {
    const resource = new URL(resourceUri);
    if (resource.hash) throw new Error("account-center gateway.resourceUri must not contain a fragment");
  }
  if (!config.casdoor.tokenEndpoint.startsWith("/")) {
    throw new Error("account-center casdoor.tokenEndpoint must use a same-origin rewrite path");
  }
  if (!config.gateway.baseUrl.startsWith("/")) {
    throw new Error("account-center gateway.baseUrl must use a same-origin rewrite path");
  }
  const afterLogout = config.routes?.afterLogout ?? "/login";
  if (!afterLogout.startsWith("/") || afterLogout.startsWith("//")) {
    throw new Error("account-center routes.afterLogout must be a same-origin path");
  }
  if (authorization.protocol !== "https:") {
    if (authorization.protocol !== "http:") {
      throw new Error("account-center authorizationEndpoint must use HTTP or HTTPS");
    }
    if (authorization.hostname !== "localhost" && !config.casdoor.allowInsecureHttp) {
      throw new Error("account-center authorizationEndpoint must use HTTPS outside localhost");
    }
  }
  if (callback.protocol !== "https:" && callback.hostname !== "localhost" && !callback.hostname.endsWith(".localhost")) {
    throw new Error("account-center redirectUri must use HTTPS outside localhost");
  }
}
