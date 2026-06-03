/**
 * calculateHealthScore — pure function, zero side effects.
 *
 * Revised in Phase 3 (Week 14) to five equal 20pt components:
 *   1. Savings Rate       — 20pts
 *   2. Expense Control    — 20pts
 *   3. Emergency Fund     — 20pts (now real — was placeholder)
 *   4. Debt Load          — 20pts
 *   5. Investment Quality — 20pts (new — Phase 3)
 *
 * All callers should now pass the new optional params.
 * Older callers without the new params gracefully default
 * to neutral mid-scores (not 0 or max) to avoid jarring drops.
 */

export function calculateHealthScore({
  // Core financial data
  savingsRate              = 0,
  totalMonthlyIncomePaise  = 0,
  totalMonthlyExpensesPaise = 0,
  // Debt
  debtToIncomeRatio        = null, // null = not yet loaded
  // Emergency fund (months of expenses covered by liquid savings)
  emergencyFundMonths      = null, // null = not yet computed
  // Investment quality
  assetClassCount          = null, // null = not yet loaded
  hasSIP                   = false,
}) {
  const factors = []
  let score = 0

  // ── 1. Savings Rate (20pts) ───────────────────────────────────────────────
  let savPts = 0
  if (savingsRate >= 30) savPts = 20
  else if (savingsRate >= 20) savPts = 15
  else if (savingsRate >= 10) savPts = 10
  score += savPts
  factors.push({
    factor: 'Savings Rate',
    impact: savPts >= 15 ? 'positive' : savPts >= 10 ? 'neutral' : 'negative',
    detail:
      totalMonthlyIncomePaise === 0
        ? 'Add income sources to calculate your savings rate'
        : savingsRate >= 30
        ? `Excellent — you save ${savingsRate}% of your income`
        : savingsRate >= 20
        ? `Good — you save ${savingsRate}% of your income`
        : savingsRate >= 10
        ? 'Fair — aim to grow your savings rate above 20%'
        : savingsRate > 0
        ? `Low — saving only ${savingsRate}% leaves little buffer`
        : 'Expenses exceed income — you are running a deficit',
    points:    savPts,
    maxPoints: 20,
  })

  // ── 2. Expense Control (20pts) ────────────────────────────────────────────
  const expRatio = totalMonthlyIncomePaise > 0
    ? totalMonthlyExpensesPaise / totalMonthlyIncomePaise
    : 0
  let expPts = 0
  if (totalMonthlyIncomePaise === 0) {
    expPts = 10 // neutral until income is set
  } else if (expRatio <= 0.5) expPts = 20
  else if (expRatio <= 0.7)   expPts = 14
  else if (expRatio <= 0.9)   expPts = 8
  else if (expRatio <= 1.0)   expPts = 2
  score += expPts
  const expPct = Math.round(expRatio * 100)
  factors.push({
    factor: 'Expense Control',
    impact: expPts >= 14 ? 'positive' : expPts >= 8 ? 'neutral' : 'negative',
    detail:
      totalMonthlyIncomePaise === 0
        ? 'Add income to evaluate your expense ratio'
        : expRatio > 1
        ? `Spending ${expPct}% of income — actively in deficit`
        : expRatio > 0.9
        ? `Spending ${expPct}% of income — very little headroom`
        : expRatio > 0.7
        ? `Spending ${expPct}% of income — aim below 70%`
        : `Spending ${expPct}% of income — well controlled`,
    points:    expPts,
    maxPoints: 20,
  })

  // ── 3. Emergency Fund (20pts) — now real ─────────────────────────────────
  // emergencyFundMonths = months of expenses covered by liquid savings
  // null = data not yet available → neutral 10pts
  let emPts = 10
  let emImpact = 'neutral'
  let emDetail = 'Emergency fund data loading…'

  if (emergencyFundMonths !== null) {
    if (emergencyFundMonths >= 6) {
      emPts = 20; emImpact = 'positive'
      emDetail = `${emergencyFundMonths.toFixed(1)} months covered — excellent safety net`
    } else if (emergencyFundMonths >= 3) {
      emPts = 15; emImpact = 'positive'
      emDetail = `${emergencyFundMonths.toFixed(1)} months covered — aim for 6 months`
    } else if (emergencyFundMonths >= 1) {
      emPts = 8; emImpact = 'neutral'
      emDetail = `${emergencyFundMonths.toFixed(1)} months covered — build to at least 3 months`
    } else {
      emPts = 0; emImpact = 'negative'
      emDetail = 'No emergency fund detected — create an Emergency Fund goal to track this'
    }
  }

  score += emPts
  factors.push({
    factor:    'Emergency Fund',
    impact:    emImpact,
    detail:    emDetail,
    points:    emPts,
    maxPoints: 20,
  })

  // ── 4. Debt Load (20pts) ──────────────────────────────────────────────────
  let debtPts   = 16
  let debtImpact = 'positive'
  let debtDetail = 'No active loans — full score applied'

  if (debtToIncomeRatio === null) {
    debtPts    = 10
    debtImpact = 'neutral'
    debtDetail = 'Loan data loading…'
  } else if (debtToIncomeRatio === 0) {
    debtPts    = 20
    debtImpact = 'positive'
    debtDetail = 'No active loans — full score applied'
  } else {
    const dtiPct = Math.round(debtToIncomeRatio * 100)
    if (debtToIncomeRatio < 0.3) {
      debtPts = 16; debtImpact = 'positive'
      debtDetail = `Debt-to-income ${dtiPct}% — well managed`
    } else if (debtToIncomeRatio < 0.5) {
      debtPts = 10; debtImpact = 'neutral'
      debtDetail = `Debt-to-income ${dtiPct}% — aim below 30%`
    } else {
      debtPts = 4; debtImpact = 'negative'
      debtDetail = `Debt-to-income ${dtiPct}% — high debt burden`
    }
  }
  score += debtPts
  factors.push({
    factor:    'Debt Load',
    impact:    debtImpact,
    detail:    debtDetail,
    points:    debtPts,
    maxPoints: 20,
  })

  // ── 5. Investment Quality (20pts) — new in Phase 3 ───────────────────────
  // null = investment data not yet loaded → neutral 10pts
  let invPts   = 10
  let invImpact = 'neutral'
  let invDetail = 'Investment data loading…'

  if (assetClassCount !== null) {
    if (assetClassCount === 0) {
      invPts    = 0
      invImpact = 'negative'
      invDetail = 'No investments tracked — start with a SIP or FD to build wealth'
    } else if (assetClassCount === 1) {
      invPts    = 8
      invImpact = 'neutral'
      invDetail = 'Portfolio has one asset class — diversify to reduce risk'
    } else if (assetClassCount >= 2 && (!hasSIP || assetClassCount < 3)) {
      invPts    = 14
      invImpact = 'positive'
      invDetail = `${assetClassCount} asset classes — add a SIP or a 3rd class for maximum score`
    } else {
      // 3+ asset classes AND has SIP
      invPts    = 20
      invImpact = 'positive'
      invDetail = `${assetClassCount} asset classes with active SIP — excellent diversification`
    }
  }

  score += invPts
  factors.push({
    factor:    'Investment Quality',
    impact:    invImpact,
    detail:    invDetail,
    points:    invPts,
    maxPoints: 20,
  })

  return {
    score:   Math.max(0, Math.min(100, score)),
    factors,
  }
}
