/**
 * aiContextBuilder — builds an anonymized, human-readable financial context string
 * that gets embedded in the AI system prompt.
 *
 * Privacy rules:
 *   - No names, account numbers, PAN, Aadhaar, lender names, employer names
 *   - Goal names replaced with type labels
 *   - Loan names replaced with generic type (home / personal / car / education / other)
 *   - Stock/fund tickers replaced with asset class only
 *   - All monetary amounts in INR (paise ÷ 100)
 */

import { format, differenceInMonths } from 'date-fns'
import { formatINRCompact } from './currency.js'
import { getCategoryMeta } from './finance.js'

function inr(paise) {
  return formatINRCompact(paise)
}

function pct(val, total) {
  if (!total) return '0%'
  return `${Math.round((val / total) * 100)}%`
}

// ─── Income + Expenses ────────────────────────────────────────────────────────

function buildIncomeSection(summary, incomeStreams, monthlyHistory) {
  const { totalMonthlyIncomePaise, totalMonthlyExpensesPaise, surplusPaise, savingsRate } = summary

  // Income by type (anonymized)
  const byType = {}
  for (const s of incomeStreams) {
    const type = s.income_type || s.type || 'other'
    byType[type] = (byType[type] || 0) + 1
  }
  const typeList = Object.entries(byType)
    .map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`)
    .join(', ')

  // 3-month income trend
  const recent = [...monthlyHistory].reverse().slice(0, 3)
  const trendStr = recent.length >= 2
    ? (recent[0].income >= recent[recent.length - 1].income ? 'stable/growing' : 'declining')
    : 'insufficient data'

  return `### Income
- Monthly gross income: ${inr(totalMonthlyIncomePaise)}
- Sources: ${incomeStreams.length} stream${incomeStreams.length !== 1 ? 's' : ''} (${typeList || 'various'})
- Monthly expenses: ${inr(totalMonthlyExpensesPaise)}
- Monthly surplus: ${inr(surplusPaise)} (savings rate: ${savingsRate}%)
- Income trend (3 months): ${trendStr}`
}

function buildExpenseSection(summary) {
  const { expenseByCategory, totalMonthlyExpensesPaise } = summary

  const top5 = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const catLines = top5.map(([cat, amt]) => {
    const meta = getCategoryMeta(cat)
    const label = meta?.label ?? cat.replace(/_/g, ' ')
    return `  - ${label}: ${inr(amt)} (${pct(amt, totalMonthlyExpensesPaise)})`
  }).join('\n')

  return `### Expenses
- Top spending categories:
${catLines || '  - No expenses recorded this month'}`
}

// ─── Monthly history ──────────────────────────────────────────────────────────

function buildHistorySection(monthlyHistory) {
  if (!monthlyHistory?.length) return ''
  const rows = [...monthlyHistory].reverse().slice(0, 6)
  const lines = rows.map((m) => {
    const sr = m.income > 0 ? Math.round((m.surplus / m.income) * 100) : 0
    const sign = m.surplus >= 0 ? '+' : '−'
    return `  - ${m.label}: income ${inr(m.income)}, surplus ${sign}${inr(Math.abs(m.surplus))} (${sr}%)`
  }).join('\n')
  return `### 6-Month History\n${lines}`
}

// ─── Goals ────────────────────────────────────────────────────────────────────

function buildGoalsSection(goals, activeGoals, totalMonthlyCommitment) {
  if (!goals.length) return '### Goals\n- No goals set yet'

  const now = new Date()
  const activeLines = activeGoals.map((g) => {
    const target  = Number(g.target_amount) || 0
    const saved   = Number(g.saved_amount) || 0
    const progress = target > 0 ? Math.round((saved / target) * 100) : 0
    const deadlineStr = g.deadline
      ? `deadline: ${format(new Date(g.deadline), 'MMM yyyy')}, ${Math.max(0, differenceInMonths(new Date(g.deadline), now))} months away`
      : 'no deadline'
    const status  = g.status === 'At Risk' || (g.deadline && new Date(g.deadline) < now) ? 'AT RISK' : 'On Track'
    const type    = (g.type || 'savings').replace(/_/g, ' ')
    return `  - ${type} goal: target ${inr(target * 100)}, saved ${inr(saved * 100)} (${progress}%), ${deadlineStr} — ${status}`
  })

  const completedCount = goals.filter(g => g.status === 'Completed').length

  return `### Goals
- Active goals: ${activeGoals.length}, Completed: ${completedCount}
- Monthly goal commitment: ${inr(totalMonthlyCommitment)}
${activeLines.join('\n') || '  - None'}`
}

// ─── Loans ────────────────────────────────────────────────────────────────────

function buildLoansSection(activeLoans, totalOutstandingPaise, totalMonthlyEMI, totalInterestRemaining, totalMonthlyIncomePaise) {
  if (!activeLoans.length) return '### Loans\n- No active loans'

  const dti = totalMonthlyIncomePaise > 0
    ? Math.round((totalMonthlyEMI / totalMonthlyIncomePaise) * 100)
    : 0

  const loanLines = activeLoans.map((l) => {
    const type    = (l.loan_type || 'loan').replace(/_/g, ' ')
    const rate    = Number(l.annual_rate) || 0
    const months  = l._monthsRemaining ?? 0
    return `  - ${type}: ${inr(l._outstandingPaise)} outstanding, ${rate}% p.a., EMI ${inr(l._emi)}, ${months} months remaining`
  })

  return `### Loans
- Active loans: ${activeLoans.length}
- Total outstanding: ${inr(totalOutstandingPaise)}
- Total monthly EMI: ${inr(totalMonthlyEMI)} (DTI: ${dti}%)
- Total interest remaining: ${inr(totalInterestRemaining)}
${loanLines.join('\n')}`
}

