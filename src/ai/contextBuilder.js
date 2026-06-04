/**
 * contextBuilder — THE single source of truth for what gets sent to Claude.
 *
 * buildContext(vaultKey) reads + decrypts every table, calculates each section
 * by reusing existing utility functions, and returns one clean ANONYMIZED
 * snapshot object. Every Phase 4 AI call uses this.
 *
 * Guarantees:
 *   - Pure async — no React, no hooks.
 *   - Never throws. Any section that fails degrades to safe defaults and is
 *     flagged in `data_completeness`.
 *   - Read-only — never mutates source records.
 *   - Money sums via Dinero.js (utils/currency helpers); paise are integers.
 *
 * PRIVACY — these NEVER appear in the output:
 *   names, lender names, fund names, broker names, tickers, scheme codes,
 *   account numbers, PAN, Aadhaar, addresses, folio numbers.
 *   Output is numbers, percentages, types, and categories only.
 */

import { format, differenceInMonths, differenceInCalendarMonths, addMonths } from 'date-fns'
import { decryptAndLoadAll } from '../db/helpers.js'
import { configGet } from '../db/schema.js'
import { toMonthlyPaise } from '../utils/finance.js'
import { calculateHealthScore } from '../utils/healthScore.js'
import { computeGoalAllocation, calculateGoalStatus } from '../utils/goalStatus.js'
import { generateAmortization } from '../utils/amortization.js'
import { analyzeFramework } from '../utils/frameworkAnalysis.js'
import { computeFDCurrentValue } from '../hooks/useInvestments.js'
import { fromPaise, toPaise, addMoney } from '../utils/currency.js'

// ─── Dinero-backed integer sum ────────────────────────────────────────────────

function sumPaise(items, getter) {
  return toPaise(
    items.reduce((acc, item) => addMoney(acc, fromPaise(Math.round(getter(item) || 0))), fromPaise(0))
  )
}

function pctStr(n) {
  return `${Math.round(n)}%`
}

function currentMonthStr() {
  return format(new Date(), 'yyyy-MM')
}

// ─── Income & expenses ────────────────────────────────────────────────────────

function buildIncomeExpenses(incomeStreams, expenses) {
  const incomeTotal = sumPaise(incomeStreams, (s) => toMonthlyPaise(Number(s.amount) || 0, s.frequency))
  const expenseTotal = sumPaise(expenses, (e) => Number(e.amount) || 0)

  const byCategory = {}
  for (const e of expenses) {
    const cat = e.category || 'miscellaneous'
    byCategory[cat] = (byCategory[cat] || 0) + (Number(e.amount) || 0)
  }

  return { incomeTotal, expenseTotal, byCategory }
}

// ─── Loans (replicates useLoans enrichment, pure) ─────────────────────────────

function enrichLoan(loan) {
  const principal = Number(loan.principal_paise) || 0
  const rate      = Number(loan.annual_rate) || 0
  const tenure    = Number(loan.tenure_months) || 0
  const startDate = loan.start_date ? new Date(loan.start_date) : new Date()
  const payments  = Array.isArray(loan.payments) ? loan.payments : []

  const { emi, schedule, totalInterest } = generateAmortization(principal, rate, tenure)

  const elapsedMonths = Math.max(0, differenceInMonths(new Date(), startDate))
  const paidPeriods   = payments.length > 0 ? payments.length : Math.min(elapsedMonths, schedule.length)

  let outstanding
  if (paidPeriods <= 0) outstanding = principal
  else if (paidPeriods >= schedule.length) outstanding = 0
  else outstanding = schedule[paidPeriods - 1].outstanding

  const remaining        = schedule.slice(paidPeriods)
  const interestRemaining = remaining.reduce((s, p) => s + p.interest, 0)
  const monthsRemaining  = remaining.length
  const debtFreeDate     = addMonths(startDate, schedule.length)

  return {
    loan_type:          (loan.loan_type || 'other').replace(/_loan$/, ''),
    outstanding,
    rate,
    emi,
    tenure_remaining:   monthsRemaining,
    strategy:           loan.strategy || 'hybrid',
    _interestRemaining: interestRemaining,
    _debtFreeDate:      debtFreeDate,
    _status:            loan.status || 'active',
  }
}

