/**
 * investmentReminders — pure function, no React, no DB calls.
 *
 * Generates actionable reminders from enriched investment records.
 * Reminder types:
 *   fd_maturing_urgent  — FD matures in ≤7 days
 *   fd_maturing         — FD matures in 8–30 days
 *   price_update_needed — no price log in 30+ days (stocks/MF/gold)
 *   ppf_contribution    — March reminder for PPF accounts
 */

import { differenceInDays, addMonths, format, getMonth } from 'date-fns'

/**
 * @param {object[]} enrichedInvestments — array from useInvestments()
 * @returns {object[]} reminders — [{id, type, invId, urgency, message}]
 */
export function generateInvestmentReminders(enrichedInvestments) {
  const reminders = []
  const today        = new Date()
  const currentMonth = getMonth(today) // 0-based; March = 2

  for (const inv of enrichedInvestments) {

    // ── FD maturity reminders ──────────────────────────────────────────
    if (inv.asset_class === 'fd') {
      const maturityDate = inv.maturity_date
        ? new Date(inv.maturity_date)
        : inv.start_date
          ? addMonths(new Date(inv.start_date), Number(inv.tenure_months) || 12)
          : null

      if (maturityDate) {
        const daysLeft = differenceInDays(maturityDate, today)

        if (daysLeft >= 0 && daysLeft <= 7) {
          reminders.push({
            id:      `fd_urgent_${inv.id}`,
            type:    'fd_maturing_urgent',
            invId:   inv.id,
            urgency: 'high',
            message: daysLeft === 0
              ? `FD matures today (${format(maturityDate, 'dd MMM yyyy')}) — decide on reinvestment`
              : `FD matures in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${format(maturityDate, 'dd MMM yyyy')} — decide on reinvestment`,
          })
        } else if (daysLeft > 7 && daysLeft <= 30) {
          reminders.push({
            id:      `fd_soon_${inv.id}`,
            type:    'fd_maturing',
            invId:   inv.id,
            urgency: 'medium',
            message: `FD matures on ${format(maturityDate, 'dd MMM yyyy')} (${daysLeft} days away) — plan your reinvestment`,
          })
        }
      }
    }

    // ── Price update reminders (stocks / MF / gold) ────────────────────
    if (['stocks', 'mutual_fund', 'gold'].includes(inv.asset_class)) {
      const history = Array.isArray(inv.price_history) ? inv.price_history : []

      // Latest entry in history (or fallback to buy date)
      const lastEntry = history.length > 0
        ? history.reduce((latest, h) => new Date(h.date) > new Date(latest.date) ? h : latest)
        : null

      const lastDate = lastEntry
        ? new Date(lastEntry.date)
        : inv.buy_date    ? new Date(inv.buy_date)
        : inv.start_date  ? new Date(inv.start_date)
        : null

      if (lastDate) {
        const daysSince = differenceInDays(today, lastDate)
        if (daysSince >= 30) {
          reminders.push({
            id:      `price_${inv.id}`,
            type:    'price_update_needed',
            invId:   inv.id,
            urgency: 'low',
            message: `Update price for "${inv._name || inv.name || 'investment'}" — last updated ${format(lastDate, 'dd MMM yyyy')} (${daysSince} days ago)`,
          })
        }
      }
    }

    // ── PPF annual contribution reminder (March only) ──────────────────
    if (inv.asset_class === 'ppf_nps') {
      const acType = (inv.account_type || 'PPF').toUpperCase()
      if (acType === 'PPF' && currentMonth === 2) {
        reminders.push({
          id:      `ppf_${inv.id}`,
          type:    'ppf_contribution',
          invId:   inv.id,
          urgency: 'medium',
          message: 'Financial year ending in March — have you made your annual PPF contribution? (max ₹1.5L, eligible for 80C deduction)',
        })
      }
    }
  }

  return reminders
}
