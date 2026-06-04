/**
 * livePrices — fetch live market prices for investments.
 *
 * Free APIs, called directly from the browser:
 *   Stocks       → Yahoo Finance  (no key)
 *   Mutual Funds → MFAPI          (no key)
 *   Gold         → GoldAPI        (user-provided free key, stored encrypted)
 *
 * Privacy: ONLY the ticker symbol / scheme code is ever sent externally.
 *          Quantity, portfolio value, and personal data NEVER leave the device.
 *
 * Every fetch:
 *   - 5 second AbortController timeout
 *   - returns null on any failure, NEVER throws
 *   - prices returned in PAISE (rupee × 100, rounded)
 *
 * Master fetch uses Promise.allSettled — one failure never blocks others.
 */

import { encryptData, decryptData } from '../crypto/vault.js'
import { configSet, configGet } from '../db/schema.js'

const TIMEOUT_MS = 5000
const GOLD_KEY_CONFIG = 'goldapi_key'

// ─── Generic timed fetch ──────────────────────────────────────────────────────

async function timedFetch(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ─── Stocks (Yahoo Finance) ───────────────────────────────────────────────────

/**
 * Fetch a stock's current price in paise.
 * @param {string} ticker - e.g. 'TCS.NS' (NSE) or 'TCS.BO' (BSE)
 * @returns {Promise<number|null>} price in paise, or null
 */
export async function fetchStockPrice(ticker) {
  if (!ticker) return null
  const symbol = normalizeTicker(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
  const data = await timedFetch(url)
  const rupee = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (typeof rupee !== 'number' || !isFinite(rupee)) return null
  return Math.round(rupee * 100)
}

/** Append .NS (NSE) by default if no exchange suffix present. */
export function normalizeTicker(ticker) {
  const t = String(ticker).trim().toUpperCase()
  if (t.endsWith('.NS') || t.endsWith('.BO')) return t
  return `${t}.NS`
}

// ─── Mutual Funds (MFAPI) ─────────────────────────────────────────────────────

/**
 * Fetch a mutual fund's latest NAV in paise.
 * @param {string|number} schemeCode - MFAPI scheme code, e.g. 120503
 * @returns {Promise<number|null>} NAV in paise, or null
 */
export async function fetchMFNav(schemeCode) {
  if (!schemeCode) return null
  const code = String(schemeCode).trim()
  const url = `https://api.mfapi.in/mf/${encodeURIComponent(code)}`
  const data = await timedFetch(url)
  const navStr = data?.data?.[0]?.nav
  const nav = parseFloat(navStr)
  if (!nav || !isFinite(nav)) return null
  return Math.round(nav * 100)
}

// ─── Gold (GoldAPI) ───────────────────────────────────────────────────────────

/**
 * Fetch the live gold price per gram (24k) in paise.
 * @param {string} apiKey - GoldAPI access token
 * @returns {Promise<number|null>} price per gram in paise, or null
 */
export async function fetchGoldPrice(apiKey) {
  if (!apiKey) return null
  const url = 'https://www.goldapi.io/api/XAU/INR'
  const data = await timedFetch(url, {
    headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' },
  })
  // GoldAPI returns price_gram_24k in INR per gram
  const perGram = data?.price_gram_24k ?? (typeof data?.price === 'number' ? data.price / 31.1035 : null)
  if (typeof perGram !== 'number' || !isFinite(perGram)) return null
  return Math.round(perGram * 100)
}

// ─── GoldAPI key storage (encrypted, same pattern as Anthropic key) ───────────

export async function saveGoldApiKey(apiKey, cryptoKey) {
  if (!apiKey || !apiKey.trim()) {
    await configSet(GOLD_KEY_CONFIG, '')
    return
  }
  const { ciphertext, iv } = await encryptData(cryptoKey, apiKey.trim())
  await configSet(GOLD_KEY_CONFIG, JSON.stringify({ ciphertext, iv }))
}

export async function loadGoldApiKey(cryptoKey) {
  const stored = await configGet(GOLD_KEY_CONFIG)
  if (!stored) return null
  try {
    const { ciphertext, iv } = JSON.parse(stored)
    return await decryptData(cryptoKey, ciphertext, iv)
  } catch {
    return null
  }
}

// ─── Master fetch ─────────────────────────────────────────────────────────────

/**
 * Fetch live prices for all eligible investments in parallel.
 * Skips FD / PPF / NPS (calculated values) and holdings without a ticker/scheme.
 *
 * @param {object[]} investments - enriched or raw investment records
 * @param {string|null} goldApiKey - decrypted GoldAPI key (or null)
 * @returns {Promise<{ prices: Object, errors: number, attempted: number }>}
 *          prices = { [investmentId]: priceInPaise }
 */
export async function fetchAllLivePrices(investments, goldApiKey = null) {
  const tasks = []

  for (const inv of investments) {
    switch (inv.asset_class) {
      case 'stocks':
        if (inv.ticker) {
          tasks.push(
            fetchStockPrice(inv.ticker).then((p) => ({ id: inv.id, price: p }))
          )
        }
        break
      case 'mutual_fund':
        if (inv.scheme_code) {
          tasks.push(
            fetchMFNav(inv.scheme_code).then((p) => ({ id: inv.id, price: p }))
          )
        }
        break
      case 'gold':
        if (goldApiKey && inv.use_live_price) {
          tasks.push(
            fetchGoldPrice(goldApiKey).then((p) => ({ id: inv.id, price: p }))
          )
        }
        break
      default:
        break // FD, PPF/NPS, real estate use calculated values
    }
  }

  const results = await Promise.allSettled(tasks)

  const prices = {}
  let errors = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.price != null) {
      prices[r.value.id] = r.value.price
    } else {
      errors++
    }
  }

  return { prices, errors, attempted: tasks.length }
}

// ─── Test a GoldAPI key (used by Settings "Test Connection") ──────────────────

/**
 * @returns {Promise<{ ok: boolean, pricePaise?: number, error?: string }>}
 */
export async function testGoldApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) return { ok: false, error: 'No key provided' }
  const price = await fetchGoldPrice(apiKey.trim())
  if (price == null) return { ok: false, error: 'Could not fetch — check your key' }
  return { ok: true, pricePaise: price }
}
