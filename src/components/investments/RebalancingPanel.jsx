/**
 * RebalancingPanel — age-based portfolio rebalancing recommendations.
 *
 * Loads user age from app_config on mount.
 * If not set, shows a one-time age input form.
 * Generates recommendations via rebalancing.js (pure, synchronous).
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ChevronDown, ChevronUp, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { configGet, configSet } from '../../db/schema.js'
import { generateRebalancingPlan, computeTargetAllocation } from '../../utils/rebalancing.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Urgency badge ────────────────────────────────────────────────────────────

const URGENCY = {
  high:   { label: 'High priority',   color: '#EF4444', bg: 'rgba(239,68,68,0.1)'   },
  medium: { label: 'Medium priority', color: '#F59E0B', bg: 'rgba(234,179,8,0.1)'   },
  low:    { label: 'Low priority',    color: '#6366F1', bg: 'rgba(99,102,241,0.1)'  },
  none:   { label: 'Balanced',        color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
}

// ─── Allocation bar ───────────────────────────────────────────────────────────

const BUCKET_COLORS = { equity: '#6366F1', debt: '#06B6D4', gold: '#F59E0B', re: '#F97316' }
const BUCKET_LABELS = { equity: 'Equity', debt: 'Debt', gold: 'Gold', re: 'Real Estate' }

function AllocationBar({ label, allocation }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
      <div className="flex h-4 rounded-lg overflow-hidden gap-px">
        {Object.entries(allocation).map(([bucket, pct]) => {
          const pctVal = typeof pct === 'object' ? pct.pct : pct
          if (!pctVal) return null
          return (
            <div
              key={bucket}
              style={{ width: `${pctVal}%`, background: BUCKET_COLORS[bucket] }}
              title={`${BUCKET_LABELS[bucket]}: ${pctVal}%`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(allocation).map(([bucket, pct]) => {
          const pctVal = typeof pct === 'object' ? pct.pct : pct
          return (
            <div key={bucket} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: BUCKET_COLORS[bucket] }} />
              <span className="text-[9px] text-white/40">{BUCKET_LABELS[bucket]} {pctVal}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Age input form ───────────────────────────────────────────────────────────

function AgeInputForm({ onSet }) {
  const [age, setAge] = useState('')
  const valid = Number(age) >= 18 && Number(age) <= 80

  async function handleSave() {
    if (!valid) return
    await configSet('user_age_rebalancing', age.toString())
    onSet(Number(age))
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      <div>
        <p className="text-sm font-semibold text-white/80">Set your age for rebalancing</p>
        <p className="text-xs text-white/35 mt-0.5">
          Used only to compute target allocation (e.g. Equity % = 100 − age). Stored locally.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="18"
          max="80"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="e.g. 32"
          className="w-24 px-3 py-1.5 rounded-lg text-sm bg-white/6 border border-white/10 outline-none focus:border-indigo-500/40"
          style={{ color: '#ffffff', caretColor: '#ffffff' }}
          onKeyDown={(e) => e.key === 'Enter' && valid && handleSave()}
        />
        <span className="text-sm text-white/40">years old</span>
        <button
          onClick={handleSave}
          disabled={!valid}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-all"
          style={{ background: '#6366F1' }}
        >
          Set
        </button>
      </div>
    </div>
  )
}

// ─── Recommendation card ──────────────────────────────────────────────────────

function RecommendationCard({ rec }) {
  const u = URGENCY[rec.urgency] || URGENCY.low
  return (
    <div
      className="rounded-xl p-3 flex items-start gap-3"
      style={{ background: u.bg, border: `1px solid ${u.color}30` }}
    >
      {rec.type === 'overweight'
        ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: u.color }} />
        : <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: u.color }} />
      }
      <div className="flex-1 space-y-1">
        <p className="text-xs text-white/75 leading-relaxed">{rec.message}</p>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: `${u.color}20`, color: u.color }}
        >
          {u.label}
        </span>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RebalancingPanel({ enrichedInvestments }) {
  const navigate = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [userAge, setUserAge] = useState(null)
  const [ageLoaded, setAgeLoaded] = useState(false)

  // Load saved age from app_config
  useEffect(() => {
    configGet('user_age_rebalancing')
      .then((val) => {
        if (val) setUserAge(Number(val))
        setAgeLoaded(true)
      })
      .catch(() => setAgeLoaded(true))
  }, [])

  const plan = useMemo(() => {
    if (!userAge || !enrichedInvestments?.length) return null
    return generateRebalancingPlan(enrichedInvestments, userAge)
  }, [enrichedInvestments, userAge])

  const urgencyMeta = URGENCY[plan?.urgency || 'none']

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Scale className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">Rebalancing</p>
          {plan && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: urgencyMeta.bg, color: urgencyMeta.color }}
            >
              {urgencyMeta.label}
            </span>
          )}
          {userAge && (
            <span className="text-[10px] text-white/25">· Age {userAge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Age input if not set */}
          {ageLoaded && !userAge && (
            <AgeInputForm onSet={(age) => setUserAge(age)} />
          )}

          {/* Plan */}
          {plan && (
            <>
              {/* Summary */}
              <p className="text-xs text-white/50 leading-relaxed">{plan.summary}</p>

              {/* Allocation comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AllocationBar label="Target (Age-based)" allocation={plan.targetAllocation} />
                <AllocationBar label="Your Current"       allocation={plan.currentAllocation} />
              </div>

              {/* Recommendations */}
              {plan.recommendations.length > 0 ? (
                <div className="space-y-2">
                  {plan.recommendations.map((rec, i) => (
                    <RecommendationCard key={i} rec={rec} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <p className="text-sm">Portfolio is well balanced. No action needed.</p>
                </div>
              )}

              {/* Apply to Goals CTA */}
              {plan.recommendations.filter((r) => r.urgency !== 'none').length > 0 && (
                <button
                  onClick={() => navigate('/goals')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/8 transition-all border border-white/10"
                >
                  Create a rebalancing goal
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}

          {/* Disclaimer */}
          <p className="text-[9px] text-white/20 leading-snug pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            Rebalancing suggestions based on general age-based principles (Equity % = 100 − age).
            Consult a SEBI-registered investment advisor before making changes.
          </p>

          {/* Change age */}
          {userAge && (
            <button
              onClick={() => setUserAge(null)}
              className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
            >
              Change age ({userAge}) →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
