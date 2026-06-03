/**
 * sipCalculator — pure SIP math functions.
 * No React, no hooks, no DB calls.
 *
 * All monetary inputs/outputs in paise.
 * Intermediate calculations use floating point (unavoidable with
 * exponential compounding), but results are rounded to paise.
 *
 * Standard SIP future value formula:
 *   FV = P × ((1 + r)^n − 1) / r × (1 + r)
 *   P = monthly SIP amount
 *   r = monthly interest rate (annual / 12)
 *   n = number of months
 */

const DEFAULT_SIP_RATE_PCT = 12 // 12% annual — standard assumed return for SIP illustrations

// ─── Core formula ─────────────────────────────────────────────────────────────

/**
 * Calculate SIP future value, total invested, and wealth gained.
 *
 * @param {number} monthlyAmountPaise — monthly SIP contribution in paise
 * @param {number} annualRatePct      — expected annual return % (e.g. 12)
 * @param {number} months             — SIP tenure in months
 * @returns {{ totalInvestedPaise, estimatedValuePaise, wealthGainedPaise }}
 */
export function calculateSIPReturns(
  monthlyAmountPaise,
  annualRatePct = DEFAULT_SIP_RATE_PCT,
  months,
) {
  const P = monthlyAmountPaise / 100  // work in rupees for the formula
  const r = annualRatePct / (12 * 100) // monthly decimal rate
  const n = Math.max(0, Math.round(months))

  const totalInvestedRs = P * n

  let estimatedValueRs
  if (r === 0 || n === 0) {
    estimatedValueRs = totalInvestedRs
  } else {
    estimatedValueRs = P * ((Math.pow(1 + r, n) - 1) / r) * (1 + r)
  }

  const wealthGainedRs = Math.max(0, estimatedValueRs - totalInvestedRs)

  return {
    totalInvestedPaise:  Math.round(totalInvestedRs * 100),
    estimatedValuePaise: Math.round(estimatedValueRs * 100),
    wealthGainedPaise:   Math.round(wealthGainedRs * 100),
  }
}

/**
 * Calculate SIP progress from actual payment history.
 *
 * @param {object} sip      — investment record with SIP fields
 * @param {number} todayMs  — Date.now() for deterministic testing
 * @returns {{ monthsCompleted, totalPaidPaise, expectedValuePaise, onTrack }}
 */
export function calculateSIPProgress(sip, todayMs = Date.now()) {
  const payments      = Array.isArray(sip.sip_payments) ? sip.sip_payments : []
  const monthlyAmount = sip.sip_amount_paise || 0
  const targetMonths  = Number(sip.sip_target_months) || 120 // default 10 years if unset
  const startDate     = sip.sip_start_date ? new Date(sip.sip_start_date) : new Date()

  // Months elapsed since SIP start
  const msElapsed     = todayMs - startDate.getTime()
  const monthsElapsed = Math.max(0, Math.floor(msElapsed / (30.4375 * 24 * 60 * 60 * 1000)))

  const monthsCompleted = Math.min(payments.length, targetMonths)
  const totalPaidPaise  = payments.reduce((s, p) => s + (Number(p.amount_paise) || monthlyAmount), 0)

  // Expected value at 12% if payments are on track
  const { estimatedValuePaise: expectedValuePaise } = calculateSIPReturns(
    monthlyAmount,
    DEFAULT_SIP_RATE_PCT,
    monthsCompleted,
  )

  // On track: actual payments ≥ 90% of expected payments by now
  const expectedPayments  = Math.min(monthsElapsed, targetMonths)
  const expectedPaidPaise = expectedPayments * monthlyAmount
  const onTrack           = expectedPaidPaise === 0 || totalPaidPaise >= expectedPaidPaise * 0.9

  return {
    monthsCompleted,
    monthsElapsed,
    targetMonths,
    totalPaidPaise,
    expectedValuePaise,
    onTrack,
    completionPct: targetMonths > 0 ? Math.min(100, Math.round((monthsCompleted / targetMonths) * 100)) : 0,
  }
}

/**
 * Frequency multiplier for non-monthly SIPs.
 */
export const SIP_FREQ_MONTHS = {
  monthly:    1,
  quarterly:  3,
  weekly:     0.25, // approx
}

export const DEFAULT_RATE = DEFAULT_SIP_RATE_PCT
