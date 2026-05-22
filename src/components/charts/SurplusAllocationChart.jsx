import { useState } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { differenceInCalendarMonths } from 'date-fns'
import { getGoalTypeMeta } from '../../utils/goalStatus.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Data builder ─────────────────────────────────────────────────────────────

function buildSlices(goals, surplusPaise) {
  const now = new Date()
  const slices = goals
    .filter((g) => {
      const saved = Number(g.saved_amount) || 0
      const target = Number(g.target_amount) || 0
      return saved < target && g.status !== 'Completed' && g.status !== 'Draft' && target > 0
    })
    .map((g) => {
      const saved = Number(g.saved_amount) || 0
      const target = Number(g.target_amount) || 0
      const remaining = Math.max(0, target - saved)
      let months = 12
      try { months = Math.max(1, differenceInCalendarMonths(new Date(g.deadline), now)) } catch {}
      const required = Math.ceil(remaining / months)
      const meta = getGoalTypeMeta(g.type)
      return { name: g.name, value: required, color: meta.accent, icon: meta.icon, priority: g.priority }
    })

  const totalGoals = slices.reduce((s, x) => s + x.value, 0)
  const free = Math.max(0, surplusPaise - totalGoals)
  const over = Math.max(0, totalGoals - surplusPaise)

  const data = [...slices]
  if (free > 0) data.push({ name: 'Free money', value: free, color: '#22C55E', icon: '💰' })
  if (over > 0) data.push({ name: 'Over budget', value: over, color: '#EF4444', icon: '⚠️' })

  const total = Math.max(surplusPaise, totalGoals)
  return { data, totalGoals, free, over, total }
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function SliceTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl" style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="font-semibold text-white mb-0.5">{d.icon} {d.name}</p>
      <p className="font-numeric" style={{ color: d.color }}>{formatINRCompact(d.value)}/mo · {pct}%</p>
    </div>
  )
}

// ─── Donut view ───────────────────────────────────────────────────────────────

function DonutView({ data, total, free, over }) {
  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={88} paddingAngle={2} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip content={<SliceTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Free</p>
          <p className={`text-lg font-bold font-numeric ${over > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatINRCompact(free > 0 ? free : over)}
          </p>
        </div>
      </div>
      <Legend data={data} total={total} />
    </div>
  )
}

// ─── Horizontal bar view ──────────────────────────────────────────────────────

function BarView({ data, total }) {
  const height = Math.max(160, data.length * 42)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ left: 4, right: 64, top: 4, bottom: 4 }}>
        <XAxis type="number" hide domain={[0, total]} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.length > 14 ? v.slice(0, 13) + '…' : v}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}
          label={{ position: 'right', formatter: (v) => formatINRCompact(v), fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
        <Tooltip content={<SliceTooltip total={total} />} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Strip view ───────────────────────────────────────────────────────────────

function StripView({ data, total }) {
  return (
    <div className="space-y-5">
      {/* Segmented strip */}
      <div className="h-9 flex rounded-xl overflow-hidden gap-0.5">
        {data.map((entry, i) => {
          const pct = total > 0 ? (entry.value / total) * 100 : 0
          return (
            <div
              key={i}
              title={`${entry.icon} ${entry.name}: ${formatINRCompact(entry.value)}/mo`}
              className="h-full transition-all duration-500 relative group cursor-default"
              style={{ width: `${pct}%`, minWidth: pct > 0 ? 4 : 0, background: entry.color }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-sm">{entry.icon}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* Legend grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.map((entry, i) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <div className="min-w-0">
                <p className="text-[11px] text-white/50 truncate">{entry.icon} {entry.name}</p>
                <p className="text-xs font-numeric font-semibold" style={{ color: entry.color }}>
                  {formatINRCompact(entry.value)}<span className="text-white/25 font-normal text-[10px]">/mo · {pct}%</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shared legend ────────────────────────────────────────────────────────────

function Legend({ data, total }) {
  return (
    <div className="flex-1 space-y-2 min-w-0">
      {data.map((entry, i) => {
        const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
        return (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="text-xs text-white/50 truncate">{entry.icon} {entry.name}</span>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xs font-numeric font-semibold" style={{ color: entry.color }}>
                {formatINRCompact(entry.value)}
              </span>
              <span className="text-[10px] text-white/25 ml-1">{pct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Chart type toggle ────────────────────────────────────────────────────────

const TYPES = [
  { id: 'donut', label: '🍩 Donut' },
  { id: 'bar',   label: '📊 Bars' },
  { id: 'strip', label: '▬ Strip' },
]

export function SurplusAllocationToggle({ chartType, setChartType }) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/8">
      {TYPES.map((t) => (
        <button
          key={t.id}
          onClick={() => setChartType(t.id)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            chartType === t.id
              ? 'bg-indigo-600 text-white'
              : 'text-white/35 hover:text-white/60'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SurplusAllocationChart({ goals, surplusPaise, chartType }) {
  const { data, totalGoals, free, over, total } = buildSlices(goals, surplusPaise)

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-full text-sm text-white/20 py-10">
      Add goals to see your surplus breakdown
    </div>
  )

  if (chartType === 'bar') return <BarView data={data} total={total} />
  if (chartType === 'strip') return <StripView data={data} total={total} />
  return <DonutView data={data} total={total} free={free} over={over} />
}
