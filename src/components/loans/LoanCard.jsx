import { useState } from 'react'
import { format } from 'date-fns'
import {
  MoreHorizontal, ChevronDown, ChevronUp,
  Pencil, CheckCircle, RotateCcw, Trash2,
  CheckCheck, FileText,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate, deleteRecord, decryptAndLoadAll } from '../../db/helpers.js'
import { LOAN_TYPES } from '../../utils/amortization.js'
import { formatINRCompact } from '../../utils/currency.js'
import LoanDetail from './LoanDetail.jsx'
import AddLoanModal from './AddLoanModal.jsx'
import LogPaymentModal from './LogPaymentModal.jsx'

// ─── Download encrypted document helper ──────────────────────────────────────

async function downloadDocument(loanId, cryptoKey) {
  const docs = await decryptAndLoadAll('loan_documents', cryptoKey)
  const doc  = docs.find((d) => String(d.loan_id) === String(loanId))
  if (!doc) { alert('Document not found'); return }

  // base64 → Blob → download
  const binary = atob(doc.file_data)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: doc.file_type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = doc.filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Loan Card ────────────────────────────────────────────────────────────────

export default function LoanCard({ loan, onRefresh }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [expanded, setExpanded]     = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [showEdit, setShowEdit]     = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const meta        = LOAN_TYPES[loan.type] || LOAN_TYPES.other
  const isActive    = loan.status !== 'closed'
  const hasDocument = !!loan.has_document

  const outstandingPaise = loan._outstandingPaise ?? 0
  const principalPaise   = Number(loan.principal_paise) || 0
  const pctPaid          = loan._pctPaid ?? 0
  const emi              = loan._emi ?? 0
  const monthsLeft       = loan._monthsRemaining ?? 0
  const debtFreeDate     = loan._debtFreeDate
  const nextDueDate      = loan._nextDueDate
  const isPaid           = loan._isCurrentMonthPaid
  const fullyPaid        = outstandingPaise === 0

  async function toggleStatus() {
    const newStatus = isActive ? 'closed' : 'active'
    await encryptAndUpdate('loans', loan.id, { ...loan, status: newStatus }, cryptoKey)
    onRefresh()
    setMenuOpen(false)
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${loan.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await deleteRecord('loans', loan.id)
    onRefresh()
  }

  return (
    <>
      <div
        className="rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
        style={{ background: '#1C1B29', border: `1px solid ${isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}` }}
      >
        <div className="p-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
              >
                {meta.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{loan.name}</p>
                  {hasDocument && (
                    <button
                      onClick={() => downloadDocument(loan.id, cryptoKey)}
                      title="Download loan document"
                      className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] text-indigo-300 hover:text-indigo-200 transition-colors"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
                    >
                      <FileText className="w-2.5 h-2.5" /> Doc
                    </button>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">
                  {loan.lender || meta.label}
                  {!isActive && <span className="ml-2 text-emerald-400/70">· Closed</span>}
                </p>
              </div>
            </div>

            {/* Three-dot menu */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-8 z-20 w-44 rounded-xl py-1.5 shadow-2xl"
                    style={{ background: '#252436', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <button
                      onClick={() => { setShowEdit(true); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Loan
                    </button>
                    <button
                      onClick={toggleStatus}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
                    >
                      {isActive
                        ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Mark Closed</>
                        : <><RotateCcw className="w-3.5 h-3.5 text-indigo-400" /> Reopen</>}
                    </button>
                    <div className="my-1 border-t border-white/6" />
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Outstanding</p>
              <p className="text-sm font-bold font-numeric" style={{ color: isActive && !fullyPaid ? '#EF4444' : 'rgba(255,255,255,0.3)' }}>
                {fullyPaid ? 'Paid off' : formatINRCompact(outstandingPaise)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Monthly EMI</p>
              <p className="text-sm font-bold font-numeric text-white/80">{formatINRCompact(emi)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Rate</p>
              <p className="text-sm font-bold font-numeric text-white/80">{loan.annual_rate}%</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-white/35">{pctPaid}% paid</span>
              {isActive && debtFreeDate && (
                <span className="text-[10px] text-white/35">
                  Free by {format(debtFreeDate, 'MMM yyyy')} · {monthsLeft}mo left
                </span>
              )}
            </div>
            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pctPaid}%`,
                  background: pctPaid >= 100
                    ? '#10B981'
                    : `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)`,
                }}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-white/25 font-numeric">
                {formatINRCompact(principalPaise - outstandingPaise)} paid
              </span>
              <span className="text-[10px] text-white/25 font-numeric">
                {formatINRCompact(principalPaise)} total
              </span>
            </div>
          </div>

          {/* Mark EMI Paid button */}
          {isActive && !fullyPaid && (
            <div className="mb-3">
              {isPaid ? (
                <div className="flex items-center justify-center gap-2 py-2 rounded-xl"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">EMI paid this month</span>
                  {nextDueDate && (
                    <span className="text-[10px] text-emerald-400/50 ml-1">
                      · Next: {format(nextDueDate, 'dd MMM')}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34D399' }}
                >
                  <CheckCheck className="w-4 h-4" />
                  Mark this month's EMI paid
                  {nextDueDate && (
                    <span className="text-[10px] opacity-60 ml-1">
                      ({format(nextDueDate, 'dd MMM')})
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide schedule' : 'View schedule & history'}
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t px-5 pb-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <LoanDetail loan={loan} />
          </div>
        )}
      </div>

      {showEdit && (
        <AddLoanModal
          editLoan={loan}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onRefresh(); setShowEdit(false) }}
        />
      )}

      {showPayment && (
        <LogPaymentModal
          loan={loan}
          onClose={() => setShowPayment(false)}
          onSaved={onRefresh}
        />
      )}
    </>
  )
}
