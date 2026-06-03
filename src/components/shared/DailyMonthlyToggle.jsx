/**
 * DailyMonthlyToggle — category amount input with Monthly/Daily mode toggle.
 *
 * Props:
 *   valuePaise         — monthly amount in paise (controlled)
 *   onChange(paise)    — called with new monthly amount in paise
 *   label              — category label
 *   emoji              — optional emoji
 *   hint               — optional hint text
 *   frameworkTarget    — optional monthly target in paise (shows ghost value)
 *   hasToggle          — whether to show the daily/monthly toggle (default true)
 *
 * Daily ↔ Monthly arithmetic uses Dinero.js (× 30 for daily → monthly).
 * Color coding vs frameworkTarget:
 *   Green:  within 10% of target
 *   Amber:  10–25% over target
 *   Red:    >25% over target
 */

import { useState, useCallback } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDisplayValue(paise, isDaily) {
  if (!paise) return ''
  const rupees = paise / 100
  if (isDaily) {
    // monthly ÷ 30 for display
    return (rupees / 30).toFixed(0)
  }
  return rupees.toFixed(0)
}

function fromDisplayValue(str, isDaily) {
  const num = parseFloat(str)
  if (!num || num <= 0) return 0
  const paise = Math.round(num * 100)
  if (isDaily) {
    // daily × 30 = monthly (integer × integer — no float risk)
    return paise * 30
  }
  return paise
}

function getVarianceColor(actual, target) {
  if (!target || !actual) return null
  const ratio = actual / target
  if (ratio <= 1.1)  return '#10B981' // within 10% — green
  if (ratio <= 1.25) return '#F59E0B' // 10–25% over — amber
  return '#EF4444'                    // >25% over — red
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DailyMonthlyToggle({
  valuePaise,
  onChange,
  label,
  emoji,
  hint,
  frameworkTarget = 0,
  hasToggle = true,
}) {
  const [isDaily, setIsDaily] = useState(false)

  const displayVal = toDisplayValue(valuePaise, isDaily)

  const handleInput = useCallback((e) => {
    const monthly = fromDisplayValue(e.target.value, isDaily)
    onChange(monthly)
  }, [isDaily, onChange])

  const borderColor = getVarianceColor(valuePaise, frameworkTarget || 0)

  // Monthly equivalent when in daily mode
  const monthlyEquivalent = isDaily && valuePaise > 0
    ? `= ₹${(valuePaise / 100).toLocaleString('en-IN')}/month`
    : null

  // Target hint text
  const targetHint = frameworkTarget > 0
    ? `target: ₹${(frameworkTarget / 100).toLocaleString('en-IN')} (${Math.round(frameworkTarget / (frameworkTarget + 1) * 100) || '?'}%)`
    : null

  return (
    <div
      className="rounded-xl p-3 flex items-start gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${borderColor || 'rgba(255,255,255,0.08)'}` }}
    >
      {/* Emoji */}
      {emoji && <span className="text-xl flex-shrink-0 mt-0.5">{emoji}</span>}

      {/* Label + hint */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-white/80">{label}</p>

          {/* Daily/Monthly toggle */}
          {hasToggle && (
            <div
              className="flex items-center rounded-lg p-0.5 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {['Monthly', 'Daily'].map((mode) => {
                const active = (mode === 'Daily') === isDaily
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setIsDaily(mode === 'Daily')}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                    style={{
                      background: active ? '#6366F1' : 'transparent',
                      color:      active ? '#fff' : 'rgba(255,255,255,0.35)',
                      minWidth:   44,
                    }}
                  >
                    {mode}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {hint && <p className="text-[10px] text-white/30 truncate">{hint}</p>}

        {/* Input row */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium">₹</span>
            <input
              type="number"
              inputMode="numeric"
              value={displayVal}
              onChange={handleInput}
              placeholder="0"
              min="0"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-sm font-numeric placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
              style={{ color: '#ffffff', caretColor: '#ffffff' }}
            />
          </div>

          {/* Ghost target */}
          {frameworkTarget > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[9px] text-white/20 whitespace-nowrap">
                target ₹{(frameworkTarget / 100).toLocaleString('en-IN')}
              </p>
            </div>
          )}
        </div>

        {/* Daily → monthly conversion label */}
        {monthlyEquivalent && (
          <p className="text-[10px] text-white/30 mt-1">{monthlyEquivalent}</p>
        )}

        {/* Over-budget indicator */}
        {borderColor && borderColor !== '#10B981' && valuePaise > 0 && frameworkTarget > 0 && (
          <p className="text-[10px] mt-1" style={{ color: borderColor }}>
            {Math.round((valuePaise / frameworkTarget - 1) * 100)}% above target
          </p>
        )}
      </div>
    </div>
  )
}
