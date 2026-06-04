/**
 * TransactionList — chronological, color-coded list of transactions with a
 * type filter. Used in the "All" tab of the Transactions page.
 */

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { formatINRFromPaise } from '../../utils/currency.js'
import { TXN_META } from './txnMeta.js'

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'income',      label: 'Income' },
  { id: 'loan_emi',    label: 'EMIs' },
  { id: 'sip',         label: 'SIPs' },
  { id: 'goal_saving', label: 'Goals' },
  { id: 'expense',     label: 'Expenses' },
]

const STATUS_BADGE = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  confirmed: { label: 'Confirmed', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  skipped:   { label: 'Skipped',   color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
}

export default function TransactionList({ transactions }) {
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    const list = filter === 'all' ? transactions : transactions.filter((t) => t.type === filter)
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [transactions, filter])

  if (!transactions.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-white/30">No transactions this month yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Type filter */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8 overflow-x-auto">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? transactions.length : transactions.filter((t) => t.type === f.id).length
          if (f.id !== 'all' && count === 0) return null
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                filter === f.id ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70'
              }`}
              style={{ minHeight: 36 }}
            >
              {f.label}
              {count > 0 && <span className="ml-1 text-[9px] opacity-60">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {filtered.map((t) => {
          const meta = TXN_META[t.type] || TXN_META.expense
          const Icon = meta.icon
          const badge = STATUS_BADGE[t.status] || STATUS_BADGE.pending
          const isIn = t.direction === 'in'
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: '#1C1B29', borderLeft: `3px solid ${meta.color}`, border: '1px solid rgba(255,255,255,0.06)', borderLeftWidth: 3, borderLeftColor: meta.color }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${meta.color}18` }}
              >
                <Icon className="w-4 h-4" style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 truncate">{t.note || meta.label}</p>
                <p className="text-[10px] text-white/30">{format(new Date(t.date), 'dd MMM yyyy')} · {meta.label}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold font-numeric" style={{ color: isIn ? '#10B981' : 'rgba(255,255,255,0.8)' }}>
                  {isIn ? '+' : '−'}{formatINRFromPaise(t.amount)}
                </p>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
