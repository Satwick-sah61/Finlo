/**
 * FrameworkSelector — 5-card grid (4 presets + Custom).
 * Clicking a card selects it (checkmark), calls onSelect(framework).
 * Custom card opens inline percentage inputs.
 */

import { useState } from 'react'
import { Check, Sliders } from 'lucide-react'
import { FRAMEWORK_PRESETS, BUCKET } from '../../utils/frameworkMapping.js'
import { buildCustomFramework } from '../../utils/frameworkAnalysis.js'

// ─── Preset card ──────────────────────────────────────────────────────────────

function PresetCard({ preset, isSelected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(preset)}
      className="relative text-left rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
      style={{
        background:  isSelected ? 'rgba(99,102,241,0.12)' : '#1C1B29',
        border:      isSelected ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {isSelected && (
        <div
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: '#6366F1' }}
        >
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Bucket bars preview */}
      <div className="flex gap-0.5 mb-3 h-2 rounded-full overflow-hidden">
        {preset.buckets.map((b) => (
          <div
            key={b.id}
            style={{ width: `${b.targetPct}%`, background: b.color }}
          />
        ))}
      </div>

      <p className="text-sm font-semibold text-white mb-0.5">{preset.name}</p>
      <p className="text-[10px] text-white/35 leading-snug">{preset.description}</p>

      {/* Bucket pct pills */}
      <div className="flex flex-wrap gap-1 mt-3">
        {preset.buckets.map((b) => (
          <span
            key={b.id}
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${b.color}20`, color: b.color }}
          >
            {b.label} {b.targetPct}%
          </span>
        ))}
      </div>
    </button>
  )
}

// ─── Custom card ──────────────────────────────────────────────────────────────

function CustomCard({ isSelected, onSelect }) {
  const [open,    setOpen]    = useState(isSelected)
  const [needs,   setNeeds]   = useState('50')
  const [wants,   setWants]   = useState('30')
  const [savings, setSavings] = useState('20')

  const total = Number(needs) + Number(wants) + Number(savings)
  const valid = total === 100

  function handleApply() {
    if (!valid) return
    const fw = buildCustomFramework({ needs, wants, savings })
    onSelect(fw)
  }

  return (
    <div
      className="relative rounded-2xl p-4 transition-all duration-200"
      style={{
        background:  isSelected ? 'rgba(99,102,241,0.12)' : '#1C1B29',
        border:      isSelected ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {isSelected && (
        <div
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: '#6366F1' }}
        >
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Sliders className="w-3.5 h-3.5 text-white/40" />
        <p className="text-sm font-semibold text-white">Custom</p>
      </div>
      <p className="text-[10px] text-white/35 mb-3">Define your own allocation. Must sum to 100%.</p>

      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {open ? 'Hide inputs ↑' : 'Set percentages ↓'}
      </button>

      {(open || isSelected) && (
        <div className="mt-3 space-y-2">
          {[
            { label: 'Needs',   val: needs,   set: setNeeds   },
            { label: 'Wants',   val: wants,   set: setWants   },
            { label: 'Savings', val: savings, set: setSavings },
          ].map(({ label, val, set }) => (
            <div key={label} className="flex items-center gap-2">
              <label className="text-[10px] text-white/40 w-14 flex-shrink-0">{label}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={val}
                onChange={(e) => set(e.target.value)}
                className="w-16 px-2 py-1 rounded-lg text-xs bg-white/6 border border-white/10 outline-none focus:border-indigo-500/40"
                style={{ color: '#ffffff', caretColor: '#ffffff' }}
              />
              <span className="text-[10px] text-white/25">%</span>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <span
              className="text-[10px] font-semibold"
              style={{ color: valid ? '#10B981' : '#EF4444' }}
            >
              Total: {total}% {valid ? '✓' : `(${total > 100 ? total - 100 : 100 - total}% ${total > 100 ? 'over' : 'under'})`}
            </span>
            <button
              onClick={handleApply}
              disabled={!valid}
              className="px-3 py-1 rounded-lg text-[10px] font-semibold text-white transition-all disabled:opacity-30 hover:opacity-90 active:scale-95"
              style={{ background: '#6366F1' }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FrameworkSelector({ selected, onSelect }) {
  const selectedId = selected?.id

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {FRAMEWORK_PRESETS.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          isSelected={selectedId === preset.id}
          onSelect={onSelect}
        />
      ))}
      <CustomCard
        isSelected={selectedId === 'custom'}
        onSelect={onSelect}
      />
    </div>
  )
}
