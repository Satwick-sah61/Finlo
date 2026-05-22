import { useState, useMemo } from 'react'
import { format, differenceInCalendarMonths } from 'date-fns'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { calculateGoalStatus, getGoalTypeMeta } from '../../utils/goalStatus.js'
import { formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'

// ─── Status colour map ────────────────────────────────────────────────────────

const STATUS_COLOR = {
  Completed: '#10B981',
  Ahead:     '#06B6D4',
  'On Track':'#6366F1',
  'At Risk': '#EF4444',
}

// ─── Position helper ──────────────────────────────────────────────────────────

function pctOf(time, minTime, range) {
  if (range <= 0) return 50
  return Math.max(2, Math.min(98, ((time - minTime) / range) * 100))
}

// ─── Inline goal detail ───────────────────────────────────────────────────────

function GoalDetail({ goal, surplusPaise }) {
  const typeMeta = getGoalTypeMeta(goal.type)
  const status   = calculateGoalStatus(goal, surplusPaise)
  const target   = Number(goal.target_amount) || 0
  const saved    = Number(goal.saved_amount)  || 0

  return (
    <div className="p-4 rounded-2xl space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{typeMeta.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{goal.name}</p>
            <p className="text-[11px] text-white/35">
              {goal.deadline ? `Due ${format(new Date(goal.deadline), 'd MMM yyyy')}` : 'No deadline'}
            </p>
          </div>
        </div>
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ background: `${STATUS_COLOR[status.status] ?? '#6366F1'}22`, color: STATUS_COLOR[status.status] ?? '#6366F1' }}
        >
          {status.status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-white/40">{formatINRCompact(saved)} saved</span>
          <span className="font-semibold text-white">{status.pctComplete}%</span>
        </div>
        <div className="h-2 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${status.pctComplete}%`, background: STATUS_COLOR[status.status] ?? '#6366F1' }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/25">
          <span>{status.monthsRemaining > 0 ? `${status.monthsRemaining} months remaining` : 'Deadline passed'}</span>
          <span>{formatINRFromPaise(target)}</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="px-3 py-2 rounded-xl bg-white/4 border border-white/6">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Need / month</p>
          <p className="text-sm font-bold font-numeric text-white">{formatINRCompact(status.requiredPerMonth)}</p>
        </div>
        {status.projectedDate ? (
          <div className="px-3 py-2 rounded-xl bg-white/4 border border-white/6">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Projected done</p>
            <p className="text-sm font-bold text-white">{format(status.projectedDate, 'MMM yyyy')}</p>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/15">
            <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-0.5">Shortfall</p>
            <p className="text-sm font-bold font-numeric text-red-400">{formatINRCompact(status.shortfallPerMonth)}/mo</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoalTimeline({ goals, surplusPaise }) {
  const [selectedId, setSelectedId] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const { nodes, todayPct, minWidth } = useMemo(() => {
    const active = goals
      .filter(g => g.status !== 'Draft' && g.status !== 'Completed' && g.deadline)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))

    if (active.length === 0) return { nodes: [], todayPct: 5, minWidth: 600 }

    const now = new Date()
    const deadlineTimes = active.map(g => new Date(g.deadline).getTime())
    const earliest = Math.min(now.getTime(), ...deadlineTimes)
    const latest   = Math.max(...deadlineTimes)
    const padding  = Math.max((latest - earliest) * 0.06, 30 * 24 * 60 * 60 * 1000) // min 30 days padding

    const timeMin = earliest - padding
    const timeMax = latest  + padding
    const range   = timeMax - timeMin

    const nodeList = active.map((g, i) => {
      const status = calculateGoalStatus(g, surplusPaise)
      return {
        ...g,
        _status: status,
        _pct:    pctOf(new Date(g.deadline).getTime(), timeMin, range),
        _above:  i % 2 === 0,
        _color:  STATUS_COLOR[status.status] ?? '#6366F1',
        _isAtRisk: status.status === 'At Risk',
        _isOverdue: new Date(g.deadline) < now,
      }
    })

    return {
      nodes:    nodeList,
      todayPct: pctOf(now.getTime(), timeMin, range),
      minWidth: Math.max(600, active.length * 180),
    }
  }, [goals, surplusPaise])

  if (nodes.length === 0) return null

  const selected = nodes.find(n => n.id === selectedId)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Goal Timeline</h3>
          <span className="text-[10px] text-white/30 bg-white/6 px-2 py-0.5 rounded-full">{nodes.length} active</span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Scrollable timeline */}
          <div className="overflow-x-auto pb-2">
            <div className="relative" style={{ minWidth, height: 168 }}>
              {/* Baseline line */}
              <div
                className="absolute left-0 right-0 h-0.5 rounded-full"
                style={{ top: 84, background: 'rgba(255,255,255,0.08)' }}
              />

              {/* Today marker */}
              <div
                className="absolute"
                style={{ left: `${todayPct}%`, top: 58, transform: 'translateX(-50%)' }}
              >
                <div
                  className="w-px"
                  style={{ height: 52, background: 'rgba(99,102,241,0.5)' }}
                />
                <span
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-indigo-400 px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.12)' }}
                >
                  Today
                </span>
              </div>

              {/* Goal nodes */}
              {nodes.map(node => {
                const isSelected = node.id === selectedId
                const typeMeta   = getGoalTypeMeta(node.type)

                return (
                  <div
                    key={node.id}
                    className="absolute"
                    style={{ left: `${node._pct}%`, top: 84, transform: 'translate(-50%, -50%)' }}
                  >
                    {/* Pulsing ring for At Risk */}
                    {node._isAtRisk && (
                      <div
                        className="absolute inset-0 rounded-full animate-ping opacity-60"
                        style={{ background: node._color, transform: 'scale(1.8)' }}
                      />
                    )}

                    {/* Node button */}
                    <button
                      onClick={() => setSelectedId(isSelected ? null : node.id)}
                      title={node.name}
                      className="relative w-9 h-9 rounded-full flex items-center justify-center text-base transition-transform hover:scale-110 focus:outline-none"
                      style={{
                        background: isSelected ? node._color : '#1C1B29',
                        border: `2.5px solid ${node._color}`,
                        boxShadow: isSelected ? `0 0 12px ${node._color}55` : undefined,
                        opacity: node._isOverdue ? 0.7 : 1,
                      }}
                    >
                      {typeMeta.icon}
                    </button>

                    {/* Label — alternates above/below */}
                    <div
                      className="absolute w-28 text-center pointer-events-none"
                      style={
                        node._above
                          ? { bottom: 26, left: '50%', transform: 'translateX(-50%)' }
                          : { top:    26, left: '50%', transform: 'translateX(-50%)' }
                      }
                    >
                      <p className="text-[11px] font-semibold text-white truncate leading-tight">{node.name}</p>
                      <p className="text-[10px] leading-snug" style={{ color: node._color }}>
                        {node.deadline ? format(new Date(node.deadline), 'MMM yyyy') : '—'}
                      </p>
                      {node._isOverdue && (
                        <p className="text-[9px] text-red-400/70">Overdue</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-white/30">
            {Object.entries(STATUS_COLOR).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>

          {/* Expanded detail */}
          {selected && (
            <GoalDetail goal={selected} surplusPaise={surplusPaise} />
          )}
        </div>
      )}
    </div>
  )
}
