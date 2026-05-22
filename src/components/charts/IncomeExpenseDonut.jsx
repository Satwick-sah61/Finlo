// NEW — src/components/charts/IncomeExpenseDonut.jsx
import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { toMonthlyPaise, EXPENSE_CATEGORIES, getCategoryMeta } from '../../utils/finance.js'
import { formatINRFromPaise, formatINRCompact } from '../../utils/currency.js'

const INCOME_COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#3B82F6', '#EC4899', '#F59E0B', '#10B981', '#94A3B8']

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '8px 12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value, pct } = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 3 }}>{name}</p>
      <p style={{ color: 'white', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
        {formatINRFromPaise(value)}
      </p>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>{pct}% of total</p>
    </div>
  )
}

export default function IncomeExpenseDonut({ incomeStreams, summary }) {
  const [activeOuter, setActiveOuter] = useState(null)
  const [activeInner, setActiveInner] = useState(null)
  const { totalMonthlyIncomePaise, totalMonthlyExpensesPaise, surplusPaise, expenseByCategory } = summary

  const hasData = totalMonthlyIncomePaise > 0 || totalMonthlyExpensesPaise > 0

  // Outer ring: one slice per income stream
  const incomeData = incomeStreams
    .map((s) => ({
      name: s.name ?? 'Unnamed',
      value: toMonthlyPaise(Number(s.amount) || 0, s.frequency),
    }))
    .filter((d) => d.value > 0)
    .map((d) => ({
      ...d,
      pct: totalMonthlyIncomePaise > 0 ? Math.round((d.value / totalMonthlyIncomePaise) * 100) : 0,
    }))

  // Inner ring: one slice per expense category with spend > 0
  const expenseData = EXPENSE_CATEGORIES
    .filter((cat) => (expenseByCategory[cat.id] ?? 0) > 0)
    .map((cat) => ({
      name: cat.label,
      value: expenseByCategory[cat.id],
      color: cat.barColor,
      pct: totalMonthlyExpensesPaise > 0
        ? Math.round((expenseByCategory[cat.id] / totalMonthlyExpensesPaise) * 100)
        : 0,
    }))

  // Insight: largest expense category vs income
  const topExpense = expenseData.sort((a, b) => b.value - a.value)[0]
  const insight = topExpense && totalMonthlyIncomePaise > 0
    ? `Largest expense: ${topExpense.name} at ${Math.round((topExpense.value / totalMonthlyIncomePaise) * 100)}% of income`
    : hasData
    ? 'Add expenses to see how your spending breaks down'
    : null

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
        <div className="w-24 h-24 rounded-full border-4 border-dashed border-white/10 flex items-center justify-center">
          <span className="text-2xl opacity-30">₹</span>
        </div>
        <p className="text-xs text-white/30 text-center">Add income and expenses to see this chart</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Donut */}
      <div className="relative" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DonutTooltip />} />
            {/* Outer ring: income streams */}
            {incomeData.length > 0 && (
              <Pie
                data={incomeData}
                cx="50%"
                cy="50%"
                outerRadius={110}
                innerRadius={84}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, i) => setActiveOuter(i)}
                onMouseLeave={() => setActiveOuter(null)}
                onClick={(_, i) => setActiveOuter(activeOuter === i ? null : i)}
                strokeWidth={2}
                stroke="#0F0E17"
              >
                {incomeData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={INCOME_COLORS[i % INCOME_COLORS.length]}
                    opacity={activeOuter === null || activeOuter === i ? 0.85 : 0.25}
                  />
                ))}
              </Pie>
            )}
            {/* Inner ring: expense categories */}
            {expenseData.length > 0 && (
              <Pie
                data={expenseData}
                cx="50%"
                cy="50%"
                outerRadius={76}
                innerRadius={54}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, i) => setActiveInner(i)}
                onMouseLeave={() => setActiveInner(null)}
                onClick={(_, i) => setActiveInner(activeInner === i ? null : i)}
                strokeWidth={2}
                stroke="#0F0E17"
              >
                {expenseData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeInner === null || expenseData.indexOf(entry) === activeInner ? 0.8 : 0.2}
                  />
                ))}
              </Pie>
            )}
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — surplus */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ gap: 1 }}
        >
          <p className="text-[10px] text-white/35 uppercase tracking-widest">
            {surplusPaise >= 0 ? 'Surplus' : 'Deficit'}
          </p>
          <p className={`text-lg font-bold font-numeric leading-tight ${surplusPaise >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatINRCompact(Math.abs(surplusPaise))}
          </p>
        </div>
      </div>

      {/* Custom legend: two columns */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-0 border-t border-white/5 pt-3">
        <div>
          <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Income</p>
          <div className="space-y-1">
            {incomeData.slice(0, 4).map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: INCOME_COLORS[i % INCOME_COLORS.length] }}
                />
                <span className="text-[11px] text-white/50 truncate">{d.name}</span>
              </div>
            ))}
            {incomeData.length > 4 && (
              <p className="text-[10px] text-white/25">+{incomeData.length - 4} more</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Expenses</p>
          <div className="space-y-1">
            {expenseData.slice(0, 4).map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="text-[11px] text-white/50 truncate">{d.name}</span>
              </div>
            ))}
            {expenseData.length > 4 && (
              <p className="text-[10px] text-white/25">+{expenseData.length - 4} more</p>
            )}
          </div>
        </div>
      </div>

      {insight && (
        <p className="text-xs text-white/40 border-t border-white/5 pt-3">{insight}</p>
      )}
    </div>
  )
}
