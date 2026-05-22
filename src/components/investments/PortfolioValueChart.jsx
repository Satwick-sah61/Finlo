/**
 * PortfolioValueChart — AreaChart of total portfolio value over time.
 *
 * Two lines:
 *   Invested (blue/indigo) — cumulative capital deployed, steps up at each buy date
 *   Current Value (green/red) — estimated market value at each monthly snapshot
 *
 * Value estimation per asset class:
 *   stocks / mutual_fund / gold  → interpolate from price_history (or linear if none)
 *   fd                           → FD accrual formula at that date
 *   ppf_nps / real_estate        → flat from buy date at current value
 *
 * Props:
 *   enrichedInvestments – from useInvestments()
 */
import { useMemo } from 'react'
import { format, addMonths, startOfMonth, differenceInMonths, isBefore, isAfter } from 'date-fns'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'
import { computeFDCurrentValue } from '../../hooks/useInvestments.js'

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '10px 14px',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBuyDate(inv) {
  const raw = inv.buy_date || inv.start_date || inv.purchase_date || inv.account_opening_date
  return raw ? new Date(raw) : null
}

function getInvestedPaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':
      return Math.round((Number(inv.quantity) || 0) * (inv.buy_price_paise || 0))
    case 'mutual_fund':
      return Math.round((Number(inv.units) || 0) * (inv.purchase_nav_paise || 0))
    case 'fd':
      return inv.principal_paise || 0
    case 'ppf_nps': {
      const open  = inv.account_opening_date ? new Date(inv.account_opening_date) : new Date()
      const years = Math.max(1, differenceInMonths(new Date(), open) / 12)
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

/**
 * Returns the estimated value of one investment at a given date (Date object).
 * Uses price_history for interpolation where available; falls back to buy price.
 */
function valueAtDate(inv, atDate) {
  const buyDate = getBuyDate(inv)
  if (!buyDate || isBefore(atDate, buyDate)) return 0

  switch (inv.asset_class) {
    case 'stocks': {
      const price = priceAtDate(inv.price_history, atDate) ?? inv.current_price_paise ?? inv.buy_price_paise ?? 0
      return Math.round((Number(inv.quantity) || 0) * price)
    }
    case 'mutual_fund': {
      const nav = priceAtDate(inv.price_history, atDate) ?? inv.current_nav_paise ?? inv.purchase_nav_paise ?? 0
      return Math.round((Number(inv.units) || 0) * nav)
    }
    case 'gold': {
      const price = priceAtDate(inv.price_history, atDate) ?? inv.current_price_per_gram_paise ?? inv.buy_price_per_gram_paise ?? 0
      return Math.round((Number(inv.quantity_grams) || 0) * price)
    }
    case 'fd': {
      // Compute FD accrual value at atDate
      const snapshot = { ...inv }
      // computeFDCurrentValue uses new Date() internally — we pass a modified record
      // with a fake "today" by computing days difference
      const started   = inv.start_date ? new Date(inv.start_date) : new Date()
      const elapsed   = Math.max(0, Math.floor((atDate - started) / (1000 * 60 * 60 * 24)))
      const tenure    = (Number(inv.tenure_months) || 12)
      const tenureDays = tenure * 30.4375
      const clampedDays = Math.min(elapsed, tenureDays)
      const rate = (Number(inv.interest_rate) || 0) / 100
      const principal = inv.principal_paise || 0
      if (inv.interest_type === 'simple') {
        return Math.round(principal * (1 + rate * (clampedDays / 365)))
      }
      const n = 4
      return Math.round(principal * Math.pow(1 + rate / n, n * (clampedDays / 365)))
    }
    case 'ppf_nps':
      // Approximate: linear from 0 at open date to current corpus at today
      return inv.current_corpus_paise || 0
    case 'real_estate':
      // Flat at current estimate
      return inv.current_estimated_value_paise || inv.purchase_price_paise || 0
    default:
      return 0
  }
}

/**
 * Find the latest price in price_history at or before atDate.
 * Returns null if no entries exist before atDate.
 */
function priceAtDate(history, atDate) {
  if (!Array.isArray(history) || !history.length) return null
  const sorted  = [...history]
    .filter((h) => h.date && !isAfter(new Date(h.date), atDate))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  return sorted.length > 0 ? sorted[0].price : null
}

// ─── Chart data builder ───────────────────────────────────────────────────────

function buildChartData(investments) {
  if (!investments.length) return []

  const buyDates = investments.map(getBuyDate).filter(Boolean)
  if (!buyDates.length) return []

  const earliest = new Date(Math.min(...buyDates.map((d) => d.getTime())))
  const today    = new Date()
  const monthCount = differenceInMonths(today, earliest) + 1

  if (monthCount <= 0) return []

  // Cap at 60 months for performance
  const cappedCount = Math.min(monthCount, 60)
  const startMonth  = cappedCount < monthCount
    ? startOfMonth(addMonths(today, -(cappedCount - 1)))
    : startOfMonth(earliest)

  const points = []
  for (let i = 0; i < cappedCount; i++) {
    const monthDate = startOfMonth(addMonths(startMonth, i))
    const label     = format(monthDate, 'MMM yy')

    // Cumulative invested: sum invested for investments bought on or before this month
    const invested = investments.reduce((s, inv) => {
      const buyDate = getBuyDate(inv)
      return buyDate && !isAfter(buyDate, monthDate) ? s + getInvestedPaise(inv) : s
    }, 0)

    // Estimated portfolio value
    const value = investments.reduce((s, inv) => s + valueAtDate(inv, monthDate), 0)

    points.push({ month: i, label, invested, value })
  }

  return points
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const invested = payload.find((p) => p.dataKey === 'invested')?.value ?? 0
  const value    = payload.find((p) => p.dataKey === 'value')?.value ?? 0
  const gain     = value - invested
  const isUp     = gain >= 0

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Invested</span>
          <span style={{ color: '#6366F1', fontSize: 12, fontWeight: 700 }}>
            {formatINRCompact(invested)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Value</span>
          <span style={{ color: isUp ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: 700 }}>
            {formatINRCompact(value)}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-6 pt-1 mt-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            {isUp ? 'Gain' : 'Loss'}
          </span>
          <span style={{ color: isUp ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: 700 }}>
            {isUp ? '+' : '−'}{formatINRCompact(Math.abs(gain))}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PortfolioValueChart({ enrichedInvestments = [] }) {
  const chartData = useMemo(
    () => buildChartData(enrichedInvestments),
    [enrichedInvestments]
  )

  if (!enrichedInvestments.length) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-white/30">No investments to chart</p>
      </div>
    )
  }

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-white/30">Add investments over multiple months to see trends</p>
      </div>
    )
  }

  const hasNoPriceHistory = enrichedInvestments.some(
    (inv) => ['stocks', 'mutual_fund', 'gold'].includes(inv.asset_class) &&
              (!Array.isArray(inv.price_history) || inv.price_history.length < 2)
  )

  const tick = { fill: 'rgba(255,255,255,0.3)', fontSize: 10 }

  return (
    <div className="space-y-3">
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="valueGradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={tick}
              axisLine={false}
              tickLine={false}
              dy={4}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => formatINRCompact(v)}
              tick={tick}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
            {/* Invested: flat step line in indigo */}
            <Area
              type="stepAfter"
              dataKey="invested"
              name="Invested"
              stroke="#6366F1"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="url(#investedGrad)"
              dot={false}
            />
            {/* Current value: smooth area in green */}
            <Area
              type="monotone"
              dataKey="value"
              name="Value"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#valueGradGreen)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 rounded-full bg-indigo-500 opacity-70" style={{ borderTop: '2px dashed #6366F1' }} />
          <span className="text-[10px] text-white/40">Invested</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-white/40">Portfolio Value</span>
        </div>
      </div>

      {hasNoPriceHistory && (
        <p className="text-[10px] text-white/25 text-center leading-snug">
          ⓘ Value trend is estimated for assets without price history — use "Update Price" to log actual prices
        </p>
      )}
    </div>
  )
}
