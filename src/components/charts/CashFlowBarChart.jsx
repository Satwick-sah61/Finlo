// NEW — src/components/charts/CashFlowBarChart.jsx
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Brush, ResponsiveContainer, Legend,
} from 'recharts'
import { formatINRFromPaise, formatINRCompact } from '../../utils/currency.js'

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p]))
  const income = byKey.income?.value ?? 0
  const expenses = byKey.expenses?.value ?? 0
  const surplus = byKey.surplus?.value ?? 0

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Row color="#6366F1" label="Income" value={income} />
        <Row color="#8B5CF6" label="Expenses" value={expenses} />
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 3, paddingTop: 5 }}>
          <Row color={surplus >= 0 ? '#22C55E' : '#EF4444'} label={surplus >= 0 ? 'Surplus' : 'Deficit'} value={Math.abs(surplus)} />
        </div>
      </div>
    </div>
  )
}

function Row({ color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, flex: 1 }}>{label}</span>
      <span style={{ color: 'white', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
        {formatINRCompact(value)}
      </span>
    </div>
  )
}

export default function CashFlowBarChart({ monthlyHistory }) {
  // Only plot the current month + past months where the user actually logged expenses.
  // This prevents ghost bars where income is retroactively applied but no activity exists.
  const activeMonths = monthlyHistory.filter((m, i) => {
    const isCurrent = i === monthlyHistory.length - 1
    return isCurrent || m.hasExpenses
  })

  const hasData = activeMonths.length >= 2

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
        <div className="flex gap-2 items-end">
          {[3, 5, 4, 6, 4, 7].map((h, i) => (
            <div key={i} className="w-6 rounded-t bg-white/8" style={{ height: h * 6 }} />
          ))}
        </div>
        <p className="text-xs text-white/30 text-center mt-3">
          Log expenses for at least 2 months to see your cash flow history
        </p>
      </div>
    )
  }

  const chartData = activeMonths.map((m) => ({
    label: m.label,
    income: m.income,
    expenses: m.expenses,
    surplus: m.surplus,
  }))

  // Insight: best month by surplus
  const withIncome = activeMonths.filter((m) => m.income > 0)
  const bestMonth = withIncome.length > 0
    ? withIncome.reduce((best, m) => (m.surplus > best.surplus ? m : best), withIncome[0])
    : null
  const worstMonth = withIncome.length > 0
    ? withIncome.reduce((worst, m) => (m.surplus < worst.surplus ? m : worst), withIncome[0])
    : null
  const insight = bestMonth
    ? bestMonth.surplus >= 0
      ? `Best month: ${bestMonth.label} with ${formatINRCompact(bestMonth.surplus)} surplus`
      : `All months in deficit — review your income and expenses`
    : null

  const tickStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11 }

  return (
    <div className="space-y-3">
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.5} />
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
              tickFormatter={(v) => formatINRCompact(v)}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={58}
            />
            <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

            <Bar
              dataKey="income"
              name="Income"
              fill="url(#incomeBarGrad)"
              radius={[3, 3, 0, 0]}
              maxBarSize={36}
            />
            <Bar
              dataKey="expenses"
              name="Expenses"
              fill="url(#expenseBarGrad)"
              radius={[3, 3, 0, 0]}
              maxBarSize={36}
            />
            <Line
              type="monotone"
              dataKey="surplus"
              name="Surplus"
              stroke="#22C55E"
              strokeWidth={2}
              dot={{ fill: '#22C55E', stroke: '#0F0E17', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#22C55E', fill: '#0F0E17', strokeWidth: 2 }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

            <Brush
              dataKey="label"
              height={22}
              stroke="rgba(255,255,255,0.08)"
              fill="#13121F"
              travellerWidth={6}
              startIndex={0}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 border-t border-white/5 pt-3">
        <LegendDot color="#6366F1" label="Income" />
        <LegendDot color="#8B5CF6" label="Expenses" />
        <LegendDot color="#22C55E" label="Surplus" line />
      </div>

      {insight && <p className="text-xs text-white/40">{insight}</p>}
    </div>
  )
}

function LegendDot({ color, label, line }) {
  return (
    <div className="flex items-center gap-1.5">
      {line ? (
        <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      )}
      <span className="text-xs text-white/40">{label}</span>
    </div>
  )
}
