/**
 * Loan reminder generator — pure + async DB sync.
 *
 * generateLoanReminders(loans) → reminder[]
 *   Pure, synchronous. Returns reminder objects for the current date.
 *
 * syncLoanReminders(loans, cryptoKey) → Promise<void>
 *   Calls generateLoanReminders, deduplicates against app_config,
 *   writes new reminders to the encrypted 'reminders' table.
 */
import { differenceInDays, format, startOfMonth } from 'date-fns'
import { configGet, configSet } from '../db/schema.js'
import { encryptAndSave } from '../db/helpers.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LoanReminder
 * @property {string} id          – dedup key: `${loanId}_${type}_${monthStr}`
 * @property {string} loanId
 * @property {string} loanName
 * @property {'due_today'|'due_soon'|'missed'|'payoff_soon'} type
 * @property {string} title
 * @property {string} body
 * @property {number} priority     – higher = more urgent
 * @property {string} icon
 */

const DEDUP_CONFIG_KEY = 'loan_reminder_dedup'
const DUE_SOON_DAYS    = 3   // remind N days before due date

// ─── Pure generator ───────────────────────────────────────────────────────────

/**
 * Generate loan reminders for today. Pure / synchronous.
 * @param {Array} loans – enriched loans from useLoans (all statuses)
 * @returns {LoanReminder[]}
 */
export function generateLoanReminders(loans = []) {
  const today    = new Date()
  const monthStr = format(startOfMonth(today), 'yyyy-MM')
  const active   = loans.filter(l => l.status !== 'closed' && (l._outstandingPaise ?? 0) > 0)

  const reminders = []

  for (const loan of active) {
    const nextDue = loan._nextDueDate ? new Date(loan._nextDueDate) : null
    const isPaid  = loan._isCurrentMonthPaid ?? false

    // ── Missed payment ────────────────────────────────────────────────────────
    // Due date has passed and EMI not marked paid
    if (!isPaid && nextDue) {
      const daysOverdue = differenceInDays(today, nextDue)
      if (daysOverdue > 0) {
        reminders.push({
          id:       `${loan.id}_missed_${monthStr}`,
          loanId:   String(loan.id),
          loanName: loan.name,
          type:     'missed',
          title:    `Missed EMI — ${loan.name}`,
          body:     `Payment of ₹${Math.round((loan._emi ?? 0) / 100).toLocaleString('en-IN')} was due ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago.`,
          priority: 10,
          icon:     '🚨',
        })
        continue // skip other checks for this loan
      }
    }

    // ── Due today ─────────────────────────────────────────────────────────────
    if (!isPaid && nextDue) {
      const daysUntil = differenceInDays(nextDue, today)
      if (daysUntil === 0) {
        reminders.push({
          id:       `${loan.id}_due_today_${monthStr}`,
          loanId:   String(loan.id),
          loanName: loan.name,
          type:     'due_today',
          title:    `EMI due today — ${loan.name}`,
          body:     `₹${Math.round((loan._emi ?? 0) / 100).toLocaleString('en-IN')} due today. Mark it paid once done.`,
          priority: 9,
          icon:     '📅',
        })
        continue
      }

      // ── Due soon ────────────────────────────────────────────────────────────
      if (daysUntil > 0 && daysUntil <= DUE_SOON_DAYS) {
        reminders.push({
          id:       `${loan.id}_due_soon_${monthStr}`,
          loanId:   String(loan.id),
          loanName: loan.name,
          type:     'due_soon',
          title:    `EMI due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — ${loan.name}`,
          body:     `₹${Math.round((loan._emi ?? 0) / 100).toLocaleString('en-IN')} due on ${format(nextDue, 'dd MMM')}. Ensure funds are ready.`,
          priority: 7,
          icon:     '⏰',
        })
      }
    }

    // ── Payoff soon ────────────────────────────────────────────────────────────
    // Within 3 months of completion
    const monthsLeft = loan._monthsRemaining ?? 999
    if (monthsLeft > 0 && monthsLeft <= 3) {
      reminders.push({
        id:       `${loan.id}_payoff_soon_${monthStr}`,
        loanId:   String(loan.id),
        loanName: loan.name,
        type:     'payoff_soon',
        title:    `Almost there — ${loan.name} clears in ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''}`,
        body:     `Just ${monthsLeft} EMI${monthsLeft !== 1 ? 's' : ''} left. Keep it up — freedom is near!`,
        priority: 6,
        icon:     '🎯',
      })
    }
  }

  return reminders.sort((a, b) => b.priority - a.priority)
}

// ─── Async DB sync ────────────────────────────────────────────────────────────

/**
 * Generate reminders, deduplicate, and write new ones to the encrypted DB.
 * @param {Array}     loans      – enriched loans
 * @param {CryptoKey} cryptoKey  – for encrypting reminder records
 */
export async function syncLoanReminders(loans = [], cryptoKey) {
  if (!cryptoKey) return

  const reminders = generateLoanReminders(loans)
  if (!reminders.length) return

  // Load existing dedup set
  let dedup = {}
  try {
    const raw = await configGet(DEDUP_CONFIG_KEY)
    if (raw) dedup = JSON.parse(raw)
  } catch {
    dedup = {}
  }

  const newReminders = reminders.filter(r => !dedup[r.id])
  if (!newReminders.length) return

  // Write each new reminder to encrypted DB
  const now = new Date().toISOString()
  for (const r of newReminders) {
    try {
      await encryptAndSave(
        'reminders',
        {
          loan_id:   r.loanId,
          loan_name: r.loanName,
          type:      r.type,
          title:     r.title,
          body:      r.body,
          icon:      r.icon,
          priority:  r.priority,
          created_at: now,
          read:      false,
        },
        cryptoKey
      )
      dedup[r.id] = now
    } catch (err) {
      console.error('[syncLoanReminders] failed to write reminder:', r.id, err)
    }
  }

  // Persist updated dedup map
  try {
    // Prune entries older than 60 days to prevent unbounded growth
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const pruned = {}
    for (const [key, ts] of Object.entries(dedup)) {
      if (new Date(ts) > cutoff) pruned[key] = ts
    }
    await configSet(DEDUP_CONFIG_KEY, JSON.stringify(pruned))
  } catch (err) {
    console.error('[syncLoanReminders] failed to save dedup map:', err)
  }
}
