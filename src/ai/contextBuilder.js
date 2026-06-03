/**
 * contextBuilder — builds the complete anonymized financial context object
 * sent to Claude API.
 *
 * This is the single source of truth for what gets sent to the AI.
 * All Phase 4 AI calls (chat, insights, suggestions) use this function.
 *
 * Privacy rules (enforced here):
 *   NEVER include: names, tickers, fund names, lender names, account numbers,
 *                  PAN, Aadhaar, exact addresses, employer names
 *   DO include:    asset classes, sectors, goal types, loan types, amounts,
 *                  rates, percentages, calculated metrics
 *
 * Pure function — no side effects, no DB calls, no network.
 * Call it from a component that already has all hook data.
 */

import { format, differenceInMonths } from 'date-fns'

// ─── Income + Expenses ────────────────────────────────────────────────────────

function buildIncomeExpenses(summary, monthlyHistory) {
  const {
    totalMonthlyIncomePaise,
    totalMonthlyExpensesPaise,
    surplusPaise,
    savingsRate,
    expenseByCategory,
    streamCount,
  } = summary

  // Normalize category amounts to INR (rounded)
  const expenseBycat = {}
  for (const [cat, amt] of Object.entries(expenseByCategory || {})) {
    expenseBycat[cat] = Math.round(amt / 100)
  }

  return {
    income_total:         totalMonthlyIncomePaise,
    expense_total:        totalMonthlyExpensesPaise,
    surplus:              surplusPaise,
    savings_rate:         `${savingsRate}%`,
    income_stream_count:  streamCount,
    expense_by_category:  expenseBycat,
  }
}

// ─── Goals ────────────────────────────────────────────────────────────────────

function buildGoals(goals, activeGoals, totalMonthlyCommitment) {
  const now = new Date()
  return {
    goals: (activeGoals || []).map((g) => {
      const target  = Number(g.target_amount) || 0
      const saved   = Number(g.saved_amount)  || 0
      const pct     = target > 0 ? Math.round((saved / target) * 100) : 0
      const months  = g.deadline
        ? Math.max(0, differenceInMonths(new Date(g.deadline), now))
        : null
      return {
        type:              g.type || 'savings',
        target_rupees:     target,
        saved_rupees:      saved,
        pct_complete:      pct,
        status:            g.status || 'Active',
        months_remaining:  months,
        priority:          g.priority,
      }
    }),
    goals_completed:       (goals || []).filter((g) => g.status === 'Completed').length,
    total_goal_commitment: totalMonthlyCommitment, // monthly paise committed
  }
}

// ─── Loans ────────────────────────────────────────────────────────────────────

function buildLoans(activeLoans, totalMonthlyEMI, totalOutstandingPaise, projectedDebtFreeDate) {
  if (!activeLoans?.length) {
    return { loans: [], total_emi: 0, dti_ratio: '0%', debt_free_date: null }
  }

  const loans = activeLoans.map((l) => ({
    type:              l.loan_type || 'personal',  // no lender name
    outstanding_paise: l._outstandingPaise ?? 0,
    rate_pct:          l.annual_rate,
    emi_paise:         l._emi ?? 0,
    months_remaining:  l._monthsRemaining ?? 0,
  }))

  return {
    loans,
    total_emi:      totalMonthlyEMI,
    total_outstanding: totalOutstandingPaise,
    debt_free_date: projectedDebtFreeDate || null,
  }
}

// ─── Investments ──────────────────────────────────────────────────────────────

function buildInvestments(
  enrichedInvestments,
  totalInvested,
  currentValue,
  totalGainLoss,
  totalGainLossPct,
  assetAllocation,
  portfolioRiskLabel,
  totalAnnualizedReturn,
) {
  if (!enrichedInvestments?.length) return { investments_summary: null }

  const assetClasses = [...new Set(enrichedInvestments.map((i) => i.asset_class).filter(Boolean))]
  const sectors      = [...new Set(enrichedInvestments
    .filter((i) => i.asset_class === 'stocks' && i.sector)
    .map((i) => i.sector)
  )]
  const hasSIP = enrichedInvestments.some((i) => i.is_sip)
  const sipMonthlyPaise = enrichedInvestments
    .filter((i) => i.is_sip)
    .reduce((s, i) => s + (i.sip_amount_paise || 0), 0)

  return {
    investments_summary: {
      total_invested:        totalInvested,
      current_value:         currentValue,
      gain_loss_paise:       totalGainLoss,
      gain_loss_pct:         `${totalGainLossPct.toFixed(1)}%`,
      asset_classes:         assetClasses,
      sectors,               // sectors only — no tickers/fund names
      asset_allocation_pct:  Object.fromEntries(
        (assetAllocation || []).map((a) => [a.asset_class, a.pct])
      ),
      has_sip:               hasSIP,
      sip_monthly_paise:     sipMonthlyPaise,
      risk_label:            portfolioRiskLabel,
      annualized_return_pct: totalAnnualizedReturn,
    },
  }
}

