import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  CreditCard, Plus, TrendingDown, Calendar, Percent,
  DollarSign, Sparkles, BarChart2, Table2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useLoans } from '../hooks/useLoans.js'
import { useFinancials, currentMonth } from '../hooks/useFinancials.js'
import { useAppStore } from '../store/appStore.js'
import { formatINRCompact } from '../utils/currency.js'
import { syncLoanReminders } from '../utils/loanReminders.js'
import LoanCard from '../components/loans/LoanCard.jsx'
import AddLoanModal from '../components/loans/AddLoanModal.jsx'
import DocumentUploadModal from '../components/loans/DocumentUploadModal.jsx'
import RepaymentStrategy from '../components/loans/RepaymentStrategy.jsx'
import LoanComparisonTable from '../components/loans/LoanComparisonTable.jsx'
import LoanMilestone from '../components/loans/LoanMilestone.jsx'
import LoanHealthDashboard from '../components/loans/LoanHealthDashboard.jsx'
import ClosedLoansArchive from '../components/loans/ClosedLoansArchive.jsx'

const FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'Closed' },
]

const SORTS = [
  { id: 'outstanding', label: 'Balance ↓' },
  { id: 'emi',         label: 'EMI ↓' },
  { id: 'rate',        label: 'Rate ↓' },
  { id: 'name',        label: 'Name A–Z' },
]

function SummaryPill({ icon: Icon, label, value, sub, color = 'text-white' }) {
  return (
    <div
      className="flex-1 min-w-[140px] rounded-2xl p-4"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-white/30" />
        <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold font-numeric ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  )
}

function CollapsiblePanel({ show, title, children }) {
  if (!show) return null
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  )
}

