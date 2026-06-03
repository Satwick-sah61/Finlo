/**
 * FrameworkChart — two-panel comparison:
 *   Left segmented bar: target allocation (ideal %)
 *   Right segmented bar: actual allocation (from expenses)
 *
 * Traffic light per bucket: green ≤5% off, amber 5–15%, red >15%
 * Plus a detailed breakdown table below.
 */

import { formatINRCompact } from '../../utils/currency.js'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  good:    { dot: '#10B981', label: '✓', labelColor: '#10B981' },
  warning: { dot: '#F59E0B', label: '⚠',  labelColor: '#F59E0B' },
  danger:  { dot: '#EF4444', label: '✗',  labelColor: '#EF4444' },
}

// ─── Segmented bar ────────────────────────────────────────────────────────────

function SegmentedBar({ buckets, mode, incomePaise }) {
  // mode: 'target' | 'actual'
  const total = buckets.reduce((s, b) => s + (mode === 'target' ? b.targetPct : b.actualPct), 0)
  if (total === 0) {
    return (
      <div
        className="h-8 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <span className="text-[10px] text-white/25">No data</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
        {buckets.map((b) => {
          const pct = mode === 'target' ? b.targetPct : b.actualPct
          if (pct === 0) return null
          return (
            <div
              key={b.id}
              style={{ width: `${pct}%`, background: b.color, minWidth: pct > 0 ? 2 : 0 }}
              title={`${b.label}: ${pct}%`}
            />
          )
        })}
        {/* Remainder (unallocated) */}
        {total < 100 && (
          <div
            style={{ width: `${100 - total}%`, background: 'rgba(255,255,255,0.06)' }}
          />
        )}
      </div>
      {/* Pct labels */}
      <div className="flex gap-2 flex-wrap">
        {buckets.map((b) => {
          const pct = mode === 'target' ? b.targetPct : b.actualPct
          if (pct === 0) return null
          return (
            <div key={b.id} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
              <span className="text-[9px] text-white/40">{b.label} {pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Breakdown table ──────────────────────────────────────────────────────────

function BreakdownTable({ buckets, incomePaise }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] min-w-[500px]">
        <thead>
          <tr>
            {['Category', 'Target %', 'Target ₹', 'Actual ₹', 'Actual %', 'Variance', 'Status']
              .map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-white/25 font-medium text-left first:rounded-tl-xl last:rounded-tr-xl"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => {
            const st = STATUS_STYLE[b.status] || STATUS_STYLE.good
            const varSign = b.varPaise >= 0 ? '+' : '−'
            return (
              <tr
                key={b.id}
                style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-white/60 font-medium">{b.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-white/40">{b.targetPct}%</td>
                <td className="px-3 py-2 text-white/50 font-numeric">{formatINRCompact(b.targetPaise)}</td>
                <td className="px-3 py-2 font-semibold font-numeric"
                  style={{ color: b.status === 'good' ? 'rgba(255,255,255,0.7)' : b.status === 'warning' ? '#F59E0B' : '#EF4444' }}
                >
                  {formatINRCompact(b.actualPaise)}
                </td>
                <td className="px-3 py-2 text-white/40">{b.actualPct}%</td>
                <td className="px-3 py-2 font-numeric"
                  style={{ color: b.varPaise === 0 ? 'rgba(255,255,255,0.3)' : b.varPaise < 0 ? '#10B981' : '#EF4444' }}
                >
                  {b.varPaise === 0 ? '—' : `${varSign}${formatINRCompact(Math.abs(b.varPaise))}`}
                </td>
                <td className="px-3 py-2">
                  <span style={{ color: st.labelColor, fontWeight: 700 }}>{st.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r          = 28
  const circ       = 2 * Math.PI * r
  const strokeDash = (score / 100) * circ

  const color =
    score >= 75 ? '#10B981' :
    score >= 50 ? '#F59E0B' : '#EF4444'

  const label =
    score >= 75 ? 'On Track' :
    score >= 50 ? 'Needs Work' : 'Off Track'

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circ}`}
            transform="rotate(-90 32 32)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        <p className="text-[10px] text-white/30 mt-0.5">Framework score</p>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FrameworkChart({ analysis, incomePaise, frameworkName }) {
  if (!analysis || !analysis.buckets?.length) return null

  const { score, buckets, suggestions } = analysis

  return (
    <div className="space-y-5">

      {/* Score + framework name */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ScoreRing score={score} />
        {suggestions.length > 0 && (
          <p className="text-xs text-white/45 max-w-xs leading-relaxed">{suggestions[0]}</p>
        )}
      </div>

      {/* Two-panel comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
            Ideal allocation
          </p>
          <SegmentedBar buckets={buckets} mode="target" incomePaise={incomePaise} />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
            Your actual allocation
          </p>
          <SegmentedBar buckets={buckets} mode="actual" incomePaise={incomePaise} />
        </div>
      </div>

      {/* Traffic light legend */}
      <div className="flex items-center gap-4">
        {[
          { color: '#10B981', text: '≤5% off target' },
          { color: '#F59E0B', text: '5–15% off' },
          { color: '#EF4444', text: '>15% off' },
        ].map(({ color, text }) => (
          <div key={text} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[9px] text-white/30">{text}</span>
          </div>
        ))}
      </div>

      {/* Breakdown table */}
      <BreakdownTable buckets={buckets} incomePaise={incomePaise} />

      {/* Extra suggestions */}
      {suggestions.length > 1 && (
        <div className="space-y-1.5">
          {suggestions.slice(1).map((s, i) => (
            <p key={i} className="text-[11px] text-white/40 leading-relaxed pl-3"
              style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}
            >
              {s}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
