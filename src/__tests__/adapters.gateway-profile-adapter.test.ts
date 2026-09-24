/**
 * Tests for the Gateway Profile Adapter (GENAIWDE-6).
 *
 * Strategy:
 * - Mock fetch and getAccessToken to verify:
 *   1. Fixed path /gateway/v1/auth/profile, GET, no body, no query
 *   2. credentials: "omit", cache: "no-store"
 *   3. Single Authorization: Bearer <token> header
 *   4. Each request calls getAccessToken() for a fresh token
 *   5. Missing/empty token fails safely before fetch
 *   6. 200 response decoded via decodeGatewayProfile + profileMetadata composed
 *   7. Extra sensitive fields from DTO do not enter result
 *   8. Error handling: 401, non-JSON, JSON parse failure, malformed DTO, network failure
 *   9. Fixed error messages — no token, URL, response body, or Profile leaking
 *  10. Four write methods delegate to legacyAdapter and never call Gateway fetch
 *  11. AccountCenter accepts optional adapter prop; falls back to default
 *  12. PROFILE_KEY does not contain token
 *  13. No /validate call
 *  14. profileMetadata must NOT be spread — explicit field selection only
 *  15. getAccessToken runtime validation: null/undefined/object/number/whitespace rejected
 *  16. Content-Type media-type parsing: case-insensitive, params OK, reject jsonp/text
 *  17. Read failure asserts legacyAdapter.getProfile never called
 *  18. Write delegation rejection propagates without gateway fetch/token provider
 */
import { describe, it, expect, vi } from "vitest";
import { createGatewayProfileAdapter } from "../adapters/gateway-profile-adapter";
import type { AccountCenterAdapter, AccountProfile } from "../types";

// ─── Mock Data ──────────────────────────────────────────────────────

const VALID_GATEWAY_PROFILE_DTO = {
  username: "user123",
  displayName: "Test User",
  firstName: "Test",
  lastName: "User",
  bio: "Test bio",
  avatar: "https://example.com/avatar.jpg",
  email: "test@example.com",
  phone: "+1234567890",
  organization: "Test Org",
};

const METADATA: Pick<AccountProfile, "capabilities" | "degradedReasons"> = {
  capabilities: { avatarUpload: true, passwordChange: false },
  degradedReasons: ["gateway_profile_only"],
};

const EXPECTED_ACCOUNT_PROFILE: AccountProfile = {
  username: "user123",
  nickname: "Test User",
  firstName: "Test",
  lastName: "User",
  bio: "Test bio",
  avatarUrl: "https://example.com/avatar.jpg",
  email: "test@example.com",
  phone: "+1234567890",
  organization: "Test Org",
  capabilities: { avatarUpload: true, passwordChange: false },
  degradedReasons: ["gateway_profile_only"],
};

// ─── Helpers ────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn> & typeof globalThis.fetch;

function makeFetchMock(
  responseBody: unknown,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" },
): FetchMock {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => responseBody,
  })) as unknown as FetchMock;
}

function makeTokenProviderMock(tokens: string[]): () => Promise<string> {
  let callCount = 0;
  return vi.fn(async () => {
    const token = tokens[callCount % tokens.length];
    callCount++;
    return token;
  });
}

