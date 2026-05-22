/**
 * AssetAllocationChart — PieChart showing portfolio allocation by asset class.
 *
 * Features:
 * - One slice per asset class, consistent colours
 * - Active shape on hover (enlarged with inner detail)
 * - Rebalancing annotation when any class is significantly off a balanced reference
 * - "Balanced" reference callout (60% equity, 30% debt, 10% alternatives)
 *
 * Props:
 *   assetAllocation  – from useInvestments: [{ asset_class, value_paise, pct }]
 *   currentValue     – total portfolio value in paise (for centre display)
 */
import { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector,
} from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Asset class metadata ─────────────────────────────────────────────────────

export const ASSET_META = {
  stocks:      { label: 'Stocks',        icon: '📈', color: '#6366F1' },
  mutual_fund: { label: 'Mutual Funds',  icon: '🔄', color: '#8B5CF6' },
  fd:          { label: 'Fixed Deposit', icon: '🏦', color: '#06B6D4' },
  ppf_nps:     { label: 'PPF / NPS',    icon: '🏛️', color: '#10B981' },
  gold:        { label: 'Gold',          icon: '🪙', color: '#F59E0B' },
  real_estate: { label: 'Real Estate',  icon: '🏠', color: '#F97316' },
  other:       { label: 'Other',         icon: '📋', color: '#6B7280' },
}

// Equity classes (for rebalancing insight)
const EQUITY_CLASSES  = new Set(['stocks', 'mutual_fund'])
const DEBT_CLASSES    = new Set(['fd', 'ppf_nps'])
const ALT_CLASSES     = new Set(['gold', 'real_estate'])

// ─── Active shape (hovered slice) ────────────────────────────────────────────

function ActiveShape(props) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, value, percent,
  } = props
  const meta = ASSET_META[payload.asset_class] || ASSET_META.other

  return (
    <g>
      <text x={cx} y={cy - 12} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={700}>
        {meta.icon} {meta.label}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={11}>
        {formatINRCompact(value)}
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill={fill} fontSize={12} fontWeight={700}>
        {Math.round(percent * 100)}%
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 16}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.4}
      />
    </g>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d    = payload[0]
  const meta = ASSET_META[d.payload.asset_class] || ASSET_META.other
  return (
    <div
      style={{
        background: '#1C1B29',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '8px 12px',
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>
        {meta.icon} {meta.label}
      </p>
      <p style={{ color: meta.color, fontSize: 13, fontWeight: 700 }}>
        {formatINRCompact(d.value)} · {Math.round(d.payload.pct)}%
      </p>
    </div>
  )
}

// ─── Rebalancing insight ──────────────────────────────────────────────────────

function RebalanceInsight({ assetAllocation }) {
  if (!assetAllocation.length) return null

  const equityPct = assetAllocation
    .filter((a) => EQUITY_CLASSES.has(a.asset_class))
    .reduce((s, a) => s + a.pct, 0)
  const debtPct = assetAllocation
    .filter((a) => DEBT_CLASSES.has(a.asset_class))
    .reduce((s, a) => s + a.pct, 0)
  const altPct = assetAllocation
    .filter((a) => ALT_CLASSES.has(a.asset_class))
    .reduce((s, a) => s + a.pct, 0)

  // Reference: balanced 60/30/10
  const TARGET = { equity: 60, debt: 30, alt: 10 }
  const issues = []

  if (Math.abs(equityPct - TARGET.equity) > 15) {
    issues.push(equityPct > TARGET.equity
      ? `Equity (${equityPct}%) is above the 60% balanced target — consider diversifying`
      : `Equity (${equityPct}%) is below the 60% balanced target — consider adding more`)
  }
  if (debtPct < 10 && assetAllocation.length >= 2) {
    issues.push(`Low debt allocation (${debtPct}%) — FDs/PPF add stability`)
  }
  if (altPct > 30) {
    issues.push(`Alternatives (gold + real estate at ${altPct}%) are high vs 10% reference`)
  }

  if (!issues.length) return null

  return (
    <div
      className="rounded-xl p-3 space-y-1"
      style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
    >
      <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
        ⚖️ Rebalancing Suggestion
      </p>
      {issues.map((msg, i) => (
        <p key={i} className="text-[11px] text-white/50 leading-snug">{msg}</p>
      ))}
      <p className="text-[10px] text-white/25 mt-1">
        Reference: Balanced investor — 60% equity, 30% debt, 10% alternatives
      </p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AssetAllocationChart({ assetAllocation = [], currentValue = 0 }) {
  const [activeIndex, setActiveIndex] = useState(null)

  if (!assetAllocation.length) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-white/30">No investments yet</p>
      </div>
    )
  }

  const chartData = assetAllocation.map((a) => ({
    ...a,
    value: a.value_paise,
    name:  (ASSET_META[a.asset_class] || ASSET_META.other).label,
  }))

  return (
    <div className="space-y-4">
      {/* Donut */}
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              dataKey="value"
              activeIndex={activeIndex}
              activeShape={<ActiveShape />}
              onMouseEnter={(_, idx) => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              strokeWidth={0}
            >
              {chartData.map((entry) => {
                const meta = ASSET_META[entry.asset_class] || ASSET_META.other
                return <Cell key={entry.asset_class} fill={meta.color} />
              })}
            </Pie>
            {activeIndex === null && (
              <text x="50%" y="48%" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={11}>
                Portfolio
              </text>
            )}
            {activeIndex === null && (
              <text x="50%" y="54%" textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700}>
                {formatINRCompact(currentValue)}
              </text>
            )}
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {assetAllocation.map((a) => {
          const meta = ASSET_META[a.asset_class] || ASSET_META.other
          return (
            <div
              key={a.asset_class}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: `${meta.color}0d`, border: `1px solid ${meta.color}20` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                <span className="text-[11px] text-white/60">{meta.icon} {meta.label}</span>
              </div>
              <span className="text-[11px] font-bold font-numeric" style={{ color: meta.color }}>
                {a.pct}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Rebalancing insight */}
      <RebalanceInsight assetAllocation={assetAllocation} />
    </div>
  )
}
