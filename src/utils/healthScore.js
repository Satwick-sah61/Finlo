// Pure function — zero side effects. Only reads inputs, never writes to DB or store.
// Called by useFinancials to attach a health score to every summary snapshot.
// Will be enriched in Phase 2 (loans) and Phase 3 (investments) with real data.
export function calculateHealthScore({
  savingsRate = 0,
  totalMonthlyIncomePaise = 0,
  totalMonthlyExpensesPaise = 0,
  debtToIncomeRatio = null, // null = no loan data yet; 0 = no loans
  emergencyMonths = 0,
}) {
  const factors = []
  let score = 0

  // ── Savings Rate (30 pts) ─────────────────────────────────────────────────
  // <10% = 0, 10–20% = 15, 20–30% = 22, >30% = 30
  let savingsPts = 0
  if (savingsRate >= 30) savingsPts = 30
  else if (savingsRate >= 20) savingsPts = 22
  else if (savingsRate >= 10) savingsPts = 15
  score += savingsPts
  factors.push({
    factor: 'Savings Rate',
    impact: savingsPts >= 22 ? 'positive' : savingsPts >= 15 ? 'neutral' : 'negative',
    detail:
      totalMonthlyIncomePaise === 0
        ? 'Add income sources to calculate your savings rate'
        : savingsRate >= 30
        ? `Excellent — you save ${savingsRate}% of your income`
        : savingsRate >= 20
        ? `Good — you save ${savingsRate}% of your income`
        : savingsRate >= 10
        ? `Fair — aim to grow savings rate above 20%`
        : savingsRate > 0
        ? `Low — saving only ${savingsRate}% leaves little buffer`
        : 'Expenses exceed income — you are running a deficit',
    points: savingsPts,
    maxPoints: 30,
  })

  // ── Expense Control (25 pts) ──────────────────────────────────────────────
  // Scored on expenses/income ratio: ≤50% = 25, ≤70% = 18, ≤90% = 10, ≤100% = 3, >100% = 0
  const expenseRatio =
    totalMonthlyIncomePaise > 0
      ? totalMonthlyExpensesPaise / totalMonthlyIncomePaise
      : 0
  let expensePts = 0
  if (totalMonthlyIncomePaise === 0) {
    expensePts = 0
  } else if (expenseRatio <= 0.5) expensePts = 25
  else if (expenseRatio <= 0.7) expensePts = 18
  else if (expenseRatio <= 0.9) expensePts = 10
  else if (expenseRatio <= 1.0) expensePts = 3
  score += expensePts
  const expPct = Math.round(expenseRatio * 100)
  factors.push({
    factor: 'Expense Control',
    impact: expensePts >= 18 ? 'positive' : expensePts >= 10 ? 'neutral' : 'negative',
    detail:
      totalMonthlyIncomePaise === 0
        ? 'Add income to evaluate your expense ratio'
        : expenseRatio > 1
        ? `Spending ${expPct}% of income — actively in deficit`
        : expenseRatio > 0.9
        ? `Spending ${expPct}% of income — very little headroom`
        : expenseRatio > 0.7
        ? `Spending ${expPct}% of income — aim below 70%`
        : `Spending ${expPct}% of income — well controlled`,
    points: expensePts,
    maxPoints: 25,
  })

  // ── Emergency Fund (20 pts) — placeholder until fund tracking is live ─────
  const emergencyPts = 20
  score += emergencyPts
  factors.push({
    factor: 'Emergency Fund',
    impact: 'neutral',
    detail: 'Emergency fund tracking coming in a future update',
    points: emergencyPts,
    maxPoints: 20,
  })

  // ── Debt Load (25 pts) ────────────────────────────────────────────────────
  // DTI = totalMonthlyEMI / totalMonthlyIncome
  // null = loan data not yet loaded (placeholder)
  let debtPts = 25
  let debtImpact = 'positive'
  let debtDetail = 'No active loans recorded — full score applied'

  if (debtToIncomeRatio === null) {
    debtPts = 20
    debtImpact = 'neutral'
    debtDetail = 'Loan data loading…'
  } else if (debtToIncomeRatio === 0) {
    debtPts = 25
    debtImpact = 'positive'
    debtDetail = 'No active loans recorded — full score applied'
  } else {
    const dtiPct = Math.round(debtToIncomeRatio * 100)
    if (debtToIncomeRatio < 0.3) {
      debtPts = 20
      debtImpact = 'positive'
      debtDetail = `Debt-to-income ratio ${dtiPct}% — well managed`
    } else if (debtToIncomeRatio < 0.5) {
      debtPts = 12
      debtImpact = 'neutral'
      debtDetail = `Debt-to-income ratio ${dtiPct}% — aim below 30%`
    } else {
      debtPts = 5
      debtImpact = 'negative'
      debtDetail = `Debt-to-income ratio ${dtiPct}% — high debt burden`
    }
  }

  score += debtPts
  factors.push({
    factor: 'Debt Load',
    impact: debtImpact,
    detail: debtDetail,
    points: debtPts,
    maxPoints: 25,
  })

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
  }
}
