// Integrity check — scans all user tables and attempts to decrypt every
// encrypted field. Corrupted records are flagged but NEVER auto-deleted.
// The user sees results in Settings and decides what action (if any) to take.

import { db } from './schema.js'
import { decryptData } from '../crypto/vault.js'

const USER_TABLES = ['income_streams', 'expenses', 'goals', 'loans', 'investments', 'reminders']
const PLAIN_FIELDS = new Set(['id', 'created_at', 'month'])

export async function runIntegrityCheck(cryptoKey) {
  const corruptedRecords = []
  let totalChecked = 0

  for (const table of USER_TABLES) {
    let rows = []
    try {
      rows = await db[table].toArray()
    } catch (err) {
      console.error(`[finio/integrity] Cannot read table "${table}":`, err)
      continue
    }

    for (const row of rows) {
      totalChecked++
      const badFields = []

      for (const [field, value] of Object.entries(row)) {
        if (PLAIN_FIELDS.has(field)) continue
        if (value && typeof value === 'object' && value.ciphertext && value.iv) {
          try {
            await decryptData(cryptoKey, value.ciphertext, value.iv)
          } catch {
            badFields.push(field)
          }
        }
      }

      if (badFields.length > 0) {
        corruptedRecords.push({
          table,
          id: row.id,
          created_at: row.created_at ?? null,
          badFields,
        })
      }
    }
  }

  const healthy = corruptedRecords.length === 0
  const summary = healthy
    ? `All ${totalChecked} records verified successfully.`
    : `${corruptedRecords.length} corrupted record${corruptedRecords.length !== 1 ? 's' : ''} found out of ${totalChecked} checked.`

  return { healthy, corruptedRecords, totalChecked, summary }
}
