/**
 * featureFlags — user tier + trial management + per-feature gating.
 *
 * Tier is stored in app_config (plaintext key 'user_tier'); trial dates in
 * 'trial_start' / 'trial_end'. During development every user is initialized to
 * the 'trial' tier with the timer NOT started, which grants full access.
 *
 * isPremium():
 *   true if tier === 'premium', OR tier === 'trial' AND the trial is active.
 *   A trial with no end date (timer not started) is treated as active — this is
 *   the dev default so all features work until launch.
 */

import { configGet, configSet } from '../db/schema.js'

export const TIERS = {
  FREE:    'free',
  TRIAL:   'trial',
  PREMIUM: 'premium',
}

const TRIAL_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

export const FEATURE_TIERS = {
  quick_log_fab:          'premium',
  ai_transaction_advice:  'premium',
  ai_chat:                'premium',
  custom_charts:          'premium',
  dashboard_customize:    'premium',
  live_prices:            'free',
  export:                 'free',
  all_modules:            'free',
}

// ─── Tier ─────────────────────────────────────────────────────────────────────

export async function getUserTier() {
  const tier = await configGet('user_tier')
  return tier || TIERS.FREE
}

export async function setUserTier(tier) {
  await configSet('user_tier', tier)
}

// ─── Trial ────────────────────────────────────────────────────────────────────

/**
 * Initialize the trial tier WITHOUT starting the timer.
 * Called on first launch — grants full (trial) access during development.
 */
export async function initializeTrial() {
  const existing = await configGet('user_tier')
  if (!existing) {
    await configSet('user_tier', TIERS.TRIAL)
  }
  // Timer intentionally not started here — see activateTrial().
}

/**
 * Start the trial countdown (call when ready to enforce limits at launch).
 */
export async function activateTrial() {
  const now = Date.now()
  await configSet('user_tier', TIERS.TRIAL)
  await configSet('trial_start', String(now))
  await configSet('trial_end', String(now + TRIAL_DAYS * MS_PER_DAY))
}

export async function getTrialStatus() {
  const [tier, startStr, endStr] = await Promise.all([
    configGet('user_tier'),
    configGet('trial_start'),
    configGet('trial_end'),
  ])

  // Trial tier but timer never started → unlimited (dev default)
  if (tier === TIERS.TRIAL && !endStr) {
    return { active: true, daysRemaining: Infinity, startDate: '', endDate: '' }
  }

  if (!endStr) {
    return { active: false, daysRemaining: 0, startDate: '', endDate: '' }
  }

  const end = parseInt(endStr, 10)
  const active = Date.now() < end
  const daysRemaining = active ? Math.ceil((end - Date.now()) / MS_PER_DAY) : 0

  return {
    active,
    daysRemaining,
    startDate: startStr ? new Date(parseInt(startStr, 10)).toISOString() : '',
    endDate:   new Date(end).toISOString(),
  }
}

// ─── Access checks ────────────────────────────────────────────────────────────

export async function isPremium() {
  const tier = await getUserTier()
  if (tier === TIERS.PREMIUM) return true
  if (tier === TIERS.TRIAL) {
    const { active } = await getTrialStatus()
    return active
  }
  return false
}

/**
 * @param {string} feature - a key from FEATURE_TIERS
 * @returns {Promise<boolean>}
 */
export async function canAccess(feature) {
  const required = FEATURE_TIERS[feature] || 'free'
  if (required === 'free') return true
  // premium-gated
  return isPremium()
}
