// Pure sync function — no async, no AI, no side effects.
// Returns 3–5 insight objects derived from current financial state.
import { format } from 'date-fns'
import { formatINRCompact } from './currency.js'

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

/**
 * @param {{ summary, monthlyHistory, activeLoans?, dti? }} opts
 *   activeLoans – enriched active loans from useLoans (optional)
 *   dti         – debt-to-income ratio 0–1 (optional)
 */
export function generateInsights({ summary, monthlyHistory, activeLoans = [], dti = null }) {
  const insights = []
  const {
    totalMonthlyIncomePaise,
    totalMonthlyExpensesPaise,
    surplusPaise,
    savingsRate,
    expenseByCategory,
  } = summary

  const activeMonths = monthlyHistory.filter((m, i) =>
    i === monthlyHistory.length - 1 || m.hasExpenses
  )
  const withIncome = activeMonths.filter((m) => m.income > 0)
  const curr = activeMonths.at(-1)
  const prev = activeMonths.at(-2)

  // ── 1. Savings rate health ─────────────────────────────────────────────
  if (totalMonthlyIncomePaise > 0) {
    if (savingsRate >= 30) {
      insights.push({
        icon: '🏆',
        headline: `Excellent savings rate of ${savingsRate}%`,
        detail: 'You are saving well above the recommended 20% minimum.',
      })
    } else if (savingsRate >= 20) {
      insights.push({
        icon: '✅',
        headline: `Savings rate at ${savingsRate}% — on track`,
        detail: 'You are hitting the 20% minimum savings target.',
      })
    } else if (savingsRate >= 10) {
      insights.push({
        icon: '⚠️',
        headline: `Savings rate of ${savingsRate}% — room to improve`,
        detail: `Saving ${formatINRCompact(Math.round((totalMonthlyIncomePaise * 0.2) - surplusPaise))} more per month would reach the 20% target.`,
      })
    } else if (savingsRate > 0) {
      insights.push({
        icon: '🔴',
        headline: `Low savings rate: ${savingsRate}%`,
        detail: 'Try to reduce discretionary spending to hit at least 10%.',
      })
    } else if (surplusPaise < 0) {
      insights.push({
        icon: '🚨',
        headline: 'Spending exceeds income this month',
        detail: `You are ${formatINRCompact(Math.abs(surplusPaise))} over budget. Review your largest expense categories.`,
      })
    }
  }

  // ── 2. MoM expense change ──────────────────────────────────────────────
  if (prev && curr && prev.expenses > 0 && curr.expenses > 0) {
    const delta = curr.expenses - prev.expenses
    const deltaPct = Math.abs(Math.round((delta / prev.expenses) * 100))
    if (Math.abs(delta) > totalMonthlyIncomePaise * 0.05) {
      insights.push({
        icon: delta > 0 ? '📈' : '📉',
        headline: delta > 0
          ? `Spending up ${deltaPct}% vs last month`
          : `Spending down ${deltaPct}% vs last month`,
        detail: delta > 0
          ? `Expenses increased by ${formatINRCompact(Math.abs(delta))} compared to ${prev.label}.`
          : `You spent ${formatINRCompact(Math.abs(delta))} less than ${prev.label} — great discipline.`,
      })
    }
  }

  // ── 3. Top spending category ───────────────────────────────────────────
  const categoryEntries = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])
  if (categoryEntries.length > 0 && totalMonthlyExpensesPaise > 0) {
    const [topCat, topAmt] = categoryEntries[0]
    const topPct = pct(topAmt, totalMonthlyExpensesPaise)
    if (topPct >= 35) {
      const label = topCat.charAt(0).toUpperCase() + topCat.slice(1)
      insights.push({
        icon: '🔍',
        headline: `${label} is ${topPct}% of total spending`,
        detail: `At ${formatINRCompact(topAmt)}, this single category dominates your budget.`,
      })
    }
  }

  // ── 4. Savings rate trend ──────────────────────────────────────────────
  if (withIncome.length >= 3) {
    const rates = withIncome.map((m) => Math.round((m.surplus / m.income) * 100))
    const first = rates[0]
    const last = rates.at(-1)
    const delta = last - first
    if (Math.abs(delta) >= 5) {
      insights.push({
        icon: delta > 0 ? '📊' : '📉',
        headline: delta > 0
          ? `Savings rate improved by ${delta} points over ${withIncome.length} months`
          : `Savings rate declined by ${Math.abs(delta)} points over ${withIncome.length} months`,
        detail: delta > 0
          ? `You started at ${first}% and are now at ${last}%.`
          : `You started at ${first}% and have slipped to ${last}%. Review recurring expenses.`,
      })
    }
  }

  // ── 5. YTD surplus projection ──────────────────────────────────────────
  if (totalMonthlyIncomePaise > 0 && withIncome.length >= 2) {
    const monthsRemaining = 12 - new Date().getMonth()
    const projectedYearEnd = surplusPaise * monthsRemaining
    if (projectedYearEnd > 0) {
      insights.push({
        icon: '🎯',
        headline: `On track to save ${formatINRCompact(projectedYearEnd)} by year end`,
        detail: `Based on your current monthly surplus of ${formatINRCompact(surplusPaise)}.`,
      })
    }
  }

  // ── 6. EMI burden insight ──────────────────────────────────────────────
  if (activeLoans.length > 0 && dti !== null && totalMonthlyIncomePaise > 0) {
    const dtiPct = Math.round(dti * 100)
    const totalEMI = activeLoans.reduce((s, l) => s + (l._emi ?? 0), 0)
    if (dtiPct >= 40) {
      insights.push({
        icon: '🏦',
        headline: `Loan EMIs consume ${dtiPct}% of your income`,
        detail: `Monthly repayments of ${formatINRCompact(totalEMI)} are above the healthy 30% threshold. Prioritise paying down debt to free up cash flow.`,
      })
    } else if (dtiPct >= 20) {
      insights.push({
        icon: '📋',
        headline: `${dtiPct}% of income goes to loan repayments`,
        detail: `You're managing ${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''} with ${formatINRCompact(totalEMI)}/month in EMIs — within a reasonable range.`,
      })
    }
  }

  // ── 7. Debt-free date insight ──────────────────────────────────────────
  if (activeLoans.length > 0) {
    const soonest = [...activeLoans]
      .filter(l => (l._monthsRemaining ?? 999) > 0 && (l._monthsRemaining ?? 999) <= 6)
      .sort((a, b) => (a._monthsRemaining ?? 999) - (b._monthsRemaining ?? 999))[0]

    if (soonest) {
      const freeDate = soonest._debtFreeDate ? format(new Date(soonest._debtFreeDate), 'MMM yyyy') : null
      insights.push({
        icon: '🎯',
        headline: `${soonest.name} pays off in ${soonest._monthsRemaining} month${soonest._monthsRemaining !== 1 ? 's' : ''}`,
        detail: freeDate
          ? `Clearing by ${freeDate} frees up ${formatINRCompact(soonest._emi ?? 0)}/month — redirect it to savings or the next loan.`
          : `Clearing this loan soon frees up ${formatINRCompact(soonest._emi ?? 0)}/month.`,
      })
    }
  }

  return insights.slice(0, 5)
}
