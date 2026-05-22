import { format, subMonths, parseISO } from 'date-fns'
import { decryptAndLoadAll } from '../db/helpers.js'
import { toMonthlyPaise } from './finance.js'

// Load expense + income history for the last N months.
// Returns an array of month records in chronological order (oldest first).
// Months with no expense data return zeroes — never nulls.
//
// Income is treated as recurring: current income_streams normalized to monthly
// paise and applied uniformly across all months. Phase 2+ can refine this
// when streams gain start/end dates.
export async function loadMonthlyHistory(cryptoKey, numMonths = 6) {
  const now = new Date()

  // Build month keys oldest-first: e.g. ['2024-12', '2025-01', ..., '2025-05']
  const monthKeys = Array.from({ length: numMonths }, (_, i) =>
    format(subMonths(now, numMonths - 1 - i), 'yyyy-MM')
  )

  // Income streams are global (not dated per-month) — compute once
  const streams = await decryptAndLoadAll('income_streams', cryptoKey)
  const monthlyIncomePaise = streams.reduce(
    (sum, s) => sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency),
    0
  )

  // Load all months' expenses in parallel
  const expensesByMonth = await Promise.all(
    monthKeys.map((m) => decryptAndLoadAll('expenses', cryptoKey, { month: m }))
  )

  return monthKeys.map((month, i) => {
    const exps = expensesByMonth[i]
    const expenses = exps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const surplus = monthlyIncomePaise - expenses

    const byCategory = {}
    for (const exp of exps) {
      const cat = exp.category ?? 'miscellaneous'
      byCategory[cat] = (byCategory[cat] ?? 0) + (Number(exp.amount) || 0)
    }

    return {
      month,
      label: format(parseISO(`${month}-01`), 'MMM yyyy'),
      income: monthlyIncomePaise,
      expenses,
      surplus,
      byCategory,
      // true only when the user has actually logged expense records for this month.
      // Used by charts to filter out ghost months where income is retroactively
      // applied but no real activity exists.
      hasExpenses: exps.length > 0,
    }
  })
}
