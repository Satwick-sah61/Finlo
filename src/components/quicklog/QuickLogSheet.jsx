/**
 * QuickLogSheet — bottom sheet for fast expense logging.
 *
 * Design: mobile-first, thumb-friendly, 3 taps max to save.
 * Height: 60% of viewport so thumb can reach all controls.
 * No backdropFilter blur (input visibility constraint).
 *
 * Flow: amount → category → (optional note) → save
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { X, ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useQuickLog, QUICK_CATEGORY_OPTIONS } from '../../hooks/useQuickLog.js'
import { useAppStore } from '../../store/appStore.js'
import { formatINRCompact } from '../../utils/currency.js'

// ─── Category pill ────────────────────────────────────────────────────────────

function CategoryPill({ cat, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cat)}
      className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 transition-all"
      style={{
        height:     48, // 44px+ tap target
        minWidth:   72,
        background: selected ? '#6366F1' : 'rgba(255,255,255,0.06)',
        border:     `1px solid ${selected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color:      selected ? '#fff' : 'rgba(255,255,255,0.5)',
        fontWeight: selected ? 700 : 400,
      }}
    >
      <span className="text-base">{cat.emoji}</span>
      <span className="text-xs whitespace-nowrap">{cat.label}</span>
    </button>
  )
}

// ─── Date selector ────────────────────────────────────────────────────────────

function DateSelector({ date, setDate }) {
  const today     = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const isToday   = date === today

  const label = date === today      ? 'Today'
              : date === yesterday   ? 'Yesterday'
              : format(new Date(date + 'T00:00:00'), 'dd MMM yyyy')

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setDate(format(subDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-white/60 font-medium min-w-[90px] text-center">{label}</span>
      <button
        type="button"
        onClick={() => {
          const next = format(addDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd')
          if (next <= today) setDate(next)
        }}
        disabled={date >= today}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function QuickLogSheet({ isOpen, onClose, onSaved, defaultCategory }) {
  const { saveLog } = useQuickLog()
  const lastUsedCat = useAppStore((s) => s.lastQuickCategory) || 'food'

  const [amount,    setAmount]    = useState('')
  const [category,  setCategory]  = useState(
    QUICK_CATEGORY_OPTIONS.find((c) => c.displayId === defaultCategory) ||
    QUICK_CATEGORY_OPTIONS.find((c) => c.displayId === lastUsedCat)     ||
    QUICK_CATEGORY_OPTIONS[0]
  )
  const [note,      setNote]      = useState('')
  const [date,      setDate]      = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState(null)

  const amountRef = useRef(null)

  // Reset and auto-focus on open
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setNote('')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setSaved(false)
      setError(null)
      setSaving(false)
      // Slight delay so sheet animation completes before focus
      setTimeout(() => amountRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const amountPaise   = Math.round((parseFloat(amount) || 0) * 100)
  const canSave       = amountPaise > 0 && !saving

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await saveLog({
        amountPaise,
        category: category.id,
        note,
        date,
        source: 'quick_log',
      })
      // Store last used category
      useAppStore.setState({ lastQuickCategory: category.displayId })
      setSaved(true)
      setTimeout(() => {
        onSaved?.()
        onClose()
      }, 700)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }, [canSave, amountPaise, category, note, date, saveLog, onSaved, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop — no blur */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.65)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-3xl"
        style={{
          background:   '#1C1B29',
          border:       '1px solid rgba(255,255,255,0.1)',
          maxHeight:    '65vh',
          minHeight:    320,
          boxShadow:    '0 -20px 60px rgba(0,0,0,0.5)',
          animation:    'slideUp 0.25s ease-out',
        }}
      >
        {/* Drag handle + close */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/15 mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <p className="text-sm font-semibold text-white">Quick Log</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">

          {/* Amount input — largest element */}
          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span className="text-4xl text-white/30 font-light select-none">₹</span>
            <input
              ref={amountRef}
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) handleSave() }}
              placeholder="0"
              min="0"
              className="flex-1 bg-transparent text-4xl font-bold font-numeric placeholder-white/15 outline-none"
              style={{ color: '#ffffff', caretColor: '#ffffff' }}
            />
          </div>

          {/* Category pills — horizontal scroll */}
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Category</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
              {QUICK_CATEGORY_OPTIONS.map((cat) => (
                <CategoryPill
                  key={cat.displayId}
                  cat={cat}
                  selected={category.displayId === cat.displayId}
                  onSelect={setCategory}
                />
              ))}
            </div>
          </div>

          {/* Note input */}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) handleSave() }}
            placeholder="Add a note… (optional)"
            maxLength={100}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder-white/20 outline-none focus:border-indigo-500/40 transition-all"
            style={{ color: '#ffffff', caretColor: '#ffffff', minHeight: 44 }}
          />

          {/* Date selector */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Date</p>
            <DateSelector date={date} setDate={setDate} />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
        </div>

        {/* Save button — fixed at bottom */}
        <div className="flex-shrink-0 px-5 pb-6 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-98 disabled:opacity-30"
            style={{
              background: saved ? '#10B981' : '#6366F1',
              color:      '#fff',
              height:     52, // large tap target
            }}
          >
            {saved ? (
              <><CheckCircle2 className="w-5 h-5" /> Saved!</>
            ) : saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              amountPaise > 0
                ? `Log ${formatINRCompact(amountPaise)} → ${category.label}`
                : 'Enter an amount to log'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
