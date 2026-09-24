import { createAccountCenterAuthScope, type AccountCenterAuthScope } from "../auth-scope";
import { AccountCenterError } from "../error";
import { decodeGatewayProfile, type GatewayProfilePatch } from "../gateway-profile";
import type {
  AccountCenterAdapter,
  AccountProfile,
  LogoutResult,
  PasswordChangePayload,
  ProfilePatchPayload,
} from "../types";

type LogoutReason = "logout" | "unauthorized";

interface DirectGatewayAdapterOptions {
  baseUrl: string;
  getAccessToken(): Promise<string>;
  clearTokens(): void;
  getAuthScope?: () => AccountCenterAuthScope;
  capabilities?: AccountProfile["capabilities"];
  degradedReasons?: string[];
  /** Trusted Casdoor public origin used to construct front-channel logout. */
  casdoorOrigin: string;
  /** Application-owned Casdoor logout path segments. */
  casdoorApplicationOwner: string;
  casdoorApplicationName: string;
  /** Same-origin route that Casdoor returns to after a successful logout. */
  afterLogoutPath?: string;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${path.replace(/^\/+/, "")}`;
}

function profileFromGateway(
  body: unknown,
  capabilities: AccountProfile["capabilities"],
  degradedReasons: string[],
): AccountProfile {
  const patch: GatewayProfilePatch = decodeGatewayProfile(body);
  return {
    username: patch.username,
    nickname: patch.nickname,
    firstName: patch.firstName,
    lastName: patch.lastName,
    bio: patch.bio,
    avatarUrl: patch.avatarUrl,
    email: patch.email,
    phone: patch.phone,
    organization: patch.organization,
    capabilities,
    degradedReasons,
  };
}

function errorCodeForStatus(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status === 422) return "FAILED_PRECONDITION";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_ERROR";
  return "INVALID_REQUEST";
}

export function buildCasdoorLogoutUrl(
  casdoorOrigin: string,
  applicationOwner: string,
  applicationName: string,
  afterLogoutPath: string,
  reason: LogoutReason = "logout",
): string {
  if (typeof window === "undefined") {
    throw new AccountCenterError({ code: "BROWSER_REQUIRED", message: "退出操作需要浏览器环境", retryable: false });
  }
  const logoutUrl = new URL(
    `/cas/${encodeURIComponent(applicationOwner)}/${encodeURIComponent(applicationName)}/logout`,
    casdoorOrigin,
  );
  const serviceUrl = new URL(afterLogoutPath, window.location.origin);
  serviceUrl.searchParams.set("reason", reason);
  serviceUrl.searchParams.set("auto", "0");
  logoutUrl.searchParams.set("service", serviceUrl.toString());
  return logoutUrl.toString();
}

function buildGatewayLogoutUrl(
  body: unknown,
  casdoorOrigin: string,
  afterLogoutPath: string,
  reason: LogoutReason,
): string | undefined {
  const redirectUrl = (body as { redirectUrl?: unknown } | null)?.redirectUrl;
  if (typeof redirectUrl !== "string") return undefined;

  let logoutUrl: URL;
  try {
    logoutUrl = new URL(redirectUrl);
  } catch {
    return undefined;
  }
  if (
    logoutUrl.origin !== casdoorOrigin
    || logoutUrl.search !== ""
    || logoutUrl.hash !== ""
    || !/^\/cas\/[^/?#]+\/[^/?#]+\/logout$/u.test(logoutUrl.pathname)
    || /%2f|%5c/iu.test(logoutUrl.pathname)
  ) {
    return undefined;
  }

  const serviceUrl = new URL(afterLogoutPath, window.location.origin);
  serviceUrl.searchParams.set("reason", reason);
  serviceUrl.searchParams.set("auto", "0");
  logoutUrl.searchParams.set("service", serviceUrl.toString());
  return logoutUrl.toString();
}

async function gatewayError(response: Response): Promise<AccountCenterError> {
  let upstreamCode: string | undefined;
  try {
    const body = await response.json() as { code?: unknown };
    if (typeof body.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(body.code)) {
      upstreamCode = body.code;
    }
  } catch {
    // Fixed client messages intentionally do not expose an upstream body.
  }
  const code = upstreamCode ?? errorCodeForStatus(response.status);
  const uncertainPasswordResult = response.status === 502 || response.status === 504;
  return new AccountCenterError({
    code,
    message: uncertainPasswordResult ? "请求结果不确定，请勿自动重试" : "账户服务请求失败",
    retryable: !uncertainPasswordResult && (response.status === 429 || response.status === 503),
    status: response.status,
  });
}

export function createDirectGatewayAdapter(options: DirectGatewayAdapterOptions): AccountCenterAdapter & {
  logout(reason?: LogoutReason): Promise<LogoutResult>;
} {
  const capabilities = Object.freeze({
    avatarUpload: options.capabilities?.avatarUpload ?? false,
    passwordChange: options.capabilities?.passwordChange ?? true,
  });
  const degradedReasons = Object.freeze([...(options.degradedReasons ?? [])]);
  const fallbackScope = createAccountCenterAuthScope();

  async function request(
    path: string,
    init: RequestInit,
    notifyUnauthorized = true,
    allowMissingToken = false,
  ): Promise<Response> {
    let accessToken: string | undefined;
    try {
      accessToken = await options.getAccessToken();
    } catch (error) {
      if (!allowMissingToken) throw error;
    }
    let response: Response;
    try {
      response = await fetch(joinUrl(options.baseUrl, path), {
        ...init,
        headers: {
          Accept: "application/json",
          ...init.headers,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new AccountCenterError({ code: "NETWORK", message: "账户服务网络请求失败", retryable: true });
    }
    if (response.status === 401 && notifyUnauthorized) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      options.clearTokens();
    }
    if (!response.ok) throw await gatewayError(response);
    return response;
  }

  async function readProfile(response: Response): Promise<AccountProfile> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AccountCenterError({ code: "INVALID_RESPONSE", message: "账户服务返回了无效资料", retryable: false });
    }
    try {
      return profileFromGateway(body, capabilities, [...degradedReasons]);
    } catch {
      throw new AccountCenterError({ code: "INVALID_RESPONSE", message: "账户服务返回了无效资料", retryable: false });
    }
  }

  return {
    getProfileAuthScope: () => options.getAuthScope?.() ?? fallbackScope,
    hasExplicitAuthScope: options.getAuthScope !== undefined,

    async getProfile() {
      return readProfile(await request("/v1/auth/profile", { method: "GET" }));
    },

    async patchProfile(payload: ProfilePatchPayload) {
      const gatewayPayload: Record<string, string> = {};
      if (payload.nickname !== undefined) gatewayPayload.displayName = payload.nickname;
      if (payload.firstName !== undefined) gatewayPayload.firstName = payload.firstName;
      if (payload.lastName !== undefined) gatewayPayload.lastName = payload.lastName;
      if (payload.bio !== undefined) gatewayPayload.bio = payload.bio;
      if (payload.email !== undefined) gatewayPayload.email = payload.email;
      if (payload.phone !== undefined) gatewayPayload.phone = payload.phone;
      return readProfile(await request("/v1/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gatewayPayload),
      }));
    },

    async uploadAvatar(blob: Blob) {
      const formData = new FormData();
      formData.append("file", blob, blob.type === "image/png" ? "avatar.png" : "avatar.jpg");
      const profile = await readProfile(await request("/v1/auth/avatar", {
        method: "POST",
        body: formData,
      }));
      return { avatarUrl: profile.avatarUrl ?? "" };
    },

    async changePassword(payload: PasswordChangePayload) {
      const response = await request("/v1/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status !== 204) {
        throw new AccountCenterError({ code: "INVALID_RESPONSE", message: "密码服务返回了无效响应", retryable: false });
      }
      return { ok: true, reauthRequired: true };
    },

    async logout(reason: LogoutReason = "logout") {
      const fallbackLogoutUrl = buildCasdoorLogoutUrl(
        options.casdoorOrigin,
        options.casdoorApplicationOwner,
        options.casdoorApplicationName,
        options.afterLogoutPath ?? "/login",
        reason,
      );
      let logoutUrl = fallbackLogoutUrl;
      try {
        const response = await request("/v1/auth/logout", { method: "POST" }, false, true);
        const body = await response.json() as unknown;
        logoutUrl = buildGatewayLogoutUrl(
          body,
          options.casdoorOrigin,
          options.afterLogoutPath ?? "/login",
          reason,
        ) ?? fallbackLogoutUrl;
      } catch {
        // Missing tokens, invalid responses and upstream failures use the
        // application-owned front-channel fallback.
      } finally {
        // Local logout is an invariant and must never depend on go-zero.
        options.clearTokens();
      }
      return { logoutUrl };
    },
  };
}

export type { DirectGatewayAdapterOptions };
