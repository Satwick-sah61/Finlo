/**
 * InvestmentDetail — expandable detail panel rendered inside InvestmentCard.
 *
 * Sections per asset class:
 *   All:          Key metrics (invested, current, gain/loss, holding period, annualized return)
 *   Stocks/MF:    Price history LineChart + break-even price
 *   Gold:         Price history LineChart
 *   FD:           Maturity countdown + projected maturity value
 *   PPF/NPS:      Year-by-year corpus projection table (10 years)
 *   Real Estate:  Key values only
 */

import { useMemo } from 'react'
import { format, differenceInDays, addMonths } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Dot,
} from 'recharts'
import { formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'
import { computeFDMaturityValue } from '../../hooks/useInvestments.js'
import { ASSET_META } from './AssetAllocationChart.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function holdingStr(days) {
  if (days <= 0)  return '< 1 day'
  if (days < 30)  return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}m ${days % 30}d`
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return months > 0 ? `${years}y ${months}m` : `${years}y`
}

// ─── Metric row component ─────────────────────────────────────────────────────

function MetricRow({ label, value, valueColor, mono = false }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[11px] text-white/35">{label}</span>
      <span className={`text-xs font-semibold ${mono ? 'font-numeric' : ''} ${valueColor || 'text-white/70'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Price history chart ──────────────────────────────────────────────────────

function PriceHistoryChart({ history, buyPricePaise, buyDateStr, accentColor = '#6366F1' }) {
  const data = useMemo(() => {
    const points = []

    // Always include buy price at buy date
    if (buyDateStr) {
      points.push({
        date:    buyDateStr,
        label:   format(new Date(buyDateStr), 'dd MMM yy'),
        price:   buyPricePaise,
        isBuy:   true,
      })
    }

    // Add logged price history
    for (const h of (history || [])) {
      if (!h.date) continue
      points.push({
        date:    h.date,
        label:   format(new Date(h.date), 'dd MMM yy'),
        price:   h.price,
        isBuy:   false,
      })
    }

    // Sort chronologically, dedupe same date (keep latest)
    const dateMap = {}
    for (const p of points) dateMap[p.date] = p
    return Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [history, buyPricePaise, buyDateStr])

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <p className="text-[10px] text-white/20">Log more prices to see the trend</p>
      </div>
    )
  }

  const prices       = data.map((d) => d.price)
  const minPrice     = Math.min(...prices)
  const maxPrice     = Math.max(...prices)
  const latestPrice  = prices[prices.length - 1]
  const isUp         = latestPrice >= buyPricePaise

  const CustomDot = (props) => {
    const { cx, cy, payload } = props
    if (!payload.isBuy) return null
    return <circle cx={cx} cy={cy} r={4} fill={accentColor} stroke="#0F0E17" strokeWidth={2} />
  }

  return (
    <div style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            dy={3}
          />
          <YAxis
            domain={[minPrice * 0.97, maxPrice * 1.03]}
            tickFormatter={(v) => formatINRCompact(v)}
            tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              const gainPct = buyPricePaise > 0
                ? (((d.price - buyPricePaise) / buyPricePaise) * 100).toFixed(2)
                : 0
              return (
                <div style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                  <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{d.label}</p>
                  <p style={{ color: '#fff', fontWeight: 700 }}>₹{(d.price / 100).toLocaleString('en-IN')}</p>
                  {!d.isBuy && (
                    <p style={{ color: Number(gainPct) >= 0 ? '#10B981' : '#EF4444', fontSize: 10 }}>
                      {Number(gainPct) >= 0 ? '+' : ''}{gainPct}% from buy
                    </p>
                  )}
                </div>
              )
            }}
          />
          {buyPricePaise > 0 && (
            <ReferenceLine
              y={buyPricePaise}
              stroke={accentColor}
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
          )}
          <Line
            type="monotone"
            dataKey="price"
            stroke={isUp ? '#10B981' : '#EF4444'}
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 3, fill: isUp ? '#10B981' : '#EF4444' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── FD maturity panel ────────────────────────────────────────────────────────

