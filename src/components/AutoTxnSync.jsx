/**
 * AutoTxnSync — runs once per unlock. Stamps baseline flags, initializes the
 * trial tier, then generates this month's pending transactions (deduplicated)
 * from loans / SIPs / goals / income. Renders nothing.
 */

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { ensureBaselineFlags } from '../db/schema.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { ensureMonthlyTransactions } from '../utils/autoTransactions.js'
import { initializeTrial } from '../utils/featureFlags.js'

export default function AutoTxnSync() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const ran = useRef(false)

  useEffect(() => {
    if (!cryptoKey || ran.current) return
    ran.current = true

    let cancelled = false
    ;(async () => {
      try {
        await ensureBaselineFlags()
        await initializeTrial()

        const [loans, investments, goals, incomeStreams] = await Promise.all([
          decryptAndLoadAll('loans', cryptoKey).catch(() => []),
          decryptAndLoadAll('investments', cryptoKey).catch(() => []),
          decryptAndLoadAll('goals', cryptoKey).catch(() => []),
          decryptAndLoadAll('income_streams', cryptoKey).catch(() => []),
        ])
        if (cancelled) return

        const month = format(new Date(), 'yyyy-MM')
        const created = await ensureMonthlyTransactions(
          month,
          { loans, investments, goals, incomeStreams },
          cryptoKey,
        )
        if (created > 0) {
          // Refresh any context consumers
          useAppStore.getState().notifyDataChanged()
        }
      } catch (err) {
        console.warn('[finio/AutoTxnSync] failed:', err)
      }
    })()

    return () => { cancelled = true }
  }, [cryptoKey])

  return null
}
