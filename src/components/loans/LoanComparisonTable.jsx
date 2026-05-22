import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Download, ChevronUp, ChevronDown } from 'lucide-react'
import { LOAN_TYPES } from '../../utils/amortization.js'
import { computePriorityScore } from '../../utils/repaymentStrategy.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Column definitions ───────────────────────────────────────────────────────

const COLS = [
  { key: 'name',            label: 'Loan',           align: 'left',  sortable: true  },
  { key: 'annual_rate',     label: 'Rate',           align: 'right', sortable: true  },
  { key: '_outstandingPaise', label: 'Outstanding',  align: 'right', sortable: true  },
  { key: '_emi',            label: 'EMI',            align: 'right', sortable: true  },
  { key: '_monthsRemaining', label: 'Months Left',   align: 'right', sortable: true  },
  { key: '_totalInterest',  label: 'Total Interest', align: 'right', sortable: true  },
  { key: '_priorityScore',  label: 'Priority',       align: 'right', sortable: true  },
]

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows) {
  const headers = [
    'Loan Name', 'Type', 'Lender', 'Rate %',
    'Outstanding (₹)', 'Monthly EMI (₹)',
    'Months Left', 'Total Interest (₹)',
    'Debt-Free Date', 'Priority Score',
  ]
  const lines = rows.map(r => [
    `"${r.name}"`,
    `"${LOAN_TYPES[r.type]?.label ?? r.type}"`,
    `"${r.lender ?? ''}"`,
    Number(r.annual_rate).toFixed(2),
    ((r._outstandingPaise ?? 0) / 100).toFixed(0),
    ((r._emi ?? 0) / 100).toFixed(0),
    r._monthsRemaining ?? '',
    ((r._totalInterest ?? 0) / 100).toFixed(0),
    r._debtFreeDate ? format(r._debtFreeDate, 'MMM yyyy') : '',
    r._priorityScore ?? '',
  ].join(','))

  const csv  = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `finio-loans-${format(new Date(), 'yyyy-MM-dd')}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ colKey, sortKey, sortDir }) {
  if (sortKey !== colKey) return <ChevronDown className="w-3 h-3 opacity-20 inline ml-0.5" />
  return sortDir === 'asc'
    ? <ChevronUp   className="w-3 h-3 text-indigo-400 inline ml-0.5" />
    : <ChevronDown className="w-3 h-3 text-indigo-400 inline ml-0.5" />
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {Array} activeLoans – enriched loans from useLoans
 */
export default function LoanComparisonTable({ activeLoans }) {
  const [sortKey, setSortKey] = useState('_priorityScore')
  const [sortDir, setSortDir] = useState('desc')

  const rows = useMemo(() => {
    const withScore = activeLoans.map(l => ({
      ...l,
      _priorityScore: computePriorityScore(l, activeLoans),
    }))
    return [...withScore].sort((a, b) => {
      const av = typeof a[sortKey] === 'string'
        ? a[sortKey].toLowerCase()
        : (a[sortKey] ?? 0)
      const bv = typeof b[sortKey] === 'string'
        ? b[sortKey].toLowerCase()
        : (b[sortKey] ?? 0)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [activeLoans, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (!activeLoans?.length) return null

  return (
    <div className="space-y-3">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          Loan Comparison
        </p>
        <button
          onClick={() => exportCSV(rows)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/6 transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Scrollable table */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <table className="w-full text-xs min-w-[680px]">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              {COLS.map((col, i) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`
                    py-2.5 font-semibold text-white/40 select-none
                    ${col.sortable ? 'cursor-pointer hover:text-white/70' : ''}
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                    ${i === 0 ? 'pl-4 pr-3' : i === COLS.length - 1 ? 'pl-3 pr-4' : 'px-3'}
                    transition-colors
                  `}
                >
                  {col.label}
                  {col.sortable && (
                    <SortIcon colKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((loan) => {
              const meta  = LOAN_TYPES[loan.type] ?? LOAN_TYPES.other
              const score = loan._priorityScore ?? 0
              const scoreColor =
                score >= 70 ? '#EF4444' :
                score >= 40 ? '#F59E0B' : '#10B981'

              return (
                <tr
                  key={loan.id}
                  className="border-t hover:bg-white/2 transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                >
                  {/* Loan name + type */}
                  <td className="pl-4 pr-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base flex-shrink-0">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-white/80 truncate max-w-[140px]">{loan.name}</p>
                        <p className="text-[10px] text-white/30 truncate">{loan.lender || meta.label}</p>
                      </div>
                    </div>
                  </td>

                  {/* Rate */}
                  <td className="px-3 py-3 text-right font-numeric font-semibold text-amber-400">
                    {Number(loan.annual_rate).toFixed(1)}%
                  </td>

                  {/* Outstanding */}
                  <td className="px-3 py-3 text-right font-numeric font-semibold text-red-400">
                    {formatINRCompact(loan._outstandingPaise ?? 0)}
                  </td>

                  {/* EMI */}
                  <td className="px-3 py-3 text-right font-numeric text-white/70">
                    {formatINRCompact(loan._emi ?? 0)}
                  </td>

                  {/* Months remaining */}
                  <td className="px-3 py-3 text-right text-white/50">
                    {loan._monthsRemaining ?? '—'} mo
                  </td>

                  {/* Total interest */}
                  <td className="px-3 py-3 text-right font-numeric text-orange-400">
                    {formatINRCompact(loan._totalInterest ?? 0)}
                  </td>

                  {/* Priority score */}
                  <td className="pl-3 pr-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${score}%`, background: scoreColor }}
                        />
                      </div>
                      <span className="font-bold font-numeric" style={{ color: scoreColor }}>
                        {score}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-white/20">
        Priority Score = Rate 40% + Outstanding 30% + Tenure 30% — higher score means pay off sooner.
        CSV export contains no account numbers or personal identifiers.
      </p>
    </div>
  )
}
