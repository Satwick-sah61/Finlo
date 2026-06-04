/**
 * Transactions — "This Month" ledger page.
 *
 * - Month selector
 * - Summary bar: Income / Committed / Spent / Surplus
 * - Tabs: All | Pending Confirmation
 * - Pending cards: Mark as Paid (+ UPI deep link for EMIs), Skip this month
 */

import { useState } from 'react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import {
  ArrowLeftRight, ChevronLeft, ChevronRight, Check, SkipForward,
  Smartphone, Loader2,
} from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions.js'
import { formatINRFromPaise, formatINRCompact } from '../utils/currency.js'
import { TXN_META } from '../components/transactions/txnMeta.js'
import TransactionList from '../components/transactions/TransactionList.jsx'

// ─── Month nav ────────────────────────────────────────────────────────────────

function MonthNav({ month, onChange }) {
  const current = format(new Date(), 'yyyy-MM')
  const atCurrent = month >= current
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))}
        className="flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all"
        style={{ width: 44, height: 44 }}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold text-white min-w-[130px] text-center">
        {format(parseISO(`${month}-01`), 'MMMM yyyy')}
      </span>
      <button
        onClick={() => onChange(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))}
        disabled={atCurrent}
        className="flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-20"
        style={{ width: 44, height: 44 }}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Summary pills ────────────────────────────────────────────────────────────

function SummaryBar({ income, committed, spent, surplus }) {
  const pills = [
    { label: 'Income',    value: income,    color: '#10B981' },
    { label: 'Committed', value: committed, color: '#F59E0B' },
    { label: 'Spent',     value: spent,     color: '#EF4444' },
    { label: 'Surplus',   value: surplus,   color: '#06B6D4' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {pills.map((p) => (
        <div
          key={p.label}
          className="rounded-2xl p-4"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5">{p.label}</p>
          <p className="text-lg font-bold font-numeric" style={{ color: p.color }}>
            {p.value < 0 ? '−' : ''}{formatINRCompact(Math.abs(p.value))}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Pending card ─────────────────────────────────────────────────────────────

function buildUpiLink(upiId, type, amountPaise) {
  const rupees = (amountPaise / 100).toFixed(2)
  const pn = encodeURIComponent((type || 'payment').replace(/_/g, ' '))
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${pn}&am=${rupees}&cu=INR`
}

function PendingCard({ txn, onConfirm, onSkip, busy }) {
  const meta = TXN_META[txn.type] || TXN_META.expense
  const Icon = meta.icon
  const hasUpi = txn.type === 'loan_emi' && txn.upi_id

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}18` }}>
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{txn.note || meta.label}</p>
          <p className="text-[10px] text-white/30">Due {format(new Date(txn.date), 'dd MMM yyyy')} · {meta.label}</p>
        </div>
        <p className="text-base font-bold font-numeric text-white/90 flex-shrink-0">
          {formatINRFromPaise(txn.amount)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {hasUpi && (
          <a
            href={buildUpiLink(txn.upi_id, txn.type, txn.amount)}
            className="flex items-center gap-1.5 px-3 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: '#6366F1', minHeight: 44 }}
          >
            <Smartphone className="w-3.5 h-3.5" /> Pay via UPI
          </a>
        )}
        <button
          onClick={() => onConfirm(txn.id)}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: '#10B981', minHeight: 44 }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Mark as Paid
        </button>
        <button
          onClick={() => onSkip(txn.id)}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 rounded-xl text-xs font-medium text-white/50 border border-white/10 hover:bg-white/5 transition-all disabled:opacity-40"
          style={{ minHeight: 44 }}
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip this month
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Transactions() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [tab, setTab]     = useState('pending') // 'all' | 'pending'
  const [busyId, setBusyId] = useState(null)

  const {
    transactions, income, committed, spent, surplus,
    pendingCount, loading, confirmTransaction, skipTransaction,
  } = useTransactions(month)

  const pending = transactions.filter((t) => t.status === 'pending')

  async function handleConfirm(id) { setBusyId(id); try { await confirmTransaction(id) } finally { setBusyId(null) } }
  async function handleSkip(id)    { setBusyId(id); try { await skipTransaction(id) } finally { setBusyId(null) } }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-semibold text-white">This Month</h2>
          {pendingCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {/* Summary */}
      <SummaryBar income={income} committed={committed} spent={spent} surplus={surplus} />

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8 w-fit">
        {[
          { id: 'pending', label: `Pending${pendingCount ? ` (${pendingCount})` : ''}` },
          { id: 'all',     label: 'All' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70'
            }`}
            style={{ minHeight: 40 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="text-center py-12 space-y-1">
            <p className="text-2xl">✓</p>
            <p className="text-sm text-white/40">Nothing pending — you're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((t) => (
              <PendingCard key={t.id} txn={t} onConfirm={handleConfirm} onSkip={handleSkip} busy={busyId === t.id} />
            ))}
          </div>
        )
      ) : (
        <TransactionList transactions={transactions} />
      )}
    </div>
  )
}
