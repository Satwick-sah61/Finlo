import { useEffect } from 'react'
import { X, Trophy } from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────

const MILESTONE_META = {
  25:  { emoji: '🌱', label: 'Quarter paid off!',  color: '#10B981', fullOverlay: false },
  50:  { emoji: '⚡', label: 'Halfway there!',      color: '#6366F1', fullOverlay: false },
  75:  { emoji: '🔥', label: '75% paid off!',       color: '#F59E0B', fullOverlay: false },
  100: { emoji: '🎉', label: 'Fully paid off!',     color: '#10B981', fullOverlay: true  },
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4']

function Confetti() {
  const particles = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2.5,
    duration: 2 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 8,
    rotate: Math.random() * 360,
  }))
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '-12px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `milestoneConfetti ${p.duration}s ${p.delay}s ease-in both`,
          }}
        />
      ))}
      <style>{`
        @keyframes milestoneConfetti {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes milestoneSlideIn {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes milestoneFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── Single toast (25 / 50 / 75 %) ───────────────────────────────────────────

function MilestoneToast({ milestone, onDismiss }) {
  const cfg = MILESTONE_META[milestone.pct] ?? MILESTONE_META[25]

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{
        background: '#1C1B29',
        border: `1px solid ${cfg.color}40`,
        minWidth: 272,
        maxWidth: 340,
        animation: 'milestoneSlideIn 0.3s ease both',
      }}
    >
      <span className="text-2xl flex-shrink-0" role="img" aria-label="milestone">{cfg.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
        <p className="text-xs text-white/50 truncate mt-0.5">{milestone.loanName}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-white/25 hover:text-white/60 flex-shrink-0 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Full-screen 100 % overlay ────────────────────────────────────────────────

function CompletionOverlay({ milestone, onDismiss }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
    >
      <Confetti />
      <div
        className="relative z-10 text-center space-y-6 px-10 py-12 rounded-3xl mx-4"
        style={{
          background: 'rgba(28,27,41,0.95)',
          border: '1px solid rgba(16,185,129,0.3)',
          animation: 'milestoneFadeIn 0.35s ease both',
          maxWidth: 420,
        }}
      >
        <div className="text-7xl" style={{ animation: 'milestoneConfetti 0s' }}>
          {MILESTONE_META[100].emoji}
        </div>
        <div className="space-y-2">
          <p className="text-3xl font-bold text-white">Debt Free!</p>
          <p className="text-lg font-semibold text-emerald-400">{milestone.loanName}</p>
          <p className="text-sm text-white/40 leading-relaxed mt-2">
            You've fully paid off this loan. That's a major financial milestone — celebrate it!
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 py-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-semibold text-amber-400">Financial Milestone Achieved</span>
          <Trophy className="w-5 h-5 text-amber-400" />
        </div>
        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-2xl text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: '#10B981' }}
        >
          Amazing, thank you! 🎉
        </button>
      </div>
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

/**
 * @param {Array}    milestones  – from useLoans: [{ loanId, loanName, pct }]
 * @param {Function} onDismiss   – called with the milestone object to remove it
 */
export default function LoanMilestone({ milestones, onDismiss }) {
  if (!milestones || milestones.length === 0) return null

  const fullPay = milestones.find(m => m.pct === 100)
  const toasts  = milestones.filter(m => m.pct !== 100)

  return (
    <>
      {fullPay && (
        <CompletionOverlay
          milestone={fullPay}
          onDismiss={() => onDismiss(fullPay)}
        />
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(m => (
            <div key={`${m.loanId}_${m.pct}`} className="pointer-events-auto">
              <MilestoneToast milestone={m} onDismiss={() => onDismiss(m)} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
