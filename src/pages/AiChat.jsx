/**
 * AiChat — full multi-turn AI financial advisor with streaming responses.
 *
 * Architecture:
 *   - Collects anonymized financial context from all hooks on mount
 *   - System prompt = SYSTEM_PROMPT_PREFIX + financial snapshot (sent once, not repeated)
 *   - Conversation history maintained in component state (session only, never persisted)
 *   - Streaming via SSE fetch with anthropic-dangerous-direct-browser-access header
 *   - API key read from configGet('anthropic_api_key') or VITE_ANTHROPIC_API_KEY
 *
 * Privacy: only anonymized summaries are sent — never raw records or personal data.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare, Sparkles, Send, RotateCcw,
  Shield, AlertCircle, Loader2, ChevronRight,
  TrendingUp, CreditCard, Target, BarChart3,
} from 'lucide-react'
import { useFinancials } from '../hooks/useFinancials.js'
import { useGoals } from '../hooks/useGoals.js'
import { useLoans } from '../hooks/useLoans.js'
import { useInvestments } from '../hooks/useInvestments.js'
import { configGet } from '../db/schema.js'
import { buildAIContext, SYSTEM_PROMPT_PREFIX } from '../utils/aiContextBuilder.js'
import { formatINRCompact } from '../utils/currency.js'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024
const API_URL = 'https://api.anthropic.com/v1/messages'

const SAMPLE_PROMPTS = [
  { icon: TrendingUp,   text: 'What\'s my biggest financial risk right now?' },
  { icon: CreditCard,   text: 'Should I prepay loans or invest more this month?' },
  { icon: Target,       text: 'Which goal should I prioritise first?' },
  { icon: BarChart3,    text: 'How can I improve my financial health score?' },
  { icon: Sparkles,     text: 'Am I saving enough for retirement?' },
  { icon: MessageSquare, text: 'Analyse my spending — where can I cut?' },
]

// ─── API key loader ───────────────────────────────────────────────────────────

async function loadApiKey() {
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (envKey) return envKey
  try {
    return (await configGet('anthropic_api_key')) || null
  } catch {
    return null
  }
}

// ─── Streaming fetch ──────────────────────────────────────────────────────────

async function streamMessage({ apiKey, systemPrompt, history, onDelta, signal }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: systemPrompt,
      messages: history,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `API error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const ev = JSON.parse(data)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          onDelta(ev.delta.text)
        }
      } catch { /* ignore malformed chunks */ }
    }
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center mr-2.5 flex-shrink-0 mt-0.5"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'rounded-tr-sm text-white'
            : 'rounded-tl-sm text-white/85'
        }`}
        style={{
          background: isUser
            ? '#6366F1'
            : 'rgba(255,255,255,0.05)',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {msg.content}
        {msg.streaming && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-indigo-300/60 rounded-sm animate-pulse align-middle" />
        )}
      </div>
    </div>
  )
}

// ─── Typing indicator (first response token not yet arrived) ──────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center mr-2.5 flex-shrink-0"
        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── No API key notice ────────────────────────────────────────────────────────

function NoApiKeyNotice() {
  return (
    <div
      className="rounded-2xl p-5 flex items-start gap-3"
      style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}
    >
      <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-yellow-300">Anthropic API key required</p>
        <p className="text-xs text-white/40 mt-1 leading-relaxed">
          The AI advisor uses the Anthropic Claude API. Add your API key in{' '}
          <strong className="text-white/60">Settings → AI Features</strong> to get started.
          Your key is stored encrypted on your device.
        </p>
      </div>
    </div>
  )
}

// ─── Context summary bar ──────────────────────────────────────────────────────

function ContextBar({ financialsSummary, loansData, invData }) {
  const chips = []

  if (financialsSummary?.totalMonthlyIncomePaise) {
    chips.push({ label: 'Income', value: formatINRCompact(financialsSummary.totalMonthlyIncomePaise) + '/mo' })
  }
  if (financialsSummary?.savingsRate !== undefined && financialsSummary.totalMonthlyIncomePaise > 0) {
    chips.push({ label: 'Savings rate', value: `${financialsSummary.savingsRate}%` })
  }
  if (loansData?.activeLoans?.length) {
    chips.push({ label: 'Loans', value: loansData.activeLoans.length })
  }
  if (invData?.totalInvested) {
    chips.push({ label: 'Portfolio', value: formatINRCompact(invData.currentValue) })
  }
  if (financialsSummary?.healthScore !== undefined) {
    chips.push({ label: 'Health', value: `${financialsSummary.healthScore}/100` })
  }

  if (!chips.length) return null

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl overflow-x-auto"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <Shield className="w-3 h-3 text-green-400 flex-shrink-0" />
      <span className="text-[10px] text-white/25 flex-shrink-0">Anonymized context loaded:</span>
      {chips.map((c) => (
        <span
          key={c.label}
          className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}
        >
          {c.label} · {c.value}
        </span>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiChat() {
  // Financial data
  const { summary: financialsSummary, incomeStreams, monthlyHistory, loading: finLoading } = useFinancials()
  const { goals, activeGoals, totalMonthlyCommitment, loading: goalsLoading } = useGoals()
  const {
    activeLoans, totalOutstandingPaise, totalMonthlyEMI, totalInterestRemaining,
    loading: loansLoading,
  } = useLoans()
  const {
    totalInvested, currentValue, totalGainLoss, totalGainLossPct,
    assetAllocation, bestPerformer, worstPerformer,
    loading: invLoading,
  } = useInvestments()

  // Chat state
  const [messages, setMessages]       = useState([])       // { role, content, streaming? }
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [waitingFirst, setWaitingFirst] = useState(false)  // true = waiting for first token
  const [error, setError]             = useState(null)
  const [apiKey, setApiKey]           = useState(null)
  const [keyLoaded, setKeyLoaded]     = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const abortRef       = useRef(null)

  const dataLoading = finLoading || goalsLoading || loansLoading || invLoading

  // Load API key once
  useEffect(() => {
    loadApiKey().then((k) => {
      setApiKey(k)
      setKeyLoaded(true)
    })
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, waitingFirst])

  // Build system prompt (memoized on financial data)
  const systemPrompt = (() => {
    if (dataLoading) return null
    try {
      const context = buildAIContext(
        { summary: financialsSummary ?? {}, incomeStreams: incomeStreams ?? [], monthlyHistory: monthlyHistory ?? [] },
        { goals: goals ?? [], activeGoals: activeGoals ?? [], totalMonthlyCommitment: totalMonthlyCommitment ?? 0 },
        {
          activeLoans:            activeLoans ?? [],
          totalOutstandingPaise:  totalOutstandingPaise ?? 0,
          totalMonthlyEMI:        totalMonthlyEMI ?? 0,
          totalInterestRemaining: totalInterestRemaining ?? 0,
        },
        { totalInvested, currentValue, totalGainLoss, totalGainLossPct, assetAllocation, bestPerformer, worstPerformer },
      )
      return SYSTEM_PROMPT_PREFIX + context
    } catch (e) {
      console.warn('[finio/ai] context build error', e)
      return SYSTEM_PROMPT_PREFIX
    }
  })()

  const send = useCallback(async (text) => {
    const msg = text.trim()
    if (!msg || sending || !apiKey) return

    setError(null)
    setInput('')
    setSending(true)

    const userMsg = { role: 'user', content: msg }
    setMessages((prev) => [...prev, userMsg])

    // Build history to send (role/content only, exclude streaming flag)
    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }))

    setWaitingFirst(true)

    // Placeholder for streaming assistant message
    const assistantPlaceholder = { role: 'assistant', content: '', streaming: true }
    let started = false

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamMessage({
        apiKey,
        systemPrompt: systemPrompt ?? SYSTEM_PROMPT_PREFIX,
        history,
        signal: controller.signal,
        onDelta: (delta) => {
          if (!started) {
            started = true
            setWaitingFirst(false)
            setMessages((prev) => [...prev, { ...assistantPlaceholder }])
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
            }
            return prev
          })
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') return
      setWaitingFirst(false)
      setError(err.message || 'Something went wrong. Please try again.')
      // Remove placeholder if it was added
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming && !last.content) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      // Remove streaming flag from last message
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { role: 'assistant', content: last.content }]
        }
        return prev
      })
      setSending(false)
      setWaitingFirst(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, sending, apiKey, systemPrompt])

  function clearChat() {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setInput('')
    setSending(false)
    setWaitingFirst(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full space-y-4" style={{ maxHeight: 'calc(100vh - 56px - 2rem)' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-semibold text-white">AI Advisor</h2>
          {dataLoading && <Loader2 className="w-3.5 h-3.5 text-white/20 animate-spin" />}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/35 hover:text-white/60 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RotateCcw className="w-3 h-3" />
            Clear chat
          </button>
        )}
      </div>

      {/* ── No API key warning ───────────────────────────────────────────── */}
      {keyLoaded && !apiKey && <NoApiKeyNotice />}

      {/* ── Context bar (when data loaded) ──────────────────────────────── */}
      {!dataLoading && keyLoaded && apiKey && (
        <ContextBar
          financialsSummary={financialsSummary}
          loansData={{ activeLoans }}
          invData={{ totalInvested, currentValue }}
        />
      )}

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto rounded-2xl p-4 min-h-0"
        style={{ background: '#13121F', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div>
              <div
                className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <Sparkles className="w-7 h-7 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-white/60 text-center">
                Your private financial advisor
              </p>
              <p className="text-xs text-white/25 text-center mt-1 max-w-xs leading-relaxed">
                Only anonymized summaries are sent — your actual numbers never leave your device.
              </p>
            </div>

            {/* Sample prompts */}
            {keyLoaded && apiKey && (
              <div className="w-full max-w-md space-y-2">
                {SAMPLE_PROMPTS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => send(text)}
                    disabled={dataLoading || sending}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:border-indigo-500/30 hover:bg-indigo-500/5 disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-400/70 flex-shrink-0" />
                    <span className="text-xs text-white/50 flex-1">{text}</span>
                    <ChevronRight className="w-3 h-3 text-white/20 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div className="space-y-0">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {waitingFirst && <TypingIndicator />}
            {error && (
              <div
                className="flex items-start gap-2 rounded-xl p-3 mb-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 leading-relaxed">{error}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ───────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-end gap-2 p-2 rounded-2xl"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={apiKey ? 'Ask anything about your finances…' : 'Add an Anthropic API key in Settings to start chatting'}
          disabled={!apiKey || sending}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed py-2 px-2 placeholder:text-white/20 disabled:opacity-40"
          style={{
            color: '#ffffff',
            caretColor: '#ffffff',
            maxHeight: 120,
            overflowY: 'auto',
            scrollbarWidth: 'none',
          }}
          onInput={(e) => {
            // Auto-grow
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!apiKey || !input.trim() || sending}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
          style={{ background: '#6366F1' }}
        >
          {sending
            ? <Loader2 className="w-4 h-4 text-white animate-spin" />
            : <Send className="w-4 h-4 text-white" />
          }
        </button>
      </div>

    </div>
  )
}