function buildLoans(loansRaw, incomeTotal) {
  const enriched = loansRaw.map(enrichLoan)
  const active   = enriched.filter((l) => l._status !== 'closed')

  const totalEmi          = sumPaise(active, (l) => l.emi)
  const totalOutstanding  = sumPaise(active, (l) => l.outstanding)
  const totalInterestLeft = sumPaise(active, (l) => l._interestRemaining)

  const debtFreeDate = active.length
    ? active.reduce((latest, l) => (l._debtFreeDate > latest ? l._debtFreeDate : latest), new Date(0))
    : null

  const dti = incomeTotal > 0 ? (totalEmi / incomeTotal) * 100 : 0

  const loans = active.map((l) => ({
    type:             l.loan_type,
    outstanding:      l.outstanding,
    rate:             l.rate,
    emi:              l.emi,
    tenure_remaining: l.tenure_remaining,
    strategy:         l.strategy,
  }))

  return {
    loans,
    loans_count:              active.length,
    total_emi:                totalEmi,
    dti_ratio:                pctStr(dti),
    debt_free_date:           debtFreeDate ? format(debtFreeDate, 'MMMM yyyy') : '',
    total_outstanding:        totalOutstanding,
    total_interest_remaining: totalInterestLeft,
  }
}

// ─── Goals ────────────────────────────────────────────────────────────────────

const GOAL_STATUS_MAP = {
  'Completed': 'completed',
  'Ahead':     'ahead',
  'On Track':  'on_track',
  'At Risk':   'at_risk',
}

function buildGoals(goalsRaw, surplusPaise) {
  const now = new Date()
  const active = goalsRaw.filter((g) => g.status !== 'Draft')

  const goals = active.map((g) => {
    const target = Number(g.target_amount) || 0
    const saved  = Number(g.saved_amount) || 0
    const st     = calculateGoalStatus(g, surplusPaise)
    let monthsRemaining = 0
    try { monthsRemaining = Math.max(0, differenceInCalendarMonths(new Date(g.deadline), now)) } catch {}
    return {
      type:               g.type || 'custom',
      target:             Math.round(target),
      saved:              Math.round(saved),
      pct_complete:       st.pctComplete,
      status:             GOAL_STATUS_MAP[st.status] || 'on_track',
      months_remaining:   monthsRemaining,
      monthly_commitment: st.requiredPerMonth || 0,
    }
  })

  const atRisk = goals.filter((g) => g.status === 'at_risk').length

  return {
    goals,
    goals_count:          goals.length,
    at_risk_goals_count:  atRisk,
    total_goal_commitment: computeGoalAllocation(goalsRaw),
  }
}

// ─── Investments (pure re-implementation of useInvestments enrichment) ────────

function invInvestedPaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return Math.round((Number(inv.quantity) || 0) * (inv.buy_price_paise || 0))
    case 'mutual_fund': return Math.round((Number(inv.units) || 0) * (inv.purchase_nav_paise || 0))
    case 'fd':          return inv.principal_paise || 0
    case 'ppf_nps': {
      const open  = inv.account_opening_date ? new Date(inv.account_opening_date) : new Date()
      const years = Math.max(1, Math.floor((Date.now() - open.getTime()) / (365 * 86400000)))
      return Math.round((inv.annual_contribution_paise || 0) * years)
    }
    case 'gold':        return Math.round((Number(inv.quantity_grams) || 0) * (inv.buy_price_per_gram_paise || 0))
    case 'real_estate': return inv.purchase_price_paise || 0
    default:            return 0
  }
}

function invCurrentPaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return Math.round((Number(inv.quantity) || 0) * (inv.current_price_paise || inv.buy_price_paise || 0))
    case 'mutual_fund': return Math.round((Number(inv.units) || 0) * (inv.current_nav_paise || inv.purchase_nav_paise || 0))
    case 'fd':          return computeFDCurrentValue(inv)
    case 'ppf_nps':     return inv.current_corpus_paise || invInvestedPaise(inv)
    case 'gold':        return Math.round((Number(inv.quantity_grams) || 0) * (inv.current_price_per_gram_paise || inv.buy_price_per_gram_paise || 0))
    case 'real_estate': return inv.current_estimated_value_paise || inv.purchase_price_paise || 0
    default:            return 0
  }
}

const RISK_WEIGHT = { stocks: 3, mutual_fund: 2, gold: 2, real_estate: 1.5, fd: 1, ppf_nps: 1 }

