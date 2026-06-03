import { create } from 'zustand'

export const APP_STATE = {
  LOADING: 'LOADING',       // Checking IndexedDB for existing vault
  SETUP: 'SETUP',           // No vault exists — first-time ever
  LOCKED: 'LOCKED',         // Vault exists, waiting for passphrase
  ONBOARDING: 'ONBOARDING', // Vault unlocked, onboarding wizard not yet complete
  UNLOCKED: 'UNLOCKED',     // Fully open — vault + onboarding done
}

export const useAppStore = create((set, get) => ({
  appState: APP_STATE.LOADING,
  cryptoKey: null, // CryptoKey — in-memory only, never serialized

  // Session-level AI cache for loan health insight
  // Shape: { text: string, hash: string } | null
  loanInsightCache: null,

  // Session-level AI cache for investment news
  // Shape: { items: object[], fetchedAt: number, isFallback: boolean } | null
  // Cleared on lock/nuke so stale data never persists across sessions
  investmentNews: null,

  setAppState: (appState) => set({ appState }),

  unlock: (cryptoKey, needsOnboarding = false) =>
    set({ cryptoKey, appState: needsOnboarding ? APP_STATE.ONBOARDING : APP_STATE.UNLOCKED }),

  completeOnboarding: () => set({ appState: APP_STATE.UNLOCKED }),

  lock: () => set({
    cryptoKey: null,
    appState: APP_STATE.LOCKED,
    loanInsightCache: null,
    investmentNews: null,
  }),

  // Wipes all local state — called after DB deletion in Settings
  nuke: () => set({
    cryptoKey: null,
    appState: APP_STATE.SETUP,
    loanInsightCache: null,
    investmentNews: null,
  }),

  setLoanInsightCache: (cache) => set({ loanInsightCache: cache }),
  setInvestmentNews:   (news)  => set({ investmentNews: news }),

  isUnlocked: () => {
    const s = get().appState
    return s === APP_STATE.UNLOCKED || s === APP_STATE.ONBOARDING
  },
}))
