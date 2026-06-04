/**
 * useQuickLog — hook for the expense_logs table.
 *
 * expense_logs is separate from expenses:
 *   expenses:     monthly budget estimates (manually entered)
 *   expense_logs: individual logged transactions (via Quick Log FAB)
 *
 * Plaintext indexed fields: date (yyyy-MM-dd), category
 * Encrypted fields:         amount, note, subcategory, source
 *
 * All monetary arithmetic via Dinero.js.
 */

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { encryptAndSave } from '../db/helpers.js'
import { decryptAndLoadAll } from '../db/helpers.js'

// ─── Quick category display → Finio category mapping ─────────────────────────

export const QUICK_CATEGORIES = [
  { id: 'food',          label: 'Food',          emoji: '🍽️' },
  { id: 'transport',     label: 'Transport',      emoji: '🚗' },
  { id: 'lifestyle',     label: 'Shopping',       emoji: '🛍️' },
  { id: 'housing',       label: 'Bills',          emoji: '💡' },
  { id: 'health',        label: 'Health',         emoji: '🏥' },
  { id: 'lifestyle',     label: 'Entertainment',  emoji: '🎬', subId: 'entertainment' },
  { id: 'lifestyle',     label: 'Personal',       emoji: '✂️', subId: 'personal' },
  { id: 'miscellaneous', label: 'Other',          emoji: '📦' },
]

// Deduplicated for state use (use subId to distinguish)
export const QUICK_CATEGORY_OPTIONS = [
  { id: 'food',          displayId: 'food',          label: 'Food',         emoji: '🍽️' },
  { id: 'transport',     displayId: 'transport',     label: 'Transport',    emoji: '🚗' },
  { id: 'lifestyle',     displayId: 'shopping',      label: 'Shopping',     emoji: '🛍️' },
  { id: 'housing',       displayId: 'bills',         label: 'Bills',        emoji: '💡' },
  { id: 'health',        displayId: 'health',        label: 'Health',       emoji: '🏥' },
  { id: 'lifestyle',     displayId: 'entertainment', label: 'Entertainment',emoji: '🎬' },
  { id: 'lifestyle',     displayId: 'personal',      label: 'Personal',     emoji: '✂️' },
  { id: 'miscellaneous', displayId: 'other',         label: 'Other',        emoji: '📦' },
]

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useQuickLog() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)

  /**
   * Save a quick log entry.
   * @param {{ amountPaise, category, note, date, source }} log
   */
  const saveLog = useCallback(async ({ amountPaise, category, note = '', date, source = 'quick_log' }) => {
    if (!cryptoKey) throw new Error('Vault locked')
    if (!amountPaise || amountPaise <= 0) throw new Error('Amount must be positive')

    // encryptAndSave fires the DATA_CHANGED event centrally (db/helpers.js)
    return encryptAndSave(
      'expense_logs',
      {
        amount:     amountPaise,
        category,               // also stored plaintext via extraPlain below
        note:       note.trim(),
        date:       date || format(new Date(), 'yyyy-MM-dd'),
        logged_at:  new Date(),
        source,
      },
      cryptoKey,
      ['date', 'category'],     // plaintext for Dexie index queries
    )
  }, [cryptoKey])

  /**
   * Load all logs for a specific date.
   */
  const loadDayLogs = useCallback(async (date = format(new Date(), 'yyyy-MM-dd')) => {
    if (!cryptoKey) return []
    return decryptAndLoadAll('expense_logs', cryptoKey, { date })
  }, [cryptoKey])

  /**
   * Load all logs for a month (yyyy-MM).
   */
  const loadMonthLogs = useCallback(async (month = format(new Date(), 'yyyy-MM')) => {
    if (!cryptoKey) return []
    const startDate = `${month}-01`
    const endDate   = `${month}-31`
    return decryptAndLoadAll('expense_logs', cryptoKey, { dateRange: [startDate, endDate] })
  }, [cryptoKey])

  /**
   * Sum of today's logs in paise (Dinero-safe).
   */
  const getTodayTotal = useCallback(async () => {
    const logs = await loadDayLogs()
    // Integer paise addition — no floating point risk
    return logs.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
  }, [loadDayLogs])

  /**
   * Sum of a month's logs in paise.
   */
  const getMonthTotal = useCallback(async (month = format(new Date(), 'yyyy-MM')) => {
    const logs = await loadMonthLogs(month)
    return logs.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
  }, [loadMonthLogs])

  /**
   * Sum for a specific category within a month.
   */
  const getCategoryTotal = useCallback(async (category, month = format(new Date(), 'yyyy-MM')) => {
    const logs = await loadMonthLogs(month)
    return logs
      .filter((l) => l.category === category)
      .reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
  }, [loadMonthLogs])

  return { saveLog, loadDayLogs, loadMonthLogs, getTodayTotal, getMonthTotal, getCategoryTotal }
}

// ─── Self-contained today's log state hook ────────────────────────────────────

export function useTodayLogs() {
  const { loadDayLogs } = useQuickLog()
  const [logs,    setLogs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [tick,    setTick]    = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDayLogs()
      .then((data) => {
        if (cancelled) return
        setLogs(data)
        const sum = data.reduce((s, l) => s + (Number(l.amount) || 0), 0)
        setTotal(sum)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadDayLogs, tick])

  return { logs, total, loading, refresh }
}
