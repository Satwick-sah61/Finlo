// NEW — src/components/charts/ExpenseBreakdownPie.jsx
import { useState } from 'react'
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts'
import { EXPENSE_CATEGORIES } from '../../utils/finance.js'
import { formatINRFromPaise, formatINRCompact } from '../../utils/currency.js'

function ActiveShape(props) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, value, percent,
  } = props

  return (
    <g>
      {/* Expanded slice */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.9}
      />
      {/* Outer accent ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 13}
        outerRadius={outerRadius + 15}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      {/* Center labels in donut hole */}
      <text
        x={cx} y={cy - 14}
        textAnchor="middle"
        fill="rgba(255,255,255,0.6)"
        fontSize={12}
        fontWeight={600}
        fontFamily="Inter, sans-serif"
      >
        {payload.emoji} {payload.name}
      </text>
      <text
        x={cx} y={cy + 6}
        textAnchor="middle"
        fill={fill}
        fontSize={16}
        fontWeight={700}
        fontFamily="monospace"
      >
        {formatINRCompact(value)}
      </text>
      <text
        x={cx} y={cy + 22}
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize={11}
        fontFamily="Inter, sans-serif"
      >
        {(percent * 100).toFixed(0)}% of spending
      </text>
    </g>
  )
}

export default function ExpenseBreakdownPie({ summary }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const { expenseByCategory, totalMonthlyExpensesPaise } = summary

  const data = EXPENSE_CATEGORIES
    .filter((cat) => (expenseByCategory[cat.id] ?? 0) > 0)
    .map((cat) => ({
      name: cat.label,
      emoji: cat.emoji,
      value: expenseByCategory[cat.id],
      color: cat.barColor,
    }))
    .sort((a, b) => b.value - a.value)

  const hasData = data.length > 0

  // Insight: top 2 categories as % of total spend
  let insight = null
  if (data.length >= 2) {
    const top2Sum = data[0].value + data[1].value
    const top2Pct = totalMonthlyExpensesPaise > 0
      ? Math.round((top2Sum / totalMonthlyExpensesPaise) * 100)
      : 0
    insight = `${data[0].name} + ${data[1].name} account for ${top2Pct}% of your spending`
  } else if (data.length === 1) {
    insight = `All spending is in ${data[0].name} this month`
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
        <div className="w-24 h-24 rounded-full border-4 border-dashed border-white/10 flex items-center justify-center">
          <span className="text-2xl opacity-30">🧾</span>
        </div>
        <p className="text-xs text-white/30 text-center">Add expenses to see your spending breakdown</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div style={{ height: 256 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={64}
              outerRadius={100}
              dataKey="value"
              activeIndex={activeIndex}
              activeShape={ActiveShape}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              startAngle={90}
              endAngle={-270}
              strokeWidth={2}
              stroke="#0F0E17"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} opacity={0.8} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category list */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-white/5 pt-3">
        {data.map((d, i) => {
          const pct = totalMonthlyExpensesPaise > 0
            ? Math.round((d.value / totalMonthlyExpensesPaise) * 100)
            : 0
          return (
            <button
              key={d.name}
              onClick={() => setActiveIndex(i)}
              className={`flex items-center gap-1.5 text-left rounded-lg px-2 py-1 transition-all ${
                activeIndex === i ? 'bg-white/5' : 'hover:bg-white/3'
              }`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[11px] text-white/55 truncate flex-1">{d.name}</span>
              <span className="text-[11px] text-white/35 font-numeric flex-shrink-0">{pct}%</span>
            </button>
          )
        })}
      </div>

      {insight && (
        <p className="text-xs text-white/40 border-t border-white/5 pt-3">{insight}</p>
      )}
    </div>
  )
}
