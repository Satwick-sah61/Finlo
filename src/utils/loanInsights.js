/**
 * Rule-based loan insight generator — pure function, synchronous, no API calls.
 *
 * generateLoanInsights(activeLoans, financials)
 *   activeLoans   – enriched loans from useLoans (status !== 'closed', _outstandingPaise > 0)
 *   financials    – { totalMonthlyIncomePaise, surplusPaise }
 *   Returns up to 4 insight objects sorted by priority (highest first)
 */
import { formatINRCompact } from './currency.js'

const HIGH_RATE_THRESHOLD = 18   // % p.a. — triggers interest-drain insight
const QUICK_WIN_MAX_MONTHS = 18  // loans payable off within this → quick-win insight
const HIGH_DTI = 0.40            // 40 %+ DTI triggers warning

export function generateLoanInsights(activeLoans = [], financials = {}) {
  if (!activeLoans.length) return []

  const { totalMonthlyIncomePaise = 0, surplusPaise = 0 } = financials

  const totalEMI              = activeLoans.reduce((s, l) => s + (l._emi ?? 0), 0)
  const totalInterestRemaining = activeLoans.reduce((s, l) => s + (l._interestRemaining ?? 0), 0)
  const dti = totalMonthlyIncomePaise > 0 ? totalEMI / totalMonthlyIncomePaise : null

  const byRate      = [...activeLoans].sort((a, b) => (Number(b.annual_rate) || 0) - (Number(a.annual_rate) || 0))
  const byBalance   = [...activeLoans].sort((a, b) => (a._outstandingPaise ?? 0) - (b._outstandingPaise ?? 0))
  const byMonthsLeft = [...activeLoans].sort((a, b) => (a._monthsRemaining ?? 999) - (b._monthsRemaining ?? 999))

  const insights = []

  // ── 1. High-rate interest drain ───────────────────────────────────────────
  const topRate = byRate[0]
  const topRateValue = Number(topRate?.annual_rate) || 0
  if (topRate && topRateValue >= HIGH_RATE_THRESHOLD) {
    const monthlyInterest = Math.round((topRate._outstandingPaise ?? 0) * (topRateValue / 12 / 100) / 100)
    insights.push({
      id:       'high_rate',
      icon:     '🔥',
      headline: `${topRate.name} at ${topRateValue}% is costing ₹${monthlyInterest.toLocaleString('en-IN')}/month in interest`,
      detail:   `Targeting this loan first (Avalanche strategy) cuts your total interest paid more than any other action.`,
      priority: 10,
    })
  }

  // ── 2. High debt-to-income ratio ──────────────────────────────────────────
  if (dti !== null && dti >= HIGH_DTI) {
    const dtiPct = Math.round(dti * 100)
    const targetEMI = totalMonthlyIncomePaise > 0 ? Math.round(totalMonthlyIncomePaise * 0.30) : 0
    const excess = Math.max(0, totalEMI - targetEMI)
    insights.push({
      id:       'high_dti',
      icon:     '⚠️',
      headline: `Loan EMIs consume ${dtiPct}% of income — healthy range is below 30%`,
      detail:   excess > 0
        ? `Reducing your EMI burden by ${formatINRCompact(excess)}/month would bring your DTI to a healthy level.`
        : `Your debt load is high. Prioritise paying off loans faster to free up monthly cash flow.`,
      priority: 9,
    })
  }

  // ── 3. Quick win — loan almost paid off ───────────────────────────────────
  const quickWin = byMonthsLeft.find(
    l => (l._monthsRemaining ?? 0) > 0 && (l._monthsRemaining ?? 0) <= QUICK_WIN_MAX_MONTHS
  )
  if (quickWin) {
    const emiRs = Math.round((quickWin._emi ?? 0) / 100)
    insights.push({
      id:       'quick_win',
      icon:     '🎯',
      headline: `${quickWin.name} clears in ${quickWin._monthsRemaining} months — freeing ₹${emiRs.toLocaleString('en-IN')}/mo`,
      detail:   `Snowball strategy: redirect extra payments here for a quick motivational win and immediate cash-flow boost.`,
      priority: 8,
    })
  }

  // ── 4. Extra payment impact ───────────────────────────────────────────────
  if (surplusPaise > 0 && activeLoans.length > 0) {
    const extraPaise = Math.max(50000, Math.round(surplusPaise * 0.10)) // 10 % of surplus, min ₹500
    const extraRs    = Math.round(extraPaise / 100)
    const focusLoan  = topRate // apply to highest-rate loan
    if (focusLoan && (focusLoan._monthsRemaining ?? 0) > 6) {
      // Simple month-saving estimate (extra / EMI fraction of remaining)
      const r            = (Number(focusLoan.annual_rate) || 0) / 12 / 100
      const outstanding  = focusLoan._outstandingPaise ?? 0
      const emi          = focusLoan._emi ?? 0
      const newEmi       = emi + extraPaise
      const monthsSaved  = r > 0 && outstanding > 0 && emi > 0
        ? Math.max(0, Math.floor(
            (focusLoan._monthsRemaining ?? 0) -
            Math.log(newEmi / (newEmi - outstanding * r)) / Math.log(1 + r)
          ))
        : 0
      if (monthsSaved >= 2) {
        insights.push({
          id:       'extra_payment',
          icon:     '📈',
          headline: `Paying ₹${extraRs.toLocaleString('en-IN')} extra/month saves ~${monthsSaved} months on ${focusLoan.name}`,
          detail:   `That's just 10 % of your current monthly surplus — a small shift with a meaningful payoff acceleration.`,
          priority: 6,
        })
      }
    }
  }

  // ── 5. Consolidation opportunity ──────────────────────────────────────────
  if (activeLoans.length >= 3) {
    const smallLoans = activeLoans.filter(l => (l._outstandingPaise ?? 0) < 200_000 * 100)
    if (smallLoans.length >= 2) {
      const combinedEMI = Math.round(smallLoans.reduce((s, l) => s + (l._emi ?? 0), 0) / 100)
      insights.push({
        id:       'consolidation',
        icon:     '💡',
        headline: `${activeLoans.length} active loans — consolidation could simplify your repayments`,
        detail:   `${smallLoans.length} smaller loans total ₹${combinedEMI.toLocaleString('en-IN')}/mo in EMIs. A consolidation loan may lower your interest rate and reduce complexity.`,
        priority: 5,
      })
    }
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 4)
}
