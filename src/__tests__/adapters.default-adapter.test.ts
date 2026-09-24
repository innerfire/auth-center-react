/**
 * Tests for the default fetch-based adapter.
 *
 * Strategy: mock globalThis.fetch to return canned envelopes and verify
 * that each adapter method correctly unwraps { data } / { error } envelopes,
 * sends the right HTTP method/headers/body, and handles edge cases.
 */
import { describe, it, expect, vi } from "vitest";
import { createDefaultAdapter } from "../adapters/default-adapter";

// ─── Helpers ────────────────────────────────────────────────────────

function successEnvelope<T>(data: T) {
  return { data };
}

function errorEnvelope(code: string, message: string, retryable = false) {
  return { error: { code, message, retryable } };
}

type FetchMock = ReturnType<typeof vi.fn> & typeof globalThis.fetch;

function makeFetch(responseBody: unknown, status = 200): FetchMock {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => responseBody,
  })) as unknown as FetchMock;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("createDefaultAdapter", () => {
  // ── GET profile ──────────────────────────────────────────────────

  describe("getProfile", () => {
    it("unwraps a success envelope", async () => {
      const profile = {
        subject: "u-001",
        nickname: "Test",
        avatarUrl: null,
        capabilities: { avatarUpload: true, passwordChange: true },
        degradedReasons: [],
      };
      const fetch = makeFetch(successEnvelope(profile));
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.getProfile();
      expect(result).toEqual(profile);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe("/api/account/profile");
      expect(init).toBeUndefined(); // GET has no init
    });

    it("throws AccountApiError on error envelope", async () => {
      const fetch = makeFetch(errorEnvelope("NOT_FOUND", "User not found"), 404);
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.getProfile()).rejects.toThrow("Resource not found");
      await expect(adapter.getProfile()).rejects.toMatchObject({
        name: "AccountApiError",
        code: "NOT_FOUND",
        retryable: false,
      });
    });

    it("throws NETWORK on non-JSON response", async () => {
      const fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })) as unknown as typeof globalThis.fetch;
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.getProfile()).rejects.toThrow("Server returned an unexpected response");
    });
  });

  // ── PATCH profile ────────────────────────────────────────────────

  describe("patchProfile", () => {
    it("sends PATCH with JSON body and unwraps success", async () => {
      const profile = {
        subject: "u-001",
        nickname: "NewName",
        avatarUrl: null,
        capabilities: { avatarUpload: true, passwordChange: true },
        degradedReasons: [],
      };
      const fetch = makeFetch(successEnvelope(profile));
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.patchProfile({ nickname: "NewName" });
      expect(result).toEqual(profile);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe("/api/account/profile");
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toBe(JSON.stringify({ nickname: "NewName" }));
    });

    it("throws retryable error on server error", async () => {
      const fetch = makeFetch(errorEnvelope("CONFLICT", "Nickname taken", true), 409);
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.patchProfile({ nickname: "taken" })).rejects.toMatchObject({
        code: "CONFLICT",
        retryable: true,
      });
    });
  });

  // ── uploadAvatar (multipart) ─────────────────────────────────────

  describe("uploadAvatar", () => {
    it("sends FormData with 'file' field and unwraps success", async () => {
      const fetch = makeFetch(successEnvelope({ avatarUrl: "https://cdn.example.com/av.jpg" }));
      const adapter = createDefaultAdapter(fetch);

      const blob = new Blob(["fake"], { type: "image/jpeg" });
      const result = await adapter.uploadAvatar(blob);

      expect(result).toEqual({ avatarUrl: "https://cdn.example.com/av.jpg" });

      const [, init] = fetch.mock.calls[0];
      expect(init?.method).toBe("POST");
      // FormData doesn't have standard headers — Content-Type is auto-set by browser
      const body = init?.body as FormData;
      expect(body).toBeInstanceOf(FormData);

      // Verify the field name is "file"
      const fileField = body.get("file") as Blob;
      expect(fileField).toBeInstanceOf(Blob);
      expect(fileField.type).toBe("image/jpeg");
    });

    it("throws on upload failure", async () => {
      const fetch = makeFetch(errorEnvelope("TOO_LARGE", "File too large"), 413);
      const adapter = createDefaultAdapter(fetch);

      const blob = new Blob(["x".repeat(6 * 1024 * 1024)], { type: "image/jpeg" });
      await expect(adapter.uploadAvatar(blob)).rejects.toMatchObject({
        code: "TOO_LARGE",
      });
    });
  });

  // ── changePassword ───────────────────────────────────────────────

  describe("changePassword", () => {
    it("sends POST with JSON body and unwraps success", async () => {
      const payload = { oldPassword: "old12345", newPassword: "newPass1" };
      const response = { ok: true, reauthRequired: false, message: "Done" };
      const fetch = makeFetch(successEnvelope(response));
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.changePassword(payload);
      expect(result).toEqual(response);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe("/api/account/password");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toBe(JSON.stringify(payload));
    });

    it("throws on validation error", async () => {
      const fetch = makeFetch(errorEnvelope("WEAK_PASSWORD", "Password too weak"), 422);
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.changePassword({ oldPassword: "x", newPassword: "x" }))
        .rejects.toMatchObject({ code: "WEAK_PASSWORD", retryable: false });
    });
  });

  // ── logout (with fire-and-forget fallback) ───────────────────────

  describe("logout", () => {
    it("unwraps success envelope", async () => {
      const fetch = makeFetch(successEnvelope({ logoutUrl: "/api/casdoor/logout" }));
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.logout();
      expect(result).toEqual({ logoutUrl: "/api/casdoor/logout" });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe("/api/account/logout");
      expect(init?.method).toBe("POST");
    });

    it("returns the cookie-clearing logout route when fetch throws", async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof globalThis.fetch;
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.logout();
      expect(result).toEqual({ logoutUrl: "/api/casdoor/logout" });
    });

    it("returns fallback when server returns error envelope", async () => {
      const fetch = makeFetch(errorEnvelope("NETWORK", "Down", false), 500);
      const adapter = createDefaultAdapter(fetch);

      const result = await adapter.logout();
      expect(result).toEqual({ logoutUrl: "/api/casdoor/logout" });
    });
  });

  // ── Non-envelope response (lenient path) ─────────────────────────

  describe("edge cases", () => {
    it("handles non-ok without error envelope by throwing UPSTREAM", async () => {
      const fetch = makeFetch({ randomField: true }, 500);
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.getProfile()).rejects.toMatchObject({
        code: "UPSTREAM",
        retryable: true,
      });
    });

    it("handles envelope with unknown status code gracefully", async () => {
      const fetch = makeFetch(errorEnvelope("RATE_LIMITED", "Slow down", true), 429);
      const adapter = createDefaultAdapter(fetch);

      await expect(adapter.getProfile()).rejects.toMatchObject({
        code: "RATE_LIMITED",
        retryable: true,
      });
    });
  });
});
