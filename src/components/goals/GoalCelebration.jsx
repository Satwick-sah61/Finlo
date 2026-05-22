import { useEffect, useState } from 'react'
import { X, Trophy, Star, ArrowRight } from 'lucide-react'
import { differenceInMonths, format } from 'date-fns'
import { formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'
import { getGoalTypeMeta } from '../../utils/goalStatus.js'

// ─── Confetti ─────────────────────────────────────────────────────────────────

const PIECES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  color: ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#22C55E'][i % 8],
  left: `${(i * 2.2 + 1) % 97}%`,
  delay: `${((i * 0.07) % 1.1).toFixed(2)}s`,
  dur: `${(1.4 + (i % 9) * 0.12).toFixed(2)}s`,
  size: [6, 8, 10, 7][i % 4],
  shape: i % 5 === 0 ? '50%' : i % 3 === 0 ? '3px' : '1px',
  rotate: i % 2 === 0 ? 720 : -540,
}))

function Confetti() {
  return (
    <>
      <style>{`
        @keyframes goal-confetti {
          0%   { transform: translateY(-10px) rotate(0deg) scale(1);   opacity: 1; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(340px) rotate(var(--gcr)) scale(0.6); opacity: 0; }
        }
        .gc { position: absolute; top: 0; animation: goal-confetti var(--gcd) var(--gcde) ease-out forwards; border-radius: var(--gcbr); }
      `}</style>
      <div className="absolute inset-x-0 top-0 h-0 overflow-visible pointer-events-none" aria-hidden>
        {PIECES.map(p => (
          <div
            key={p.id}
            className="gc"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              background: p.color,
              '--gcd':  p.dur,
              '--gcde': p.delay,
              '--gcr':  `${p.rotate}deg`,
              '--gcbr': p.shape,
            }}
          />
        ))}
      </div>
    </>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-white/6 border border-white/8">
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
      <p className="text-base font-bold font-numeric text-white">{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoalCelebration({ goal, onArchive, onNewGoal, onDismiss }) {
  const [archiving, setArchiving] = useState(false)
  const typeMeta = getGoalTypeMeta(goal.type)

  const targetPaise = Number(goal.target_amount) || 0
  const savedPaise  = Number(goal.saved_amount)  || 0
  const createdAt   = goal.created_at ? new Date(goal.created_at) : null
  const monthsTaken = createdAt ? Math.max(1, differenceInMonths(new Date(), createdAt)) : 1
  const monthlyAvg  = Math.round(savedPaise / monthsTaken)

  // Lock scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleArchive() {
    setArchiving(true)
    try {
      await onArchive()
    } catch (err) {
      console.error('[GoalCelebration] archive:', err)
      setArchiving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.88)' }}
        onClick={onDismiss}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden flex flex-col items-center"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <Confetti />

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero */}
        <div className="pt-10 pb-6 px-6 text-center space-y-3">
          <div className="relative inline-block">
            <span className="text-6xl">{typeMeta.icon}</span>
            <div className="absolute -top-1 -right-2 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white leading-tight">You did it!</h2>
            <p className="text-sm text-white/50 mt-1">
              <span className="text-white font-semibold">"{goal.name}"</span> is complete
            </p>
          </div>

          <div className="flex items-center justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="w-full px-6 pb-6">
          <div className="grid grid-cols-3 gap-3">
            <StatPill label="Total Saved" value={formatINRCompact(savedPaise)} />
            <StatPill label="Months Taken" value={`${monthsTaken}mo`} />
            <StatPill label="Avg / Month" value={formatINRCompact(monthlyAvg)} />
          </div>
        </div>

        {/* Message */}
        <div className="w-full px-6 pb-6">
          <div className="px-4 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center">
            <p className="text-sm text-indigo-300 leading-relaxed">
              Completed {format(new Date(), 'd MMM yyyy')} · {formatINRFromPaise(targetPaise)} saved in full
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="w-full px-6 pb-8 flex gap-3">
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {archiving ? 'Archiving…' : '🏆 Archive Goal'}
          </button>
          <button
            onClick={() => { onDismiss(); onNewGoal() }}
            className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/6 hover:bg-white/10 text-white/60 text-sm transition-colors"
          >
            New Goal <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