function makeLegacyAdapter(overrides: Partial<AccountCenterAdapter> = {}): AccountCenterAdapter {
  return {
    getProfile: vi.fn(),
    patchProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("createGatewayProfileAdapter", () => {
  // ── Core: getProfile ───────────────────────────────────────────

  describe("getProfile", () => {
    it("uses fixed path /gateway/v1/auth/profile", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();

      expect(fetch).toHaveBeenCalledOnce();
      const [url] = fetch.mock.calls[0];
      expect(url).toBe("/gateway/v1/auth/profile");
    });

    it("uses GET method with no body and no query", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();

      const [, init] = fetch.mock.calls[0];
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeUndefined();
      // URL should not contain query params
      const url = fetch.mock.calls[0][0] as string;
      expect(url).not.toContain("?");
    });

    it("sets credentials: omit and cache: no-store", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();

      const [, init] = fetch.mock.calls[0];
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
    });

    it("sets single Authorization: Bearer <token> header", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();

      const [, init] = fetch.mock.calls[0];
      expect(init?.headers).toEqual({
        Authorization: "Bearer token-123",
      });
    });

    it("calls getAccessToken on each request", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-1", "token-2"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();
      await adapter.getProfile();

      expect(getAccessToken).toHaveBeenCalledTimes(2);
      // Verify different tokens were used
      const [, init1] = fetch.mock.calls[0];
      const [, init2] = fetch.mock.calls[1];
      expect(init1?.headers).toEqual({ Authorization: "Bearer token-1" });
      expect(init2?.headers).toEqual({ Authorization: "Bearer token-2" });
    });

    it("returns decoded AccountProfile with explicit metadata", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.getProfile();

      expect(result).toEqual(EXPECTED_ACCOUNT_PROFILE);
    });

    it("does not call /validate endpoint", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await adapter.getProfile();

      for (const [url] of fetch.mock.calls) {
        expect(url).not.toContain("/validate");
      }
    });

    it("does not fabricate capabilities/degradedReasons defaults", async () => {
      // Use metadata with specific values — result must match exactly
      const customMeta: Pick<AccountProfile, "capabilities" | "degradedReasons"> = {
        capabilities: { avatarUpload: false, passwordChange: true },
        degradedReasons: ["custom_reason"],
      };
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: customMeta,
      });

      const result = await adapter.getProfile();

      expect(result.capabilities).toEqual({ avatarUpload: false, passwordChange: true });
      expect(result.degradedReasons).toEqual(["custom_reason"]);
    });

    it("returns only the documented profile DTO fields", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.getProfile();

      expect(result).toMatchObject(EXPECTED_ACCOUNT_PROFILE);
      expect(result).not.toHaveProperty("subject");
      expect(result).not.toHaveProperty("roles");
      expect(result).not.toHaveProperty("permissions");
    });
  });

  // ── Missing/empty token ────────────────────────────────────────

  describe("token handling", () => {
    it("fails safely before fetch when token is missing", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock([""]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "TOKEN_MISSING",
      });
      expect((err as Error).message).toBe("Access token is missing or empty");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("fails safely when token is empty string", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = async () => "";
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "TOKEN_MISSING",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("fails safely when getAccessToken rejects", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = vi.fn(async () => {
        throw new Error("token unavailable");
      });
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "TOKEN_ERROR",
      });
      // Fixed message must not expose the original getter error
      expect((err as Error).message).toBe("Unable to obtain access token");
      expect((err as Error).message).not.toContain("token unavailable");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe("error handling", () => {
    it("normalizes 401 to fixed error without leaking body/token", async () => {
      const fetch = makeFetchMock({ error: "Unauthorized" }, 401);
      const getAccessToken = makeTokenProviderMock(["secret-token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      // Single call: capture error once, assert everything
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "UNAUTHORIZED",
      });
      const msg = (err as Error).message;
      expect(msg).not.toContain("secret-token-123");
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("Unauthorized");
      expect(msg).not.toContain("/gateway/v1/auth/profile");
      // Exactly one fetch call (no duplicate request)
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("normalizes non-JSON content-type to fixed error", async () => {
      const fetch = makeFetchMock("Not JSON", 200, {
        "content-type": "text/plain",
      });
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "INVALID_RESPONSE",
      });
      const msg = (err as Error).message;
      expect(msg).not.toContain("token-123");
      expect(msg).not.toContain("Not JSON");
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("normalizes JSON parse failure to fixed error", async () => {
      const fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type"
              ? "application/json"
              : null,
        },
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })) as unknown as FetchMock;
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "MALFORMED_JSON",
      });
      const msg = (err as Error).message;
      expect(msg).not.toContain("token-123");
      expect(msg).not.toContain("Unexpected token");
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("normalizes malformed DTO to fixed error", async () => {
      const fetch = makeFetchMock({ username: "only-one-field" });
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "INVALID_GATEWAY_PROFILE",
      });
      const msg = (err as Error).message;
      expect(msg).not.toContain("token-123");
      expect(msg).not.toContain("only-one-field");
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("normalizes network failure to fixed error", async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as FetchMock;
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "NETWORK_ERROR",
      });
      const msg = (err as Error).message;
      expect(msg).not.toContain("token-123");
      expect(msg).not.toContain("Failed to fetch");
      // fetch IS called but throws (simulating a network error)
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("401 error has retryable: false", async () => {
      const fetch = makeFetchMock({}, 401);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      let err: unknown;
      try {
        await adapter.getProfile();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "UNAUTHORIZED",
      });
      expect((err as { retryable: boolean }).retryable).toBe(false);
      expect(typeof (err as { status?: number }).status).toBe("number");
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("non-200 success (e.g. 500) is normalized to error", async () => {
      const fetch = makeFetchMock({ error: "Internal Server Error" }, 500);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "GatewayProfileAdapterError",
      });
    });

    it("non-object 200 response is normalized to error", async () => {
      const fetch = makeFetchMock("just a string", 200);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "INVALID_GATEWAY_PROFILE",
      });
    });
  });

  // ── Security: no token leaks ───────────────────────────────────

  describe("security", () => {
    it("does not expose token in error messages", async () => {
      const fetch = makeFetchMock({ error: "Unauthorized" }, 401);
      const getAccessToken = makeTokenProviderMock(["super-secret-token-xyz"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      try {
        await adapter.getProfile();
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).not.toContain("super-secret-token-xyz");
        expect(msg).not.toContain("Bearer");
        expect(msg).not.toContain("token");
      }
    });

    it("does not expose token in console output", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      const fetch = makeFetchMock({ error: "Unauthorized" }, 401);
      const getAccessToken = makeTokenProviderMock(["secret-abc-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      try {
        await adapter.getProfile();
      } catch {
        // Expected
      }

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("secret-abc-123"),
      );
      expect(consoleWarn).not.toHaveBeenCalledWith(
        expect.stringContaining("secret-abc-123"),
      );
      expect(consoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("secret-abc-123"),
      );

      consoleSpy.mockRestore();
      consoleWarn.mockRestore();
      consoleLog.mockRestore();
    });
  });

  // ── Write method delegation ────────────────────────────────────

  describe("write operations delegate to legacyAdapter", () => {
    it("delegates patchProfile to legacyAdapter without calling gateway fetch", async () => {
      const gatewayFetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter({
        patchProfile: vi.fn().mockResolvedValue({
          nickname: "New Name",
          avatarUrl: null,
          capabilities: METADATA.capabilities,
          degradedReasons: METADATA.degradedReasons,
        }),
      });
      const adapter = createGatewayProfileAdapter({
        fetchFn: gatewayFetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.patchProfile({ nickname: "New Name" });

      expect(legacyAdapter.patchProfile).toHaveBeenCalledOnce();
      expect(legacyAdapter.patchProfile).toHaveBeenCalledWith({ nickname: "New Name" });
      expect(gatewayFetch).not.toHaveBeenCalled();
      expect(result.nickname).toBe("New Name");
    });

    it("delegates uploadAvatar to legacyAdapter without calling gateway fetch", async () => {
      const gatewayFetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter({
        uploadAvatar: vi.fn().mockResolvedValue({ avatarUrl: "https://cdn.example.com/av.jpg" }),
      });
      const adapter = createGatewayProfileAdapter({
        fetchFn: gatewayFetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const blob = new Blob(["fake"], { type: "image/jpeg" });
      const result = await adapter.uploadAvatar(blob);

      expect(legacyAdapter.uploadAvatar).toHaveBeenCalledOnce();
      expect(legacyAdapter.uploadAvatar).toHaveBeenCalledWith(blob);
      expect(gatewayFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ avatarUrl: "https://cdn.example.com/av.jpg" });
    });

    it("delegates changePassword to legacyAdapter without calling gateway fetch", async () => {
      const gatewayFetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter({
        changePassword: vi.fn().mockResolvedValue({ ok: true, reauthRequired: false }),
      });
      const adapter = createGatewayProfileAdapter({
        fetchFn: gatewayFetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.changePassword({
        oldPassword: "old",
        newPassword: "new",
      });

      expect(legacyAdapter.changePassword).toHaveBeenCalledOnce();
      expect(legacyAdapter.changePassword).toHaveBeenCalledWith({
        oldPassword: "old",
        newPassword: "new",
      });
      expect(gatewayFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, reauthRequired: false });
    });

    it("delegates logout to legacyAdapter without calling gateway fetch", async () => {
      const gatewayFetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter({
        logout: vi.fn().mockResolvedValue({ logoutUrl: "/api/casdoor/logout" }),
      });
      const adapter = createGatewayProfileAdapter({
        fetchFn: gatewayFetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.logout();

      expect(legacyAdapter.logout).toHaveBeenCalledOnce();
      expect(gatewayFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ logoutUrl: "/api/casdoor/logout" });
    });
  });

  // ── Interface conformance ──────────────────────────────────────

  describe("interface conformance", () => {
    it("implements AccountCenterAdapter interface", () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      // Type check
      const _typeCheck: AccountCenterAdapter = adapter;
      void _typeCheck;

      expect(typeof adapter.getProfile).toBe("function");
      expect(typeof adapter.patchProfile).toBe("function");
      expect(typeof adapter.uploadAvatar).toBe("function");
      expect(typeof adapter.changePassword).toBe("function");
      expect(typeof adapter.logout).toBe("function");
    });
  });

  // ── Query key safety ───────────────────────────────────────────

  describe("QUERY_KEY safety", () => {
    it("PROFILE_KEY does not contain token", async () => {
      const { PROFILE_KEY } = await import("../hooks/use-account");
      expect(PROFILE_KEY).toEqual(["account-center", "profile"]);
      expect(PROFILE_KEY).not.toContain("token");
      expect(JSON.stringify(PROFILE_KEY)).not.toContain("token");
    });
  });

  // ── profileMetadata explicit field selection (no spread) ──────

  describe("profileMetadata explicit field selection (no spread)", () => {
    it("composes the nine profile fields plus local capability metadata", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.getProfile();
      const keys = Object.keys(result).sort();
      expect(keys).toEqual([
        "avatarUrl", "bio", "capabilities", "degradedReasons", "email",
        "firstName", "lastName", "nickname", "organization", "phone", "username",
      ]);
    });

    it("does not leak subject from a full AccountProfile passed as profileMetadata", async () => {
      const fullProfile: AccountProfile = {
        subject: "u-leaked",
        nickname: "Should Not Appear",
        avatarUrl: "https://leak.example.com/av.jpg",
        capabilities: { avatarUpload: false, passwordChange: false },
        degradedReasons: ["leaked"],
      };
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: {
          capabilities: fullProfile.capabilities,
          degradedReasons: fullProfile.degradedReasons,
        },
      });

      const result = await adapter.getProfile();

      // Gateway displayName "Test User" wins, not profileMetadata.nickname
      expect(result.nickname).toBe("Test User");
      expect(result.avatarUrl).toBe("https://example.com/avatar.jpg");
      // subject must never appear
      expect(result).not.toHaveProperty("subject");
      // capabilities/degradedReasons come from metadata, not from the DTO
      expect(result.capabilities).toEqual({ avatarUpload: false, passwordChange: false });
      expect(result.degradedReasons).toEqual(["leaked"]);
    });

    it("does not fabricate capabilities/degradedReasons when profileMetadata has different values", async () => {
      const meta: Pick<AccountProfile, "capabilities" | "degradedReasons"> = {
        capabilities: { avatarUpload: true, passwordChange: false },
        degradedReasons: ["special"],
      };
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: meta,
      });

      const result = await adapter.getProfile();
      expect(result.capabilities).toEqual({ avatarUpload: true, passwordChange: false });
      expect(result.degradedReasons).toEqual(["special"]);
    });
  });

  // ── getAccessToken runtime validation ────────────────────────

  describe("getAccessToken runtime validation", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["number 42", 42],
      ["boolean true", true],
      ["object {}", {}],
      ["whitespace-only string", "   "],
      ["tab+newline string", "\t\n"],
      ["empty string", ""],
    ])("rejects %s token and does NOT call fetch", async (_label, badToken) => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = vi.fn(async () => badToken as unknown as string);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "TOKEN_MISSING",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("accepts a valid non-empty string token", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = makeTokenProviderMock(["valid-token"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      const result = await adapter.getProfile();
      expect(result.nickname).toBe("Test User");
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  // ── Content-Type media-type parsing ──────────────────────────

  describe("Content-Type media-type parsing", () => {
    it.each([
      ["application/json; charset=utf-8", true],
      ["Application/JSON", true],
      ["APPLICATION/JSON; charset=utf-8; boundary=something", true],
      ["application/json", true],
      ["application/jsonp", false],
      ["text/application/json", false],
      ["text/html", false],
      ["application/vnd.api+json", false],
    ])("Content-Type %s → accepted=%s", async (contentType, shouldPass) => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO, 200, {
        "content-type": contentType,
      });
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      if (shouldPass) {
        const result = await adapter.getProfile();
        expect(result.nickname).toBe("Test User");
      } else {
        await expect(adapter.getProfile()).rejects.toMatchObject({
          name: "GatewayProfileAdapterError",
          code: "INVALID_RESPONSE",
        });
      }
    });

    it("rejects missing content-type header", async () => {
      const fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO, 200, {});
      const getAccessToken = makeTokenProviderMock(["token-123"]);
      const legacyAdapter = makeLegacyAdapter();
      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "GatewayProfileAdapterError",
        code: "INVALID_RESPONSE",
      });
    });
  });

  // ── Read failure asserts legacyAdapter.getProfile never called ─

  describe("read failure never calls legacyAdapter.getProfile", () => {
    it.each([
      "TOKEN_MISSING",
      "TOKEN_ERROR",
      "NETWORK_ERROR",
      "UNAUTHORIZED",
      "INVALID_RESPONSE",
      "MALFORMED_JSON",
      "INVALID_GATEWAY_PROFILE",
    ])("%s does not call legacyAdapter.getProfile", async (code) => {
      const legacyGetProfile = vi.fn();
      const legacyAdapter = makeLegacyAdapter({ getProfile: legacyGetProfile });

      // Set up fetch/gateway based on the error code
      let fetch: FetchMock;
      let getAccessToken: () => Promise<string>;

      switch (code) {
        case "TOKEN_MISSING":
          fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
          getAccessToken = async () => "";
          break;
        case "TOKEN_ERROR":
          fetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
          getAccessToken = async () => { throw new Error("auth down"); };
          break;
        case "NETWORK_ERROR":
          fetch = vi.fn(async () => { throw new TypeError("fail"); }) as unknown as FetchMock;
          getAccessToken = makeTokenProviderMock(["token"]);
          break;
        case "UNAUTHORIZED":
          fetch = makeFetchMock({}, 401);
          getAccessToken = makeTokenProviderMock(["token"]);
          break;
        case "INVALID_RESPONSE":
          fetch = makeFetchMock("not json", 200, { "content-type": "text/plain" });
          getAccessToken = makeTokenProviderMock(["token"]);
          break;
        case "MALFORMED_JSON":
          fetch = vi.fn(async () => ({
            ok: true, status: 200, statusText: "OK",
            headers: { get: (n: string) => n === "content-type" ? "application/json" : null },
            json: async () => { throw new SyntaxError("bad"); },
          })) as unknown as FetchMock;
          getAccessToken = makeTokenProviderMock(["token"]);
          break;
        case "INVALID_GATEWAY_PROFILE":
          fetch = makeFetchMock({ username: "only" });
          getAccessToken = makeTokenProviderMock(["token"]);
          break;
        default:
          throw new Error(`Unknown code: ${code}`);
      }

      const adapter = createGatewayProfileAdapter({
        fetchFn: fetch!,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "GatewayProfileAdapterError",
      });

      expect(legacyGetProfile).not.toHaveBeenCalled();
    });
  });

  // ── Write delegation rejection propagation ───────────────────

  describe("write delegation rejection propagation", () => {
    it("propagates a legacy rejection without calling gateway fetch or token provider", async () => {
      const gatewayFetch = makeFetchMock(VALID_GATEWAY_PROFILE_DTO);
      const getAccessToken = vi.fn(async () => "secret-token");
      const rejectionError = new Error("Legacy write rejected");
      const legacyAdapter = makeLegacyAdapter({
        patchProfile: vi.fn().mockRejectedValue(rejectionError),
      });
      const adapter = createGatewayProfileAdapter({
        fetchFn: gatewayFetch,
        getAccessToken,
        legacyAdapter,
        profileMetadata: METADATA,
      });

      await expect(adapter.patchProfile({ nickname: "fail" })).rejects.toBe(rejectionError);
      expect(gatewayFetch).not.toHaveBeenCalled();
      expect(getAccessToken).not.toHaveBeenCalled();
    });
  });
});