export default function Loans() {
  const {
    enrichedLoans, activeLoans, closedLoans,
    totalOutstandingPaise, totalMonthlyEMI, projectedDebtFreeDate,
    loading, error, refresh,
    pendingMilestones, dismissMilestone,
  } = useLoans()
  const { summary } = useFinancials(currentMonth())
  const cryptoKey = useAppStore((s) => s.cryptoKey)

  const [showAdd, setShowAdd]         = useState(false)
  const [showUpload, setShowUpload]   = useState(false)
  const [filter, setFilter]           = useState('all')
  const [sort, setSort]               = useState('outstanding')
  const [showStrategy, setShowStrategy] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  const totalMonthlyIncomePaise = summary?.totalMonthlyIncomePaise ?? 0
  const surplusPaise = summary?.surplusPaise ?? 0

  // Sync reminders on mount and whenever enriched loans change
  useEffect(() => {
    if (!loading && enrichedLoans.length > 0 && cryptoKey) {
      syncLoanReminders(enrichedLoans, cryptoKey).catch((err) =>
        console.error('[Loans] syncLoanReminders failed:', err)
      )
    }
  }, [enrichedLoans, cryptoKey, loading])
  const dti = totalMonthlyIncomePaise > 0
    ? Math.round((totalMonthlyEMI / totalMonthlyIncomePaise) * 100)
    : null

  const displayed = (() => {
    let list = filter === 'all'    ? enrichedLoans
             : filter === 'active' ? activeLoans
             : closedLoans

    return [...list].sort((a, b) => {
      if (sort === 'outstanding') return (b._outstandingPaise ?? 0) - (a._outstandingPaise ?? 0)
      if (sort === 'emi')         return (b._emi ?? 0) - (a._emi ?? 0)
      if (sort === 'rate')        return (Number(b.annual_rate) || 0) - (Number(a.annual_rate) || 0)
      if (sort === 'name')        return (a.name ?? '').localeCompare(b.name ?? '')
      return 0
    })
  })()

  return (
    <div className="space-y-6">

      {/* Milestone toasts / 100% overlay */}
      <LoanMilestone
        milestones={pendingMilestones}
        onDismiss={dismissMilestone}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-red-400" />
          <h2 className="text-xl font-semibold text-white">Loans</h2>
          {!loading && enrichedLoans.length > 0 && (
            <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
              {activeLoans.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Repayment plan toggle */}
          {!loading && activeLoans.length > 0 && (
            <button
              onClick={() => { setShowStrategy(s => !s); setShowComparison(false) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-95"
              style={{
                background: showStrategy ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${showStrategy ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: showStrategy ? '#A5B4FC' : 'rgba(255,255,255,0.5)',
              }}
            >
              <BarChart2 className="w-4 h-4" />
              Repayment Plan
              {showStrategy ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Compare toggle */}
          {!loading && activeLoans.length > 1 && (
            <button
              onClick={() => { setShowComparison(c => !c); setShowStrategy(false) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-95"
              style={{
                background: showComparison ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${showComparison ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.1)'}`,
                color: showComparison ? '#67E8F9' : 'rgba(255,255,255,0.5)',
              }}
            >
              <Table2 className="w-4 h-4" />
              Compare
              {showComparison ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-indigo-300 transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
          >
            <Sparkles className="w-4 h-4" />
            Upload Doc
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#6366F1' }}
          >
            <Plus className="w-4 h-4" />
            Add Loan
          </button>
        </div>
      </div>

      {/* Repayment strategy panel */}
      <CollapsiblePanel show={showStrategy} title="Repayment Strategy">
        <RepaymentStrategy
          activeLoans={activeLoans}
          totalMonthlyEMI={totalMonthlyEMI}
        />
      </CollapsiblePanel>

      {/* Comparison table panel */}
      <CollapsiblePanel show={showComparison} title="Loan Comparison">
        <LoanComparisonTable activeLoans={activeLoans} />
      </CollapsiblePanel>

      {/* Summary pills */}
      {!loading && activeLoans.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <SummaryPill
            icon={TrendingDown}
            label="Total Outstanding"
            value={formatINRCompact(totalOutstandingPaise)}
            sub={`across ${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''}`}
            color="text-red-400"
          />
          <SummaryPill
            icon={DollarSign}
            label="Monthly EMI"
            value={formatINRCompact(totalMonthlyEMI)}
            sub={totalMonthlyIncomePaise > 0
              ? `${Math.round((totalMonthlyEMI / totalMonthlyIncomePaise) * 100)}% of income`
              : undefined}
            color="text-orange-400"
          />
          <SummaryPill
            icon={Percent}
            label="Debt-to-Income"
            value={dti !== null ? `${dti}%` : '—'}
            sub={dti !== null
              ? dti < 30 ? 'Healthy' : dti < 50 ? 'Moderate' : 'High'
              : 'Add income to calculate'}
            color={
              dti === null  ? 'text-white/30'
              : dti < 30    ? 'text-emerald-400'
              : dti < 50    ? 'text-amber-400'
              : 'text-red-400'
            }
          />
          {projectedDebtFreeDate && (
            <SummaryPill
              icon={Calendar}
              label="Debt-Free Date"
              value={format(projectedDebtFreeDate, 'MMM yyyy')}
              sub="latest loan payoff"
              color="text-indigo-300"
            />
          )}
        </div>
      )}

      {/* Loan health dashboard — metric cards + AI insight */}
      {!loading && activeLoans.length > 0 && (
        <LoanHealthDashboard
          activeLoans={activeLoans}
          totalMonthlyIncomePaise={totalMonthlyIncomePaise}
          surplusPaise={surplusPaise}
          totalMonthlyEMI={totalMonthlyEMI}
        />
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 rounded-2xl animate-pulse bg-white/6" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-red-400">Failed to load loans</p>
          <button onClick={refresh} className="text-xs text-white/40 hover:text-white/60 underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && enrichedLoans.length === 0 && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center text-center gap-4"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="text-5xl">💳</div>
          <div>
            <p className="text-base font-semibold text-white">No loans yet</p>
            <p className="text-sm text-white/40 mt-1 max-w-xs">
              Track home loans, car loans, personal loans and more. View amortization schedules,
              total interest costs, and your projected debt-free date.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-300 transition-all hover:opacity-90"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <Sparkles className="w-4 h-4" />
              Upload document
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: '#6366F1' }}
            >
              <Plus className="w-4 h-4" />
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* Filter + Sort controls */}
      {!loading && enrichedLoans.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filter === f.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {f.label}
                {f.id === 'active' && activeLoans.length > 0 && (
                  <span className="ml-1 text-[9px] opacity-70">{activeLoans.length}</span>
                )}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white/50 bg-white/5 border border-white/8 cursor-pointer outline-none"
            style={{ colorScheme: 'dark' }}
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {/* Loan cards grid */}
      {!loading && displayed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* No results for active filter */}
      {!loading && enrichedLoans.length > 0 && displayed.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-white/30">No {filter} loans</p>
        </div>
      )}

      {/* Closed loans archive */}
      {!loading && closedLoans.length > 0 && (
        <ClosedLoansArchive closedLoans={closedLoans} />
      )}

      {showAdd && (
        <AddLoanModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { refresh(); setShowAdd(false) }}
        />
      )}

      {showUpload && (
        <DocumentUploadModal
          onClose={() => setShowUpload(false)}
          onSaved={() => { refresh(); setShowUpload(false) }}
        />
      )}
    </div>
  )
}
