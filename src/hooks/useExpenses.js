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
 * Strict rules (do not double count):
 *   - Variable NEVER includes loans / savings / goals / investments — those are
 *     FIXED and are counted only in fixedExpenses. This applies to BOTH the
 *     onboarding estimates AND any logged transactions.
 *   - For each category, a logged amount REPLACES the estimate (never added).
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

// Categories that are FIXED commitments — never part of variable spending.
// 'loans' → EMIs, 'savings' → SIPs, 'goals'/'investments' → goal/SIP savings.
const FIXED_CATEGORY_IDS = new Set(['loans', 'savings', 'goals', 'investments'])

// Variable categories = every expense category except the fixed-commitment ones.
export const VARIABLE_CATEGORY_IDS = EXPENSE_CATEGORIES
  .map((c) => c.id)
  .filter((id) => !FIXED_CATEGORY_IDS.has(id))

// Fixed transaction types (the auto-generated commitments).
const FIXED_TXN_TYPES = ['loan_emi', 'sip', 'goal_saving']

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

        // ── FIXED expenses (loan EMIs + SIPs + goals; committed) ──
        const fixedExpenses = txns
          .filter((t) => t.direction === 'out' && FIXED_TXN_TYPES.includes(t.type)
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

        // ── VARIABLE: logged expense transactions, EXCLUDING fixed categories ──
        // (Bug 1 guard: a log accidentally filed under loans/savings/goals must
        //  never enter the variable total — it's already in fixedExpenses.)
        const loggedByCat = {}
        for (const t of txns) {
          if (t.direction !== 'out' || t.type !== 'expense' || t.status !== 'confirmed') continue
          const c = t.category || 'miscellaneous'
          if (FIXED_CATEGORY_IDS.has(c)) continue
          loggedByCat[c] = (loggedByCat[c] || 0) + (Number(t.amount) || 0)
        }
        const hasLoggedExpenses = Object.keys(loggedByCat).length > 0

        // ── Onboarding estimates, EXCLUDING fixed categories ──
        // (The expenses table from onboarding may contain loan/SIP rows — drop
        //  them so they don't double count against fixedExpenses.)
        const estimateByCat = {}
        for (const e of baselineExps) {
          const c = e.category || 'miscellaneous'
          if (FIXED_CATEGORY_IDS.has(c)) continue
          estimateByCat[c] = (estimateByCat[c] || 0) + (Number(e.amount) || 0)
        }

        // ── Per-category resolution: logged REPLACES estimate (never added) ──
        const variableByCategory = {}
        const catIds = new Set([...VARIABLE_CATEGORY_IDS, ...Object.keys(loggedByCat)])
        for (const id of catIds) {
          if (FIXED_CATEGORY_IDS.has(id)) continue // belt-and-braces
          const logged = loggedByCat[id] || 0
          if (logged > 0) {
            variableByCategory[id] = { amount: logged, source: 'logged' } // logged ONLY
          } else {
            variableByCategory[id] = { amount: estimateByCat[id] || 0, source: 'estimate' }
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
          hasLoggedExpenses,
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
