/**
 * useExpenses(month) — the single source of truth for a month's expenses.
 *
 * Model:
 *   FIXED expenses    = loan EMIs + SIPs + goal savings (transaction ledger).
 *                       Always present each month; pending until marked paid.
 *   VARIABLE expenses = per category, LOGGED transactions take priority;
 *                       categories with no logs fall back to the onboarding
 *                       estimate (shown as a normal number, not a special mode).
 *
 *   surplus = income − totalFixed − totalVariable
 *
 * All money is integer paise. Rebuilds when the vault's dataVersion bumps.
 */

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { getMonthTransactions } from '../db/transactions.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { configGet } from '../db/schema.js'
import { toMonthlyPaise, EXPENSE_CATEGORIES } from '../utils/finance.js'

// Variable categories = all expense categories except the fixed-commitment ones
// ('loans' → EMIs, 'savings' → SIP/goal savings, which are FIXED).
export const VARIABLE_CATEGORY_IDS = EXPENSE_CATEGORIES
  .map((c) => c.id)
  .filter((id) => id !== 'loans' && id !== 'savings')

const FIXED_TYPES = ['loan_emi', 'sip', 'goal_saving']

function emptyState() {
  const variableByCategory = {}
  for (const id of VARIABLE_CATEGORY_IDS) variableByCategory[id] = { amount: 0, source: 'estimate' }
  return {
    fixedExpenses: [],
    totalFixed: 0,
    variableByCategory,
    totalVariable: 0,
    totalExpenses: 0,
    income: 0,
    surplus: 0,
    hasLoggedExpenses: false,
    loading: true,
    error: null,
  }
}

export function useExpenses(month = format(new Date(), 'yyyy-MM')) {
  const cryptoKey   = useAppStore((s) => s.cryptoKey)
  const dataVersion = useAppStore((s) => s.dataVersion)

  const [state, setState] = useState(emptyState)
  const [tick, setTick]   = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false

    ;(async () => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const baselineMonthCfg = await configGet('baseline_month')
        const baselineMonth = baselineMonthCfg || format(new Date(), 'yyyy-MM')

        const [txns, incomeStreams, baselineExps] = await Promise.all([
          getMonthTransactions(month, cryptoKey),
          decryptAndLoadAll('income_streams', cryptoKey),
          decryptAndLoadAll('expenses', cryptoKey, { month: baselineMonth }),
        ])
        if (cancelled) return

        // ── Income (confirmed inflow; fallback to income streams) ──
        const incomeTxns = txns.filter((t) => t.direction === 'in' && t.status === 'confirmed')
        const incomeFromTxns = incomeTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const incomeFromStreams = incomeStreams.reduce(
          (s, r) => s + toMonthlyPaise(Number(r.amount) || 0, r.frequency), 0
        )
        const income = incomeFromTxns > 0 ? incomeFromTxns : incomeFromStreams

        // ── Fixed expenses (committed: pending OR confirmed) ──
        const fixedExpenses = txns
          .filter((t) => t.direction === 'out' && FIXED_TYPES.includes(t.type)
            && (t.status === 'pending' || t.status === 'confirmed'))
          .map((t) => ({
            type:        t.type,
            amount:      Number(t.amount) || 0,
            status:      t.status,
            dueDate:     t.date,
            referenceId: t.reference_id,
            upiId:       t.upi_id || '',
            note:        t.note || '',
          }))
        const totalFixed = fixedExpenses.reduce((s, f) => s + f.amount, 0)

        // ── Variable: logged transactions per category ──
        const loggedExpenseTxns = txns.filter((t) =>
          t.direction === 'out' && t.type === 'expense' && t.status === 'confirmed')
        const loggedByCat = {}
        for (const t of loggedExpenseTxns) {
          const c = t.category || 'miscellaneous'
          loggedByCat[c] = (loggedByCat[c] || 0) + (Number(t.amount) || 0)
        }

        // ── Onboarding estimates per category (baseline fallback) ──
        const estimateByCat = {}
        for (const e of baselineExps) {
          const c = e.category || 'miscellaneous'
          estimateByCat[c] = (estimateByCat[c] || 0) + (Number(e.amount) || 0)
        }

        // ── Per-category resolution: logged wins, else estimate ──
        const variableByCategory = {}
        for (const id of VARIABLE_CATEGORY_IDS) {
          if (loggedByCat[id] > 0) {
            variableByCategory[id] = { amount: loggedByCat[id], source: 'logged' }
          } else {
            variableByCategory[id] = { amount: estimateByCat[id] || 0, source: 'estimate' }
          }
        }
        // Any logged category not in the standard variable list (safety)
        for (const [cat, amt] of Object.entries(loggedByCat)) {
          if (!(cat in variableByCategory)) {
            variableByCategory[cat] = { amount: amt, source: 'logged' }
          }
        }

        const totalVariable = Object.values(variableByCategory).reduce((s, v) => s + v.amount, 0)
        const totalExpenses = totalFixed + totalVariable

        if (cancelled) return
        setState({
          fixedExpenses,
          totalFixed,
          variableByCategory,
          totalVariable,
          totalExpenses,
          income,
          surplus: income - totalExpenses,
          hasLoggedExpenses: loggedExpenseTxns.length > 0,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (cancelled) return
        console.error('[finio/useExpenses] load failed:', err)
        setState({ ...emptyState(), loading: false, error: err.message })
      }
    })()

    return () => { cancelled = true }
  }, [cryptoKey, month, tick, dataVersion])

  return { ...state, refresh }
}
