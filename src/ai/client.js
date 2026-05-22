// Stateless Claude API client — each call is fully independent
// Context sent = anonymized financial summary only (see buildContext below)
// Model: claude-sonnet-4-20250514
// API key comes from environment — never hardcoded

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024

// Anonymized context shape — never include names, account numbers, lender names, PAN, Aadhaar
export function buildAnonymizedContext({ income, expenses, goals, loans, healthScore }) {
  return {
    income_total: income,
    expense_total: expenses,
    surplus: income - expenses,
    savings_rate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
    goals: goals.map((g) => ({
      type: g.type,
      target: g.target_amount,
      saved: g.saved_amount,
      deadline_months: g.deadline_months,
      priority: g.priority,
    })),
    loans: loans.map((l) => ({
      outstanding: l.outstanding,
      rate: l.rate,
      emi: l.emi,
      tenure_remaining: l.tenure_remaining,
    })),
    health_score: healthScore,
  }
}

export async function askClaude(userMessage, financialContext, apiKey) {
  if (!apiKey) throw new Error('No API key provided')

  const systemPrompt = `You are Finio's AI financial advisor. You help Indian users manage personal finances.
You receive anonymized financial summaries — never raw personal data.
Respond concisely. When suggesting actions, return structured JSON with type "action".
Format: { "type": "text", "content": "..." } or { "type": "action", "action": "add_goal", "payload": {...} }
All amounts in INR (Indian Rupees). Be specific, practical, and culturally aware of Indian financial products (SIPs, PPF, NPS, FDs, home loans, etc.).`

  const userContent = `Financial context: ${JSON.stringify(financialContext)}

User question: ${userMessage}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `API error ${response.status}`)
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text ?? ''

  // Try to parse as structured response, fall back to plain text
  try {
    return JSON.parse(raw)
  } catch {
    return { type: 'text', content: raw }
  }
}
