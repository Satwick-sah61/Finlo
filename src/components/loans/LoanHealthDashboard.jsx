/**
 * LoanHealthDashboard — 4 metric cards + session-cached AI insight.
 *
 * Metrics:
 *   Debt Burden   — DTI %
 *   Interest Leak — monthly interest burn (paise)
 *   Fastest Win   — loan closest to payoff
 *   Biggest Drain — highest-rate loan's monthly interest cost
 *
 * AI insight uses claude-sonnet-4-20250514 with 10s timeout.
 * Falls back to generateLoanInsights() rule-based output if API fails.
 * Result is session-cached in Zustand (loanInsightCache: { text, hash }).
 *
 * Props:
 *   activeLoans             – enriched active loans from useLoans
 *   totalMonthlyIncomePaise – from financials / budget summary
 *   surplusPaise            – monthly surplus (income - expenses)
 *   totalMonthlyEMI         – sum of all active EMIs (paise)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Flame, TrendingDown, Target, Zap, Sparkles, RefreshCw } from 'lucide-react'
import Anthropic from '@anthropic-ai/sdk'
import { useAppStore } from '../../store/appStore.js'
import { generateLoanInsights } from '../../utils/loanInsights.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Stable hash for cache invalidation ───────────────────────────────────────

function hashLoans(activeLoans, totalMonthlyIncomePaise) {
  const key = activeLoans.map(l =>
    `${l.id}:${l._outstandingPaise}:${l._pctPaid}:${l.annual_rate}`
  ).join('|') + `|income:${totalMonthlyIncomePaise}`
  // djb2 hash — fast, no crypto needed
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) ^ key.charCodeAt(i)
    h = h >>> 0 // keep unsigned 32-bit
  }
  return String(h)
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, iconColor, iconBg, label, value, sub, accentBorder }) {
  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${accentBorder ?? 'rgba(255,255,255,0.07)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        </div>
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold font-numeric text-white leading-none">{value}</p>
      {sub && <p className="text-[10px] text-white/35 leading-snug">{sub}</p>}
    </div>
  )
}

// ─── Insight bubble ───────────────────────────────────────────────────────────

function InsightBubble({ insight }) {
  return (
    <div
      className="flex gap-3 rounded-xl p-3.5"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <span className="text-xl flex-shrink-0 leading-none mt-0.5">{insight.icon}</span>
      <div className="space-y-0.5 min-w-0">
        <p className="text-xs font-semibold text-white/80 leading-snug">{insight.headline}</p>
        <p className="text-[11px] text-white/40 leading-relaxed">{insight.detail}</p>
      </div>
    </div>
  )
}

// ─── AI insight section ───────────────────────────────────────────────────────

function AIInsightSection({ activeLoans, financials }) {
  const { loanInsightCache, setLoanInsightCache } = useAppStore()
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done' | 'fallback' | 'error'
  const [aiText,  setAIText]  = useState('')
  const [ruleBased, setRuleBased] = useState([])
  const abortRef = useRef(null)

  const { totalMonthlyIncomePaise = 0, surplusPaise = 0 } = financials

  const currentHash = activeLoans.length
    ? hashLoans(activeLoans, totalMonthlyIncomePaise)
    : null

  // ── On mount / when loans change: check cache then fetch ──────────────────
  const fetchInsight = useCallback(async (force = false) => {
    if (!activeLoans.length) return

    // Cache hit
    if (!force && loanInsightCache && loanInsightCache.hash === currentHash) {
      setAIText(loanInsightCache.text)
      setStatus('done')
      return
    }

    setStatus('loading')
    setAIText('')

    // Build rule-based insights as fallback (always pre-compute)
    const fallbackInsights = generateLoanInsights(activeLoans, financials)
    setRuleBased(fallbackInsights)

    // Abort any prior request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('No API key')

      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

      // Compact loan summary for the prompt
      const loanSummary = activeLoans.map(l => ({
        name:       l.name,
        type:       l.type,
        rate:       `${l.annual_rate}% p.a.`,
        outstanding: formatINRCompact(l._outstandingPaise ?? 0),
        emi:         formatINRCompact(l._emi ?? 0),
        monthsLeft:  l._monthsRemaining,
        pctPaid:     `${l._pctPaid}%`,
      }))

      const dti = totalMonthlyIncomePaise > 0
        ? Math.round((activeLoans.reduce((s, l) => s + (l._emi ?? 0), 0) / totalMonthlyIncomePaise) * 100)
        : null

      const prompt = [
        `You are a personal finance advisor for an Indian user. Analyse their loan portfolio and give ONE concise, actionable insight (2–3 sentences max). Be specific — use the numbers. Write in a warm, direct tone. No markdown, no bullet points, no headings.`,
        ``,
        `Loans: ${JSON.stringify(loanSummary, null, 2)}`,
        dti !== null ? `Debt-to-income ratio: ${dti}%` : '',
        surplusPaise > 0 ? `Monthly surplus: ${formatINRCompact(surplusPaise)}` : '',
      ].filter(Boolean).join('\n')

      const msg = await client.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }],
      }, { signal: controller.signal })

      clearTimeout(timeoutId)
      const text = msg.content?.[0]?.text?.trim() ?? ''

      if (text) {
        setAIText(text)
        setLoanInsightCache({ text, hash: currentHash })
        setStatus('done')
      } else {
        throw new Error('Empty response')
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError' || controller.signal.aborted) {
        // Timeout or manual abort — fall back silently
      } else {
        console.warn('[LoanHealthDashboard] AI insight failed:', err.message)
      }
      setStatus('fallback')
    }
  }, [activeLoans, currentHash, financials, loanInsightCache, setLoanInsightCache, totalMonthlyIncomePaise, surplusPaise])

  useEffect(() => {
    fetchInsight()
    return () => abortRef.current?.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHash])

  if (!activeLoans.length) return null

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            {status === 'fallback' ? 'Smart Insights' : 'AI Insight'}
          </p>
        </div>
        {(status === 'done' || status === 'fallback') && (
          <button
            onClick={() => fetchInsight(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-indigo-300/50 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        )}
      </div>

      {/* Content */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 py-2">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span className="text-xs text-indigo-300/50">Analysing your loan portfolio…</span>
        </div>
      )}

      {status === 'done' && aiText && (
        <p className="text-sm text-white/70 leading-relaxed">{aiText}</p>
      )}

      {status === 'fallback' && ruleBased.length > 0 && (
        <div className="space-y-2">
          {ruleBased.map(ins => (
            <InsightBubble key={ins.id} insight={ins} />
          ))}
        </div>
      )}

      {status === 'error' && (
        <p className="text-xs text-white/40">Could not load insights right now.</p>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LoanHealthDashboard({
  activeLoans = [],
  totalMonthlyIncomePaise = 0,
  surplusPaise = 0,
  totalMonthlyEMI = 0,
}) {
  if (!activeLoans.length) return null

  const financials = { totalMonthlyIncomePaise, surplusPaise }

  // ── Metric computations ──────────────────────────────────────────────────
  const dti = totalMonthlyIncomePaise > 0
    ? Math.round((totalMonthlyEMI / totalMonthlyIncomePaise) * 100)
    : null

  // Monthly interest burn: sum of (outstanding * rate/12)
  const monthlyInterestBurnPaise = activeLoans.reduce((s, l) => {
    const r = (Number(l.annual_rate) || 0) / 12 / 100
    return s + Math.round((l._outstandingPaise ?? 0) * r)
  }, 0)

  // Fastest win: soonest to pay off
  const fastestWin = [...activeLoans]
    .filter(l => (l._monthsRemaining ?? 999) > 0)
    .sort((a, b) => (a._monthsRemaining ?? 999) - (b._monthsRemaining ?? 999))[0] ?? null

  // Biggest drain: highest rate (most monthly interest relative to outstanding)
  const biggestDrain = [...activeLoans]
    .sort((a, b) => (Number(b.annual_rate) || 0) - (Number(a.annual_rate) || 0))[0] ?? null

  const biggestDrainMonthlyInterest = biggestDrain
    ? Math.round((biggestDrain._outstandingPaise ?? 0) * ((Number(biggestDrain.annual_rate) || 0) / 12 / 100))
    : 0

  // ── DTI colour logic ─────────────────────────────────────────────────────
  const dtiColor   = dti === null ? 'rgba(255,255,255,0.5)' : dti >= 50 ? '#EF4444' : dti >= 40 ? '#F59E0B' : '#10B981'
  const dtiBorder  = dti === null ? 'rgba(255,255,255,0.07)' : dti >= 50 ? 'rgba(239,68,68,0.25)' : dti >= 40 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'
  const dtiIconBg  = dti === null ? 'rgba(255,255,255,0.06)' : dti >= 50 ? 'rgba(239,68,68,0.12)' : dti >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'

  return (
    <div className="space-y-4">
      {/* 4 metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Debt Burden (DTI) */}
        <MetricCard
          icon={Flame}
          iconColor={dtiColor}
          iconBg={dtiIconBg}
          accentBorder={dtiBorder}
          label="Debt Burden"
          value={dti !== null ? `${dti}%` : '—'}
          sub={
            dti === null
              ? 'No income data'
              : dti >= 50
                ? 'Critical — above 50%'
                : dti >= 40
                  ? 'High — aim for < 30%'
                  : 'Healthy range'
          }
        />

        {/* Interest Leak */}
        <MetricCard
          icon={TrendingDown}
          iconColor="#EF4444"
          iconBg="rgba(239,68,68,0.12)"
          accentBorder="rgba(239,68,68,0.15)"
          label="Monthly Interest"
          value={formatINRCompact(monthlyInterestBurnPaise)}
          sub="burnt on interest every month"
        />

        {/* Fastest Win */}
        <MetricCard
          icon={Target}
          iconColor="#10B981"
          iconBg="rgba(16,185,129,0.12)"
          accentBorder="rgba(16,185,129,0.15)"
          label="Fastest Win"
          value={fastestWin ? `${fastestWin._monthsRemaining}mo` : '—'}
          sub={fastestWin ? `${fastestWin.name} clears soonest` : 'No active loans'}
        />

        {/* Biggest Drain */}
        <MetricCard
          icon={Zap}
          iconColor="#F59E0B"
          iconBg="rgba(245,158,11,0.12)"
          accentBorder="rgba(245,158,11,0.15)"
          label="Biggest Drain"
          value={biggestDrain ? `${biggestDrain.annual_rate}%` : '—'}
          sub={
            biggestDrain
              ? `${biggestDrain.name} · ${formatINRCompact(biggestDrainMonthlyInterest)}/mo`
              : 'No active loans'
          }
        />
      </div>

      {/* AI / rule-based insight */}
      <AIInsightSection activeLoans={activeLoans} financials={financials} />
    </div>
  )
}
