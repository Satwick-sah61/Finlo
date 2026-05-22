import { useState, useMemo } from 'react'
import { X, Lightbulb, ShieldCheck, TrendingUp, Plus } from 'lucide-react'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Rule engine ──────────────────────────────────────────────────────────────

function buildRecommendations(activeGoals, summary) {
  const recs = []
  const goalTypes = new Set(activeGoals.map(g => g.type))
  const monthlyExpenses = summary?.totalMonthlyExpensesPaise ?? 0
  const savingsRate     = summary?.savingsRate ?? 0

  // Rule 1: No emergency fund
  if (!goalTypes.has('emergency')) {
    const suggested = Math.round(monthlyExpenses * 3)
    recs.push({
      id:          'no_emergency_fund',
      icon:        '🛡️',
      IconComp:    ShieldCheck,
      title:       'You have no emergency fund',
      description: `Life is unpredictable. ${monthlyExpenses > 0
        ? `We recommend building at least ${formatINRCompact(suggested)} — 3 months of your expenses — as a financial safety net before any other goal.`
        : 'An emergency fund of 3–6 months of expenses is the foundation of a healthy financial life.'}`,
      urgency:     'high',
      cta:         'Start Emergency Fund',
      goalType:    'emergency',
      color:       'emerald',
    })
  }

  // Rule 2: High savings rate, no wealth-building goal
  if (savingsRate >= 30 && activeGoals.length < 4) {
    recs.push({
      id:          'invest_surplus',
      icon:        '📈',
      IconComp:    TrendingUp,
      title:       "You're saving well — put it to work",
      description: `Your savings rate is ${savingsRate}%, which is excellent. Idle savings lose value to inflation over time. Consider a goal to invest your surplus — SIPs, index funds, or a long-term wealth target.`,
      urgency:     'medium',
      cta:         'Create Wealth Goal',
      goalType:    'custom',
      color:       'cyan',
    })
  }

  // Rule 3: General prompt for users with very few goals
  if (activeGoals.length === 0) {
    recs.push({
      id:          'create_first_goal',
      icon:        '🎯',
      IconComp:    Lightbulb,
      title:       'No goals yet — what are you saving for?',
      description: 'Goals give your savings a purpose. Whether it\'s a trip, an emergency fund, or a big purchase — having a target makes it far more likely you\'ll get there.',
      urgency:     'medium',
      cta:         'Set My First Goal',
      goalType:    'custom',
      color:       'indigo',
    })
  }

  return recs
}

// ─── Single recommendation card ───────────────────────────────────────────────

const URGENCY_RING = { high: 'border-emerald-500/25', medium: 'border-indigo-500/20' }
const URGENCY_BG   = { high: 'bg-emerald-500/6',      medium: 'bg-indigo-500/6'      }
const CTA_COLOR    = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
  cyan:    'bg-cyan-600 hover:bg-cyan-500',
  indigo:  'bg-indigo-600 hover:bg-indigo-500',
}

function RecCard({ rec, onAddGoal, onDismiss }) {
  return (
    <div className={`relative rounded-2xl p-4 border ${URGENCY_BG[rec.urgency]} ${URGENCY_RING[rec.urgency]}`}>
      <button
        onClick={() => onDismiss(rec.id)}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-lg text-white/20 hover:text-white/50 hover:bg-white/8 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="text-2xl flex-shrink-0 mt-0.5">{rec.icon}</span>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{rec.title}</p>
            <p className="text-xs text-white/45 leading-relaxed mt-1">{rec.description}</p>
          </div>
          <button
            onClick={() => onAddGoal(rec.goalType)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold transition-colors ${CTA_COLOR[rec.color]}`}
          >
            <Plus className="w-3 h-3" /> {rec.cta}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoalRecommendations({ activeGoals, summary, onAddGoal }) {
  const [dismissed, setDismissed] = useState(new Set())

  const recommendations = useMemo(
    () => buildRecommendations(activeGoals, summary).filter(r => !dismissed.has(r.id)),
    [activeGoals, summary, dismissed]
  )

  if (recommendations.length === 0) return null

  function dismiss(id) {
    setDismissed(prev => new Set([...prev, id]))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white/60">Suggestions for you</h3>
      </div>
      <div className="space-y-3">
        {recommendations.map(rec => (
          <RecCard
            key={rec.id}
            rec={rec}
            onAddGoal={onAddGoal}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </div>
  )
}
