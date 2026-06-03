/**
 * SalaryFramework — Salary / Budget Framework Planner page.
 *
 * Flow:
 *   1. User selects a framework preset (or Custom)
 *   2. Page shows ideal vs actual side-by-side comparison
 *   3. AI insight button sends anonymized framework data to Claude
 *   4. "Adjust My Budget" CTA writes framework targets as expense budgets
 *
 * Framework choice persisted in app_config['budget_framework'].
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Sparkles, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { useFinancials } from '../hooks/useFinancials.js'
import { useGoals } from '../hooks/useGoals.js'
import { useLoans } from '../hooks/useLoans.js'
import { configGet, configSet } from '../db/schema.js'
import { analyzeFramework } from '../utils/frameworkAnalysis.js'
import { formatINRCompact, formatINRFromPaise } from '../utils/currency.js'
import FrameworkSelector from '../components/framework/FrameworkSelector.jsx'
import FrameworkChart from '../components/framework/FrameworkChart.jsx'

const AI_MODEL  = 'claude-sonnet-4-20250514'
const AI_URL    = 'https://api.anthropic.com/v1/messages'
const AI_TOKENS = 512

// ─── Load API key ─────────────────────────────────────────────────────────────

async function loadApiKey() {
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (envKey) return envKey
  try { return (await configGet('anthropic_api_key')) || null } catch { return null }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/6 rounded-xl ${className}`} />
}

// ─── AI insight ───────────────────────────────────────────────────────────────

async function fetchAIInsight(framework, incomePaise, analysis, signal) {
  const apiKey = await loadApiKey()
  if (!apiKey) throw new Error('No API key — add it in Settings → AI Features')

  const payload = {
    framework:      framework.name,
    monthly_income: Math.round(incomePaise / 100),
    score:          analysis.score,
    buckets:        analysis.buckets.map((b) => ({
      name:      b.label,
      target_pct: b.targetPct,
      actual_pct: b.actualPct,
      status:    b.status,
    })),
    over_budget:   analysis.overBudget.map((b) => b.label),
    under_budget:  analysis.underBudget.map((b) => b.label),
  }

  const prompt = `You are a concise Indian personal finance advisor. The user is following the ${framework.name} budget framework.

Framework analysis (all amounts in INR):
${JSON.stringify(payload, null, 2)}

Give 2-3 sentences of personalised, actionable guidance. Reference their actual numbers.
Be specific and practical. Use ₹ symbol. Do not start with "Great" or generic openers.`

  const res = await fetch(AI_URL, {
    method:  'POST',
    signal,
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      AI_MODEL,
      max_tokens: AI_TOKENS,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text?.trim() || 'No insight returned.'
}

// ─── Rule-based fallback insight ──────────────────────────────────────────────

function ruleFallbackInsight(analysis, framework) {
  if (!analysis) return null
  const { score, overBudget, underBudget, suggestions } = analysis

  if (score >= 85) return `You're closely following the ${framework.name} — great discipline this month.`
  if (overBudget.length > 0) {
    return `${overBudget[0].label} is ${overBudget[0].overByStr} over your ${framework.name} target. ${suggestions[0] || ''}`
  }
  if (underBudget.length > 0) {
    const sav = underBudget.find((b) => b.id === 'savings' || b.id === 'investments')
    if (sav) return `Savings are ${sav.underByStr} below target. Consider setting up an automatic SIP transfer on payday.`
  }
  return suggestions[0] || `Your framework score is ${score}/100.`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalaryFramework() {
  const navigate = useNavigate()

  // Data hooks
  const { summary, expenses, loading: finLoading, saveBudgets } = useFinancials()
  const { totalMonthlyCommitment = 0 }                           = useGoals()
  const { totalMonthlyEMI = 0 }                                  = useLoans()

  // Framework state
  const [framework,  setFramework]  = useState(null)
  const [fwLoaded,   setFwLoaded]   = useState(false)

  // AI state
  const [aiInsight,  setAiInsight]  = useState(null)
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)
  const abortRef                    = { current: null }

  // Load saved framework on mount
  useEffect(() => {
    configGet('budget_framework')
      .then((saved) => {
        if (saved) try { setFramework(JSON.parse(saved)) } catch { /* ignore */ }
        setFwLoaded(true)
      })
      .catch(() => setFwLoaded(true))
  }, [])

  // Persist framework choice and reset AI insight
  async function handleSelectFramework(fw) {
    setFramework(fw)
    setAiInsight(null)
    setAiError(null)
    await configSet('budget_framework', JSON.stringify(fw))
  }

  // Analysis (pure, synchronous)
  const analysis = useMemo(() => {
    if (!framework || !summary || finLoading) return null
    return analyzeFramework(
      framework,
      summary.totalMonthlyIncomePaise,
      expenses,
      totalMonthlyCommitment,
      totalMonthlyEMI,
    )
  }, [framework, summary, expenses, totalMonthlyCommitment, totalMonthlyEMI, finLoading])

  // ── AI insight call ─────────────────────────────────────────────────────────
  const handleAiInsight = useCallback(async () => {
    if (!analysis || !framework) return
    setAiLoading(true)
    setAiError(null)
    setAiInsight(null)

    const controller = new AbortController()
    abortRef.current = controller
    const timeout    = setTimeout(() => controller.abort(), 10_000)

    try {
      const text = await fetchAIInsight(framework, summary.totalMonthlyIncomePaise, analysis, controller.signal)
      setAiInsight(text)
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        setAiInsight(ruleFallbackInsight(analysis, framework))
      } else {
        setAiError(err.message)
        setAiInsight(ruleFallbackInsight(analysis, framework))
      }
    } finally {
      clearTimeout(timeout)
      setAiLoading(false)
    }
  }, [analysis, framework, summary])

  // ── Adjust My Budget CTA ────────────────────────────────────────────────────
  async function handleAdjustBudget() {
    if (!analysis || !summary?.totalMonthlyIncomePaise) return

    // Build budget map: category → target paise
    // Each bucket has categories; distribute target paise equally among categories
    const budgets = {}
    for (const bucket of (framework.buckets || [])) {
      const cats = Object.entries(framework.categoryMap || {})
        .filter(([, bucketId]) => bucketId === bucket.id)
        .map(([cat]) => cat)

      if (cats.length === 0) continue
      const perCat = Math.round(bucket.targetPaise / cats.length)
      for (const cat of cats) {
        budgets[cat] = perCat
      }
    }

    await saveBudgets(budgets)
    navigate('/expenses')
  }

  const incomePaise = summary?.totalMonthlyIncomePaise || 0
  const loading     = finLoading || !fwLoaded

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Wallet className="w-5 h-5 text-indigo-400" />
        <h2 className="text-xl font-semibold text-white">Salary Planner</h2>
        {incomePaise > 0 && !loading && (
          <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
            Based on {formatINRCompact(incomePaise)}/mo income
          </span>
        )}
      </div>

      {/* ── Income required notice ───────────────────────────────────────── */}
      {!loading && incomePaise === 0 && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}
        >
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-white/50">
            Add income streams first — the framework planner uses your monthly income to calculate targets.
          </p>
        </div>
      )}

      {/* ── Framework selector ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div>
          <p className="text-sm font-semibold text-white">Choose a Framework</p>
          <p className="text-xs text-white/35 mt-0.5">
            Select how you want to allocate your monthly income across buckets.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <FrameworkSelector selected={framework} onSelect={handleSelectFramework} />
        )}
      </div>

      {/* ── Analysis panel (only when framework selected + data loaded) ──── */}
      {!loading && framework && analysis && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{framework.name} — Analysis</p>
              <p className="text-xs text-white/35 mt-0.5">
                How your current spending compares to your target allocation
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* AI insight */}
              <button
                onClick={handleAiInsight}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#A5B4FC' }}
              >
                {aiLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />
                }
                {aiLoading ? 'Analysing…' : 'AI Insight'}
              </button>

              {/* Adjust budget */}
              {incomePaise > 0 && (
                <button
                  onClick={handleAdjustBudget}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: '#6366F1' }}
                >
                  Adjust My Budget
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* AI insight box */}
          {(aiInsight || aiError) && (
            <div
              className="rounded-xl p-4 flex gap-3"
              style={{
                background: aiError ? 'rgba(239,68,68,0.06)' : 'rgba(99,102,241,0.08)',
                border:     `1px solid ${aiError ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}`,
              }}
            >
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: aiError ? '#EF4444' : '#818CF8' }} />
              <p className="text-xs text-white/60 leading-relaxed">{aiInsight}</p>
            </div>
          )}

          <FrameworkChart
            analysis={analysis}
            incomePaise={incomePaise}
            frameworkName={framework.name}
          />
        </div>
      )}

      {/* ── Empty state (framework not yet selected) ─────────────────────── */}
      {!loading && !framework && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center text-center gap-4"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <Wallet className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Select a framework above</p>
            <p className="text-sm text-white/35 mt-1.5 max-w-sm leading-relaxed">
              Choose a budgeting framework to see how your actual spending compares to your ideal allocation.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
