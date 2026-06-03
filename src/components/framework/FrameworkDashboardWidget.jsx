/**
 * FrameworkDashboardWidget — compact version for Dashboard.
 * Shows framework score + top 2 bucket variances.
 * Loads its own saved framework from app_config.
 * Only renders if a framework has been selected.
 *
 * Props: incomePaise, expenses[], goalsMonthlyCommitment, loansMonthlyEMI
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ChevronRight } from 'lucide-react'
import { configGet } from '../../db/schema.js'
import { analyzeFramework } from '../../utils/frameworkAnalysis.js'
import { formatINRCompact } from '../../utils/currency.js'

const STATUS_COLOR = { good: '#10B981', warning: '#F59E0B', danger: '#EF4444' }

function ScoreRing({ score }) {
  const r    = 18
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const c    = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <div className="relative w-11 h-11 flex-shrink-0">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={r}
          fill="none" stroke={c} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold" style={{ color: c }}>{score}</span>
      </div>
    </div>
  )
}

export default function FrameworkDashboardWidget({
  incomePaise,
  expenses,
  goalsMonthlyCommitment = 0,
  loansMonthlyEMI = 0,
}) {
  const [framework, setFramework] = useState(null)
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    configGet('budget_framework')
      .then((saved) => {
        if (saved) {
          try { setFramework(JSON.parse(saved)) } catch { /* ignore */ }
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const analysis = useMemo(() => {
    if (!framework || !incomePaise || !expenses) return null
    return analyzeFramework(framework, incomePaise, expenses, goalsMonthlyCommitment, loansMonthlyEMI)
  }, [framework, incomePaise, expenses, goalsMonthlyCommitment, loansMonthlyEMI])

  // Don't render if no framework selected, or data not ready
  if (!loaded || !framework || !analysis) return null

  // Top 2 most off-target buckets (by absolute variance %)
  const top2 = [...analysis.buckets]
    .filter((b) => b.status !== 'good')
    .sort((a, b) => Math.abs(b.varPct) - Math.abs(a.varPct))
    .slice(0, 2)

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">Budget Framework</p>
          <span className="text-[10px] text-white/25 bg-white/5 px-2 py-0.5 rounded-full">
            {framework.name}
          </span>
        </div>
        <Link
          to="/salary-planner"
          className="flex items-center gap-0.5 text-[11px] text-indigo-400/70 hover:text-indigo-400 transition-colors"
        >
          Full view <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Score + top variances */}
      <div className="flex items-center gap-4">
        <ScoreRing score={analysis.score} />
        <div className="flex-1 space-y-1.5">
          {top2.length === 0 ? (
            <p className="text-xs text-emerald-400">All buckets on track this month 🎉</p>
          ) : (
            top2.map((b) => {
              const over = b.varPaise > 0
              return (
                <div key={b.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-[11px] text-white/60 truncate">{b.label}</span>
                  </div>
                  <span
                    className="text-[11px] font-semibold font-numeric flex-shrink-0"
                    style={{ color: STATUS_COLOR[b.status] }}
                  >
                    {over ? '+' : '−'}{formatINRCompact(Math.abs(b.varPaise))} {over ? 'over' : 'under'}
                  </span>
                </div>
              )
            })
          )}
          {top2.length === 0 && analysis.score < 100 && (
            <p className="text-[10px] text-white/30">Score: {analysis.score}/100</p>
          )}
        </div>
      </div>
    </div>
  )
}
