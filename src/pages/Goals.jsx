import { useState, useMemo } from 'react'
import { Target, Plus, ArrowUpDown, BookmarkCheck, Zap, Download, Lock } from 'lucide-react'
import { useFinancials, currentMonth } from '../hooks/useFinancials.js'
import { useGoals } from '../hooks/useGoals.js'
import { useAppStore } from '../store/appStore.js'
import { calculateGoalStatus, computeGoalAllocation } from '../utils/goalStatus.js'
import { formatINRCompact } from '../utils/currency.js'
import { buildGoalsExport, downloadGoalsJSON, downloadGoalsEncrypted } from '../utils/goalsExport.js'
import GoalCard from '../components/goals/GoalCard.jsx'
import GoalCreationFlow from '../components/goals/GoalCreationFlow.jsx'
import GoalTimeline from '../components/goals/GoalTimeline.jsx'
import GoalRecommendations from '../components/goals/GoalRecommendations.jsx'

// ─── Skeletons ────────────────────────────────────────────────────────────────

function GoalSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="h-12 bg-white/5" />
      <div className="p-5 space-y-4">
        <div className="h-4 bg-white/6 rounded-lg w-3/4" />
        <div className="h-3 bg-white/4 rounded-lg w-1/2" />
        <div className="h-2.5 bg-white/6 rounded-full" />
        <div className="h-8 bg-white/4 rounded-xl" />
      </div>
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ goalsWithStatus, goalAllocatedPaise, surplusPaise }) {
  const total     = goalsWithStatus.length
  const active    = goalsWithStatus.filter(g => g._status.status !== 'Completed').length
  const completed = goalsWithStatus.filter(g => g._status.status === 'Completed').length
  const atRisk    = goalsWithStatus.filter(g => g._status.status === 'At Risk').length

  const totalTarget = goalsWithStatus.reduce((s, g) => s + (Number(g.target_amount) || 0), 0)
  const totalSaved  = goalsWithStatus.reduce((s, g) => s + (Number(g.saved_amount)  || 0), 0)
  const overallPct  = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0

  const effectiveSurplus = surplusPaise - goalAllocatedPaise

  if (total === 0) return null

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SumStat label="Total Goals"  value={total} />
        <SumStat label="Active"       value={active} />
        <SumStat label="Completed"    value={completed} valueColor="text-emerald-400" />
        <SumStat label="At Risk"      value={atRisk}    valueColor={atRisk > 0 ? 'text-red-400' : 'text-white'} />
      </div>

      {goalAllocatedPaise > 0 && surplusPaise > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-indigo-500/8 border border-indigo-500/15">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <div>
              <p className="text-xs font-semibold text-white">Monthly goal commitment</p>
              <p className="text-[11px] text-white/40">Automatically reserved from your surplus each month</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <p className="text-sm font-bold text-indigo-300 font-numeric">
              {formatINRCompact(goalAllocatedPaise)}<span className="text-white/30 font-normal">/mo</span>
            </p>
            <p className="text-[11px] text-white/40 font-numeric">
              {effectiveSurplus >= 0
                ? <span className="text-emerald-400">{formatINRCompact(effectiveSurplus)} free</span>
                : <span className="text-red-400">{formatINRCompact(Math.abs(effectiveSurplus))} over budget</span>
              }
            </p>
          </div>
        </div>
      )}

      {totalTarget > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-white/40">
            <span>Overall progress — {formatINRCompact(totalSaved)} of {formatINRCompact(totalTarget)}</span>
            <span className="font-semibold text-white">{overallPct}%</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #6366F1, #06B6D4)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SumStat({ label, value, valueColor = 'text-white' }) {
  return (
    <div>
      <p className="text-xs text-white/35 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
        🎯
      </div>
      <div className="text-center">
        <h3 className="text-base font-semibold text-white">No goals yet</h3>
        <p className="text-sm text-white/35 mt-1 max-w-xs">
          Set a financial goal and Finio will track your progress and tell you if you're on track.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
      >
        <Plus className="w-4 h-4" /> Create your first goal
      </button>
    </div>
  )
}

// ─── Export menu ──────────────────────────────────────────────────────────────

