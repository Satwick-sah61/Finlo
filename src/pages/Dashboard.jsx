import { Component, useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, ArrowUp, ArrowDown, Minus, RefreshCw, FileText, Target, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useFinancials, currentMonth } from '../hooks/useFinancials.js'
import { useGoals } from '../hooks/useGoals.js'
import { useLoans } from '../hooks/useLoans.js'
import { calculateHealthScore } from '../utils/healthScore.js'
import { useDashboardStore, RANGES, rangeToNumMonths } from '../store/dashboardStore.js'
import { formatINRFromPaise, formatINRCompact } from '../utils/currency.js'
import { calculateGoalStatus, getGoalTypeMeta, computeGoalAllocation } from '../utils/goalStatus.js'
import IncomeExpenseDonut from '../components/charts/IncomeExpenseDonut.jsx'
import ExpenseBreakdownPie from '../components/charts/ExpenseBreakdownPie.jsx'
import CashFlowBarChart from '../components/charts/CashFlowBarChart.jsx'
import SavingsRateTrend from '../components/charts/SavingsRateTrend.jsx'
import HealthScoreGauge from '../components/charts/HealthScoreGauge.jsx'
import NetWorthChart from '../components/charts/NetWorthChart.jsx'
import SurplusAllocationChart, { SurplusAllocationToggle } from '../components/charts/SurplusAllocationChart.jsx'
import DashboardInsights from '../components/DashboardInsights.jsx'
import ReportModal from '../components/ReportModal.jsx'

// ─── Error Boundary ───────────────────────────────────────────────────────────

