// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEncryptedStateStorage } from "../spa/encrypted-storage";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});

describe("encrypted Zustand storage", () => {
  it("persists ciphertext instead of plaintext tokens and decrypts it", async () => {
    const storage = createEncryptedStateStorage("test-vault");
    const value = JSON.stringify({ state: { tokens: { accessToken: "secret-access-token" } } });

    await storage.setItem("ignored", value);

    const raw = localStorage.getItem("account-center:cipher:test-vault");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("secret-access-token");
    await expect(storage.getItem("ignored")).resolves.toBe(value);
  });

  it("removes unreadable ciphertext without exposing it", async () => {
    localStorage.setItem("account-center:cipher:broken-vault", "not-json");
    const storage = createEncryptedStateStorage("broken-vault");
    await expect(storage.getItem("ignored")).resolves.toBeNull();
    expect(localStorage.getItem("account-center:cipher:broken-vault")).toBeNull();
  });
});
