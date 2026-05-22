import { useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import { generateInsights } from '../utils/insights.js'

export default function DashboardInsights({ summary, monthlyHistory, activeLoans = [], dti = null }) {
  const [open, setOpen] = useState(true)

  const insights = generateInsights({ summary, monthlyHistory, activeLoans, dti })
  if (insights.length === 0) return null

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Insights</span>
          <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
            {insights.length}
          </span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-white/30" />
          : <ChevronDown className="w-4 h-4 text-white/30" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/5">
          {insights.map((ins, i) => (
            <div
              key={i}
              className="flex items-start gap-3 pt-3"
            >
              <span className="text-lg leading-none flex-shrink-0 mt-0.5">{ins.icon}</span>
              <div>
                <p className="text-sm font-medium text-white/85">{ins.headline}</p>
                {ins.detail && (
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{ins.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
