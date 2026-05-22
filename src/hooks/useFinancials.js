import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { configGet, configSet } from '../db/schema.js'
import { toMonthlyPaise } from '../utils/finance.js'
import { loadMonthlyHistory } from '../utils/monthlyHistory.js'
import { calculateHealthScore } from '../utils/healthScore.js'

export function currentMonth() {
  return format(new Date(), 'yyyy-MM')
}

// Single source of truth for all financial summaries.
// Used by Dashboard (Phase 1b) and the AI context builder.
// Income/expense pages maintain their own optimistic local state for CRUD,
// but can call refresh() after mutations to re-sync this hook.
export function useFinancials(month = currentMonth(), numMonths = 6) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [incomeStreams, setIncomeStreams] = useState([])
  const [expenses, setExpenses] = useState([])
  const [monthlyHistory, setMonthlyHistory] = useState([])
  const [budgets, setBudgets] = useState({}) // { [categoryId]: paise }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  // Persist budget changes to app_config. Call after any budget mutation.
  const saveBudgets = useCallback(async (newBudgets) => {
    setBudgets(newBudgets)
    await configSet('expense_budgets', JSON.stringify(newBudgets))
  }, [])

  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      decryptAndLoadAll('income_streams', cryptoKey),
      decryptAndLoadAll('expenses', cryptoKey, { month }),
      loadMonthlyHistory(cryptoKey, numMonths),
      configGet('expense_budgets'),
    ])
      .then(([streams, exps, history, budgetsJson]) => {
        if (cancelled) return
        setIncomeStreams(streams)
        setExpenses(exps)
        setMonthlyHistory(history)
        try {
          setBudgets(budgetsJson ? JSON.parse(budgetsJson) : {})
        } catch {
          setBudgets({})
        }
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[finio/useFinancials] Load failed:', err)
        setError(err.message)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cryptoKey, month, numMonths, tick])

  const summary = useMemo(() => {
    const totalMonthlyIncomePaise = incomeStreams.reduce((sum, s) => {
      return sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency)
    }, 0)

    const totalMonthlyExpensesPaise = expenses.reduce((sum, e) => {
      return sum + (Number(e.amount) || 0)
    }, 0)

    const surplusPaise = totalMonthlyIncomePaise - totalMonthlyExpensesPaise

    const savingsRate =
      totalMonthlyIncomePaise > 0
        ? Math.round((surplusPaise / totalMonthlyIncomePaise) * 100)
        : 0

    const expenseByCategory = {}
    for (const exp of expenses) {
      const cat = exp.category ?? 'miscellaneous'
      expenseByCategory[cat] = (expenseByCategory[cat] ?? 0) + (Number(exp.amount) || 0)
    }

    const { score: healthScore, factors: healthFactors } = calculateHealthScore({
      savingsRate,
      totalMonthlyIncomePaise,
      totalMonthlyExpensesPaise,
      hasLoans: false, // enriched in Phase 2
      emergencyMonths: 0, // enriched in Phase 2
    })

    return {
      totalMonthlyIncomePaise,
      totalMonthlyExpensesPaise,
      surplusPaise,
      savingsRate,
      expenseByCategory,
      streamCount: incomeStreams.length,
      expenseCount: expenses.length,
      healthScore,
      healthFactors,
    }
  }, [incomeStreams, expenses])

  return {
    incomeStreams,
    expenses,
    summary,
    monthlyHistory,
    budgets,
    saveBudgets,
    loading,
    error,
    refresh,
  }
}
