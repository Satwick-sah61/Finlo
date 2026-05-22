// NEW — src/components/charts/SavingsRateTrend.jsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

function SavingsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const rate = d.savingsRate
  const surplus = d.surplus

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 5 }}>{label}</p>
      <p style={{
        color: rate >= 20 ? '#22C55E' : rate >= 10 ? '#F59E0B' : '#EF4444',
        fontSize: 15,
        fontWeight: 700,
        fontFamily: 'monospace',
      }}>
        {rate}% savings rate
      </p>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 }}>
        Surplus: {surplus >= 0 ? '' : '-'}{formatINRCompact(Math.abs(surplus))}
      </p>
    </div>
  )
}

function RefLineLabel({ viewBox, value }) {
  return (
    <text
      x={viewBox.width + viewBox.x + 2}
      y={viewBox.y + 4}
      fill="#F59E0B"
      fontSize={10}
      fontFamily="Inter, sans-serif"
    >
      {value}
    </text>
  )
}

export default function SavingsRateTrend({ monthlyHistory }) {
  // Only plot months where the user has actually logged expenses (+ current month).
  const activeMonths = monthlyHistory.filter((m, i) => {
    const isCurrent = i === monthlyHistory.length - 1
    return isCurrent || m.hasExpenses
  })

  const chartData = activeMonths.map((m) => ({
    label: m.label,
    savingsRate: m.income > 0 ? Math.round((m.surplus / m.income) * 100) : 0,
    surplus: m.surplus,
    income: m.income,
  }))

  const withIncome = chartData.filter((d) => d.income > 0)
  const hasData = activeMonths.length >= 2

  // Insight: trend direction over the period
  let insight = null
  if (withIncome.length >= 2) {
    const first = withIncome[0].savingsRate
    const last = withIncome.at(-1).savingsRate
    const delta = last - first
    const direction = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'stayed stable'
    insight = delta === 0
      ? `Savings rate has stayed stable at ${last}% over ${withIncome.length} months`
      : `Savings rate ${direction} by ${Math.abs(delta)} percentage points over ${withIncome.length} months`
  } else if (withIncome.length === 1) {
    insight = `Current savings rate: ${withIncome[0].savingsRate}%. Add more months to see a trend.`
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
        <div className="flex items-end gap-1 opacity-20">
          {[30, 45, 35, 55, 50, 65].map((h, i) => (
            <div key={i} className="w-1.5 bg-indigo-400 rounded-full" style={{ height: h }} />
          ))}
        </div>
        <p className="text-xs text-white/30 text-center">Log expenses for at least 2 months to see your savings rate trend</p>
      </div>
    )
  }

  const tickStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11 }
  const allRates = chartData.map((d) => d.savingsRate)
  const minRate = Math.min(...allRates, 0)
  const maxRate = Math.max(...allRates, 25)
  const yDomain = [Math.floor(minRate / 10) * 10 - 5, Math.ceil(maxRate / 10) * 10 + 5]

  return (
    <div className="space-y-3">
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={38}
              domain={yDomain}
            />
            <Tooltip content={<SavingsTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />

            {/* 20% reference line — "recommended minimum" */}
            <ReferenceLine
              y={20}
              stroke="#F59E0B"
              strokeDasharray="5 4"
              strokeOpacity={0.6}
              label={<RefLineLabel value="20% min" />}
            />
            {/* Zero line */}
            {minRate < 0 && (
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            )}

            <Area
              type="monotone"
              dataKey="savingsRate"
              stroke="#6366F1"
              strokeWidth={2.5}
              fill="url(#savingsGrad)"
              dot={{
                fill: '#6366F1',
                stroke: '#0F0E17',
                strokeWidth: 2,
                r: 4,
              }}
              activeDot={{
                r: 6,
                fill: '#0F0E17',
                stroke: '#6366F1',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {insight && (
        <p className="text-xs text-white/40 border-t border-white/5 pt-3">{insight}</p>
      )}
    </div>
  )
}
