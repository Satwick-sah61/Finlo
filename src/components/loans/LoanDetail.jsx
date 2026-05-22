import { useState, useMemo } from 'react'
import { format, addMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { openPaymentReceipt } from '../../utils/loanReceipt.js'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { generateAmortizationWithExtra } from '../../utils/amortization.js'
import { formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'
import InterestSavedCard from './InterestSavedCard.jsx'

const PAGE_SIZE = 10

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '10px 14px',
}
const tick = { fill: 'rgba(255,255,255,0.35)', fontSize: 11 }

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{d.name}</p>
      <p style={{ color: d.payload.fill, fontSize: 14, fontWeight: 700 }}>
        {formatINRCompact(d.value)}
      </p>
    </div>
  )
}

function BalanceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{label}</p>
      <p style={{ color: '#EF4444', fontSize: 14, fontWeight: 700 }}>
        {formatINRCompact(payload[0].value)}
      </p>
    </div>
  )
}

function SimSlider({ label, value, min, max, step, onChange, format: fmt }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-xs font-semibold text-indigo-300">{fmt(value)}</span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full bg-white/10" />
        <div
          className="absolute h-1.5 rounded-full bg-indigo-500"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-4"
        />
      </div>
    </div>
  )
}

export default function LoanDetail({ loan }) {
  const [page, setPage] = useState(0)
  const [extraMonthly, setExtraMonthly] = useState(0)

  const schedule = loan._schedule ?? []
  const totalPages = Math.ceil(schedule.length / PAGE_SIZE)
  const pageRows = schedule.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Donut data: principal paid vs total interest
  const principalPaid = (Number(loan.principal_paise) || 0) - (loan._outstandingPaise ?? 0)
  const donutData = [
    { name: 'Principal Paid', value: principalPaid, fill: '#6366F1' },
    { name: 'Total Interest', value: loan._totalInterest ?? 0, fill: '#EF4444' },
    { name: 'Remaining', value: loan._outstandingPaise ?? 0, fill: 'rgba(255,255,255,0.08)' },
  ].filter((d) => d.value > 0)

  // Outstanding balance chart — every 12th period + current outstanding
  const balanceData = useMemo(() => {
    if (!schedule.length) return []
    const startDate = loan.start_date ? new Date(loan.start_date) : new Date()
    const points = []
    // Start point
    points.push({
      label: format(startDate, 'MMM yy'),
      balance: Number(loan.principal_paise) || 0,
    })
    const step = Math.max(1, Math.floor(schedule.length / 12))
    for (let i = step - 1; i < schedule.length; i += step) {
      const d = addMonths(startDate, i + 1)
      points.push({ label: format(d, 'MMM yy'), balance: schedule[i].outstanding })
    }
    return points
  }, [schedule, loan.start_date, loan.principal_paise])

  // Extra payment simulation
  const simResult = useMemo(() => {
    if (!extraMonthly) return null
    const { schedule: simSched, totalInterest: simInterest } = generateAmortizationWithExtra(
      Number(loan.principal_paise) || 0,
      Number(loan.annual_rate) || 0,
      loan._emi ?? 0,
      extraMonthly * 100
    )
    const monthsSaved = schedule.length - simSched.length
    const interestSaved = (loan._totalInterest ?? 0) - simInterest
    return { monthsSaved, interestSaved, newMonths: simSched.length }
  }, [extraMonthly, loan, schedule.length])

  const maxExtra = Math.round((loan._emi ?? 0) / 100) // cap slider at 1× EMI in rupees

  return (
    <div className="space-y-6 pt-2">
      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Loan Breakdown</p>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                <span className="text-[10px] text-white/50">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Balance line */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Outstanding Balance</p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} dy={4} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(v)}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<BalanceTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <Line type="monotone" dataKey="balance" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Interest saved tracker (only for loans with extra payments logged) */}
      <InterestSavedCard loan={loan} />

      {/* Extra payment simulator */}
      {maxExtra > 0 && (
        <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Extra Payment Simulator</p>
          <SimSlider
            label="Extra monthly payment"
            value={extraMonthly}
            min={0}
            max={maxExtra}
            step={500}
            onChange={setExtraMonthly}
            format={(v) => v === 0 ? '₹0 (no extra)' : `+₹${v.toLocaleString('en-IN')}/mo`}
          />
          {simResult && extraMonthly > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <p className="text-xl font-bold text-emerald-400">
                  {simResult.monthsSaved > 0 ? `-${simResult.monthsSaved}` : '0'} mo
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">Months saved</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <p className="text-xl font-bold text-emerald-400">
                  {simResult.interestSaved > 0 ? formatINRCompact(simResult.interestSaved) : '—'}
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">Interest saved</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Amortization table */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Amortization Schedule</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                {['#', 'EMI', 'Principal', 'Interest', 'Outstanding'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-white/40 first:pl-4 last:pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={row.period}
                  className="border-t transition-colors hover:bg-white/3"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                >
                  <td className="px-3 py-2 pl-4 text-white/30">{row.period}</td>
                  <td className="px-3 py-2 font-numeric text-white/70">{formatINRCompact(row.emi)}</td>
                  <td className="px-3 py-2 font-numeric text-indigo-300">{formatINRCompact(row.principal)}</td>
                  <td className="px-3 py-2 font-numeric text-red-400">{formatINRCompact(row.interest)}</td>
                  <td className="px-3 py-2 pr-4 font-numeric text-white/60">{formatINRCompact(row.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-white/30">
              {page + 1} / {totalPages} · {schedule.length} periods
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Payment History */}
      {loan.payments && loan.payments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Payment History
            <span className="ml-2 text-white/30 normal-case font-normal">{loan.payments.length} payments</span>
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {['Period', 'Date', 'EMI', 'Principal', 'Interest', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-white/40 first:pl-4 last:pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...loan.payments].reverse().map((p) => (
                  <tr
                    key={p.period}
                    className="border-t transition-colors hover:bg-white/3"
                    style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <td className="px-3 py-2 pl-4 text-white/30">{p.period}</td>
                    <td className="px-3 py-2 text-white/50">
                      {p.date ? format(new Date(p.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-3 py-2 font-numeric text-white/70">{formatINRCompact(p.emi_paise)}</td>
                    <td className="px-3 py-2 font-numeric text-indigo-300">{formatINRCompact(p.principal_paise)}</td>
                    <td className="px-3 py-2 font-numeric text-red-400">{formatINRCompact(p.interest_paise)}</td>
                    <td className="px-3 py-2 pr-4">
                      <button
                        onClick={() => openPaymentReceipt(loan, p)}
                        title="Print receipt"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-white/30 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                      >
                        <Printer className="w-3 h-3" /> Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