// ─── Framework ────────────────────────────────────────────────────────────────

function buildFramework(frameworkObj, frameworkScore, frameworkGoal) {
  return {
    framework:       frameworkObj?.name || null,
    framework_id:    frameworkObj?.id   || null,
    framework_score: frameworkScore     || null,
    framework_goal:  frameworkGoal      || null,
  }
}

// ─── Quick logs ───────────────────────────────────────────────────────────────

function buildQuickLogs(todayTotal, monthTotal, topCategory) {
  return {
    recent_logs_summary: {
      today_total_paise:        todayTotal     || 0,
      this_month_logged_paise:  monthTotal     || 0,
      most_logged_category:     topCategory    || null,
    },
  }
}

// ─── Health score ─────────────────────────────────────────────────────────────

function buildHealth(healthScore, healthFactors) {
  return {
    health_score:   healthScore,
    health_factors: (healthFactors || []).map((f) => ({
      factor:  f.factor,
      impact:  f.impact,
      detail:  f.detail,
      points:  f.points,
      max:     f.maxPoints,
    })),
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the complete anonymized AI context.
 *
 * @param {object} p — all financial data (from hooks/computed values)
 * @returns {object} — structured context object safe to send to Claude
 */
export function buildAIContext({
  // Income + Expenses
  summary,
  monthlyHistory = [],

  // Health
  healthScore = 0,
  healthFactors = [],

  // Goals
  goals = [],
  activeGoals = [],
  totalMonthlyCommitment = 0,

  // Loans
  activeLoans = [],
  totalMonthlyEMI = 0,
  totalOutstandingPaise = 0,
  projectedDebtFreeDate = null,

  // Investments
  enrichedInvestments = [],
  totalInvested = 0,
  currentValue = 0,
  totalGainLoss = 0,
  totalGainLossPct = 0,
  assetAllocation = [],
  portfolioRiskLabel = 'Balanced',
  totalAnnualizedReturn = 0,

  // Framework
  frameworkObj = null,
  frameworkScore = null,
  frameworkGoal = null,

  // Quick logs
  todayLogTotal = 0,
  monthLogTotal = 0,
  topQuickLogCategory = null,
}) {
  const dtiRatio = summary?.totalMonthlyIncomePaise > 0
    ? Math.round((totalMonthlyEMI / summary.totalMonthlyIncomePaise) * 100)
    : 0

  return {
    generated_at: format(new Date(), 'yyyy-MM-dd HH:mm'),

    ...buildIncomeExpenses(summary || {}, monthlyHistory),
    ...buildHealth(healthScore, healthFactors),
    ...buildGoals(goals, activeGoals, totalMonthlyCommitment),
    ...buildLoans(activeLoans, totalMonthlyEMI, totalOutstandingPaise, projectedDebtFreeDate),
    dti_ratio: `${dtiRatio}%`,
    ...buildInvestments(
      enrichedInvestments, totalInvested, currentValue,
      totalGainLoss, totalGainLossPct, assetAllocation,
      portfolioRiskLabel, totalAnnualizedReturn,
    ),
    ...buildFramework(frameworkObj, frameworkScore, frameworkGoal),
    ...buildQuickLogs(todayLogTotal, monthLogTotal, topQuickLogCategory),
  }
}

/**
 * Convert the context object to a concise text summary for system prompts.
 * Used by AI Chat (Phase 4) when sending to Claude.
 */
export function contextToText(ctx) {
  const lines = []

  if (ctx.income_total) {
    lines.push(`Monthly income: ₹${Math.round(ctx.income_total / 100).toLocaleString('en-IN')}, expenses: ₹${Math.round(ctx.expense_total / 100).toLocaleString('en-IN')}, surplus: ₹${Math.round(ctx.surplus / 100).toLocaleString('en-IN')} (${ctx.savings_rate} savings rate)`)
  }

  if (ctx.health_score) lines.push(`Financial health score: ${ctx.health_score}/100`)

  if (ctx.goals?.length) {
    lines.push(`Goals: ${ctx.goals.length} active, monthly commitment ₹${Math.round((ctx.total_goal_commitment || 0) / 100).toLocaleString('en-IN')}`)
  }

  if (ctx.loans?.length) {
    lines.push(`Loans: ${ctx.loans.length} active, total EMI ₹${Math.round((ctx.total_emi || 0) / 100).toLocaleString('en-IN')}, DTI ${ctx.dti_ratio}`)
  }

  if (ctx.investments_summary) {
    const inv = ctx.investments_summary
    lines.push(`Investments: ₹${Math.round((inv.current_value || 0) / 100).toLocaleString('en-IN')} portfolio (${inv.gain_loss_pct} return), ${inv.asset_classes.join('/')} allocation, risk: ${inv.risk_label}`)
  }

  if (ctx.framework) lines.push(`Budget framework: ${ctx.framework} (score: ${ctx.framework_score}/100)`)

  return lines.join('\n')
}
