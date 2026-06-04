/**
 * transactions — CRUD + summaries for the unified transaction ledger.
 *
 * Transaction shape:
 *   {
 *     id,
 *     type:         'income' | 'loan_emi' | 'sip' | 'goal_saving' | 'expense',
 *     direction:    'in' | 'out',
 *     status:       'pending' | 'confirmed' | 'skipped',
 *     amount:       number (paise),
 *     category:     string,
 *     date:         'yyyy-MM-dd'  (plaintext index)
 *     month:        'yyyy-MM'     (plaintext index)
 *     reference_id: string|number  (source loan/investment/goal id)
 *     upi_id:       string,
 *     note:         string,
 *     created_at
 *   }
 *
 * Plaintext (indexed): date, type, status, month
 * Encrypted: amount, direction, category, reference_id, upi_id, note
 *
 * Money sums use Dinero.js (utils/currency helpers).
 */

import { encryptAndSave, encryptAndUpdate, deleteRecord, decryptAndLoadAll } from './helpers.js'
import { fromPaise, toPaise, addMoney } from '../utils/currency.js'

const PLAINTEXT = ['date', 'type', 'status', 'month']

function sumPaise(items, getter) {
  return toPaise(
    items.reduce((acc, it) => addMoney(acc, fromPaise(Math.round(getter(it) || 0))), fromPaise(0))
  )
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createTransaction(data, vaultKey) {
  const record = {
    type:         data.type,
    direction:    data.direction || (data.type === 'income' ? 'in' : 'out'),
    status:       data.status || 'pending',
    amount:       Math.round(Number(data.amount) || 0),
    category:     data.category || data.type,
    date:         data.date,
    month:        data.month || (data.date ? data.date.slice(0, 7) : ''),
    reference_id: data.reference_id != null ? String(data.reference_id) : '',
    upi_id:       data.upi_id || '',
    note:         data.note || '',
  }
  const id = await encryptAndSave('transactions', record, vaultKey, PLAINTEXT)
  return { id, ...record }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMonthTransactions(month, vaultKey) {
  return decryptAndLoadAll('transactions', vaultKey, { month })
}

export async function getMonthTransactionsByType(month, type, vaultKey) {
  const all = await getMonthTransactions(month, vaultKey)
  return all.filter((t) => t.type === type)
}

export async function getTransactionsForRange(startDate, endDate, vaultKey) {
  return decryptAndLoadAll('transactions', vaultKey, { dateRange: [startDate, endDate] })
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateTransactionStatus(id, status, vaultKey) {
  await encryptAndUpdate('transactions', id, { status }, vaultKey, PLAINTEXT)
}

export async function removeTransaction(id) {
  await deleteRecord('transactions', id)
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Running balance for a month.
 *   income       — confirmed 'in'
 *   committed    — all 'out' that are pending OR confirmed
 *   spent        — confirmed 'out' only
 *   surplus      — income − committed   (budget view)
 *   true_surplus — income − spent       (actual cash view)
 */
export async function getMonthSummary(month, vaultKey) {
  const txns = await getMonthTransactions(month, vaultKey)

  const incomeTxns    = txns.filter((t) => t.direction === 'in'  && t.status === 'confirmed')
  const committedTxns = txns.filter((t) => t.direction === 'out' && (t.status === 'pending' || t.status === 'confirmed'))
  const spentTxns     = txns.filter((t) => t.direction === 'out' && t.status === 'confirmed')

  const income    = sumPaise(incomeTxns,    (t) => t.amount)
  const committed = sumPaise(committedTxns, (t) => t.amount)
  const spent     = sumPaise(spentTxns,     (t) => t.amount)

  return {
    income,
    committed,
    spent,
    surplus:      income - committed,
    true_surplus: income - spent,
  }
}