function FDMaturityPanel({ inv }) {
  const startDate = inv.start_date ? new Date(inv.start_date) : null
  const matDate   = inv.maturity_date
    ? new Date(inv.maturity_date)
    : startDate
      ? addMonths(startDate, Number(inv.tenure_months) || 12)
      : null

  if (!matDate) return null

  const today    = new Date()
  const daysLeft = differenceInDays(matDate, today)
  const matured  = daysLeft < 0

  const maturityValuePaise = computeFDMaturityValue(
    inv.principal_paise || 0,
    inv.interest_rate || 0,
    inv.tenure_months || 12,
    inv.interest_type || 'compound',
  )
  const interestEarnedPaise = maturityValuePaise - (inv.principal_paise || 0)

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{
        background: matured ? 'rgba(239,68,68,0.06)' : daysLeft <= 7 ? 'rgba(239,68,68,0.06)' : 'rgba(6,182,212,0.06)',
        border: `1px solid ${matured || daysLeft <= 7 ? 'rgba(239,68,68,0.2)' : 'rgba(6,182,212,0.2)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: matured || daysLeft <= 7 ? '#EF4444' : '#06B6D4' }}>
          {matured ? 'Matured' : 'Maturity Countdown'}
        </span>
        <span className="text-xs font-bold" style={{ color: matured || daysLeft <= 7 ? '#EF4444' : '#06B6D4' }}>
          {matured
            ? `${Math.abs(daysLeft)}d ago`
            : daysLeft === 0
              ? 'Today!'
              : `${daysLeft} days`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-white/30 mb-0.5">Matures on</p>
          <p className="text-[11px] font-semibold text-white/70">{format(matDate, 'dd MMM yy')}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/30 mb-0.5">Maturity value</p>
          <p className="text-[11px] font-semibold text-emerald-400">{formatINRCompact(maturityValuePaise)}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/30 mb-0.5">Interest earned</p>
          <p className="text-[11px] font-semibold text-emerald-400">+{formatINRCompact(interestEarnedPaise)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── PPF/NPS projection table ─────────────────────────────────────────────────

function PPFProjectionTable({ inv }) {
  const annualContrib = inv.annual_contribution_paise || 0
  const rate          = (Number(inv.expected_return_rate) || 7.1) / 100
  const currentCorpus = inv.current_corpus_paise || 0

  const rows = useMemo(() => {
    const result = []
    let corpus = currentCorpus
    const thisYear = new Date().getFullYear()

    for (let i = 1; i <= 10; i++) {
      corpus = Math.round(corpus * (1 + rate) + annualContrib)
      result.push({ year: thisYear + i, corpus, contrib: annualContrib })
    }
    return result
  }, [currentCorpus, rate, annualContrib])

  if (!annualContrib && !currentCorpus) return null

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
        10-Year Corpus Projection ({Number(inv.expected_return_rate) || 7.1}% p.a.)
      </p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th className="text-left px-3 py-1.5 text-white/30 font-medium">Year</th>
              <th className="text-right px-3 py-1.5 text-white/30 font-medium">Annual Contrib.</th>
              <th className="text-right px-3 py-1.5 text-white/30 font-medium">Corpus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.year}
                style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
              >
                <td className="px-3 py-1.5 text-white/50">{r.year}</td>
                <td className="px-3 py-1.5 text-right text-white/40 font-numeric">
                  {formatINRCompact(r.contrib)}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-emerald-400 font-numeric">
                  {formatINRCompact(r.corpus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function InvestmentDetail({ inv, onUpdatePrice }) {
  const meta      = ASSET_META[inv.asset_class] || ASSET_META.other
  const isGain    = inv._gain_loss_paise >= 0
  const canUpdate = ['stocks', 'mutual_fund', 'gold'].includes(inv.asset_class)

  // Build per-class key-value rows
  const kvRows = []
  switch (inv.asset_class) {
    case 'stocks':
      kvRows.push(
        ['Shares',        `${(Number(inv.quantity) || 0).toLocaleString('en-IN')}`],
        ['Buy Price',     `₹${((inv.buy_price_paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['Current Price', `₹${((inv.current_price_paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['Break-even',    `₹${((inv.buy_price_paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        inv.ticker && ['Ticker', inv.ticker],
        inv.sector && ['Sector', inv.sector],
      )
      break
    case 'mutual_fund':
      kvRows.push(
        ['Units',         `${(Number(inv.units) || 0).toFixed(3)}`],
        ['Purchase NAV',  `₹${((inv.purchase_nav_paise || 0) / 100).toFixed(4)}`],
        ['Current NAV',   `₹${((inv.current_nav_paise || 0) / 100).toFixed(4)}`],
        ['Break-even NAV', `₹${((inv.purchase_nav_paise || 0) / 100).toFixed(4)}`],
        inv.fund_type && ['Fund Type', inv.fund_type],
        inv.folio_number && ['Folio', inv.folio_number],
      )
      break
    case 'fd':
      kvRows.push(
        ['Principal',  formatINRCompact(inv.principal_paise || 0)],
        ['Rate',       `${inv.interest_rate}% p.a.`],
        ['Tenure',     `${inv.tenure_months} months`],
        ['Type',       inv.interest_type === 'compound' ? 'Compound (Qly)' : 'Simple'],
        ['Payout',     inv.payout_type === 'cumulative' ? 'Cumulative' : 'Monthly'],
      )
      break
    case 'ppf_nps':
      kvRows.push(
        ['Account Type',   inv.account_type || 'PPF'],
        ['Annual Contribution', formatINRCompact(inv.annual_contribution_paise || 0)],
        ['Current Corpus', formatINRCompact(inv.current_corpus_paise || 0)],
        ['Expected Return', `${inv.expected_return_rate || 7.1}% p.a.`],
      )
      break
    case 'gold':
      kvRows.push(
        ['Form',          inv.form || 'Physical'],
        ['Quantity',      `${(Number(inv.quantity_grams) || 0).toFixed(3)}g`],
        ['Buy Price',     `₹${((inv.buy_price_per_gram_paise || 0) / 100).toLocaleString('en-IN')}/g`],
        ['Current Price', `₹${((inv.current_price_per_gram_paise || 0) / 100).toLocaleString('en-IN')}/g`],
      )
      break
    case 'real_estate':
      kvRows.push(
        ['Type',           inv.property_type || '—'],
        ['Purchase Price', formatINRCompact(inv.purchase_price_paise || 0)],
        ['Current Value',  formatINRCompact(inv.current_estimated_value_paise || 0)],
        inv.rental_income_paise > 0 && ['Monthly Rent', formatINRCompact(inv.rental_income_paise)],
      )
      break
    default: break
  }

  const validKV = kvRows.filter(Boolean).filter((r) => r && r[1])

  const historyForChart = Array.isArray(inv.price_history)
    ? [...inv.price_history].sort((a, b) => new Date(a.date) - new Date(b.date))
    : []

  // Determine buy price paise for chart
  let buyPricePaise = 0
  if (inv.asset_class === 'stocks')      buyPricePaise = inv.buy_price_paise || 0
  if (inv.asset_class === 'mutual_fund') buyPricePaise = inv.purchase_nav_paise || 0
  if (inv.asset_class === 'gold')        buyPricePaise = inv.buy_price_per_gram_paise || 0

  return (
    <div className="space-y-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

      {/* ── Core metrics ──────────────────────────────────────────────── */}
      <div className="space-y-0">
        <MetricRow label="Invested" value={formatINRCompact(inv._invested_paise)} mono />
        <MetricRow label="Current Value" value={formatINRCompact(inv._current_value_paise)} mono />
        <MetricRow
          label={isGain ? 'Gain' : 'Loss'}
          value={`${isGain ? '+' : '−'}${formatINRCompact(Math.abs(inv._gain_loss_paise))} (${isGain ? '+' : ''}${inv._gain_loss_pct.toFixed(2)}%)`}
          valueColor={isGain ? 'text-emerald-400' : 'text-red-400'}
          mono
        />
        <MetricRow
          label="Holding Period"
          value={holdingStr(inv._holding_period_days)}
        />
        {inv._holding_period_days > 30 && (
          <MetricRow
            label="Annualized Return (approx.)"
            value={`${inv._annualized_return >= 0 ? '+' : ''}${inv._annualized_return.toFixed(2)}% p.a.`}
            valueColor={inv._annualized_return >= 0 ? 'text-emerald-400' : 'text-red-400'}
            mono
          />
        )}
      </div>

      {/* ── Asset-class specifics ──────────────────────────────────────── */}
      {validKV.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {validKV.map(([label, value]) => (
            <div key={label} className="py-1">
              <p className="text-[9px] text-white/25 leading-none mb-0.5">{label}</p>
              <p className="text-[11px] text-white/60 font-numeric leading-tight">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── FD maturity countdown ──────────────────────────────────────── */}
      {inv.asset_class === 'fd' && <FDMaturityPanel inv={inv} />}

      {/* ── PPF/NPS projection ────────────────────────────────────────── */}
      {inv.asset_class === 'ppf_nps' && <PPFProjectionTable inv={inv} />}

      {/* ── Price history chart (stocks / MF / gold) ──────────────────── */}
      {['stocks', 'mutual_fund', 'gold'].includes(inv.asset_class) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
              Price History
              {historyForChart.length > 0 && (
                <span className="ml-1.5 text-white/20 normal-case">
                  {historyForChart.length} data point{historyForChart.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
            {canUpdate && onUpdatePrice && (
              <button
                onClick={() => onUpdatePrice(inv)}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors hover:opacity-80"
                style={{ color: meta.color, background: `${meta.color}15` }}
              >
                + Log Price
              </button>
            )}
          </div>
          <PriceHistoryChart
            history={historyForChart}
            buyPricePaise={buyPricePaise}
            buyDateStr={inv._buy_date_str}
            accentColor={meta.color}
          />
        </div>
      )}

    </div>
  )
}
