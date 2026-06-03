/**
 * frameworkAnalysis — pure function, fully synchronous.
 * No React, no hooks, no DB calls.
 *
 * analyzeFramework(framework, incomePaise, expenses, goalsMonthlyCommitment, loansMonthlyEMI)
 *   → { score, buckets[], overBudget[], underBudget[], suggestions[] }
 *
 * Score formula: 100 − Σ|variance%| capped at 0 (simple and explainable)
 * Variance% = (actual − target) / income × 100
 */

import { BUCKET } from './frameworkMapping.js'

// ─── Map expenses to bucket totals ───────────────────────────────────────────

function buildBucketActuals(framework, expenses, goalsMonthlyCommitment, loansMonthlyEMI) {
  const totals = {}

  // Init all buckets to 0
  for (const bucket of framework.buckets) {
    totals[bucket.id] = 0
  }

  // Sum expenses by mapped bucket
  for (const exp of expenses) {
    const cat        = exp.category || 'miscellaneous'
    const bucketId   = framework.categoryMap?.[cat]
    if (!bucketId || !(bucketId in totals)) continue

    // For 75/15/10: "wants" maps to "needs" (everything is "living")
    const targetBucket = framework.id === '75_15_10' && bucketId === BUCKET.WANTS
      ? BUCKET.NEEDS
      : bucketId

    if (targetBucket in totals) {
      totals[targetBucket] = (totals[targetBucket] || 0) + (Number(exp.amount) || 0)
    }
  }

  // For Finio Smart Split: populate "goals" bucket from goals data
  if (framework.isFinioSmart) {
    totals[BUCKET.GOALS] = goalsMonthlyCommitment || 0

    // Also supplement loans bucket from the loan tracker if expenses loans < EMI
    const expLoans = totals[BUCKET.LOANS_DEBT] || 0
    totals[BUCKET.LOANS_DEBT] = Math.max(expLoans, loansMonthlyEMI || 0)
  }

  return totals
}

// ─── Traffic light status ─────────────────────────────────────────────────────

function bucketStatus(varPct) {
  const abs = Math.abs(varPct)
  if (abs <= 5)  return 'good'
  if (abs <= 15) return 'warning'
  return 'danger'
}

// ─── Rule-based suggestions ───────────────────────────────────────────────────

function generateSuggestions(buckets, incomePaise) {
  const suggestions = []

  for (const b of buckets) {
    if (b.varPct > 15) {
      suggestions.push(`Your "${b.label}" bucket is ${b.varPct.toFixed(0)}% over target — ` +
        `you're spending ${b.overByStr} more than planned.`)
    }
  }

  // Savings-specific insight
  const savBucket = buckets.find((b) =>
    b.id === BUCKET.SAVINGS || b.id === BUCKET.INVESTMENTS
  )
  if (savBucket && savBucket.varPct < -10) {
    suggestions.push(
      `Savings are ${Math.abs(savBucket.varPct).toFixed(0)}% below target — ` +
      `consider automating SIP transfers on payday to hit your goal.`
    )
  }

  if (suggestions.length === 0 && buckets.every((b) => b.status === 'good')) {
    suggestions.push('Excellent — your spending closely follows your chosen framework this month.')
  }

  return suggestions.slice(0, 3)
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {object}   framework              — preset from FRAMEWORK_PRESETS
 * @param {number}   incomePaise            — total monthly income in paise
 * @param {object[]} expenses               — array of {category, amount} records (current month)
 * @param {number}   goalsMonthlyCommitment — paise/month committed to goals
 * @param {number}   loansMonthlyEMI        — total monthly EMI from loan tracker
 * @returns {{ score, buckets, overBudget, underBudget, suggestions }}
 */
export function analyzeFramework(
  framework,
  incomePaise,
  expenses,
  goalsMonthlyCommitment = 0,
  loansMonthlyEMI        = 0,
) {
  if (!framework || !incomePaise) {
    return { score: 0, buckets: [], overBudget: [], underBudget: [], suggestions: [] }
  }

  const actuals = buildBucketActuals(framework, expenses, goalsMonthlyCommitment, loansMonthlyEMI)

  let totalAbsVariance = 0

  const buckets = framework.buckets.map((bucket) => {
    const targetPaise = Math.round(incomePaise * bucket.targetPct / 100)
    const actualPaise = actuals[bucket.id] || 0
    const varPaise    = actualPaise - targetPaise

    // Variance as % of income (so we can sum across buckets meaningfully)
    const varPctOfIncome = incomePaise > 0
      ? (varPaise / incomePaise) * 100
      : 0

    totalAbsVariance += Math.abs(varPctOfIncome)

    // Variance as % of target (for display — how far off are we from target)
    const varPct = targetPaise > 0
      ? Math.round((varPaise / targetPaise) * 100)
      : 0

    const status = bucketStatus(varPct)

    const overByStr = varPaise > 0
      ? `₹${Math.round(Math.abs(varPaise) / 100).toLocaleString('en-IN')}`
      : null
    const underByStr = varPaise < 0
      ? `₹${Math.round(Math.abs(varPaise) / 100).toLocaleString('en-IN')}`
      : null

    return {
      ...bucket,
      targetPaise,
      actualPaise,
      varPaise,
      varPct,
      varPctOfIncome,
      status,
      overByStr,
      underByStr,
      actualPct: incomePaise > 0 ? Math.round((actualPaise / incomePaise) * 100) : 0,
    }
  })

  // Score: 100 − total variance, capped at 0
  const score = Math.max(0, Math.round(100 - totalAbsVariance))

  const overBudget  = buckets.filter((b) => b.varPct > 5).sort((a, b) => b.varPct - a.varPct)
  const underBudget = buckets.filter((b) => b.varPct < -5).sort((a, b) => a.varPct - b.varPct)

  const suggestions = generateSuggestions(buckets, incomePaise)

  return { score, buckets, overBudget, underBudget, suggestions }
}

// ─── Custom framework builder ─────────────────────────────────────────────────

/**
 * Build a custom framework from user-defined bucket percentages.
 * customDef: { needs: number, wants: number, savings: number }
 * Percentages must sum to 100 — validated before calling.
 */
import { STANDARD_CATEGORY_MAP } from './frameworkMapping.js'

export function buildCustomFramework(customDef) {
  return {
    id:          'custom',
    name:        'Custom Framework',
    description: 'Your own allocation rules.',
    categoryMap: STANDARD_CATEGORY_MAP,
    buckets: [
      {
        id: BUCKET.NEEDS,
        label: 'Needs',
        targetPct: Number(customDef.needs) || 0,
        color: '#6366F1',
        description: 'Housing, food, transport, health, education, loan EMIs',
      },
      {
        id: BUCKET.WANTS,
        label: 'Wants',
        targetPct: Number(customDef.wants) || 0,
        color: '#F59E0B',
        description: 'Lifestyle, entertainment, dining out, hobbies',
      },
      {
        id: BUCKET.SAVINGS,
        label: 'Savings',
        targetPct: Number(customDef.savings) || 0,
        color: '#10B981',
        description: 'SIPs, FDs, PPF, emergency fund, goals',
      },
    ],
  }
}