function buildInvestments(investmentsRaw) {
  if (!investmentsRaw.length) {
    return { summary: null, currentValue: 0, sipMonthly: 0 }
  }

  const enriched = investmentsRaw.map((inv) => {
    const invested = invInvestedPaise(inv)
    const current  = invCurrentPaise(inv)
    const buyDate  = inv.buy_date || inv.start_date || inv.purchase_date || inv.account_opening_date || null
    const days     = buyDate ? Math.max(0, Math.floor((Date.now() - new Date(buyDate).getTime()) / 86400000)) : 0
    const annualized = (days > 30 && invested > 0 && current > 0)
      ? Math.round((Math.pow(current / invested, 365 / days) - 1) * 10000) / 100
      : (invested > 0 ? Math.round(((current - invested) / invested) * 10000) / 100 : 0)
    return { ...inv, _invested: invested, _current: current, _days: days, _annualized: annualized }
  })

  const totalInvested = sumPaise(enriched, (i) => i._invested)
  const currentValue  = sumPaise(enriched, (i) => i._current)
  const gainLoss      = currentValue - totalInvested
  const gainLossPct   = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0

  // Asset classes (normalized) + sectors (stocks only, sector tag is generic)
  const assetClasses = [...new Set(enriched.map((i) => i.asset_class).filter(Boolean))]
    .map((ac) => (ac === 'mutual_fund' ? 'mutual_funds' : ac))
  const sectors = [...new Set(
    enriched.filter((i) => i.asset_class === 'stocks' && i.sector).map((i) => i.sector)
  )]

  // SIP
  const hasSip     = enriched.some((i) => i.is_sip)
  const sipMonthly = sumPaise(enriched.filter((i) => i.is_sip), (i) => i.sip_amount_paise || 0)

  // Risk label (value-weighted)
  const riskWeighted = enriched.reduce((s, i) => s + (RISK_WEIGHT[i.asset_class] || 2) * i._current, 0)
  const weightedRisk = currentValue > 0 ? riskWeighted / currentValue : 0
  const riskLabel = weightedRisk >= 2.5 ? 'Aggressive' : weightedRisk >= 1.5 ? 'Balanced' : 'Conservative'

  // Weighted annualized return (>30d holdings)
  const retEligible = enriched.filter((i) => i._days > 30 && i._invested > 0)
  const retBase     = sumPaise(retEligible, (i) => i._invested)
  const retWeighted = retEligible.reduce((s, i) => s + i._annualized * i._invested, 0)
  const annualized  = retBase > 0 ? Math.round((retWeighted / retBase) * 100) / 100 : 0

  return {
    summary: {
      total_invested:          totalInvested,
      current_value:           currentValue,
      gain_loss_pct:           `${gainLossPct >= 0 ? '+' : ''}${gainLossPct.toFixed(1)}%`,
      asset_classes:           assetClasses,
      sectors,
      has_sip:                 hasSip,
      sip_monthly_total:       sipMonthly,
      risk_label:              riskLabel,
      total_annualized_return: `${annualized >= 0 ? '+' : ''}${annualized.toFixed(1)}% p.a.`,
    },
    currentValue,
    sipMonthly,
  }
}

// ─── Framework ────────────────────────────────────────────────────────────────

const BUCKET_STATUS_COLOR = { good: 'green', warning: 'amber', danger: 'red' }

function buildFramework(frameworkObj, frameworkGoal, incomeTotal, expenses, goalCommitment, totalEmi) {
  if (!frameworkObj || !incomeTotal) {
    return { framework: '', framework_score: 0, framework_goal: frameworkGoal || '', framework_buckets: [] }
  }

  let analysis
  try {
    analysis = analyzeFramework(frameworkObj, incomeTotal, expenses, goalCommitment, totalEmi)
  } catch {
    return { framework: frameworkObj.id || '', framework_score: 0, framework_goal: frameworkGoal || '', framework_buckets: [] }
  }

  const buckets = (analysis.buckets || []).map((b) => ({
    name:         b.label,
    target_pct:   b.targetPct,
    actual_pct:   b.actualPct,
    variance_pct: b.actualPct - b.targetPct,
    status:       BUCKET_STATUS_COLOR[b.status] || 'green',
  }))

  return {
    framework:         frameworkObj.id || '',
    framework_score:   analysis.score || 0,
    framework_goal:    frameworkGoal || '',
    framework_buckets: buckets,
  }
}

// ─── Quick logs ───────────────────────────────────────────────────────────────

function buildQuickLogs(logs) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = currentMonthStr()

  const todayLogs = logs.filter((l) => l.date === today)
  const monthLogs = logs.filter((l) => typeof l.date === 'string' && l.date.startsWith(month))

  const todayTotal = sumPaise(todayLogs, (l) => Number(l.amount) || 0)
  const monthTotal = sumPaise(monthLogs, (l) => Number(l.amount) || 0)

  // Most-logged category this month (by count)
  const counts = {}
  for (const l of monthLogs) counts[l.category] = (counts[l.category] || 0) + 1
  const mostLogged = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  return {
    today_total:          todayTotal,
    this_month_logged:    monthTotal,
    this_month_count:     monthLogs.length,
    most_logged_category: mostLogged,
  }
}