// ─── Investments ──────────────────────────────────────────────────────────────

function buildInvestmentsSection(totalInvested, currentValue, totalGainLoss, totalGainLossPct, assetAllocation, bestPerformer, worstPerformer) {
  if (!totalInvested) return '### Investments\n- No investments tracked'

  const isGain   = totalGainLoss >= 0
  const gainStr  = `${isGain ? '+' : '−'}${inr(Math.abs(totalGainLoss))} (${isGain ? '+' : ''}${totalGainLossPct.toFixed(1)}%)`

  const allocLines = (assetAllocation || [])
    .sort((a, b) => b.value_paise - a.value_paise)
    .map((a) => `  - ${a.asset_class.replace(/_/g, ' ')}: ${inr(a.value_paise)} (${a.pct.toFixed(1)}%)`)

  const perf = []
  if (bestPerformer) perf.push(`best performer: ${bestPerformer.asset_class} (+${bestPerformer._gain_loss_pct.toFixed(1)}%)`)
  if (worstPerformer && worstPerformer.id !== bestPerformer?.id) perf.push(`worst: ${worstPerformer.asset_class} (${worstPerformer._gain_loss_pct.toFixed(1)}%)`)

  return `### Investments
- Total invested: ${inr(totalInvested)} | Current value: ${inr(currentValue)} | Overall: ${gainStr}
- Asset allocation:
${allocLines.join('\n') || '  - No allocation data'}
${perf.length ? `- Performance: ${perf.join(', ')}` : ''}`
}

// ─── Health score ─────────────────────────────────────────────────────────────

function buildHealthSection(healthScore) {
  const label = healthScore >= 80 ? 'Excellent' : healthScore >= 65 ? 'Good' : healthScore >= 45 ? 'Fair' : 'Needs Attention'
  return `### Financial Health Score
- Score: ${healthScore}/100 (${label})`
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the full anonymized context string for the AI system prompt.
 *
 * @param {object} financials - { summary, incomeStreams, monthlyHistory }
 * @param {object} goalsData  - { goals, activeGoals, totalMonthlyCommitment }
 * @param {object} loansData  - { activeLoans, totalOutstandingPaise, totalMonthlyEMI, totalInterestRemaining }
 * @param {object} invData    - { totalInvested, currentValue, totalGainLoss, totalGainLossPct, assetAllocation, bestPerformer, worstPerformer }
 * @returns {string}
 */
export function buildAIContext(financials, goalsData, loansData, invData) {
  const { summary, incomeStreams = [], monthlyHistory = [] } = financials
  const { goals = [], activeGoals = [], totalMonthlyCommitment = 0 } = goalsData
  const {
    activeLoans = [],
    totalOutstandingPaise = 0,
    totalMonthlyEMI = 0,
    totalInterestRemaining = 0,
  } = loansData
  const {
    totalInvested = 0,
    currentValue = 0,
    totalGainLoss = 0,
    totalGainLossPct = 0,
    assetAllocation = [],
    bestPerformer = null,
    worstPerformer = null,
  } = invData

  const sections = [
    `## User's Financial Snapshot — ${format(new Date(), 'MMMM yyyy')}`,
    buildHealthSection(summary.healthScore ?? 0),
    buildIncomeSection(summary, incomeStreams, monthlyHistory),
    buildExpenseSection(summary),
    buildHistorySection(monthlyHistory),
    buildGoalsSection(goals, activeGoals, totalMonthlyCommitment),
    buildLoansSection(activeLoans, totalOutstandingPaise, totalMonthlyEMI, totalInterestRemaining, summary.totalMonthlyIncomePaise),
    buildInvestmentsSection(totalInvested, currentValue, totalGainLoss, totalGainLossPct, assetAllocation, bestPerformer, worstPerformer),
  ]

  return sections.filter(Boolean).join('\n\n')
}

export const SYSTEM_PROMPT_PREFIX = `You are Finio, a private AI financial advisor for Indian users. You receive anonymized financial summaries — no personal names, account numbers, or identifiers are ever sent.

Your role: Give clear, actionable, personalized advice tailored to the Indian financial context. Reference the user's actual numbers in your answers.

Guidelines:
- Be conversational and empathetic, not robotic
- Always quote specific numbers from the financial snapshot
- Suggest Indian financial products where relevant: SIPs, ELSS, PPF (₹1.5L/yr limit), NPS (additional ₹50K u/s 80CCD), FDs, index funds
- For loans: consider prepayment vs investment trade-off (loan rate vs expected returns)
- For taxes: reference 80C (₹1.5L), 80D (health insurance), Section 24 (home loan interest)
- Answer concisely — 150-250 words unless the question genuinely requires more
- Use ₹ symbol for all amounts
- Do not recommend specific stocks or mutual fund schemes by name
- If data is missing or zero, acknowledge the gap and give general advice

`