function ExportMenu({ goals, cryptoKey }) {
  const [open, setOpen]       = useState(false)
  const [working, setWorking] = useState(false)

  async function doExport(encrypted) {
    setWorking(true)
    setOpen(false)
    try {
      const data = buildGoalsExport(goals)
      if (encrypted) {
        await downloadGoalsEncrypted(data, cryptoKey)
      } else {
        downloadGoalsJSON(data)
      }
    } catch (err) {
      console.error('[GoalsExport]', err)
    }
    setWorking(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={working || goals.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/8 hover:text-white/60 transition-colors border border-white/8 disabled:opacity-40"
      >
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 w-44 rounded-xl shadow-xl z-20 overflow-hidden"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.12)' }}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            onClick={() => doExport(false)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/70 hover:bg-white/6 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> JSON (plain)
          </button>
          <button
            onClick={() => doExport(true)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/70 hover:bg-white/6 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" /> JSON (encrypted)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Filters & sort ───────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'Active' },
  { id: 'at_risk',   label: 'At Risk' },
  { id: 'completed', label: 'Completed' },
]

const SORT_OPTIONS = [
  { id: 'deadline',  label: 'Deadline' },
  { id: 'priority',  label: 'Priority' },
  { id: 'pct',       label: '% Complete' },
  { id: 'amount',    label: 'Target Amount' },
]

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Goals() {
  const month     = currentMonth()
  const cryptoKey = useAppStore(s => s.cryptoKey)
  const { summary, loading: finLoading } = useFinancials(month)
  const { goals, loading: goalsLoading, refresh } = useGoals()

  const [showCreate, setShowCreate]   = useState(false)
  const [prefillType, setPrefillType] = useState(null)
  const [filter, setFilter]           = useState('all')
  const [sort, setSort]               = useState('deadline')
  const [showSortMenu, setShowSortMenu] = useState(false)

  const surplusPaise = summary?.surplusPaise ?? 0
  const loading = finLoading || goalsLoading

  const draftGoals  = useMemo(() => goals.filter(g => g.status === 'Draft'),  [goals])
  const activeGoals = useMemo(() => goals.filter(g => g.status !== 'Draft'),  [goals])

  const goalAllocatedPaise   = useMemo(() => computeGoalAllocation(activeGoals), [activeGoals])
  const effectiveSurplusPaise = surplusPaise - goalAllocatedPaise

  const goalsWithStatus = useMemo(
    () => activeGoals.map(g => ({ ...g, _status: calculateGoalStatus(g, surplusPaise) })),
    [activeGoals, surplusPaise]
  )

  const filtered = useMemo(() => {
    let list = goalsWithStatus
    if (filter === 'active')    list = list.filter(g => g._status.status !== 'Completed')
    else if (filter === 'at_risk')  list = list.filter(g => g._status.status === 'At Risk')
    else if (filter === 'completed') list = list.filter(g => g._status.status === 'Completed')

    return [...list].sort((a, b) => {
      if (sort === 'deadline')  return new Date(a.deadline || 0) - new Date(b.deadline || 0)
      if (sort === 'priority')  return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
      if (sort === 'pct')       return b._status.pctComplete - a._status.pctComplete
      if (sort === 'amount')    return (Number(b.target_amount) || 0) - (Number(a.target_amount) || 0)
      return 0
    })
  }, [goalsWithStatus, filter, sort])

  function filterCount(id) {
    if (id === 'all')       return goals.length
    if (id === 'active')    return goalsWithStatus.filter(g => g._status.status !== 'Completed').length
    if (id === 'at_risk')   return goalsWithStatus.filter(g => g._status.status === 'At Risk').length
    return goalsWithStatus.filter(g => g._status.status === 'Completed').length
  }

  function handleAddGoal(type = null) {
    setPrefillType(type)
    setShowCreate(true)
  }

  const sortLabel = SORT_OPTIONS.find(s => s.id === sort)?.label ?? 'Sort'
  const onlyActiveForTimeline = activeGoals.filter(g => g.status !== 'Completed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-semibold text-white">Goals</h2>
          {!loading && activeGoals.length > 0 && (
            <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">{activeGoals.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && goals.length > 0 && (
            <ExportMenu goals={goals} cryptoKey={cryptoKey} />
          )}
          <button
            onClick={() => handleAddGoal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Goal
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && (
        <SummaryBar
          goalsWithStatus={goalsWithStatus}
          goalAllocatedPaise={goalAllocatedPaise}
          surplusPaise={surplusPaise}
        />
      )}

      {/* Goal timeline */}
      {!loading && onlyActiveForTimeline.length >= 2 && (
        <GoalTimeline goals={activeGoals} surplusPaise={effectiveSurplusPaise} />
      )}

      {/* Recommendations (shown when < 3 active non-completed goals) */}
      {!loading && goalsWithStatus.filter(g => g._status.status !== 'Completed').length < 3 && (
        <GoalRecommendations
          activeGoals={goalsWithStatus.filter(g => g._status.status !== 'Completed')}
          summary={summary}
          onAddGoal={handleAddGoal}
        />
      )}

      {/* Filter + Sort bar */}
      {!loading && goals.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
            {FILTERS.map(f => {
              const count = filterCount(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {f.label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-[10px] ${filter === f.id ? 'text-white/60' : 'text-white/25'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/8 hover:text-white/60 transition-colors border border-white/8"
            >
              <ArrowUpDown className="w-3.5 h-3.5" /> {sortLabel}
            </button>
            {showSortMenu && (
              <div
                className="absolute right-0 top-9 w-40 rounded-xl shadow-xl z-20 overflow-hidden"
                style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.12)' }}
                onMouseLeave={() => setShowSortMenu(false)}
              >
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { setSort(opt.id); setShowSortMenu(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      sort === opt.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/60 hover:bg-white/6'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2].map(i => <GoalSkeleton key={i} />)}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState onAdd={() => handleAddGoal()} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">
          No goals match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              surplusPaise={effectiveSurplusPaise}
              onDeleted={refresh}
              onUpdated={refresh}
              onActivated={refresh}
              onNewGoal={() => handleAddGoal()}
            />
          ))}
        </div>
      )}

      {/* Draft goals section */}
      {!loading && draftGoals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-white/30" />
            <h3 className="text-sm font-semibold text-white/40">Saved as Drafts</h3>
            <span className="text-xs text-white/20 bg-white/5 px-2 py-0.5 rounded-full">{draftGoals.length}</span>
            <p className="text-xs text-white/25 ml-1">· Not counted in your monthly budget</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draftGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                surplusPaise={effectiveSurplusPaise}
                onDeleted={refresh}
                onUpdated={refresh}
                onActivated={refresh}
                onNewGoal={() => handleAddGoal()}
              />
            ))}
          </div>
        </div>
      )}

      {/* Creation flow modal */}
      {showCreate && (
        <GoalCreationFlow
          summary={summary}
          existingGoalsCount={activeGoals.length}
          goalAllocatedPaise={goalAllocatedPaise}
          initialType={prefillType}
          onClose={() => { setShowCreate(false); setPrefillType(null) }}
          onCreated={() => { setShowCreate(false); setPrefillType(null); refresh() }}
        />
      )}
    </div>
  )
}
