/**
 * autoTransactions — generate pending transactions for the current month
 * from existing module data (loans, SIPs, goals, income).
 *
 * generateMonthlyTransactions() is PURE — reads source arrays, returns the
 * transactions that *should* exist. It does not write or deduplicate.
 *
 * ensureMonthlyTransactions() is the async runner: loads existing transactions,
 * removes anything already present (by reference_id + month + type), and writes
 * only the missing ones. Safe to run on every unlock — never creates duplicates.
 */

import { differenceInCalendarMonths } from 'date-fns'
import { toMonthlyPaise } from './finance.js'
import { generateAmortization } from './amortization.js'
import { getMonthTransactions, createTransaction } from '../db/transactions.js'

// ─── Per-goal monthly commitment (paise) ──────────────────────────────────────

function goalMonthlyCommitment(goal) {
  const saved  = Number(goal.saved_amount) || 0
  const target = Number(goal.target_amount) || 0
  if (saved >= target || target <= 0) return 0
  const remaining = Math.max(0, target - saved)
  let months = 12
  try { months = Math.max(1, differenceInCalendarMonths(new Date(goal.deadline), new Date())) } catch {}
  return Math.ceil(remaining / months)
}

// ─── Loan EMI (paise) — use enriched _emi if present, else compute ────────────

function loanEmiPaise(loan) {
  if (loan._emi) return loan._emi
  const principal = Number(loan.principal_paise) || 0
  const rate      = Number(loan.annual_rate) || 0
  const tenure    = Number(loan.tenure_months) || 0
  if (!principal || !tenure) return 0
  const { emi } = generateAmortization(principal, rate, tenure)
  return emi
}

// ─── Pure generator ───────────────────────────────────────────────────────────

/**
 * @returns {object[]} candidate transactions (no ids, not deduplicated)
 */
export function generateMonthlyTransactions(month, loans = [], investments = [], goals = [], incomeStreams = []) {
  const firstOfMonth = `${month}-01`
  const out = []

  // 1. Income — one per stream, confirmed (assumed received)
  for (const stream of incomeStreams) {
    const amount = toMonthlyPaise(Number(stream.amount) || 0, stream.frequency)
    if (amount <= 0) continue
    out.push({
      type:         'income',
      direction:    'in',
      status:       'confirmed',
      amount,
      category:     'income',
      date:         firstOfMonth,
      month,
      reference_id: stream.id != null ? String(stream.id) : '',
      note:         'Monthly income',
    })
  }

  // 2. Loan EMIs — one per active loan, pending
  for (const loan of loans) {
    if (loan.status === 'closed') continue
    const amount = loanEmiPaise(loan)
    if (amount <= 0) continue
    const type = (loan.loan_type || 'loan').replace(/_loan$/, '')
    out.push({
      type:         'loan_emi',
      direction:    'out',
      status:       'pending',
      amount,
      category:     'loans',
      date:         firstOfMonth,
      month,
      reference_id: loan.id != null ? String(loan.id) : '',
      upi_id:       loan.upi_id || '',
      note:         `EMI for ${type}`,
    })
  }

  // 3. SIPs — one per active SIP investment, pending
  for (const inv of investments) {
    if (!inv.is_sip) continue
    const amount = Number(inv.sip_amount_paise) || 0
    if (amount <= 0) continue
    out.push({
      type:         'sip',
      direction:    'out',
      status:       'pending',
      amount,
      category:     'savings',
      date:         firstOfMonth,
      month,
      reference_id: inv.id != null ? String(inv.id) : '',
      note:         'Monthly SIP',
    })
  }

  // 4. Goal savings — one per active goal, pending
  for (const goal of goals) {
    if (goal.status === 'Completed' || goal.status === 'Draft') continue
    const amount = goalMonthlyCommitment(goal)
    if (amount <= 0) continue
    out.push({
      type:         'goal_saving',
      direction:    'out',
      status:       'pending',
      amount,
      category:     'savings',
      date:         firstOfMonth,
      month,
      reference_id: goal.id != null ? String(goal.id) : '',
      note:         'Goal contribution',
    })
  }

  return out
}

// ─── Async dedup + write runner ───────────────────────────────────────────────

/**
 * Generate and persist this month's auto-transactions, skipping any that
 * already exist (matched by reference_id + month + type).
 *
 * @returns {Promise<number>} count of transactions actually created
 */
export async function ensureMonthlyTransactions(month, sources, vaultKey) {
  const { loans = [], investments = [], goals = [], incomeStreams = [] } = sources
  const candidates = generateMonthlyTransactions(month, loans, investments, goals, incomeStreams)
  if (!candidates.length) return 0

  const existing = await getMonthTransactions(month, vaultKey)
  const existingKeys = new Set(
    existing.map((t) => `${t.reference_id}|${t.month}|${t.type}`)
  )

  let created = 0
  for (const c of candidates) {
    const key = `${c.reference_id}|${c.month}|${c.type}`
    if (existingKeys.has(key)) continue
    await createTransaction(c, vaultKey)
    existingKeys.add(key) // guard against duplicate candidates in the same run
    created++
  }
  return created
}
