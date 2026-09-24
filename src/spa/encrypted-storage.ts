import type { StateStorage } from "zustand/middleware";

const DATABASE_NAME = "account-center-vault";
const DATABASE_VERSION = 1;
const KEY_STORE = "keys";
const CIPHER_PREFIX = "account-center:cipher:";
const keyPromises = new Map<string, Promise<CryptoKey>>();

interface CipherRecord {
  version: 1;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Unable to open the account token vault"));
  });
}

async function readKey(database: IDBDatabase, keyName: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get(keyName);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(new Error("Unable to read the account token key"));
  });
}

async function writeKey(database: IDBDatabase, keyName: string, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readwrite");
    transaction.objectStore(KEY_STORE).put(key, keyName);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Unable to persist the account token key"));
  });
}

async function loadEncryptionKey(keyName: string): Promise<CryptoKey> {
  const database = await openVault();
  try {
    const existing = await readKey(database, keyName);
    if (existing) return existing;
    const created = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await writeKey(database, keyName, created);
    return created;
  } finally {
    database.close();
  }
}

function getEncryptionKey(keyName: string): Promise<CryptoKey> {
  const existing = keyPromises.get(keyName);
  if (existing) return existing;
  const pending = loadEncryptionKey(keyName).catch((error) => {
    keyPromises.delete(keyName);
    throw error;
  });
  keyPromises.set(keyName, pending);
  return pending;
}

/**
 * Zustand StateStorage backed by AES-GCM ciphertext in localStorage.
 * The non-extractable AES key is stored separately as a CryptoKey in IndexedDB.
 * This protects tokens at rest, but cannot protect them from executing XSS.
 */
export function createEncryptedStateStorage(vaultName: string): StateStorage {
  const storageKey = `${CIPHER_PREFIX}${vaultName}`;
  let writeChain = Promise.resolve();

  return {
    async getItem(): Promise<string | null> {
      if (typeof window === "undefined") return null;
      const serialized = window.localStorage.getItem(storageKey);
      if (!serialized) return null;
      try {
        const record = JSON.parse(serialized) as CipherRecord;
        if (record.version !== 1) return null;
        const key = await getEncryptionKey(vaultName);
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(record.iv) },
          key,
          base64ToBytes(record.ciphertext),
        );
        return new TextDecoder().decode(plaintext);
      } catch {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(storageKey);
        }
        return null;
      }
    },

    async setItem(_name: string, value: string): Promise<void> {
      if (typeof window === "undefined") return;
      writeChain = writeChain.catch(() => undefined).then(async () => {
        const key = await getEncryptionKey(vaultName);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(value),
        );
        const record: CipherRecord = {
          version: 1,
          iv: bytesToBase64(iv),
          ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        };
        window.localStorage.setItem(storageKey, JSON.stringify(record));
      });
      await writeChain;
    },

    async removeItem(): Promise<void> {
      writeChain = writeChain.catch(() => undefined).then(() => {
        if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
      });
      await writeChain;
    },
  };
}
