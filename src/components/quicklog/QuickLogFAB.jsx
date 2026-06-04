/**
 * QuickLogFAB — fixed bottom-right "₹" button that opens the Quick Log Sheet.
 *
 * Pulse animation: active for 7 days from first_launch (stored in app_config).
 * Keyboard shortcut: press Q on desktop to open.
 * Min size: 56×56px (mobile tap target standard).
 */

import { useState, useEffect } from 'react'
import { IndianRupee } from 'lucide-react'
import { configGet, configSet } from '../../db/schema.js'
import QuickLogSheet from './QuickLogSheet.jsx'
import { useTodayLogs } from '../../hooks/useQuickLog.js'
import { formatINRCompact } from '../../utils/currency.js'
import { canAccess } from '../../utils/featureFlags.js'

const PULSE_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

export default function QuickLogFAB() {
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [shouldPulse, setShouldPulse] = useState(false)
  const [allowed, setAllowed]       = useState(true) // premium-gated
  const { logs, total, refresh }    = useTodayLogs()

  // Feature flag: Quick Log FAB requires premium (trial counts during dev)
  useEffect(() => {
    canAccess('quick_log_fab').then(setAllowed).catch(() => setAllowed(false))
  }, [])

  // Check pulse eligibility from first_launch timestamp
  useEffect(() => {
    configGet('first_launch').then((ts) => {
      if (!ts) return // no launch date means onboarding not yet done
      const age = (Date.now() - parseInt(ts, 10)) / MS_PER_DAY
      setShouldPulse(age <= PULSE_DAYS)
    })
  }, [])

  // Keyboard shortcut: Q to open
  useEffect(() => {
    function handler(e) {
      if (sheetOpen) return
      if (e.key === 'q' || e.key === 'Q') {
        // Don't trigger if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
        setSheetOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sheetOpen])

  function handleOpen() {
    // Stop pulsing once the user interacts with FAB
    setShouldPulse(false)
    setSheetOpen(true)
  }

  // Premium-gated — hidden entirely for free tier (upgrade hint lives on Expenses)
  if (!allowed) return null

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-4 z-30 flex flex-col items-end gap-2">
        {/* Today's total badge (shown if any logs exist) */}
        {logs.length > 0 && !sheetOpen && (
          <div
            className="px-3 py-1 rounded-full text-[10px] font-semibold text-white/70"
            style={{ background: 'rgba(28,27,41,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Today: {formatINRCompact(total)} · {logs.length} logged
          </div>
        )}

        {/* Main FAB */}
        <button
          onClick={handleOpen}
          title="Quick Log (Q)"
          aria-label="Quick log an expense"
          className={`flex items-center justify-center rounded-2xl text-white shadow-xl transition-all active:scale-95 hover:opacity-90 ${shouldPulse ? 'fab-pulse' : ''}`}
          style={{
            width:      56,
            height:     56,
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            boxShadow:  '0 8px 30px rgba(99,102,241,0.45)',
          }}
        >
          <IndianRupee className="w-6 h-6" />
        </button>
      </div>

      {/* Quick log sheet */}
      <QuickLogSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refresh}
      />

      {/* Pulse animation CSS */}
      <style>{`
        @keyframes fabPulse {
          0%   { box-shadow: 0 8px 30px rgba(99,102,241,0.45), 0 0 0 0 rgba(99,102,241,0.5); }
          70%  { box-shadow: 0 8px 30px rgba(99,102,241,0.45), 0 0 0 12px rgba(99,102,241,0); }
          100% { box-shadow: 0 8px 30px rgba(99,102,241,0.45), 0 0 0 0 rgba(99,102,241,0); }
        }
        .fab-pulse {
          animation: fabPulse 2s ease-out infinite;
        }
      `}</style>
    </>
  )
}
