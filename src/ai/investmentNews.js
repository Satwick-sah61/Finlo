/**
 * investmentNews — fetches anonymized portfolio-relevant Indian financial news
 * via Claude's web_search tool.
 *
 * Privacy rules:
 *   SEND:    asset_classes[], sectors[], has_fd, fd_tenure_avg_months, has_ppf
 *   NEVER:   tickers, fund names, quantities, rupee values, account details
 *
 * Session cache: result stored in Zustand `investmentNews`
 * Rate limit:    manual refresh blocked if last fetch < 60 minutes ago
 *                (last_news_fetch timestamp stored in app_config)
 *
 * Fallback: if API call fails or times out, returns STATIC_TIPS with
 *           isFallback: true so the UI can label them differently.
 */

import { configGet, configSet } from '../db/schema.js'

const MODEL    = 'claude-sonnet-4-20250514'
const API_URL  = 'https://api.anthropic.com/v1/messages'
const TIMEOUT  = 15_000 // 15 seconds
const MIN_INTERVAL_MS = 60 * 60 * 1000 // 60 minutes between manual refreshes

// ─── Static fallback tips ─────────────────────────────────────────────────────

export const STATIC_TIPS = [
  {
    headline:        'Review your FD rates before renewal',
    summary:         'RBI policy changes directly affect FD interest rates. Always compare before renewing.',
    relevance_reason: 'Relevant for investors holding fixed deposits',
    sentiment:       'neutral',
    asset_classes_affected: ['fd'],
  },
  {
    headline:        'Gold allocation of 10–15% provides portfolio stability',
    summary:         'Historical data shows gold performs well during equity market downturns, offering a hedge.',
    relevance_reason: 'Gold helps balance high-risk equity exposure',
    sentiment:       'positive',
    asset_classes_affected: ['gold', 'stocks'],
  },
  {
    headline:        'ELSS mutual funds offer 80C tax benefits up to ₹1.5L',
    summary:         'Equity Linked Savings Schemes combine market returns with Section 80C deductions.',
    relevance_reason: 'Tax-efficient option for mutual fund investors',
    sentiment:       'positive',
    asset_classes_affected: ['mutual_fund'],
  },
  {
    headline:        'SIP rupee-cost averaging reduces market timing risk',
    summary:         'Systematic investment averages your cost per unit over time, smoothing out volatility.',
    relevance_reason: 'Best practice for long-term equity investors',
    sentiment:       'positive',
    asset_classes_affected: ['stocks', 'mutual_fund'],
  },
  {
    headline:        'Rebalance your portfolio annually to maintain target allocation',
    summary:         'Annual rebalancing keeps risk in check as equity markets outperform and shift your mix.',
    relevance_reason: 'Key principle for diversified portfolio management',
    sentiment:       'neutral',
    asset_classes_affected: ['stocks', 'mutual_fund', 'fd', 'gold'],
  },
]

// ─── API key ──────────────────────────────────────────────────────────────────

async function getApiKey() {
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (envKey) return envKey
  try { return (await configGet('anthropic_api_key')) || null } catch { return null }
}

// ─── Build anonymized context ─────────────────────────────────────────────────

function buildContext(enrichedInvestments) {
  const assetClasses = [...new Set(enrichedInvestments.map((i) => i.asset_class).filter(Boolean))]
  const sectors      = [...new Set(enrichedInvestments
    .filter((i) => i.asset_class === 'stocks' && i.sector)
    .map((i) => i.sector)
  )]

  const fds = enrichedInvestments.filter((i) => i.asset_class === 'fd')
  const hasFD = fds.length > 0
  const fdTenureAvg = hasFD
    ? Math.round(fds.reduce((s, f) => s + (Number(f.tenure_months) || 12), 0) / fds.length)
    : 0

  const hasPPF = enrichedInvestments.some((i) => i.asset_class === 'ppf_nps')
  const hasGold = enrichedInvestments.some((i) => i.asset_class === 'gold')
  const hasRE   = enrichedInvestments.some((i) => i.asset_class === 'real_estate')

  return { asset_classes: assetClasses, sectors, has_fd: hasFD, fd_tenure_avg_months: fdTenureAvg, has_ppf: hasPPF, has_gold: hasGold, has_real_estate: hasRE }
}

// ─── Claude API call with web_search ──────────────────────────────────────────

async function fetchFromClaude(context, apiKey, signal) {
  const prompt = `You are a financial news assistant for Indian investors. Based on this investor's portfolio profile, find 3-5 recent and relevant financial news items from India.

Portfolio profile (anonymized):
${JSON.stringify(context, null, 2)}

Find news relevant to their specific holdings and sectors. Focus on:
- RBI/SEBI policy updates affecting their asset classes
- Market trends for sectors they hold stocks in
- Tax rule changes relevant to their investment types
- FD rate changes if they hold FDs
- Gold/commodity news if relevant

Return ONLY a JSON array with NO other text, markdown, or explanation:
[
  {
    "headline": "concise news headline",
    "summary": "one sentence plain-English summary",
    "relevance_reason": "why this matters for this investor",
    "sentiment": "positive|negative|neutral",
    "asset_classes_affected": ["stocks","mutual_fund","fd","gold","ppf_nps","real_estate"]
  }
]`

  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type':  'application/json',
      'x-api-key':     apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()

  // Extract text from all content blocks (Claude may include tool_use blocks too)
  const textBlocks = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

  if (!textBlocks.trim()) throw new Error('No text content in response')

  // Strip any accidental markdown fencing
  const cleaned = textBlocks.replace(/```json|```/g, '').trim()

  // Find JSON array in the response
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Could not find JSON array in response')

  const items = JSON.parse(match[0])
  if (!Array.isArray(items) || items.length === 0) throw new Error('Empty or invalid items array')

  return items
}

// ─── Rate limit check ─────────────────────────────────────────────────────────

async function isRateLimited() {
  try {
    const ts = await configGet('last_news_fetch')
    if (!ts) return false
    return (Date.now() - parseInt(ts, 10)) < MIN_INTERVAL_MS
  } catch {
    return false
  }
}

async function markFetched() {
  try { await configSet('last_news_fetch', Date.now().toString()) } catch { /* non-critical */ }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch investment news for the user's portfolio.
 * Returns { items, fetchedAt, isFallback }.
 *
 * @param {object[]} enrichedInvestments — from useInvestments()
 * @param {boolean}  forceRefresh        — bypass 60-min rate limit (internal, not for user)
 * @throws never — always returns something (fallback on any error)
 */
export async function fetchInvestmentNews(enrichedInvestments, forceRefresh = false) {
  const context = buildContext(enrichedInvestments)
  const fetchedAt = Date.now()

  const apiKey = await getApiKey()
  if (!apiKey) {
    return { items: STATIC_TIPS, fetchedAt, isFallback: true, reason: 'no_api_key' }
  }

  if (!forceRefresh && await isRateLimited()) {
    return { items: STATIC_TIPS, fetchedAt, isFallback: true, reason: 'rate_limited' }
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT)

  try {
    const items = await fetchFromClaude(context, apiKey, controller.signal)
    clearTimeout(timer)
    await markFetched()
    return { items, fetchedAt, isFallback: false }
  } catch (err) {
    clearTimeout(timer)
    console.warn('[finio/investmentNews] Fetch failed, using fallback:', err.message)
    return { items: STATIC_TIPS, fetchedAt, isFallback: true, reason: err.message }
  }
}

/**
 * Check whether a manual refresh is allowed (not rate-limited).
 */
export async function canRefreshNews() {
  return !(await isRateLimited())
}
