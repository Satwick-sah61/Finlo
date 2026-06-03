/**
 * rebalancing — pure function, no React, no hooks, no DB.
 *
 * Generates rebalancing recommendations based on:
 *   - Current portfolio allocation (from enriched investments)
 *   - Target allocation derived from user age (classic rules)
 *   - Sector concentration (stocks only)
 *
 * Asset class groupings for rebalancing:
 *   Equity  → stocks + mutual_fund
 *   Debt    → fd + ppf_nps
 *   Gold    → gold
 *   RE      → real_estate
 *
 * Target allocation (age-based):
 *   Equity % = max(20, 100 − age)
 *   Debt   % = min(50, age × 0.6)
 *   Gold   % = 10 (fixed)
 *   RE     % = 100 − equity − debt − gold (clamped ≥ 0, normalized)
 *
 * Urgency:
 *   High   — any bucket > 2× its target
 *   Medium — any bucket > 1.5× or < 0.5× its target
 *   Low    — minor drift (< 15% off)
 *   None   — within 10% of target on all buckets
 */

import { formatINRCompact } from './currency.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const REBALANCE_BUCKET = {
  equity: 'equity',
  debt:   'debt',
  gold:   'gold',
  re:     're',
}

const CLASS_TO_BUCKET = {
  stocks:      REBALANCE_BUCKET.equity,
  mutual_fund: REBALANCE_BUCKET.equity,
  fd:          REBALANCE_BUCKET.debt,
  ppf_nps:     REBALANCE_BUCKET.debt,
  gold:        REBALANCE_BUCKET.gold,
  real_estate: REBALANCE_BUCKET.re,
}

const BUCKET_LABEL = {
  equity: 'Equity (Stocks + MF)',
  debt:   'Debt (FD + PPF/NPS)',
  gold:   'Gold',
  re:     'Real Estate',
}

// ─── Target allocation ────────────────────────────────────────────────────────

export function computeTargetAllocation(age) {
  const safeAge = Math.max(18, Math.min(75, Number(age) || 30))

  const equity = Math.max(20, 100 - safeAge)           // 20%–82%
  const debt   = Math.min(50, Math.round(safeAge * 0.6)) // up to 50%
  const gold   = 10
  const re     = Math.max(0, 100 - equity - debt - gold)

  // Normalize to exactly 100 (floating point safety)
  const total  = equity + debt + gold + re
  const scale  = 100 / total

  return {
    equity: Math.round(equity * scale),
    debt:   Math.round(debt   * scale),
    gold:   Math.round(gold   * scale),
    re:     Math.round(re     * scale),
  }
}

// ─── Current allocation ───────────────────────────────────────────────────────

function computeCurrentAllocation(enrichedInvestments, totalValue) {
  const bucketValues = { equity: 0, debt: 0, gold: 0, re: 0 }

  for (const inv of enrichedInvestments) {
    const bucket = CLASS_TO_BUCKET[inv.asset_class]
    if (bucket) bucketValues[bucket] += inv._current_value_paise
  }

  const result = {}
  for (const [bucket, value] of Object.entries(bucketValues)) {
    result[bucket] = {
      valuePaise: value,
      pct: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
    }
  }
  return result
}

// ─── Urgency helper ───────────────────────────────────────────────────────────

function computeUrgency(recommendations) {
  if (recommendations.some((r) => r.urgency === 'high'))   return 'high'
  if (recommendations.some((r) => r.urgency === 'medium')) return 'medium'
  if (recommendations.length > 0)                          return 'low'
  return 'none'
}

// ─── Sector concentration ─────────────────────────────────────────────────────

