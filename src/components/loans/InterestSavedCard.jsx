/**
 * InterestSavedCard — shown inside LoanDetail for loans that have logged payments.
 * Compares actual interest paid vs baseline amortization schedule interest,
 * and shows projected savings if the user continues with an extra payment.
 *
 * Props:
 *   loan  – enriched loan object from useLoans
 */
import { useMemo, useEffect, useRef, useState } from 'react'
import { TrendingDown } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'
import { generateAmortizationWithExtra } from '../../utils/amortization.js'

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0)
  const frame = useRef(null)
  const startTime = useRef(null)
  const startVal = useRef(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    startVal.current = value
    startTime.current = performance.now()

    function tick(now) {
      const elapsed = now - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(startVal.current + (target - startVal.current) * eased))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const TT_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '8px 12px',
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TT_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, fontSize: 12, fontWeight: 700 }}>
          {p.name}: {formatINRCompact(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InterestSavedCard({ loan }) {
  const payments = Array.isArray(loan.payments) ? loan.payments : []

  // Only render when there are logged extra payments
  const hasExtraPayments = useMemo(() => {
    if (!payments.length) return false
    const emi = loan._emi ?? 0
    return payments.some(p => (p.emi_paise ?? 0) > emi)
  }, [payments, loan._emi])

  // Interest comparison: baseline vs actual paid
  const { interestSaved, actualInterestPaid, baselineInterestPaid, chartData } = useMemo(() => {
    const schedule = loan._schedule ?? []
    const emi      = loan._emi ?? 0

    // Baseline: what schedule says for paid periods
    const paidPeriods = payments.length
    const baselineInterestPaid = schedule
      .slice(0, paidPeriods)
      .reduce((s, row) => s + row.interest, 0)

    // Actual: sum of interest_paise from logged payments
    const actualInterestPaid = payments.reduce((s, p) => s + (p.interest_paise ?? 0), 0)

    const interestSaved = Math.max(0, baselineInterestPaid - actualInterestPaid)

    // Build per-payment chart: cumulative baseline vs actual
    let cumulativeBaseline = 0
    let cumulativeActual   = 0
    const chartData = payments.map((p, i) => {
      cumulativeBaseline += schedule[i]?.interest ?? 0
      cumulativeActual   += p.interest_paise ?? 0
      return {
        period:   p.period ?? i + 1,
        label:    `EMI ${p.period ?? i + 1}`,
        baseline: cumulativeBaseline,
        actual:   cumulativeActual,
      }
    })

    return { interestSaved, actualInterestPaid, baselineInterestPaid, chartData }
  }, [payments, loan._schedule, loan._emi])

  // Projected savings (remaining schedule with avg extra from past payments)
  const projectedSavings = useMemo(() => {
    if (!hasExtraPayments) return 0
    const emi = loan._emi ?? 0
    const avgExtra = payments.length > 0
      ? payments.reduce((s, p) => s + Math.max(0, (p.emi_paise ?? 0) - emi), 0) / payments.length
      : 0
    if (avgExtra < 1000) return 0 // less than ₹10 extra — not meaningful

    try {
      const { totalInterest: projInterest } = generateAmortizationWithExtra(
        loan._outstandingPaise ?? 0,
        Number(loan.annual_rate) || 0,
        emi,
        Math.round(avgExtra)
      )
      const baselineRemaining = loan._interestRemaining ?? 0
      return Math.max(0, baselineRemaining - projInterest)
    } catch {
      return 0
    }
  }, [hasExtraPayments, payments, loan])

  const animatedSaved = useCountUp(Math.round(interestSaved / 100))

  if (!hasExtraPayments && interestSaved === 0) return null

  return (
    <div
      className="rounded-xl p-4 space-y-4"
      style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.15)' }}
        >
          <TrendingDown className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Interest Saved</p>
          <p className="text-[10px] text-white/35">vs scheduled amortization</p>
        </div>
      </div>

      {/* Main stat */}
      <div className="flex items-end gap-4">
        <div>
          <p className="text-2xl font-bold font-numeric text-emerald-400">
            ₹{animatedSaved.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">
            Paid ₹{Math.round(actualInterestPaid / 100).toLocaleString('en-IN')} interest
            vs scheduled ₹{Math.round(baselineInterestPaid / 100).toLocaleString('en-IN')}
          </p>
        </div>
        {projectedSavings > 0 && (
          <div
            className="ml-auto px-3 py-2 rounded-lg text-right"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' }}
          >
            <p className="text-sm font-bold font-numeric text-emerald-300">
              +{formatINRCompact(projectedSavings)}
            </p>
            <p className="text-[10px] text-white/35">projected more</p>
          </div>
        )}
      </div>

      {/* Chart: cumulative interest — baseline vs actual */}
      {chartData.length >= 2 && (
        <div style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                dy={4}
              />
              <YAxis
                tickFormatter={v => formatINRCompact(v)}
                tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)' }} />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Baseline"
                stroke="rgba(239,68,68,0.5)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.5)', borderTop: '1px dashed rgba(239,68,68,0.5)' }} />
          <span className="text-[10px] text-white/35">Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-white/35">Actual paid</span>
        </div>
      </div>
    </div>
  )
}
