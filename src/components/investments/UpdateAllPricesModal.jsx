/**
 * UpdateAllPricesModal — bulk price update for stocks, MFs, and gold.
 *
 * Shows a table of all price-trackable investments.
 * User enters current price/NAV/rate per holding.
 * Single save updates all changed holdings simultaneously.
 */

import { useState } from 'react'
import { format } from 'date-fns'
import { X, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate } from '../../db/helpers.js'
import { formatINRCompact } from '../../utils/currency.js'
import { ASSET_META } from './AssetAllocationChart.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentPriceField(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return { field: 'current_price_paise', label: 'Price/share (₹)', histField: 'price' }
    case 'mutual_fund': return { field: 'current_nav_paise',   label: 'NAV (₹)',          histField: 'price' }
    case 'gold':        return { field: 'current_price_per_gram_paise', label: 'Price/gram (₹)', histField: 'price' }
    default:            return null
  }
}

function lastKnownPricePaise(inv) {
  switch (inv.asset_class) {
    case 'stocks':      return inv.current_price_paise || inv.buy_price_paise || 0
    case 'mutual_fund': return inv.current_nav_paise   || inv.purchase_nav_paise || 0
    case 'gold':        return inv.current_price_per_gram_paise || inv.buy_price_per_gram_paise || 0
    default:            return 0
  }
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function PriceRow({ inv, priceInput, onPriceChange }) {
  const meta       = ASSET_META[inv.asset_class] || ASSET_META.other
  const fields     = currentPriceField(inv)
  const lastPaise  = lastKnownPricePaise(inv)
  const newPaise   = Math.round((parseFloat(priceInput) || 0) * 100)
  const hasChange  = newPaise > 0 && newPaise !== lastPaise
  const deltaPct   = lastPaise > 0 && newPaise > 0
    ? (((newPaise - lastPaise) / lastPaise) * 100).toFixed(1)
    : null

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: `${meta.color}18` }}
          >
            {meta.icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/80 truncate max-w-[140px]">{inv._name}</p>
            <p className="text-[9px] text-white/30">{meta.label}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right">
        <p className="text-xs text-white/40 font-numeric">
          {lastPaise > 0 ? `₹${(lastPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
        </p>
      </td>
      <td className="py-3">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">₹</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={priceInput}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder={lastPaise > 0 ? (lastPaise / 100).toFixed(2) : '0.00'}
            className="w-32 bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs font-numeric outline-none focus:border-indigo-500/40 transition-all"
            style={{ color: '#ffffff', caretColor: '#ffffff' }}
          />
        </div>
      </td>
      <td className="py-3 pl-3">
        {deltaPct !== null && hasChange && (
          <span
            className="text-xs font-semibold font-numeric"
            style={{ color: Number(deltaPct) >= 0 ? '#10B981' : '#EF4444' }}
          >
            {Number(deltaPct) >= 0 ? '+' : ''}{deltaPct}%
          </span>
        )}
      </td>
    </tr>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UpdateAllPricesModal({ enrichedInvestments, onClose, onSaved }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)

  const eligible = enrichedInvestments.filter((i) =>
    ['stocks', 'mutual_fund', 'gold'].includes(i.asset_class)
  )

  // Price input state per investment id
  const [prices,  setPrices]  = useState({})
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  const changedCount = Object.values(prices).filter((v) => parseFloat(v) > 0).length

  async function handleSave() {
    if (saving || changedCount === 0) return
    setSaving(true)
    setError(null)

    try {
      const updates = eligible
        .filter((inv) => {
          const raw = prices[inv.id]
          return raw && parseFloat(raw) > 0
        })
        .map((inv) => {
          const fields    = currentPriceField(inv)
          const newPaise  = Math.round(parseFloat(prices[inv.id]) * 100)
          const history   = Array.isArray(inv.price_history) ? [...inv.price_history] : []

          // Remove existing entry for today if any, then add new
          const filtered  = history.filter((h) => h.date !== today)
          filtered.push({ date: today, price: newPaise })

          return encryptAndUpdate(
            'investments',
            inv.id,
            {
              [fields.field]: newPaise,
              price_history:  filtered,
            },
            cryptoKey,
            ['asset_class'],
          )
        })

      await Promise.all(updates)
      setSaved(true)
      setTimeout(() => { onSaved?.(); onClose() }, 700)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-xl rounded-2xl flex flex-col shadow-2xl"
        style={{
          background:  '#1C1B29',
          border:      '1px solid rgba(255,255,255,0.1)',
          maxHeight:   '80vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Update All Prices</p>
            <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
              {eligible.length} holdings
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-5">
          {eligible.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/30">
              No stocks, mutual funds, or gold holdings to update.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th className="text-left py-3 pr-4 text-[10px] text-white/30 uppercase tracking-wider font-medium">Holding</th>
                  <th className="text-right py-3 pr-4 text-[10px] text-white/30 uppercase tracking-wider font-medium">Last Price</th>
                  <th className="text-left py-3 text-[10px] text-white/30 uppercase tracking-wider font-medium">New Price</th>
                  <th className="text-left py-3 pl-3 text-[10px] text-white/30 uppercase tracking-wider font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((inv) => (
                  <PriceRow
                    key={inv.id}
                    inv={inv}
                    priceInput={prices[inv.id] || ''}
                    onPriceChange={(val) => setPrices((p) => ({ ...p, [inv.id]: val }))}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={changedCount === 0 || saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-98 disabled:opacity-30"
              style={{ background: saved ? '#10B981' : '#6366F1' }}
            >
              {saved ? (
                <><CheckCircle2 className="w-4 h-4" /> Saved!</>
              ) : saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                changedCount > 0
                  ? `Update ${changedCount} price${changedCount !== 1 ? 's' : ''}`
                  : 'Enter at least one price'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
