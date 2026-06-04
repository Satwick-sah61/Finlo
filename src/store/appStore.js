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

  // Session-level live-price cache
  // Shape: { prices: { [id]: paise }, lastFetched: number } | null
  livePrices: null,

  // Session-level AI context cache (built by ai/contextBuilder.js)
  // Shape: object | null
  finioContext: null,

  // Monotonic counter — bumped whenever financial data changes.
  // useFinioContext watches this and rebuilds the context automatically.
  dataVersion: 0,

  setAppState: (appState) => set({ appState }),

  unlock: (cryptoKey, needsOnboarding = false) =>
    set({ cryptoKey, appState: needsOnboarding ? APP_STATE.ONBOARDING : APP_STATE.UNLOCKED }),

  completeOnboarding: () => set({ appState: APP_STATE.UNLOCKED }),

  lock: () => set({
    cryptoKey: null,
    appState: APP_STATE.LOCKED,
    loanInsightCache: null,
    investmentNews: null,
    livePrices: null,
    finioContext: null,
  }),

  // Wipes all local state — called after DB deletion in Settings
  nuke: () => set({
    cryptoKey: null,
    appState: APP_STATE.SETUP,
    loanInsightCache: null,
    investmentNews: null,
    livePrices: null,
    finioContext: null,
    dataVersion: 0,
  }),

  setLoanInsightCache: (cache) => set({ loanInsightCache: cache }),
  setInvestmentNews:   (news)  => set({ investmentNews: news }),
  setLivePrices:       (data)  => set({ livePrices: data }),
  setFinioContext:     (ctx)   => set({ finioContext: ctx }),

  // Call after any write that changes the financial picture (the "DATA_CHANGED" event).
  notifyDataChanged:   () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  isUnlocked: () => {
    const s = get().appState
    return s === APP_STATE.UNLOCKED || s === APP_STATE.ONBOARDING
  },
}))
