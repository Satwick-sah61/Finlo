// NEW — src/components/charts/NetWorthCard.jsx
// Phase 1b placeholder — enriched with real loan + investment data in Phase 2 & 3.
import { ArrowUp, ArrowDown, Minus, PiggyBank } from 'lucide-react'
import { formatINRFromPaise, formatINRCompact } from '../../utils/currency.js'

export default function NetWorthCard({ summary, monthlyHistory }) {
  const { totalMonthlyIncomePaise } = summary

  // Estimated assets: sum of positive monthly surpluses we have data for.
  // This is a floor estimate — doesn't include cash savings, investments, property.
  const estimatedSavingsPaise = monthlyHistory.reduce(
    (sum, m) => sum + Math.max(0, m.surplus),
    0
  )

  // Liabilities: 0 until Loans module (Phase 2)
  const liabilitiesPaise = 0

  const netWorthPaise = estimatedSavingsPaise - liabilitiesPaise
  const hasEstimate = estimatedSavingsPaise > 0

  // MoM trend from last two months' surplus
  const last = monthlyHistory.at(-1)
  const prev = monthlyHistory.at(-2)
  const trend = last && prev
    ? last.surplus - prev.surplus
    : null

  return (
    <div className="space-y-5">
      {/* Main figure */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank className="w-4 h-4 text-indigo-400" />
            <p className="text-xs text-white/40 uppercase tracking-wider">Estimated Net Worth</p>
          </div>
          <p className={`text-4xl font-bold font-numeric leading-none ${hasEstimate ? 'text-white' : 'text-white/20'}`}>
            {hasEstimate ? formatINRCompact(netWorthPaise) : '—'}
          </p>
          {hasEstimate && (
            <p className="text-xs text-white/30 mt-1.5">
              Based on {monthlyHistory.filter((m) => m.surplus > 0).length} months of surplus
            </p>
          )}
        </div>

        {trend !== null && hasEstimate && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-numeric ${
            trend > 0
              ? 'bg-green-500/10 text-green-400'
              : trend < 0
              ? 'bg-red-500/10 text-red-400'
              : 'bg-white/5 text-white/30'
          }`}>
            {trend > 0
              ? <ArrowUp className="w-4 h-4" />
              : trend < 0
              ? <ArrowDown className="w-4 h-4" />
              : <Minus className="w-4 h-4" />}
            {trend !== 0 && (
              <span>{trend > 0 ? '+' : ''}{formatINRCompact(Math.abs(trend))} vs last month</span>
            )}
            {trend === 0 && <span>Unchanged</span>}
          </div>
        )}
      </div>

      {/* Breakdown row */}
      {hasEstimate && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/8 border border-green-500/15 rounded-xl px-4 py-3">
            <p className="text-xs text-green-400/70 mb-1">Estimated Assets</p>
            <p className="text-lg font-bold font-numeric text-green-400">
              {formatINRCompact(estimatedSavingsPaise)}
            </p>
            <p className="text-[10px] text-green-400/40 mt-0.5">Accumulated surplus</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
            <p className="text-xs text-white/40 mb-1">Liabilities</p>
            <p className="text-lg font-bold font-numeric text-white/25">₹0</p>
            <p className="text-[10px] text-white/20 mt-0.5">No loans recorded</p>
          </div>
        </div>
      )}

      {/* Call to action */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-indigo-500/20 bg-indigo-500/5">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-sm">📊</span>
        </div>
        <p className="text-xs text-indigo-400/70 leading-relaxed">
          Add your loans and investments to see your complete net worth picture.
        </p>
      </div>

      {/* Monthly income reference */}
      {totalMonthlyIncomePaise > 0 && (
        <p className="text-xs text-white/25">
          Annual income capacity: {formatINRCompact(totalMonthlyIncomePaise * 12)}
        </p>
      )}
    </div>
  )
}
