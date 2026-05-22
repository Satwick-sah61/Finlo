import { configGet } from '../db/schema.js'
import { formatINRCompact } from '../utils/currency.js'

async function getApiKey() {
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (envKey) return envKey
  try {
    return await configGet('anthropic_api_key')
  } catch {
    return null
  }
}

function ruleFallback({ surplus, monthsRemaining, goalTarget }) {
  const months = Math.max(1, monthsRemaining)
  const monthlyRequired = Math.ceil(goalTarget / months)
  const feasible = surplus >= monthlyRequired
  const shortfall = Math.max(0, monthlyRequired - surplus)

  const suggestions = []
  if (!feasible) {
    suggestions.push(`Save ${formatINRCompact(monthlyRequired)} per month to hit your deadline`)
    if (surplus > 0) {
      const extendedMonths = Math.ceil(goalTarget / surplus)
      suggestions.push(`Extend your deadline by ${extendedMonths - months} months to match your current surplus`)
    }
    suggestions.push('Review discretionary spending to free up additional surplus')
    if (shortfall > surplus * 0.5) {
      suggestions.push('Consider a smaller initial milestone to build momentum')
    }
  } else {
    suggestions.push('Your current surplus comfortably covers this goal')
    const extra = surplus - monthlyRequired
    if (extra > 0) {
      suggestions.push(`You have ${formatINRCompact(extra)}/month headroom — consider investing the rest`)
    }
    suggestions.push('Set up a recurring transfer on payday to automate your savings')
  }

  return {
    feasible,
    monthly_required: monthlyRequired,
    shortfall,
    suggestions,
    adjusted_deadline: null,
    message: feasible
      ? 'Based on your current surplus, this goal is achievable by your target date.'
      : 'Your current surplus may not be enough to meet this deadline.',
    isFallback: true,
  }
}

export async function analyzeGoalFeasibility(context) {
  const { surplus, savingsRate, goalTarget, monthsRemaining, existingGoalsCount } = context

  if (monthsRemaining <= 0) return ruleFallback(context)

  const apiKey = await getApiKey()
  if (!apiKey) return ruleFallback(context)

  const prompt = `You are a concise personal finance advisor. Analyze this savings goal and respond with ONLY valid JSON — no markdown, no explanation.

All monetary values are in Indian paise (divide by 100 for rupees).
- Monthly surplus available: ${surplus}
- Savings rate: ${savingsRate}%
- Goal target amount: ${goalTarget}
- Months until deadline: ${monthsRemaining}
- Number of other active goals: ${existingGoalsCount}

Respond with EXACTLY this JSON structure:
{
  "feasible": boolean,
  "monthly_required": number,
  "shortfall": number,
  "suggestions": ["string", "string", "string"],
  "adjusted_deadline": "YYYY-MM-DD or null",
  "message": "one concise sentence"
}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.warn('[finio/ai] API error', res.status, '— using rule-based fallback')
      return ruleFallback(context)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''

    try {
      // Strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      return { ...parsed, isFallback: false }
    } catch {
      console.warn('[finio/ai] Could not parse AI response — using rule-based fallback')
      return ruleFallback(context)
    }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      console.warn('[finio/ai] Request timed out — using rule-based fallback')
    } else {
      console.warn('[finio/ai] Request failed:', err.message, '— using rule-based fallback')
    }
    return ruleFallback(context)
  }
}