function checkSectorConcentration(enrichedInvestments) {
  const sectorValues = {}
  let stocksTotal = 0

  for (const inv of enrichedInvestments) {
    if (inv.asset_class !== 'stocks') continue
    stocksTotal += inv._current_value_paise
    if (inv.sector) {
      sectorValues[inv.sector] = (sectorValues[inv.sector] || 0) + inv._current_value_paise
    }
  }

  if (!stocksTotal) return null

  const topSector = Object.entries(sectorValues)
    .sort((a, b) => b[1] - a[1])[0]

  if (!topSector) return null

  const topPct = Math.round((topSector[1] / stocksTotal) * 100)
  if (topPct < 40) return null

  return {
    type:       'sector_concentration',
    urgency:    topPct > 60 ? 'medium' : 'low',
    sector:     topSector[0],
    currentPct: topPct,
    message:    `${topPct}% of your stocks are in ${topSector[0]} — consider diversifying across sectors`,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {object[]} enrichedInvestments — from useInvestments()
 * @param {number}   userAge             — used to compute target allocation
 * @returns {{ recommendations, urgency, summary, targetAllocation, currentAllocation }}
 */
export function generateRebalancingPlan(enrichedInvestments, userAge) {
  if (!enrichedInvestments?.length) {
    return {
      recommendations:    [],
      urgency:            'none',
      summary:            'No investments to analyse yet.',
      targetAllocation:   computeTargetAllocation(userAge),
      currentAllocation:  { equity: { valuePaise: 0, pct: 0 }, debt: { valuePaise: 0, pct: 0 }, gold: { valuePaise: 0, pct: 0 }, re: { valuePaise: 0, pct: 0 } },
    }
  }

  const totalValue     = enrichedInvestments.reduce((s, i) => s + i._current_value_paise, 0)
  const target         = computeTargetAllocation(userAge)
  const current        = computeCurrentAllocation(enrichedInvestments, totalValue)
  const recommendations = []

  // ── Bucket-level recommendations ────────────────────────────────────────────
  for (const [bucket, targetPct] of Object.entries(target)) {
    const cur      = current[bucket] || { valuePaise: 0, pct: 0 }
    const diff     = cur.pct - targetPct         // positive = overweight
    const ratio    = targetPct > 0 ? cur.pct / targetPct : 0

    if (Math.abs(diff) <= 10) continue           // within ±10% is fine

    const amountPaise = Math.abs(Math.round(totalValue * diff / 100))

    if (diff > 0) {
      // Overweight
      const urgency = ratio >= 2 ? 'high' : ratio >= 1.5 ? 'medium' : 'low'
      const underweightBucket = Object.entries(target)
        .filter(([b]) => (current[b]?.pct || 0) < target[b])
        .sort((a, b) => (current[a[0]]?.pct || 0) - a[1] - ((current[b[0]]?.pct || 0) - b[1]))[0]?.[0]
        || 'debt'
      recommendations.push({
        type:       'overweight',
        bucket,
        label:      BUCKET_LABEL[bucket],
        currentPct: cur.pct,
        targetPct,
        diff,
        urgency,
        message:    `${BUCKET_LABEL[bucket]} is at ${cur.pct}% vs target ${targetPct}% — consider moving ${formatINRCompact(amountPaise)} to ${BUCKET_LABEL[underweightBucket] || 'debt'}`,
      })
    } else {
      // Underweight
      const urgency = ratio <= 0.25 ? 'medium' : 'low'
      recommendations.push({
        type:       'underweight',
        bucket,
        label:      BUCKET_LABEL[bucket],
        currentPct: cur.pct,
        targetPct,
        diff,
        urgency,
        message:    `${BUCKET_LABEL[bucket]} is only ${cur.pct}% vs target ${targetPct}% — consider investing ${formatINRCompact(amountPaise)} here`,
      })
    }
  }

  // ── Sector concentration ────────────────────────────────────────────────────
  const sectorAlert = checkSectorConcentration(enrichedInvestments)
  if (sectorAlert) recommendations.push(sectorAlert)

  const urgency = computeUrgency(recommendations)

  let summary
  if (recommendations.length === 0) {
    summary = `Portfolio is well balanced for age ${userAge}. No rebalancing needed right now.`
  } else {
    const highCount = recommendations.filter((r) => r.urgency === 'high').length
    summary = highCount > 0
      ? `${highCount} significant imbalance${highCount !== 1 ? 's' : ''} found. Consider rebalancing to stay aligned with your age-based target.`
      : `Minor drift from target allocation detected. Rebalancing annually keeps your portfolio on track.`
  }

  return {
    recommendations,
    urgency,
    summary,
    targetAllocation:  target,
    currentAllocation: current,
    totalValuePaise:   totalValue,
  }
}
