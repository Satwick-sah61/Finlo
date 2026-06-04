/**
 * DailyMonthlyToggle — category amount input with Monthly/Daily mode toggle.
 *
 * Props:
 *   valuePaise | value  — monthly amount in paise (controlled). `value` is an alias.
 *   onChange(paise)     — called with the new MONTHLY amount in paise (always monthly)
 *   label               — category label
 *   emoji               — optional emoji
 *   hint                — optional hint text
 *   frameworkTarget     — optional monthly target in paise (shows ghost value + border color)
 *   hasToggle           — show the daily/monthly toggle (default true)
 *
 * Arithmetic via Dinero.js (project currency helpers):
 *   daily → monthly: toPaise(multiplyMoney(fromPaise(dailyPaise), 30))
 * The emitted onChange value is ALWAYS the monthly paise amount.
 *
 * Border color vs frameworkTarget:
 *   Green  ≤ 110% of target  ·  Amber 110–125%  ·  Red > 125%
 *
 * Toggle state is component-local — resets to Monthly on remount.
 */

import { useState, useCallback } from 'react'
import { fromPaise, toPaise, multiplyMoney } from '../../utils/currency.js'

// ─── Pure conversion helpers (Dinero-backed) ─────────────────────────────────

// monthly paise → daily paise (display only; division is non-persisted)
function monthlyToDailyPaise(monthlyPaise) {
  if (!monthlyPaise) return 0
  return Math.round(monthlyPaise / 30)
}

// daily paise → monthly paise (value-affecting → use Dinero ×30)
function dailyToMonthlyPaise(dailyPaise) {
  if (!dailyPaise) return 0
  return toPaise(multiplyMoney(fromPaise(dailyPaise), 30))
}

// Convert a controlled monthly-paise value into the ₹ string shown in the input
function toInputString(monthlyPaise, isDaily) {
  if (!monthlyPaise) return ''
  const shown = isDaily ? monthlyToDailyPaise(monthlyPaise) : monthlyPaise
  return String(Math.round(shown / 100))
}

// Convert the ₹ string typed by the user back into a monthly-paise value
function toMonthlyPaiseFromInput(str, isDaily) {
  const num = parseFloat(str)
  if (!num || num <= 0) return 0
  const enteredPaise = Math.round(num * 100)
  return isDaily ? dailyToMonthlyPaise(enteredPaise) : enteredPaise
}

function varianceColor(actualPaise, targetPaise) {
  if (!targetPaise || !actualPaise) return null
  const ratio = actualPaise / targetPaise
  if (ratio <= 1.10) return '#10B981' // within 10% — green
  if (ratio <= 1.25) return '#F59E0B' // 10–25% over — amber
  return '#EF4444'                    // > 25% over — red
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyMonthlyToggle({
  valuePaise,
  value,
  onChange,
  label,
  emoji,
  hint,
  frameworkTarget = 0,
  hasToggle = true,
}) {
  const monthlyPaise = Number(valuePaise ?? value ?? 0)
  const [isDaily, setIsDaily] = useState(false)

  const inputString = toInputString(monthlyPaise, isDaily)

  const handleInput = useCallback((e) => {
    onChange(toMonthlyPaiseFromInput(e.target.value, isDaily))
  }, [isDaily, onChange])

  const borderColor = varianceColor(monthlyPaise, frameworkTarget || 0)

  // "= ₹X/month (×30)" when in daily mode
  const monthlyEquivalent = isDaily && monthlyPaise > 0
    ? `= ₹${(monthlyPaise / 100).toLocaleString('en-IN')}/month (×30)`
    : null

  return (
    <div
      className="rounded-xl p-3 flex items-start gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${borderColor || 'rgba(255,255,255,0.08)'}` }}
    >
      {emoji && <span className="text-xl flex-shrink-0 mt-0.5">{emoji}</span>}

      <div className="flex-1 min-w-0">
        {/* Label + toggle */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-white/80">{label}</p>

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
                    className="rounded-md text-[11px] font-semibold transition-all flex items-center justify-center"
                    style={{
                      background: active ? '#6366F1' : 'transparent',
                      color:      active ? '#fff' : 'rgba(255,255,255,0.35)',
                      minWidth:   48,   // ≥ 44px tap target
                      minHeight:  44,
                      padding:    '0 8px',
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

        {/* Input + ghost target */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium">₹</span>
            <input
              type="number"
              inputMode="numeric"
              value={inputString}
              onChange={handleInput}
              placeholder={isDaily ? 'per day' : '0'}
              min="0"
              aria-label={`${label} ${isDaily ? 'daily' : 'monthly'} amount`}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-sm font-numeric placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
              style={{ color: '#ffffff', caretColor: '#ffffff' }}
            />
          </div>

          {frameworkTarget > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[10px] text-white/25 whitespace-nowrap">
                Target: ₹{(frameworkTarget / 100).toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-white/15">framework</p>
            </div>
          )}
        </div>

        {/* Daily → monthly conversion line */}
        {monthlyEquivalent && (
          <p className="text-[10px] text-white/30 mt-1">{monthlyEquivalent}</p>
        )}

        {/* Over-target indicator */}
        {borderColor && borderColor !== '#10B981' && monthlyPaise > 0 && frameworkTarget > 0 && (
          <p className="text-[10px] mt-1" style={{ color: borderColor }}>
            {Math.round((monthlyPaise / frameworkTarget - 1) * 100)}% above target
          </p>
        )}
      </div>
    </div>
  )
}
