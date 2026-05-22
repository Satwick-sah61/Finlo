/**
 * ClosedLoansArchive — collapsible section showing all closed/paid-off loans
 * with achievement stats per loan and an aggregate summary.
 *
 * Props:
 *   closedLoans – enriched closed loans from useLoans
 */
import { useState } from 'react'
import { format, differenceInMonths } from 'date-fns'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { LOAN_TYPES } from '../../utils/amortization.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Individual closed loan row ───────────────────────────────────────────────

function ClosedLoanRow({ loan }) {
  const meta           = LOAN_TYPES[loan.type] || LOAN_TYPES.other
  const principal      = Number(loan.principal_paise) || 0
  const payments       = Array.isArray(loan.payments) ? loan.payments : []

  // Total actually paid (from payment log) or fall back to schedule total
  const totalPaidPaise = payments.length > 0
    ? payments.reduce((s, p) => s + (p.emi_paise ?? 0), 0)
    : (loan._totalInterest ?? 0) + principal

  const totalInterestPaid = payments.length > 0
    ? payments.reduce((s, p) => s + (p.interest_paise ?? 0), 0)
    : (loan._totalInterest ?? 0)

  // Tenure: from start_date to last payment date (or start + schedule length)
  const startDate = loan.start_date ? new Date(loan.start_date) : null
  const lastPaymentDate = payments.length > 0
    ? new Date(payments.at(-1).date)
    : null
  const closedDate = lastPaymentDate || (startDate && loan._schedule?.length
    ? new Date(new Date(startDate).setMonth(startDate.getMonth() + loan._schedule.length))
    : null)

  const monthsTaken = startDate && closedDate
    ? Math.max(0, differenceInMonths(closedDate, startDate))
    : (loan._schedule?.length ?? 0)

  const scheduledMonths = loan.tenure_months ?? loan._schedule?.length ?? monthsTaken
  const monthsEarly = Math.max(0, scheduledMonths - monthsTaken)

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 opacity-60"
          style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
        >
          {meta.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white/70">{loan.name}</p>
            {monthsEarly > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-emerald-300"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                {monthsEarly}mo early
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-0.5">
            {loan.lender || meta.label}
            {startDate ? ` · ${format(startDate, 'MMM yyyy')}` : ''}
            {closedDate ? ` → ${format(closedDate, 'MMM yyyy')}` : ''}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Principal</p>
              <p className="text-xs font-bold font-numeric text-white/50">{formatINRCompact(principal)}</p>
            </div>
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Total Paid</p>
              <p className="text-xs font-bold font-numeric text-white/50">{formatINRCompact(totalPaidPaise)}</p>
            </div>
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Interest</p>
              <p className="text-xs font-bold font-numeric text-red-400/50">{formatINRCompact(totalInterestPaid)}</p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1">
            <div className="flex-1 h-1 rounded-full bg-emerald-500/30">
              <div className="h-full w-full rounded-full bg-emerald-500/50" />
            </div>
            <span className="text-[9px] text-emerald-400/60 font-semibold ml-1">Paid Off ✓</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ClosedLoansArchive({ closedLoans = [] }) {
  const [open, setOpen] = useState(false)

  if (!closedLoans.length) return null

  // Aggregate stats
  const totalPrincipal = closedLoans.reduce((s, l) => s + (Number(l.principal_paise) || 0), 0)
  const totalInterest  = closedLoans.reduce((l, loan) => {
    const payments = Array.isArray(loan.payments) ? loan.payments : []
    const interest = payments.length > 0
      ? payments.reduce((s, p) => s + (p.interest_paise ?? 0), 0)
      : (loan._totalInterest ?? 0)
    return l + interest
  }, 0)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <Trophy className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">
              Loan Archive
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-300"
                style={{ background: 'rgba(16,185,129,0.12)' }}
              >
                {closedLoans.length} cleared
              </span>
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">
              Cleared {formatINRCompact(totalPrincipal)} across {closedLoans.length} loan{closedLoans.length !== 1 ? 's' : ''}
              {totalInterest > 0 && ` · ₹${Math.round(totalInterest / 100).toLocaleString('en-IN')} interest paid`}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-white/25 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-white/25 flex-shrink-0" />}
      </button>

      {/* Expanded list */}
      {open && (
        <div className="px-5 pb-5 space-y-3">
          <div className="border-t border-white/6 mb-4" />

          {/* Summary strip */}
          <div
            className="grid grid-cols-2 gap-3 rounded-xl p-3 mb-4"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}
          >
            <div className="text-center">
              <p className="text-lg font-bold font-numeric text-emerald-400">{formatINRCompact(totalPrincipal)}</p>
              <p className="text-[10px] text-white/35">Total debt cleared</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-numeric text-white/50">{closedLoans.length}</p>
              <p className="text-[10px] text-white/35">Loans paid off</p>
            </div>
          </div>

          {closedLoans.map(loan => (
            <ClosedLoanRow key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  )
}