class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
          <p className="text-xs text-red-400/70">Chart failed to render</p>
          <button
            className="text-xs text-white/30 hover:text-white/50 underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0)
  const raf = useRef(null)
  const start = useRef(null)
  const from = useRef(0)

  useEffect(() => {
    from.current = 0
    start.current = null
    cancelAnimationFrame(raf.current)

    function step(ts) {
      if (!start.current) start.current = ts
      const progress = Math.min((ts - start.current) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // ease-out-cubic
      setValue(Math.round(from.current + (target - from.current) * ease))
      if (progress < 1) raf.current = requestAnimationFrame(step)
    }

    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return value
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/6 rounded-xl ${className}`} />
}

function StatSkeleton() {
  return (
    <div className="glass rounded-xl p-5 space-y-2.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

// ─── MoM delta badge ──────────────────────────────────────────────────────────

function MoMBadge({ delta, unit = '' }) {
  if (delta === null || delta === undefined) return null
  if (delta === 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/25 px-1.5 py-0.5 rounded-md bg-white/5">
      <Minus className="w-2.5 h-2.5" />
      Stable
    </span>
  )
  const isUp = delta > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-numeric ${
      isUp ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
    }`}>
      {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {isUp ? '+' : ''}{delta}{unit}
    </span>
  )
}

// ─── Stat card with count-up ──────────────────────────────────────────────────

function StatCard({ label, rawValue, displayValue, sub, valueColor = 'text-white', mom, momUnit, animate }) {
  const animated = useCountUp(animate ? (rawValue ?? 0) : 0)
  const shown = animate && rawValue != null
    ? displayValue?.replace(/[\d,]+/, formatINRCompact(animated)) ?? displayValue
    : displayValue

  return (
    <div className="glass rounded-xl p-5 space-y-1.5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30">
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-numeric leading-tight ${valueColor}`}>{shown}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {sub && <p className="text-xs text-white/30">{sub}</p>}
        <MoMBadge delta={mom} unit={momUnit} />
      </div>
    </div>
  )
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, subtitle, headerAction, children, className = '' }) {
  return (
    <div className={`glass rounded-2xl p-5 flex flex-col gap-4 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
        </div>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </div>
      <div className="flex-1 min-h-0">
        <ChartErrorBoundary>
          {children}
        </ChartErrorBoundary>
      </div>
    </div>
  )
}

// ─── Range selector ───────────────────────────────────────────────────────────

function RangeSelector() {
  const { range, setRange } = useDashboardStore()
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => setRange(r.id)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            range === r.id
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

// ─── Dashboard mini goal card ─────────────────────────────────────────────────

function DashboardGoalCard({ goal, surplusPaise }) {
  const typeMeta = getGoalTypeMeta(goal.type)
  const status = calculateGoalStatus(goal, surplusPaise)
  const { pctComplete, monthsRemaining } = status

  const STATUS_COLOR = {
    'Completed': 'text-emerald-400',
    'Ahead':     'text-cyan-400',
    'On Track':  'text-indigo-400',
    'At Risk':   'text-red-400',
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-white/4"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-xl flex-shrink-0">{typeMeta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-sm font-medium text-white truncate">{goal.name}</p>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_COLOR[status.status] ?? 'text-indigo-400'}`}>
            {status.status}
          </span>
        </div>
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden mb-1">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pctComplete}%`,
              background: pctComplete >= 100 ? '#10B981' : 'linear-gradient(90deg, #6366F1, #06B6D4)',
            }}
          />
        </div>
        <p className="text-[10px] text-white/30">
          {pctComplete}% · {monthsRemaining > 0 ? `${monthsRemaining}mo remaining` : 'Overdue'}
        </p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const month = currentMonth()
  const { range } = useDashboardStore()
  const numMonths = rangeToNumMonths(range)

  const { incomeStreams, summary, monthlyHistory, loading, error, refresh } = useFinancials(month, numMonths)
  const { goals } = useGoals()
  const { activeLoans, totalOutstandingPaise, totalMonthlyEMI } = useLoans()
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [surplusChartType, setSurplusChartType] = useState('donut')

  useEffect(() => {
    if (!loading) setLastUpdated(new Date())
  }, [loading])

  // Merge active loan EMIs into expense totals so they appear in all charts + stat cards
  // Uses the existing 'loans' expense category — avoids double-counting if user also
  // manually logs EMIs (rare, but noted in UI).
  const mergedSummary = useMemo(() => {
    if (!totalMonthlyEMI) return summary
    const totalMonthlyExpensesPaise = summary.totalMonthlyExpensesPaise + totalMonthlyEMI
    const surplusPaise = summary.totalMonthlyIncomePaise - totalMonthlyExpensesPaise
    const savingsRate = summary.totalMonthlyIncomePaise > 0
      ? Math.round((surplusPaise / summary.totalMonthlyIncomePaise) * 100)
      : 0
    return {
      ...summary,
      totalMonthlyExpensesPaise,
      surplusPaise,
      savingsRate,
      expenseByCategory: {
        ...summary.expenseByCategory,
        loans: (summary.expenseByCategory.loans ?? 0) + totalMonthlyEMI,
      },
    }
  }, [summary, totalMonthlyEMI])

  const {
    totalMonthlyIncomePaise,
    totalMonthlyExpensesPaise,
    surplusPaise,
    savingsRate,
  } = mergedSummary

  // Recompute health score with real loan DTI data + merged savings rate
  const dti = totalMonthlyIncomePaise > 0 ? totalMonthlyEMI / totalMonthlyIncomePaise : 0
  const { score: healthScore, factors: healthFactors } = calculateHealthScore({
    savingsRate,
    totalMonthlyIncomePaise,
    totalMonthlyExpensesPaise,
    debtToIncomeRatio: dti,
  })

  const goalAllocatedPaise = computeGoalAllocation(goals)
  const effectiveSurplusPaise = surplusPaise - goalAllocatedPaise

  // ── MoM deltas ────────────────────────────────────────────────────────
  const hist = monthlyHistory
  const currHist = hist.at(-1)
  const prevHist = hist.at(-2)

  const expenseMoM = prevHist?.expenses > 0
    ? Math.round(((currHist.expenses - prevHist.expenses) / prevHist.expenses) * 100)
    : null

  const prevSavingsRate = prevHist?.income > 0
    ? Math.round((prevHist.surplus / prevHist.income) * 100)
    : null
  const savingsRateMoM = prevSavingsRate !== null ? savingsRate - prevSavingsRate : null

  const monthLabel = format(new Date(), 'MMMM yyyy')

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-red-400">Failed to load financial data.</p>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          {lastUpdated && (
            <span className="text-[10px] text-white/20 hidden sm:block">
              Updated {format(lastUpdated, 'h:mm a')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RangeSelector />
          <span className="text-xs text-white/30 px-2.5 py-1 rounded-full border border-white/8 hidden md:block">
            {monthLabel}
          </span>
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 hover:text-white/80 transition-all"
            title="Export Report"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={refresh}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Monthly Income"
            rawValue={totalMonthlyIncomePaise}
            displayValue={totalMonthlyIncomePaise > 0 ? formatINRFromPaise(totalMonthlyIncomePaise) : '—'}
            sub={totalMonthlyIncomePaise > 0 ? `${incomeStreams.length} stream${incomeStreams.length !== 1 ? 's' : ''}` : 'Add income streams'}
            valueColor="text-green-400"
            animate={totalMonthlyIncomePaise > 0}
          />
          <StatCard
            label="Monthly Expenses"
            rawValue={totalMonthlyExpensesPaise}
            displayValue={totalMonthlyExpensesPaise > 0 ? formatINRFromPaise(totalMonthlyExpensesPaise) : '—'}
            sub={totalMonthlyExpensesPaise > 0
              ? totalMonthlyIncomePaise > 0
                ? `${Math.round((totalMonthlyExpensesPaise / totalMonthlyIncomePaise) * 100)}% of income`
                : 'Log expenses'
              : 'No expenses this month'}
            valueColor="text-orange-400"
            mom={expenseMoM}
            momUnit="%"
            animate={totalMonthlyExpensesPaise > 0}
          />
          <StatCard
            label="Free Monthly Surplus"
            rawValue={Math.abs(effectiveSurplusPaise)}
            displayValue={totalMonthlyIncomePaise > 0 ? formatINRFromPaise(Math.abs(effectiveSurplusPaise)) : '—'}
            sub={
              totalMonthlyIncomePaise === 0 ? undefined
              : effectiveSurplusPaise < 0 ? `${formatINRCompact(Math.abs(effectiveSurplusPaise))} over budget`
              : goalAllocatedPaise > 0 ? `after ${formatINRCompact(goalAllocatedPaise)}/mo to ${goals.filter(g => (Number(g.saved_amount)||0) < (Number(g.target_amount)||0) && g.status !== 'Completed').length} goal${goals.filter(g => (Number(g.saved_amount)||0) < (Number(g.target_amount)||0) && g.status !== 'Completed').length !== 1 ? 's' : ''}`
              : surplusPaise > 0 ? 'No active goals yet' : 'Deficit this month'
            }
            valueColor={
              totalMonthlyIncomePaise === 0 ? 'text-white/20'
              : effectiveSurplusPaise >= 0 ? 'text-green-400' : 'text-red-400'
            }
            animate={totalMonthlyIncomePaise > 0}
          />
          <StatCard
            label="Savings Rate"
            displayValue={totalMonthlyIncomePaise > 0 ? `${savingsRate}%` : '—'}
            sub={
              savingsRate >= 30 ? 'Excellent' :
              savingsRate >= 20 ? 'Good' :
              savingsRate >= 10 ? 'Fair — aim for 20%' :
              totalMonthlyIncomePaise > 0 ? 'Needs improvement' : 'Add income'
            }
            valueColor={
              totalMonthlyIncomePaise === 0 ? 'text-white/20'
              : savingsRate >= 20 ? 'text-green-400'
              : savingsRate >= 10 ? 'text-amber-400' : 'text-red-400'
            }
            mom={savingsRateMoM}
            momUnit="pts"
          />
        </div>
      )}

      {/* ── Insights panel ─────────────────────────────────────────────── */}
      {!loading && (
        <DashboardInsights
          summary={mergedSummary}
          monthlyHistory={monthlyHistory}
          activeLoans={activeLoans}
          dti={dti}
        />
      )}

      {/* ── Chart grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[380px] md:col-span-2" />
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[280px] md:col-span-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Row 1 — Income vs Expense Donut | Expense Breakdown Pie */}
          <ChartCard
            title="Income vs Expenses"
            subtitle="Outer ring: income sources · Inner ring: expense categories"
          >
            <IncomeExpenseDonut incomeStreams={incomeStreams} summary={mergedSummary} />
          </ChartCard>

          <ChartCard
            title="Expense Breakdown"
            subtitle={`Where your money goes in ${monthLabel}`}
          >
            <ExpenseBreakdownPie summary={mergedSummary} />
          </ChartCard>

          {/* Row 2 — Cash Flow Bar Chart (full width) */}
          <div className="md:col-span-2">
            <ChartCard
              title="Monthly Cash Flow"
              subtitle={`Income and expenses over the last ${numMonths} months`}
            >
              <CashFlowBarChart monthlyHistory={monthlyHistory} />
            </ChartCard>
          </div>

          {/* Row 3 — Savings Rate Trend | Health Score Gauge */}
          <ChartCard
            title="Savings Rate Trend"
            subtitle={`How your savings rate has moved over ${numMonths} months`}
          >
            <SavingsRateTrend monthlyHistory={monthlyHistory} />
          </ChartCard>

          <ChartCard
            title="Financial Health Score"
            subtitle="Composite score across savings, expenses, and debt"
          >
            <HealthScoreGauge score={healthScore} factors={healthFactors} />
          </ChartCard>

          {/* Row 4 — Net Worth (full width) */}
          <div className="md:col-span-2">
            <ChartCard
              title="Net Worth"
              subtitle={activeLoans.length > 0
                ? 'Cumulative surplus vs outstanding loan liabilities'
                : 'Cumulative surplus over time · Add loans to see liabilities'}
            >
              <NetWorthChart monthlyHistory={monthlyHistory} totalOutstanding={totalOutstandingPaise} />
            </ChartCard>
          </div>

          {/* Row 5 — Surplus allocation chart (full width, only when active goals exist) */}
          {goals.filter(g => g.status !== 'Draft' && g.status !== 'Completed' && (Number(g.saved_amount)||0) < (Number(g.target_amount)||0)).length > 0 && (
            <div className="md:col-span-2">
              <ChartCard
                title="Surplus Breakdown"
                subtitle="How your monthly surplus is allocated across goals"
                headerAction={<SurplusAllocationToggle chartType={surplusChartType} setChartType={setSurplusChartType} />}
              >
                <SurplusAllocationChart goals={goals} surplusPaise={surplusPaise} chartType={surplusChartType} />
              </ChartCard>
            </div>
          )}

          {/* Row 6 — Goals summary (full width, only when goals exist) */}
          {goals.length > 0 && (() => {
            const withStatus = goals.map((g) => ({
              ...g,
              _status: calculateGoalStatus(g, surplusPaise),
            }))
            // At Risk first, then by deadline
            const sorted = [...withStatus].sort((a, b) => {
              if (a._status.status === 'At Risk' && b._status.status !== 'At Risk') return -1
              if (b._status.status === 'At Risk' && a._status.status !== 'At Risk') return 1
              return new Date(a.deadline || 0) - new Date(b.deadline || 0)
            })
            const shown = sorted.slice(0, 3)
            return (
              <div className="md:col-span-2">
                <div
                  className="rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
                  style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-semibold text-white">Goals</h3>
                        <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">{goals.length}</span>
                      </div>
                      <p className="text-xs text-white/35 mt-0.5">Your top active goals</p>
                    </div>
                    <Link
                      to="/goals"
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      View all <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {shown.map((g) => (
                      <DashboardGoalCard key={g.id} goal={g} surplusPaise={effectiveSurplusPaise} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {/* ── Report Modal ────────────────────────────────────────────────── */}
      {showReport && (
        <ReportModal
          summary={mergedSummary}
          incomeStreams={incomeStreams}
          monthlyHistory={monthlyHistory}
          activeLoans={activeLoans}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
