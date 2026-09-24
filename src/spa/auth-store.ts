import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { createEncryptedStateStorage } from "./encrypted-storage";
import type { AccountCenterAuthStatus, AccountCenterTokenSet } from "./types";

export interface AccountCenterAuthState {
  status: AccountCenterAuthStatus;
  tokens: AccountCenterTokenSet | null;
  setStatus(status: AccountCenterAuthStatus): void;
  setTokens(tokens: AccountCenterTokenSet): void;
  clearTokens(): void;
  finishHydration(): void;
}

export type AccountCenterAuthStore = ReturnType<typeof createAccountCenterAuthStore>;

export function createAccountCenterAuthStore(storageKey: string) {
  return createStore<AccountCenterAuthState>()(
    persist(
      (set) => ({
        status: "hydrating",
        tokens: null,
        setStatus: (status) => set({ status }),
        setTokens: (tokens) => set({ tokens, status: "authenticated" }),
        clearTokens: () => set({ tokens: null, status: "unauthenticated" }),
        finishHydration: () => set((state) => ({
          status: state.tokens && (state.tokens.expiresAt > Date.now() || state.tokens.refreshToken)
            ? "authenticated"
            : "unauthenticated",
          tokens: state.tokens && (state.tokens.expiresAt > Date.now() || state.tokens.refreshToken)
            ? state.tokens
            : null,
        })),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => createEncryptedStateStorage(storageKey)),
        partialize: (state) => ({ tokens: state.tokens }),
        onRehydrateStorage: (initialState) => (rehydratedState) => {
          (rehydratedState ?? initialState).finishHydration();
        },
      },
    ),
  );
}
