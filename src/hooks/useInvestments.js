/**
 * useInvestments — decrypts, enriches, and aggregates all investment records.
 *
 * Per-investment derived fields (prefix _):
 *   _name               display name
 *   _invested_paise     capital deployed (buy price × quantity / principal)
 *   _current_value_paise current market/accrual value
 *   _gain_loss_paise    current − invested
 *   _gain_loss_pct      gain % (2 dp)
 *   _holding_period_days days since first purchase
 *   _annualized_return  % p.a. (simple XIRR approximation)
 *   _buy_date_str       ISO date string for buy date
 *
 * Returns:
 *   enrichedInvestments, byAssetClass,
 *   totalInvested, currentValue, totalGainLoss, totalGainLossPct,
 *   bestPerformer, worstPerformer, assetAllocation
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { differenceInDays, addMonths } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { decryptAndLoadAll } from '../db/helpers.js'

// ─── FD current value (accrual to today, capped at maturity) ─────────────────

export function computeFDCurrentValue(inv) {
  const principal  = inv.principal_paise || 0
  const rate       = (Number(inv.interest_rate) || 0) / 100
  const tenureMonths = Number(inv.tenure_months) || 12

  if (!principal || !rate || !tenureMonths) return principal

  const startDate    = inv.start_date ? new Date(inv.start_date) : new Date()
  const maturityDate = addMonths(startDate, tenureMonths)
  const today        = new Date()

  const effectiveDate  = today > maturityDate ? maturityDate : today < startDate ? startDate : today
  const elapsedDays    = Math.max(0, differenceInDays(effectiveDate, startDate))
  const elapsedYears   = elapsedDays / 365

  if (inv.interest_type === 'simple') {
    return Math.round(principal * (1 + rate * elapsedYears))
  }
  // Quarterly compounding — standard for Indian FDs
  const n = 4
  return Math.round(principal * Math.pow(1 + rate / n, n * elapsedYears))
}

// FD maturity value (at end of full tenure) — used in form preview
export function computeFDMaturityValue(principalPaise, ratePct, tenureMonths, interestType) {
  const r = (Number(ratePct) || 0) / 100
  const t = (Number(tenureMonths) || 12) / 12
  const p = Number(principalPaise) || 0
  if (!p || !r || !t) return p
  if (interestType === 'simple') return Math.round(p * (1 + r * t))
  const n = 4
  return Math.round(p * Math.pow(1 + r / n, n * t))
}

// ─── Display name per asset class ─────────────────────────────────────────────

function displayName(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return inv.name || inv.ticker || 'Stock'
    case 'mutual_fund': return inv.name || 'Mutual Fund'
    case 'fd':          return inv.bank_name ? `${inv.bank_name} FD` : 'Fixed Deposit'
    case 'ppf_nps':     return `${inv.account_type || 'PPF'} Account`
    case 'gold':        return `Gold${inv.form ? ` (${inv.form})` : ''}`
    case 'real_estate': return inv.property_type || 'Property'
    default:            return 'Investment'
  }
}

// ─── Capital deployed ─────────────────────────────────────────────────────────

function investedPaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':
      return Math.round((Number(inv.quantity) || 0) * (inv.buy_price_paise || 0))
    case 'mutual_fund':
      return Math.round((Number(inv.units) || 0) * (inv.purchase_nav_paise || 0))
    case 'fd':
      return inv.principal_paise || 0
    case 'ppf_nps': {
      const openDate = inv.account_opening_date ? new Date(inv.account_opening_date) : new Date()
      const years    = Math.max(1, differenceInDays(new Date(), openDate) / 365)
      return Math.round((inv.annual_contribution_paise || 0) * Math.floor(years))
    }
    case 'gold':
      return Math.round((Number(inv.quantity_grams) || 0) * (inv.buy_price_per_gram_paise || 0))
    case 'real_estate':
      return inv.purchase_price_paise || 0
    default:
      return 0
  }
}

// ─── Current market/accrual value ─────────────────────────────────────────────

function currentValuePaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':
      return Math.round(
        (Number(inv.quantity) || 0) *
        (inv.current_price_paise || inv.buy_price_paise || 0)
      )
    case 'mutual_fund':
      return Math.round(
        (Number(inv.units) || 0) *
        (inv.current_nav_paise || inv.purchase_nav_paise || 0)
      )
    case 'fd':
      return computeFDCurrentValue(inv)
    case 'ppf_nps':
      return inv.current_corpus_paise || investedPaise(inv)
    case 'gold':
      return Math.round(
        (Number(inv.quantity_grams) || 0) *
        (inv.current_price_per_gram_paise || inv.buy_price_per_gram_paise || 0)
      )
    case 'real_estate':
      return inv.current_estimated_value_paise || inv.purchase_price_paise || 0
    default:
      return 0
  }
}

// ─── Buy date (normalised across asset classes) ───────────────────────────────

function buyDateStr(inv) {
  return (
    inv.buy_date ||
    inv.start_date ||
    inv.purchase_date ||
    inv.account_opening_date ||
    null
  )
}

// ─── Per-investment enrichment ────────────────────────────────────────────────

function enrichInvestment(inv) {
  const _invested_paise      = investedPaise(inv)
  const _current_value_paise = currentValuePaise(inv)
  const _gain_loss_paise     = _current_value_paise - _invested_paise
  const _gain_loss_pct       = _invested_paise > 0
    ? Math.round((_gain_loss_paise / _invested_paise) * 10000) / 100
    : 0

  const _buy_date_str        = buyDateStr(inv)
  const _holding_period_days = _buy_date_str
    ? Math.max(0, differenceInDays(new Date(), new Date(_buy_date_str)))
    : 0

  // Simple XIRR approximation: ((current/invested)^(365/days) − 1) × 100
  // Flagged as approximate in UI. Requires >30 days holding.
  const _annualized_return =
    _holding_period_days > 30 && _invested_paise > 0 && _current_value_paise > 0
      ? Math.round(
          (Math.pow(_current_value_paise / _invested_paise, 365 / _holding_period_days) - 1)
          * 10000
        ) / 100
      : _gain_loss_pct

  return {
    ...inv,
    _name:               displayName(inv),
    _invested_paise,
    _current_value_paise,
    _gain_loss_paise,
    _gain_loss_pct,
    _holding_period_days,
    _annualized_return,
    _buy_date_str,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInvestments() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [investments, setInvestments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [tick,        setTick]        = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    decryptAndLoadAll('investments', cryptoKey)
      .then((data) => {
        if (cancelled) return
        setInvestments(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[useInvestments] Load failed:', err)
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [cryptoKey, tick])

  const derived = useMemo(() => {
    const enriched = investments.map(enrichInvestment)

    const totalInvested  = enriched.reduce((s, i) => s + i._invested_paise, 0)
    const currentValue   = enriched.reduce((s, i) => s + i._current_value_paise, 0)
    const totalGainLoss  = currentValue - totalInvested
    const totalGainLossPct = totalInvested > 0
      ? Math.round((totalGainLoss / totalInvested) * 10000) / 100
      : 0

    // Group by asset_class
    const byAssetClass = {}
    for (const inv of enriched) {
      const ac = inv.asset_class || 'other'
      if (!byAssetClass[ac]) byAssetClass[ac] = []
      byAssetClass[ac].push(inv)
    }

    // Asset allocation — % of current portfolio value
    const assetAllocation = Object.entries(byAssetClass).map(([ac, invs]) => {
      const value = invs.reduce((s, i) => s + i._current_value_paise, 0)
      return {
        asset_class: ac,
        value_paise: value,
        pct: currentValue > 0 ? Math.round((value / currentValue) * 100) : 0,
      }
    }).sort((a, b) => b.value_paise - a.value_paise)

    // Best / worst performers (by gain_loss_pct, min ₹1000 invested to avoid noise)
    const eligible = enriched.filter((i) => i._invested_paise >= 100_00) // ₹100 min
    const bestPerformer  = eligible.length > 0
      ? eligible.reduce((b, i) => i._gain_loss_pct > b._gain_loss_pct ? i : b)
      : null
    const worstPerformer = eligible.length > 1
      ? eligible.reduce((w, i) => i._gain_loss_pct < w._gain_loss_pct ? i : w)
      : null

    return {
      enrichedInvestments: enriched,
      byAssetClass,
      totalInvested,
      currentValue,
      totalGainLoss,
      totalGainLossPct,
      bestPerformer,
      worstPerformer,
      assetAllocation,
    }
  }, [investments])

  return {
    investments,
    loading,
    error,
    refresh,
    ...derived,
  }
}
