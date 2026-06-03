/**
 * DiversificationChart — two-panel analysis:
 *   Left:  Sector breakdown donut (stocks only, grouped by inv.sector)
 *   Right: Portfolio risk breakdown by asset class with risk labels
 *
 * No live data. All risk scores are hardcoded.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Risk meta per asset class ────────────────────────────────────────────────

const RISK_META = {
  stocks:      { label: 'High Risk',    score: 3, color: '#EF4444' },
  mutual_fund: { label: 'Medium Risk',  score: 2, color: '#F59E0B' },
  gold:        { label: 'Medium Risk',  score: 2, color: '#F59E0B' },
  real_estate: { label: 'Low-Med Risk', score: 1.5, color: '#06B6D4' },
  fd:          { label: 'Low Risk',     score: 1, color: '#10B981' },
  ppf_nps:     { label: 'Low Risk',     score: 1, color: '#10B981' },
}

// ─── Sector colors ────────────────────────────────────────────────────────────

const SECTOR_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#94A3B8',
]

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function SimpleTooltip({ active, payload, type }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#1C1B29',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 11,
    }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{d.name}</p>
      <p style={{ color: '#fff', fontWeight: 700 }}>{d.pct}%</p>
      {type === 'risk' && d.riskLabel && (
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{d.riskLabel}</p>
      )}
      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{formatINRCompact(d.value)}</p>
    </div>
  )
}

// ─── Sector donut ─────────────────────────────────────────────────────────────

function SectorDonut({ sectorAllocation, stocksTotal }) {
  if (!sectorAllocation.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[10px] text-white/20 text-center leading-relaxed px-2">
          {stocksTotal === 0
            ? 'No stocks tracked'
            : 'Add sector tags to your stock holdings to see breakdown'}
        </p>
      </div>
    )
  }

  const data = sectorAllocation.map((s, i) => ({
    name:  s.sector,
    value: s.value_paise,
    pct:   s.pct,
    fill:  SECTOR_COLORS[i % SECTOR_COLORS.length],
  }))

  // Check concentration warning
  const topSector    = data[0]
  const concentrated = topSector && topSector.pct >= 40

  return (
    <div className="h-full flex flex-col gap-2">
      <div style={{ height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
            >
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<SimpleTooltip type="sector" />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1 flex-1 overflow-y-auto" style={{ maxHeight: 80 }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
              <span className="text-[10px] text-white/50 truncate">{d.name}</span>
            </div>
            <span className="text-[10px] text-white/40 flex-shrink-0">{d.pct}%</span>
          </div>
        ))}
        {data.length > 5 && (
          <p className="text-[9px] text-white/20">+{data.length - 5} more sectors</p>
        )}
      </div>

      {concentrated && (
        <p className="text-[9px] leading-snug" style={{ color: '#F59E0B' }}>
          ⚠ {topSector.pct}% of your stocks are in {topSector.name} — consider diversifying
        </p>
      )}
    </div>
  )
}

// ─── Risk donut ───────────────────────────────────────────────────────────────

function RiskDonut({ assetAllocation, portfolioRiskLabel, highRiskPct }) {
  if (!assetAllocation.length) return null

  const data = assetAllocation.map((a) => {
    const rm = RISK_META[a.asset_class] || { label: 'Medium Risk', color: '#94A3B8' }
    return {
      name:      a.asset_class.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value:     a.value_paise,
      pct:       a.pct,
      riskLabel: rm.label,
      fill:      rm.color,
    }
  })

  const riskColor =
    portfolioRiskLabel === 'Aggressive' ? '#EF4444' :
    portfolioRiskLabel === 'Balanced'   ? '#F59E0B' : '#10B981'

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="relative" style={{ height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
            >
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<SimpleTooltip type="risk" />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] text-white/25">Risk</p>
          <p className="text-[11px] font-bold" style={{ color: riskColor }}>
            {portfolioRiskLabel}
          </p>
        </div>
      </div>

      {/* Risk legend */}
      <div className="space-y-1 flex-1 overflow-y-auto" style={{ maxHeight: 80 }}>
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
              <span className="text-[10px] text-white/50 truncate">{d.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[9px] text-white/25">{d.riskLabel}</span>
              <span className="text-[10px] text-white/40">{d.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-white/30 leading-snug">
        {highRiskPct > 0 ? `${highRiskPct}% in high-risk assets` : 'Conservative allocation'}
      </p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DiversificationChart({
  sectorAllocation,
  assetAllocation,
  portfolioRiskLabel,
  highRiskPct,
  enrichedInvestments,
}) {
  const stocksTotal = (enrichedInvestments || [])
    .filter((i) => i.asset_class === 'stocks')
    .reduce((s, i) => s + i._current_value_paise, 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Sector breakdown */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
            Stock Sectors
          </p>
          <div style={{ height: 220 }}>
            <SectorDonut sectorAllocation={sectorAllocation || []} stocksTotal={stocksTotal} />
          </div>
        </div>

        {/* Right: Risk profile */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
            Risk Profile
          </p>
          <div style={{ height: 220 }}>
            <RiskDonut
              assetAllocation={assetAllocation || []}
              portfolioRiskLabel={portfolioRiskLabel || 'Balanced'}
              highRiskPct={highRiskPct || 0}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
