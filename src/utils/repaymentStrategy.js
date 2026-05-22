/**
 * Repayment strategy engine — pure functions, no React, no async, no DB.
 *
 * generateStrategies(activeLoans, extraMonthlyPaise)
 *   Returns { baseline, avalanche, snowball, hybrid, recommended }
 *   Each strategy: { strategy, debtFreeMonth, totalInterestPaid, payoffOrder, snapshots }
 *
 * computePriorityScore(loan, allActiveLoans)
 *   Returns 0–100 priority score for the comparison table.
 */

const MAX_MONTHS = 600 // 50-year hard cap

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateStrategies(activeLoans, extraMonthlyPaise = 0) {
  const loans = activeLoans.filter(l => (l._outstandingPaise ?? 0) > 0)
  if (!loans.length) return null

  const baseline  = runStrategy(loans, 0,                 'avalanche') // no extra = true baseline
  const avalanche = runStrategy(loans, extraMonthlyPaise, 'avalanche')
  const snowball  = runStrategy(loans, extraMonthlyPaise, 'snowball')
  const hybrid    = runStrategy(loans, extraMonthlyPaise, 'hybrid')

  // Attach savings vs. baseline
  for (const s of [avalanche, snowball, hybrid]) {
    s.monthsSaved    = Math.max(0, baseline.debtFreeMonth - s.debtFreeMonth)
    s.interestSaved  = Math.max(0, baseline.totalInterestPaid - s.totalInterestPaid)
  }

  const recommended = pickRecommended(loans)
  return { baseline, avalanche, snowball, hybrid, recommended }
}

// Priority score for LoanComparisonTable (0–100, higher = pay off sooner)
export function computePriorityScore(loan, allActiveLoans) {
  const maxRate = Math.max(...allActiveLoans.map(l => Number(l.annual_rate) || 0), 1)
  const maxOs   = Math.max(...allActiveLoans.map(l => l._outstandingPaise ?? 0), 1)
  const maxMo   = Math.max(...allActiveLoans.map(l => l._monthsRemaining ?? 0), 1)

  const rateScore  = ((Number(loan.annual_rate) || 0) / maxRate) * 40
  const osScore    = ((loan._outstandingPaise ?? 0) / maxOs) * 30
  const tenScore   = ((loan._monthsRemaining ?? 0) / maxMo) * 30

  return Math.round(rateScore + osScore + tenScore)
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function pickRecommended(loans) {
  if (loans.length === 1) return 'avalanche'

  const rates  = loans.map(l => Number(l.annual_rate) || 0)
  const spread = Math.max(...rates) - Math.min(...rates)
  if (spread >= 3) return 'avalanche' // big rate spread → avalanche wins on interest

  const totalOs = loans.reduce((s, l) => s + (l._outstandingPaise ?? 0), 0)
  const hasSmall = loans.some(
    l => (l._outstandingPaise ?? 0) < totalOs * 0.2 && (l._monthsRemaining ?? Infinity) < 18
  )
  if (hasSmall) return 'hybrid' // quick win available

  return 'snowball' // balanced
}

function runStrategy(loans, extraMonthlyPaise, strategyType) {
  // Clone state — never mutate originals
  const state = loans.map(l => ({
    id:          l.id,
    name:        l.name,
    outstanding: l._outstandingPaise ?? 0,
    rate:        Number(l.annual_rate) || 0,
    emi:         l._emi ?? 0,
    paidOff:     false,
  }))

  let pool             = extraMonthlyPaise  // grows as EMIs are freed
  let month            = 0
  let totalInterestPaid = 0
  const payoffOrder    = []
  const snapshots      = []

  while (state.some(l => !l.paidOff) && month < MAX_MONTHS) {
    month++

    // Determine focus loan BEFORE payments change balances
    const active = state.filter(l => !l.paidOff)
    const focus  = pickFocus(active, strategyType)

    // Regular EMI for all active loans
    for (const loan of state) {
      if (loan.paidOff) continue
      const r        = loan.rate / 12 / 100
      const interest = Math.round(loan.outstanding * r)
      totalInterestPaid += interest
      const principal = Math.min(Math.max(0, loan.emi - interest), loan.outstanding)
      loan.outstanding = Math.max(0, loan.outstanding - principal)
      if (loan.outstanding === 0) {
        loan.paidOff = true
        payoffOrder.push({ id: loan.id, name: loan.name, month })
        pool += loan.emi // freed EMI permanently joins the pool
      }
    }

    // Apply pool to focus loan (after regular payments, if still has balance)
    if (focus && !focus.paidOff && pool > 0) {
      const target = state.find(l => l.id === focus.id && !l.paidOff)
      if (target) {
        target.outstanding = Math.max(0, target.outstanding - pool)
        if (target.outstanding === 0) {
          target.paidOff = true
          if (!payoffOrder.find(p => p.id === target.id)) {
            payoffOrder.push({ id: target.id, name: target.name, month })
          }
          pool += target.emi
        }
      }
    }

    // Snapshot at payoff events + every 12 months + final
    const isEvent = payoffOrder.some(e => e.month === month)
    if (isEvent || month % 12 === 0 || !state.some(l => !l.paidOff)) {
      snapshots.push({
        month,
        label: month < 13 ? `M${month}` : `Y${Math.round(month / 12)}`,
        totalOutstanding: state.reduce((s, l) => s + l.outstanding, 0),
      })
    }
  }

  return {
    strategy: strategyType,
    debtFreeMonth:    !state.some(l => !l.paidOff) ? month : MAX_MONTHS,
    totalInterestPaid,
    payoffOrder,
    snapshots,
    // savings attached later by generateStrategies
    monthsSaved:   0,
    interestSaved: 0,
  }
}

function pickFocus(active, type) {
  if (!active.length) return null
  if (type === 'avalanche') {
    return active.reduce((b, l) =>
      l.rate > b.rate || (l.rate === b.rate && l.outstanding < b.outstanding) ? l : b,
      active[0])
  }
  if (type === 'snowball') {
    return active.reduce((b, l) => l.outstanding < b.outstanding ? l : b, active[0])
  }
  if (type === 'hybrid') {
    const maxRate = Math.max(...active.map(l => l.rate), 1)
    const maxOs   = Math.max(...active.map(l => l.outstanding), 1)
    const score = l => (l.rate / maxRate) * 0.6 + (1 - l.outstanding / maxOs) * 0.4
    return active.reduce((b, l) => score(l) > score(b) ? l : b, active[0])
  }
  return active[0]
}
