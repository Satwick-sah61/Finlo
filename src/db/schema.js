import Dexie from 'dexie'
import { encryptData, decryptData } from '../crypto/vault.js'
import { useAppStore } from '../store/appStore.js'

// app_config stores plaintext only (salt, sentinel, onboarding_complete, theme)
// All user financial tables use per-field encryption via db/helpers.js
// v2: month index on expenses
// v3: loan_documents table
// v4: asset_class index on investments
// v5: expense_logs table (date + category as plaintext indexes for efficient queries)

export const db = new Dexie('finio')

db.version(1).stores({
  income_streams: '++id, created_at',
  expenses:       '++id, created_at',
  goals:          '++id, created_at',
  loans:          '++id, created_at',
  investments:    '++id, created_at',
  reminders:      '++id, created_at',
  app_config:     'key',
})

db.version(2).stores({
  income_streams: '++id, created_at',
  expenses:       '++id, created_at, month',
  goals:          '++id, created_at',
  loans:          '++id, created_at',
  investments:    '++id, created_at',
  reminders:      '++id, created_at',
  app_config:     'key',
})

db.version(3).stores({
  income_streams: '++id, created_at',
  expenses:       '++id, created_at, month',
  goals:          '++id, created_at',
  loans:          '++id, created_at',
  investments:    '++id, created_at',
  reminders:      '++id, created_at',
  app_config:     'key',
  loan_documents: '++id, loan_id, created_at',
})

db.version(4).stores({
  income_streams: '++id, created_at',
  expenses:       '++id, created_at, month',
  goals:          '++id, created_at',
  loans:          '++id, created_at',
  investments:    '++id, created_at, asset_class',
  reminders:      '++id, created_at',
  app_config:     'key',
  loan_documents: '++id, loan_id, created_at',
})

// v5 — expense_logs: quick-log transactions stored separately from budget estimates.
//   date     (plaintext) — yyyy-MM-dd, enables efficient date-range queries
//   category (plaintext) — Finio category ID, enables per-category summaries
//   All financial fields (amount, note, subcategory) are encrypted.
db.version(5).stores({
  income_streams: '++id, created_at',
  expenses:       '++id, created_at, month',
  goals:          '++id, created_at',
  loans:          '++id, created_at',
  investments:    '++id, created_at, asset_class',
  reminders:      '++id, created_at',
  app_config:     'key',
  loan_documents: '++id, loan_id, created_at',
  expense_logs:   '++id, date, category, logged_at',
})

// ─── Legacy blob helpers (used only for config/sentinel — not user data) ──────

function getKey() {
  const key = useAppStore.getState().cryptoKey
  if (!key) throw new Error('Vault is locked — no CryptoKey in memory')
  return key
}

export async function encryptedAdd(table, data) {
  const key = getKey()
  const { ciphertext, iv } = await encryptData(key, data)
  return db[table].add({ ciphertext, iv, created_at: new Date() })
}

export async function encryptedGetAll(table) {
  const key = getKey()
  const rows = await db[table].toArray()
  const results = []
  for (const row of rows) {
    try {
      const json = await decryptData(key, row.ciphertext, row.iv)
      results.push({ id: row.id, created_at: row.created_at, ...JSON.parse(json) })
    } catch {
      console.error(`[finio] Failed to decrypt blob record ${row.id} in ${table}`)
    }
  }
  return results
}

export async function encryptedGet(table, id) {
  const key = getKey()
  const row = await db[table].get(id)
  if (!row) return null
  const json = await decryptData(key, row.ciphertext, row.iv)
  return { id: row.id, created_at: row.created_at, ...JSON.parse(json) }
}

export async function encryptedUpdate(table, id, data) {
  const key = getKey()
  const { ciphertext, iv } = await encryptData(key, data)
  return db[table].update(id, { ciphertext, iv })
}

export async function encryptedDelete(table, id) {
  return db[table].delete(id)
}

// ─── app_config — plaintext key/value pairs ────────────────────────────────

export async function configSet(key, value) {
  return db.app_config.put({ key, value })
}

export async function configGet(key) {
  const row = await db.app_config.get(key)
  return row ? row.value : null
}

// Permanently wipe the database — used in Settings danger zone
export async function nukeDatabase() {
  await db.delete()
}
