/**
 * BenchmarkComparison — compares user's portfolio annualized return
 * against hardcoded historical benchmark CAGRs.
 *
 * All benchmarks are approximate historical averages — no live data ever fetched.
 * Hardcoded constants only.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'

// ─── Benchmark constants (hardcoded, approximate historical averages) ──────────

const BENCHMARKS = [
  { id: 'nifty50',   label: 'Nifty 50',   cagr: 12, description: 'Large-cap Indian equity' },
  { id: 'gold',      label: 'Gold',        cagr: 8,  description: 'Physical/sovereign gold' },
  { id: 'fd',        label: 'FD Average',  cagr: 7,  description: 'Bank fixed deposits' },
  { id: 'inflation', label: 'Inflation',   cagr: 6,  description: 'Purchasing power erosion' },
]

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const isUser = d.id === 'portfolio'
  return (
    <div style={{
      background: '#1C1B29',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 11,
    }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
        {d.label}
        {!isUser && <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>({d.description})</span>}
      </p>
      <p style={{ color: d.barColor, fontWeight: 700 }}>
        {d.cagr >= 0 ? '' : ''}{d.cagr.toFixed(1)}% p.a.
      </p>
      {!isUser && (
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 2 }}>
          Approx. historical average
        </p>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BenchmarkComparison({ totalAnnualizedReturn, hasHistory }) {
  if (!hasHistory) {
    return (
      <div className="flex items-center justify-center h-32 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <p className="text-[11px] text-white/20 text-center leading-relaxed px-4">
          Log prices over 30+ days to see benchmark comparison
        </p>
      </div>
    )
  }

  const data = [
    {
      id:          'portfolio',
      label:       'Your Portfolio',
      description: '',
      cagr:        totalAnnualizedReturn,
      barColor:    totalAnnualizedReturn >= 12 ? '#10B981' : totalAnnualizedReturn >= 6 ? '#F59E0B' : '#EF4444',
    },
    ...BENCHMARKS.map((b) => ({
      ...b,
      barColor: totalAnnualizedReturn >= b.cagr ? '#10B981' : '#EF4444',
    })),
  ]

  // Compare vs Nifty
  const nifty = BENCHMARKS[0]
  const vsNifty = totalAnnualizedReturn - nifty.cagr
  const insightColor = vsNifty >= 0 ? '#10B981' : '#EF4444'
  const insightText = vsNifty >= 0
    ? `Your portfolio is returning ${totalAnnualizedReturn.toFixed(1)}% p.a. — beating Nifty 50 by ${vsNifty.toFixed(1)}%`
    : `Your portfolio is returning ${totalAnnualizedReturn.toFixed(1)}% p.a. — lagging Nifty 50 by ${Math.abs(vsNifty).toFixed(1)}%`

  return (
    <div className="space-y-3">
      {/* Insight headline */}
      <p className="text-xs leading-relaxed" style={{ color: insightColor }}>
        {insightText}
      </p>

      {/* Bar chart */}
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={entry.id}
                  fill={i === 0 ? '#6366F1' : entry.barColor}
                  fillOpacity={i === 0 ? 1 : 0.65}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[9px] text-white/20 leading-snug">
        ⓘ Benchmark returns are approximate historical averages, not guaranteed future returns.
        Your return is calculated from logged price data using a simple XIRR approximation.
      </p>
    </div>
  )
}
