/**
 * UpdatePriceModal — appends a new price entry to an investment's price_history
 * and updates the "current price" field on the record.
 *
 * Applies to: stocks (current_price_paise), mutual_fund (current_nav_paise),
 *             gold (current_price_per_gram_paise)
 * Other classes do not need this (FD is computed; PPF/NPS/RE edit via Edit modal).
 *
 * Props:
 *   investment   – enriched investment object
 *   onClose      () => void
 *   onSaved      () => void
 */
import { useState } from 'react'
import { format } from 'date-fns'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate } from '../../db/helpers.js'
import { formatINRCompact } from '../../utils/currency.js'

const ASSET_META = {
  stocks:      { label: 'Share Price',   unit: '₹/share',  color: '#6366F1' },
  mutual_fund: { label: 'Current NAV',   unit: '₹/unit',   color: '#8B5CF6' },
  gold:        { label: 'Price / gram',  unit: '₹/gram',   color: '#F59E0B' },
}

function getCurrentPricePaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return inv.current_price_paise || inv.buy_price_paise || 0
    case 'mutual_fund': return inv.current_nav_paise || inv.purchase_nav_paise || 0
    case 'gold':        return inv.current_price_per_gram_paise || inv.buy_price_per_gram_paise || 0
    default:            return 0
  }
}

function buildUpdates(inv, newPricePaise, dateStr) {
  const newEntry    = { date: dateStr, price: newPricePaise }
  const history     = Array.isArray(inv.price_history) ? [...inv.price_history] : []

  // Replace today's entry if one exists, otherwise append
  const todayIdx = history.findIndex((h) => h.date === dateStr)
  if (todayIdx >= 0) history[todayIdx] = newEntry
  else history.push(newEntry)

  const updates = { price_history: history }
  switch (inv.asset_class) {
    case 'stocks':      updates.current_price_paise             = newPricePaise; break
    case 'mutual_fund': updates.current_nav_paise               = newPricePaise; break
    case 'gold':        updates.current_price_per_gram_paise    = newPricePaise; break
    default: break
  }
  return updates
}

export default function UpdatePriceModal({ investment, onClose, onSaved }) {
  const cryptoKey    = useAppStore((s) => s.cryptoKey)
  const meta         = ASSET_META[investment.asset_class]
  const today        = format(new Date(), 'yyyy-MM-dd')
  const currentPaise = getCurrentPricePaise(investment)

  const [priceStr, setPriceStr]   = useState('')
  const [dateStr,  setDateStr]    = useState(today)
  const [saving,   setSaving]     = useState(false)
  const [error,    setError]      = useState('')

  const newPricePaise = priceStr ? Math.round(Number(priceStr) * 100) : 0
  const delta         = newPricePaise - currentPaise
  const deltaPct      = currentPaise > 0 ? Math.round((delta / currentPaise) * 10000) / 100 : 0
  const isUp          = delta >= 0

  async function handleSave() {
    if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
      setError('Enter a valid price greater than 0')
      return
    }
    setSaving(true)
    setError('')
    try {
      const updates = buildUpdates(investment, newPricePaise, dateStr)
      await encryptAndUpdate('investments', investment.id, updates, cryptoKey, ['asset_class'])
      onSaved()
      onClose()
    } catch (err) {
      console.error('[UpdatePriceModal] save failed:', err)
      setError('Update failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!meta) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <p className="text-sm font-semibold text-white">Update Price</p>
            <p className="text-[10px] text-white/35 mt-0.5">{investment._name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Current price display */}
          <div
            className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span className="text-xs text-white/40">Previous {meta.label}</span>
            <span className="text-sm font-bold font-numeric text-white/70">
              ₹{(currentPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* New price input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50">
              New {meta.label} <span className="text-white/25">({meta.unit})</span>
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={priceStr}
              onChange={(e) => { setPriceStr(e.target.value); setError('') }}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-all placeholder:text-white/20"
              style={{ color: '#ffffff', caretColor: '#ffffff' }}
            />
          </div>

          {/* Date input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50">Price Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-all"
              style={{ color: '#ffffff', caretColor: '#ffffff', colorScheme: 'dark' }}
            />
          </div>

          {/* Delta preview */}
          {priceStr && Number(priceStr) > 0 && currentPaise > 0 && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{
                background: isUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${isUp ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                {isUp
                  ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-xs" style={{ color: isUp ? '#34D399' : '#F87171' }}>
                  {isUp ? '+' : ''}{deltaPct}%
                </span>
              </div>
              <span className="text-xs font-numeric" style={{ color: isUp ? '#34D399' : '#F87171' }}>
                {isUp ? '+' : '−'}₹{Math.abs(delta / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !priceStr}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{ background: meta.color }}
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  )
}
