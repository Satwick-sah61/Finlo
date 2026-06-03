/**
 * InvestmentNewsPanel — "Market Pulse" collapsible panel.
 *
 * On mount: checks Zustand cache → fetches via Claude if not cached.
 * Refresh button: rate-limited to once per hour via app_config.
 * Fallback: if AI fails, shows STATIC_TIPS labeled as "General Tips".
 */

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Newspaper, RefreshCw, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { fetchInvestmentNews, canRefreshNews } from '../../ai/investmentNews.js'

// ─── Sentiment badge ──────────────────────────────────────────────────────────

const SENTIMENT = {
  positive: { label: 'Positive', bg: 'rgba(16,185,129,0.12)', color: '#10B981', border: 'rgba(16,185,129,0.25)' },
  negative: { label: 'Negative', bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', border: 'rgba(239,68,68,0.25)'  },
  neutral:  { label: 'Neutral',  bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: 'rgba(148,163,184,0.25)' },
}

function SentimentBadge({ s }) {
  const m = SENTIMENT[s] || SENTIMENT.neutral
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0"
      style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
    >
      {m.label}
    </span>
  )
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="h-3 bg-white/10 rounded w-3/4" />
      <div className="h-2.5 bg-white/6 rounded w-full" />
      <div className="h-2.5 bg-white/6 rounded w-2/3" />
      <div className="flex gap-1.5 pt-1">
        <div className="h-4 w-12 bg-white/8 rounded-full" />
        <div className="h-4 w-16 bg-white/8 rounded-full" />
      </div>
    </div>
  )
}

// ─── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item }) {
  return (
    <div
      className="p-3 rounded-xl space-y-1.5 transition-colors hover:bg-white/5"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-white/85 leading-snug flex-1">{item.headline}</p>
        <SentimentBadge s={item.sentiment} />
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">{item.summary}</p>
      {item.relevance_reason && (
        <p className="text-[10px] text-indigo-300/50 italic">{item.relevance_reason}</p>
      )}
      {Array.isArray(item.asset_classes_affected) && item.asset_classes_affected.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {item.asset_classes_affected.map((ac) => (
            <span
              key={ac}
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#A5B4FC' }}
            >
              {ac.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InvestmentNewsPanel({ enrichedInvestments }) {
  const { investmentNews, setInvestmentNews } = useAppStore()

  const [open,        setOpen]        = useState(true)
  const [loading,     setLoading]     = useState(false)
  const [canRefresh,  setCanRefresh]  = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  // Auto-fetch on first render if no session cache
  useEffect(() => {
    if (investmentNews) {
      checkRefreshEligibility()
      return
    }
    if (!enrichedInvestments?.length) return

    setLoading(true)
    fetchInvestmentNews(enrichedInvestments)
      .then((news) => {
        setInvestmentNews(news)
        setLoading(false)
        checkRefreshEligibility()
      })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkRefreshEligibility() {
    setCanRefresh(await canRefreshNews())
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const news = await fetchInvestmentNews(enrichedInvestments, true) // force
      setInvestmentNews(news)
      setCanRefresh(false) // just refreshed, block again
    } finally {
      setRefreshing(false)
    }
  }

  const news       = investmentNews
  const isFallback = news?.isFallback ?? false
  const panelTitle = isFallback ? 'General Tips' : 'Market Pulse'

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
          <Newspaper className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">{panelTitle}</p>
          {isFallback && (
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(148,163,184,0.12)', color: '#94A3B8' }}
            >
              General tips
            </span>
          )}
          {!isFallback && news?.fetchedAt && (
            <span className="text-[10px] text-white/25">
              · Refreshed {format(new Date(news.fetchedAt), 'HH:mm')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && canRefresh && !loading && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRefresh() }}
              disabled={refreshing}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-white/35 hover:text-white/60 hover:bg-white/6 transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 space-y-3">
          {/* Loading skeletons */}
          {loading && !news && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* News cards */}
          {news?.items?.length > 0 && (
            <div className="space-y-2">
              {news.items.map((item, i) => <NewsCard key={i} item={item} />)}
            </div>
          )}

          {/* Empty / error state */}
          {!loading && (!news || news.items?.length === 0) && (
            <div className="flex items-center gap-2 py-3 text-white/30">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <p className="text-xs">Could not load market news. Add an API key in Settings to enable AI features.</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[9px] text-white/20 leading-snug pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {isFallback
              ? 'These are general financial education tips, not personalised advice.'
              : 'AI-generated news summary. Verify before acting. Not financial advice. Sources may include web search results.'}
          </p>
        </div>
      )}
    </div>
  )
}
