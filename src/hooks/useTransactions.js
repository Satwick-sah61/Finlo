/**
 * useTransactions(month) — loads + manages the transaction ledger for a month.
 *
 * Returns income / committed / spent / surplus / true_surplus plus grouped
 * views and mutation helpers. All money sums via Dinero.js.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { fromPaise, toPaise, addMoney } from '../utils/currency.js'
import {
  getMonthTransactions,
  createTransaction,
  updateTransactionStatus,
  removeTransaction,
} from '../db/transactions.js'

function sumPaise(items, getter) {
  return toPaise(
    items.reduce((acc, it) => addMoney(acc, fromPaise(Math.round(getter(it) || 0))), fromPaise(0))
  )
}

export function useTransactions(month = format(new Date(), 'yyyy-MM')) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tick, setTick]       = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    getMonthTransactions(month, cryptoKey)
      .then((data) => {
        if (cancelled) return
        setTransactions(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[finio/useTransactions] load failed:', err)
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [cryptoKey, month, tick])

  const derived = useMemo(() => {
    const incomeTxns    = transactions.filter((t) => t.direction === 'in'  && t.status === 'confirmed')
    const committedTxns = transactions.filter((t) => t.direction === 'out' && (t.status === 'pending' || t.status === 'confirmed'))
    const spentTxns     = transactions.filter((t) => t.direction === 'out' && t.status === 'confirmed')

    const income    = sumPaise(incomeTxns,    (t) => t.amount)
    const committed = sumPaise(committedTxns, (t) => t.amount)
    const spent     = sumPaise(spentTxns,     (t) => t.amount)

    const byType = {}
    for (const t of transactions) {
      if (!byType[t.type]) byType[t.type] = []
      byType[t.type].push(t)
    }

    const byCategory = {}
    for (const t of transactions) {
      const cat = t.category || t.type
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(t)
    }

    const pendingCount = transactions.filter((t) => t.status === 'pending').length

    return {
      income,
      committed,
      spent,
      surplus:      income - committed,
      trueSurplus:  income - spent,
      byType,
      byCategory,
      pendingCount,
    }
  }, [transactions])

  // ── Mutations ───────────────────────────────────────────────────────────────

  const confirmTransaction = useCallback(async (id) => {
    await updateTransactionStatus(id, 'confirmed', cryptoKey)
    refresh()
  }, [cryptoKey, refresh])

  const skipTransaction = useCallback(async (id) => {
    await updateTransactionStatus(id, 'skipped', cryptoKey)
    refresh()
  }, [cryptoKey, refresh])

  const addTransaction = useCallback(async (data) => {
    await createTransaction({ ...data, month: data.month || month }, cryptoKey)
    refresh()
  }, [cryptoKey, month, refresh])

  const deleteTransaction = useCallback(async (id) => {
    await removeTransaction(id)
    refresh()
  }, [refresh])

  return {
    transactions,
    ...derived,
    loading,
    error,
    refresh,
    confirmTransaction,
    skipTransaction,
    addTransaction,
    deleteTransaction,
  }
}
