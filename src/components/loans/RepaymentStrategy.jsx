import { useState, useMemo } from 'react'
import { addMonths, format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { generateStrategies } from '../../utils/repaymentStrategy.js'
import { formatINRCompact } from '../../utils/currency.js'
import { configSet } from '../../db/schema.js'

// ─── Strategy metadata ────────────────────────────────────────────────────────

const STRATEGIES = [
  {
    key:   'avalanche',
    label: 'Avalanche',
    icon:  '🏔️',
    color: '#6366F1',
    desc:  'Highest rate first — minimizes total interest paid',
  },
  {
    key:   'snowball',
    label: 'Snowball',
    icon:  '⛄',
    color: '#06B6D4',
    desc:  'Smallest balance first — builds momentum with quick wins',
  },
  {
    key:   'hybrid',
    label: 'Hybrid',
    icon:  '⚡',
    color: '#F59E0B',
    desc:  "Finio's balanced approach — rate & balance weighted",
  },
]

// ─── Slider ───────────────────────────────────────────────────────────────────

function SimSlider({ label, value, min, max, step, onChange, display }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-xs font-bold text-indigo-300">{display}</span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full bg-white/10" />
        <div
          className="absolute h-1.5 rounded-full bg-indigo-500 transition-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-4"
        />
      </div>
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '8px 12px',
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 4 }}>{label}</p>
      {payload.map(p => {
        const meta = STRATEGIES.find(s => s.key === p.dataKey)
        return (
          <p key={p.dataKey} style={{ color: p.color, fontSize: 12, fontWeight: 700 }}>
            {meta?.label ?? p.dataKey}: {formatINRCompact(p.value)}
          </p>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {Array}  activeLoans      – enriched loans from useLoans
 * @param {number} totalMonthlyEMI  – total monthly EMI in paise
 */
export default function RepaymentStrategy({ activeLoans, totalMonthlyEMI }) {
  const [extraRupees,    setExtraRupees]    = useState(0)
  const [activeStrategy, setActiveStrategy] = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)

  const maxExtra   = Math.max(5000, Math.round((totalMonthlyEMI ?? 0) / 100 / 500) * 500)
  const extraPaise = extraRupees * 100

  const strategies = useMemo(
    () => activeLoans?.length ? generateStrategies(activeLoans, extraPaise) : null,
    [activeLoans, extraPaise]
  )

  // Merge snapshot data for chart (all 3 strategies share the same x-axis months)
  const chartData = useMemo(() => {
    if (!strategies || !activeLoans?.length) return []

    const totalStart = activeLoans.reduce((s, l) => s + (l._outstandingPaise ?? 0), 0)
    const byMonth = new Map()
    byMonth.set(0, { month: 0, label: 'Now', avalanche: totalStart, snowball: totalStart, hybrid: totalStart })

    for (const { key } of STRATEGIES) {
      const s = strategies[key]
      if (!s) continue
      for (const snap of s.snapshots) {
        const existing = byMonth.get(snap.month) ?? { month: snap.month, label: snap.label }
        existing[key] = snap.totalOutstanding
        byMonth.set(snap.month, existing)
      }
    }

    const sorted = [...byMonth.values()].sort((a, b) => a.month - b.month)

    // Forward-fill missing values
    for (let i = 1; i < sorted.length; i++) {
      for (const { key } of STRATEGIES) {
        if (sorted[i][key] === undefined) sorted[i][key] = sorted[i - 1][key] ?? 0
      }
    }

    return sorted
  }, [strategies, activeLoans])

  async function handleFollow() {
    if (!activeStrategy || saving) return
    setSaving(true)
    try {
      await configSet('repayment_plan', JSON.stringify({
        strategy:     activeStrategy,
        extraMonthly: extraPaise,
        savedAt:      new Date().toISOString(),
      }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('[RepaymentStrategy] save plan:', err)
    }
    setSaving(false)
  }

  if (!activeLoans?.length) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-white/30">No active loans to plan</p>
      </div>
    )
  }

  const recommended = strategies?.recommended

  return (
    <div className="space-y-5">

      {/* Extra payment slider */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
      >
        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
          Extra Monthly Payment
        </p>
        <SimSlider
          label="How much extra can you commit each month?"
          value={extraRupees}
          min={0}
          max={maxExtra}
          step={500}
          onChange={setExtraRupees}
          display={extraRupees === 0 ? 'No extra payment' : `+₹${extraRupees.toLocaleString('en-IN')}/mo`}
        />
        {extraRupees > 0 && strategies?.baseline && strategies?.avalanche && (
          <p className="text-[10px] text-indigo-300/60 mt-2">
            Best case saves {strategies.avalanche.monthsSaved} month{strategies.avalanche.monthsSaved !== 1 ? 's' : ''}{' '}
            and {formatINRCompact(strategies.avalanche.interestSaved)} in interest vs minimum payments
          </p>
        )}
      </div>

      {/* Strategy cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STRATEGIES.map(meta => {
          const s          = strategies?.[meta.key]
          const isRec      = recommended === meta.key
          const isSelected = activeStrategy === meta.key
          const debtFree   = s ? addMonths(new Date(), s.debtFreeMonth) : null

          return (
            <button
              key={meta.key}
              onClick={() => setActiveStrategy(prev => prev === meta.key ? null : meta.key)}
              className="relative text-left rounded-xl p-4 space-y-3 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: isSelected ? `${meta.color}15` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isSelected ? `${meta.color}40` : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              {isRec && (
                <div
                  className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white"
                  style={{ background: meta.color }}
                >
                  Recommended
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xl">{meta.icon}</span>
                <span className="text-sm font-semibold text-white">{meta.label}</span>
              </div>

              <p className="text-[10px] text-white/35 leading-relaxed">{meta.desc}</p>

              <div className="space-y-2 pt-2 border-t border-white/6">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/40">Debt-free</span>
                  <span className="text-[10px] font-semibold text-white">
                    {debtFree ? format(debtFree, 'MMM yyyy') : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/40">Total interest</span>
                  <span className="text-[10px] font-semibold text-red-400">
                    {s ? formatINRCompact(s.totalInterestPaid) : '—'}
                  </span>
                </div>
                {(s?.interestSaved ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40">Interest saved</span>
                    <span className="text-[10px] font-semibold text-emerald-400">
                      +{formatINRCompact(s.interestSaved)}
                    </span>
                  </div>
                )}
                {(s?.monthsSaved ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40">Months saved</span>
                    <span className="text-[10px] font-semibold text-emerald-400">
                      -{s.monthsSaved} mo
                    </span>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Payoff balance chart */}
      {chartData.length > 1 && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Outstanding Balance by Strategy
          </p>
          <div style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={4}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={v => formatINRCompact(v)}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                {STRATEGIES.map(meta => (
                  <Line
                    key={meta.key}
                    type="monotone"
                    dataKey={meta.key}
                    stroke={meta.color}
                    strokeWidth={activeStrategy === meta.key ? 3 : 1.5}
                    dot={false}
                    opacity={activeStrategy && activeStrategy !== meta.key ? 0.3 : 1}
                    style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center">
            {STRATEGIES.map(meta => (
              <div key={meta.key} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded-full" style={{ background: meta.color }} />
                <span className="text-[10px] text-white/40">{meta.icon} {meta.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow plan CTA */}
      {activeStrategy && (
        <button
          onClick={handleFollow}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: saved
              ? '#10B981'
              : STRATEGIES.find(s => s.key === activeStrategy)?.color ?? '#6366F1',
          }}
        >
          {saved
            ? '✓ Plan saved!'
            : saving
              ? 'Saving…'
              : (
                <>
                  Follow {STRATEGIES.find(s => s.key === activeStrategy)?.label} Plan
                  <ArrowRight className="w-4 h-4" />
                </>
              )
          }
        </button>
      )}
    </div>
  )
}
