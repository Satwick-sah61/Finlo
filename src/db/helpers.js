// Per-field AES-256-GCM encryption helpers for Dexie tables
//
// Every sensitive field is encrypted individually — not as a single JSON blob.
// This lets us index on plaintext metadata (month, created_at) while keeping
// financial data opaque.
//
// Encrypted field shape: { ciphertext: "<base64>", iv: "<base64>" }
// Plain fields stored as-is: id, created_at, month

import { encryptData, decryptData } from '../crypto/vault.js'
import { db } from './schema.js'

// Fields that are never encrypted regardless of table
const ALWAYS_PLAIN = new Set(['id', 'created_at', 'month'])

async function encryptField(cryptoKey, value) {
  if (value === null || value === undefined) return null
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  return encryptData(cryptoKey, str) // { ciphertext, iv }
}

async function decryptField(cryptoKey, encrypted) {
  if (!encrypted || typeof encrypted !== 'object' || !encrypted.ciphertext) return null
  try {
    const plain = await decryptData(cryptoKey, encrypted.ciphertext, encrypted.iv)
    // Return parsed JSON if possible, otherwise raw string
    try { return JSON.parse(plain) } catch { return plain }
  } catch (err) {
    console.error('[finio/helpers] Field decryption failed:', err.message)
    return null
  }
}

async function decryptRow(row, cryptoKey) {
  const result = {}
  for (const [key, value] of Object.entries(row)) {
    if (ALWAYS_PLAIN.has(key)) {
      result[key] = value
    } else if (value && typeof value === 'object' && value.ciphertext && value.iv) {
      result[key] = await decryptField(cryptoKey, value)
    } else {
      // Non-encrypted field (old-format records during migration) — pass through
      result[key] = value
    }
  }
  return result
}

// Write a new record with per-field encryption.
// extraPlain: additional field names to store unencrypted (e.g. ['month'])
export async function encryptAndSave(table, record, cryptoKey, extraPlain = []) {
  const plainFields = new Set([...ALWAYS_PLAIN, ...extraPlain])
  const row = { created_at: record.created_at ?? new Date() }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue // Dexie auto-generates ++id
    if (plainFields.has(key)) {
      row[key] = value
    } else {
      row[key] = await encryptField(cryptoKey, value)
    }
  }

  return db[table].add(row)
}

// Update specific fields on an existing record.
export async function encryptAndUpdate(table, id, updates, cryptoKey, extraPlain = []) {
  const plainFields = new Set([...ALWAYS_PLAIN, ...extraPlain])
  const patch = {}

  for (const [key, value] of Object.entries(updates)) {
    if (plainFields.has(key)) {
      patch[key] = value
    } else {
      patch[key] = await encryptField(cryptoKey, value)
    }
  }

  return db[table].update(id, patch)
}

// Read and decrypt a single record. Returns null if not found.
export async function decryptAndLoad(table, id, cryptoKey) {
  const row = await db[table].get(id)
  if (!row) return null
  try {
    return await decryptRow(row, cryptoKey)
  } catch (err) {
    console.error(`[finio/helpers] Failed to decrypt record ${id} in ${table}:`, err)
    return null
  }
}

// Read and decrypt all records in a table.
// filter.month: if provided, uses the Dexie 'month' index for efficient filtering
export async function decryptAndLoadAll(table, cryptoKey, filter = {}) {
  let rows
  if (filter.month) {
    rows = await db[table].where('month').equals(filter.month).toArray()
  } else {
    rows = await db[table].toArray()
  }

  const results = []
  for (const row of rows) {
    try {
      results.push(await decryptRow(row, cryptoKey))
    } catch (err) {
      // Corrupted / tampered record — skip and log, never crash
      console.error(`[finio/helpers] Skipping unreadable record ${row.id} in ${table}:`, err)
    }
  }
  return results
}

// Hard delete — no soft delete, no archive
export async function deleteRecord(table, id) {
  return db[table].delete(id)
}

export async function countRecords(table) {
  return db[table].count()
}