// ─── Empty/default context (used on catastrophic failure) ─────────────────────

function emptyContext(completeness = {}) {
  return {
    income_total: 0, expense_total: 0, surplus: 0, savings_rate: '0%',
    expense_by_category: {},
    total_emi: 0, total_sip: 0, total_goal_commitment: 0, true_surplus: 0,
    health_score: 0, health_factors: [],
    goals: [], goals_count: 0, at_risk_goals_count: 0,
    loans: [], loans_count: 0, dti_ratio: '0%', debt_free_date: '',
    total_outstanding: 0, total_interest_remaining: 0,
    investments_summary: null,
    framework: '', framework_score: 0, framework_goal: '', framework_buckets: [],
    recent_logs_summary: { today_total: 0, this_month_logged: 0, this_month_count: 0, most_logged_category: '' },
    net_worth: 0, total_assets: 0, total_liabilities: 0,
    currency: 'INR',
    built_at: new Date().toISOString(),
    data_completeness: {
      has_income: false, has_expenses: false, has_loans: false,
      has_investments: false, has_goals: false, has_framework: false,
      has_quick_logs: false, ...completeness,
    },
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * @param {CryptoKey} vaultKey
 * @returns {Promise<object>} the anonymized FinioContext
 */
export async function buildContext(vaultKey) {
  if (!vaultKey) return emptyContext()

  // 1. Load + decrypt all tables in parallel (each failure isolated)
  const [
    incomeStreams, expenses, expenseLogs, goalsRaw, loansRaw, investmentsRaw,
    frameworkJson, frameworkGoal,
  ] = await Promise.all([
    decryptAndLoadAll('income_streams', vaultKey).catch(() => []),
    decryptAndLoadAll('expenses', vaultKey, { month: currentMonthStr() }).catch(() => []),
    decryptAndLoadAll('expense_logs', vaultKey).catch(() => []),
    decryptAndLoadAll('goals', vaultKey).catch(() => []),
    decryptAndLoadAll('loans', vaultKey).catch(() => []),
    decryptAndLoadAll('investments', vaultKey).catch(() => []),
    configGet('budget_framework').catch(() => null),
    configGet('onboarding_goal').catch(() => null),
  ])

  try {
    // 2. Income & expenses
    const { incomeTotal, expenseTotal, byCategory } = buildIncomeExpenses(incomeStreams, expenses)

    // 3. Loans
    const loanCtx = buildLoans(loansRaw, incomeTotal)

    // 4. Investments
    const invCtx = buildInvestments(investmentsRaw)

    // 5. Goals (surplus before commitments drives status)
    const grossSurplus = incomeTotal - expenseTotal
    const goalCtx = buildGoals(goalsRaw, grossSurplus)

    // 6. Committed deductions + true surplus
    const totalEmi = loanCtx.total_emi
    const totalSip = invCtx.sipMonthly
    const totalGoalCommitment = goalCtx.total_goal_commitment
    const surplus     = grossSurplus
    const trueSurplus = incomeTotal - expenseTotal - totalEmi - totalSip - totalGoalCommitment
    const savingsRate = incomeTotal > 0 ? (surplus / incomeTotal) * 100 : 0

    // 7. Health score (reuse engine with real data)
    const efGoal = goalsRaw.find((g) => g.type === 'emergency')
    const efSavedPaise = efGoal ? (Number(efGoal.saved_amount) || 0) : 0
    const emergencyFundMonths = expenseTotal > 0 ? Math.round((efSavedPaise / expenseTotal) * 10) / 10 : 0
    const assetClassCount = new Set(investmentsRaw.map((i) => i.asset_class)).size
    const hasSip = investmentsRaw.some((i) => i.is_sip)
    const { score: healthScore, factors: healthFactors } = calculateHealthScore({
      savingsRate,
      totalMonthlyIncomePaise:   incomeTotal,
      totalMonthlyExpensesPaise: expenseTotal,
      debtToIncomeRatio:         incomeTotal > 0 ? totalEmi / incomeTotal : 0,
      emergencyFundMonths:       efGoal ? emergencyFundMonths : null,
      assetClassCount:           investmentsRaw.length ? assetClassCount : 0,
      hasSip,
    })

    // 8. Framework
    let frameworkObj = null
    try { frameworkObj = frameworkJson ? JSON.parse(frameworkJson) : null } catch { frameworkObj = null }
    const fwCtx = buildFramework(frameworkObj, frameworkGoal, incomeTotal, expenses, totalGoalCommitment, totalEmi)

    // 9. Quick logs
    const logsCtx = buildQuickLogs(expenseLogs)

    // 10. Net worth
    const totalAssets      = invCtx.currentValue + sumPaise(goalsRaw, (g) => Number(g.saved_amount) || 0)
    const totalLiabilities = loanCtx.total_outstanding
    const netWorth         = totalAssets - totalLiabilities

    return {
      // Income & expenses
      income_total:         incomeTotal,
      expense_total:        expenseTotal,
      surplus,
      savings_rate:         pctStr(savingsRate),
      expense_by_category:  byCategory,

      // Committed deductions
      total_emi:             totalEmi,
      total_sip:             totalSip,
      total_goal_commitment: totalGoalCommitment,
      true_surplus:          trueSurplus,

      // Health
      health_score:   healthScore,
      health_factors: healthFactors.map((f) => ({
        factor: f.factor,
        impact: f.impact === 'positive' ? 'positive' : f.impact === 'negative' ? 'negative' : 'positive',
        detail: f.detail,
      })),

      // Goals
      goals:               goalCtx.goals,
      goals_count:         goalCtx.goals_count,
      at_risk_goals_count: goalCtx.at_risk_goals_count,

      // Loans
      loans:                    loanCtx.loans,
      loans_count:              loanCtx.loans_count,
      dti_ratio:                loanCtx.dti_ratio,
      debt_free_date:           loanCtx.debt_free_date,
      total_outstanding:        loanCtx.total_outstanding,
      total_interest_remaining: loanCtx.total_interest_remaining,

      // Investments
      investments_summary: invCtx.summary,

      // Framework
      ...fwCtx,

      // Quick logs
      recent_logs_summary: logsCtx,

      // Net worth
      net_worth:         netWorth,
      total_assets:      totalAssets,
      total_liabilities: totalLiabilities,

      // Meta
      currency:  'INR',
      built_at:  new Date().toISOString(),
      data_completeness: {
        has_income:      incomeStreams.length > 0,
        has_expenses:    expenses.length > 0,
        has_loans:       loanCtx.loans_count > 0,
        has_investments: investmentsRaw.length > 0,
        has_goals:       goalCtx.goals_count > 0,
        has_framework:   !!frameworkObj,
        has_quick_logs:  expenseLogs.length > 0,
      },
    }
  } catch (err) {
    console.error('[finio/contextBuilder] build failed, returning partial:', err)
    return emptyContext({
      has_income:      incomeStreams.length > 0,
      has_expenses:    expenses.length > 0,
      has_loans:       loansRaw.length > 0,
      has_investments: investmentsRaw.length > 0,
      has_goals:       goalsRaw.length > 0,
      has_framework:   !!frameworkJson,
      has_quick_logs:  expenseLogs.length > 0,
    })
  }
}

/**
 * Compact human-readable summary for embedding in a system prompt.
 */
export function contextToText(ctx) {
  if (!ctx) return ''
  const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`
  const lines = []

  if (ctx.data_completeness?.has_income) {
    lines.push(`Income ${rupees(ctx.income_total)}/mo · Expenses ${rupees(ctx.expense_total)} · Surplus ${rupees(ctx.surplus)} (${ctx.savings_rate} saved)`)
    lines.push(`True surplus after EMIs/SIPs/goals: ${rupees(ctx.true_surplus)}`)
  }
  if (ctx.health_score) lines.push(`Health score: ${ctx.health_score}/100`)
  if (ctx.goals_count)  lines.push(`Goals: ${ctx.goals_count} active (${ctx.at_risk_goals_count} at risk), commitment ${rupees(ctx.total_goal_commitment)}/mo`)
  if (ctx.loans_count)  lines.push(`Loans: ${ctx.loans_count}, EMI ${rupees(ctx.total_emi)}/mo, DTI ${ctx.dti_ratio}, debt-free ${ctx.debt_free_date}`)
  if (ctx.investments_summary) {
    const inv = ctx.investments_summary
    lines.push(`Investments: ${rupees(inv.current_value)} (${inv.gain_loss_pct}), ${inv.asset_classes.join('/')}, ${inv.risk_label} risk`)
  }
  if (ctx.framework) lines.push(`Framework: ${ctx.framework} (score ${ctx.framework_score}/100, goal: ${ctx.framework_goal})`)
  lines.push(`Net worth: ${rupees(ctx.net_worth)} (assets ${rupees(ctx.total_assets)} − liabilities ${rupees(ctx.total_liabilities)})`)

  return lines.join('\n')
}
