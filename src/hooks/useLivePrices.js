/**
 * useLivePrices — orchestrates live price fetching with a 60-minute session gate.
 *
 * - Reads the encrypted GoldAPI key from the vault.
 * - Fetches stock/MF/gold prices via ai/livePrices.js (Promise.allSettled).
 * - Writes each fetched price back to the DB:
 *     stocks      → current_price_paise
 *     mutual_fund → current_nav_paise
 *     gold        → current_price_per_gram_paise
 *   and appends a { date, price } entry to price_history (replacing today's).
 * - Caches results in Zustand; refresh() is blocked if last fetch < 60 min ago
 *   unless force=true.
 */

import { useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { encryptAndUpdate } from '../db/helpers.js'
import { fetchAllLivePrices, loadGoldApiKey } from '../ai/livePrices.js'

const SIXTY_MIN = 60 * 60 * 1000

const PRICE_FIELD = {
  stocks:      'current_price_paise',
  mutual_fund: 'current_nav_paise',
  gold:        'current_price_per_gram_paise',
}

export function useLivePrices() {
  const cryptoKey   = useAppStore((s) => s.cryptoKey)
  const livePrices  = useAppStore((s) => s.livePrices)
  const setLivePrices = useAppStore((s) => s.setLivePrices)

  const [fetching, setFetching] = useState(false)
  const [error,    setError]    = useState(null)

  const lastFetched = livePrices?.lastFetched ?? null
  const canRefresh  = !lastFetched || (Date.now() - lastFetched) >= SIXTY_MIN

  /**
   * Fetch live prices and persist them.
   * @param {object[]} investments - enriched investment records
   * @param {boolean} force - bypass the 60-min gate (manual refresh)
   */
  const refresh = useCallback(async (investments, force = false) => {
    if (fetching) return
    if (!force && lastFetched && (Date.now() - lastFetched) < SIXTY_MIN) return
    if (!cryptoKey || !investments?.length) return

    setFetching(true)
    setError(null)

    try {
      const goldKey = await loadGoldApiKey(cryptoKey)
      const { prices } = await fetchAllLivePrices(investments, goldKey)
      const today = format(new Date(), 'yyyy-MM-dd')

      // Persist each fetched price back to the DB
      const writes = []
      for (const inv of investments) {
        const pricePaise = prices[inv.id]
        if (pricePaise == null) continue
        const field = PRICE_FIELD[inv.asset_class]
        if (!field) continue

        const history = Array.isArray(inv.price_history) ? [...inv.price_history] : []
        const filtered = history.filter((h) => h.date !== today)
        filtered.push({ date: today, price: pricePaise })

        writes.push(
          encryptAndUpdate(
            'investments',
            inv.id,
            { [field]: pricePaise, price_history: filtered },
            cryptoKey,
            ['asset_class'],
          )
        )
      }
      await Promise.allSettled(writes)

      setLivePrices({ prices, lastFetched: Date.now() })
    } catch (err) {
      console.warn('[finio/useLivePrices] refresh failed:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [cryptoKey, fetching, lastFetched, setLivePrices])

  return { fetching, error, lastFetched, canRefresh, refresh, prices: livePrices?.prices || {} }
}
