/**
 * SIPTracker — SIP management for mutual fund investments.
 *
 * Features:
 *   - Shows all MF investments; SIP-enabled ones get richer cards
 *   - "Mark as SIP" inline form on any MF investment
 *   - "Log Payment" modal records payment to sip_payments[]
 *   - SIP card shows: progress bar, expected value at 12% p.a., on-track status
 */

import { useState } from 'react'
import { format, addMonths } from 'date-fns'
import { TrendingUp, Plus, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate } from '../../db/helpers.js'
import { formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'
import { calculateSIPReturns, calculateSIPProgress, DEFAULT_RATE } from '../../utils/sipCalculator.js'

// ─── Mark as SIP inline form ──────────────────────────────────────────────────

function MarkSIPForm({ inv, onSaved, onCancel }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [amount,    setAmount]    = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [freq,      setFreq]      = useState('monthly')
  const [tenure,    setTenure]    = useState('120')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  const amountPaise = Math.round((parseFloat(amount) || 0) * 100)
  const valid = amountPaise > 0 && startDate

  const preview = valid
    ? calculateSIPReturns(amountPaise, DEFAULT_RATE, Number(tenure) || 120)
    : null

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      await encryptAndUpdate('investments', inv.id, {
        is_sip:            true,
        sip_amount_paise:  amountPaise,
        sip_start_date:    startDate,
        sip_frequency:     freq,
        sip_target_months: Number(tenure) || 120,
        sip_payments:      inv.sip_payments || [],
      }, cryptoKey, ['asset_class'])
      onSaved()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="mt-3 p-4 rounded-xl space-y-3"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}
    >
      <p className="text-xs font-semibold text-indigo-300">Mark as SIP</p>

      <div className="grid grid-cols-2 gap-2">
        {/* Monthly amount */}
        <div>
          <label className="text-[10px] text-white/35 block mb-1">Monthly Amount (₹)</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5000"
            className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white/6 border border-white/10 outline-none focus:border-indigo-500/40"
            style={{ color: '#ffffff', caretColor: '#ffffff' }}
          />
        </div>

        {/* Start date */}
        <div>
          <label className="text-[10px] text-white/35 block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white/6 border border-white/10 outline-none focus:border-indigo-500/40"
            style={{ color: '#ffffff', caretColor: '#ffffff', colorScheme: 'dark' }}
          />
        </div>

        {/* Frequency */}
        <div>
          <label className="text-[10px] text-white/35 block mb-1">Frequency</label>
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white/6 border border-white/10 outline-none"
            style={{ color: '#ffffff', colorScheme: 'dark' }}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Target tenure */}
        <div>
          <label className="text-[10px] text-white/35 block mb-1">Target Tenure (months)</label>
          <input
            type="number"
            min="6"
            max="360"
            value={tenure}
            onChange={(e) => setTenure(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white/6 border border-white/10 outline-none focus:border-indigo-500/40"
            style={{ color: '#ffffff', caretColor: '#ffffff' }}
          />
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Total Invested', value: formatINRCompact(preview.totalInvestedPaise) },
            { label: 'Est. Value (12%)', value: formatINRCompact(preview.estimatedValuePaise), color: '#10B981' },
            { label: 'Wealth Gained', value: formatINRCompact(preview.wealthGainedPaise), color: '#10B981' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[9px] text-white/30 mb-0.5">{label}</p>
              <p className="text-[11px] font-bold font-numeric" style={{ color: color || 'rgba(255,255,255,0.7)' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!valid || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 hover:opacity-90"
          style={{ background: '#6366F1' }}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          {saving ? 'Saving…' : 'Save SIP'}
        </button>
        <button onClick={onCancel} className="text-xs text-white/35 hover:text-white/60 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ─── Log SIP payment modal ────────────────────────────────────────────────────

function LogPaymentForm({ inv, onSaved, onCancel }) {
  const cryptoKey    = useAppStore((s) => s.cryptoKey)
  const defaultAmt   = ((inv.sip_amount_paise || 0) / 100).toString()
  const [amount, setAmount]   = useState(defaultAmt)
  const [date,   setDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving]   = useState(false)

  async function handleLog() {
    if (saving) return
    setSaving(true)
    try {
      const amtPaise = Math.round((parseFloat(amount) || 0) * 100)
      const payments = [...(inv.sip_payments || []), { date, amount_paise: amtPaise }]
      await encryptAndUpdate('investments', inv.id, { sip_payments: payments }, cryptoKey, ['asset_class'])
      onSaved()
    } catch (e) {
      console.error('[SIPTracker] log payment failed:', e)
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 p-3 rounded-xl space-y-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
      <p className="text-[10px] font-semibold text-emerald-400">Log SIP Payment</p>
      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 px-2 py-1 rounded-lg text-xs bg-white/6 border border-white/10 outline-none"
          style={{ color: '#ffffff', caretColor: '#ffffff' }}
          placeholder="Amount ₹"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 px-2 py-1 rounded-lg text-xs bg-white/6 border border-white/10 outline-none"
          style={{ color: '#ffffff', caretColor: '#ffffff', colorScheme: 'dark' }}
        />
        <button
          onClick={handleLog}
          disabled={saving}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          style={{ background: '#10B981' }}
        >
          {saving ? '…' : 'Log'}
        </button>
        <button onClick={onCancel} className="text-xs text-white/30 hover:text-white/50">✕</button>
      </div>
    </div>
  )
}

// ─── SIP card ─────────────────────────────────────────────────────────────────

function SIPCard({ inv, onRefresh }) {
  const progress   = calculateSIPProgress(inv)
  const [logOpen, setLogOpen] = useState(false)

  const sipAmtRs = (inv.sip_amount_paise || 0) / 100
  const nextDate = inv.sip_start_date
    ? addMonths(new Date(inv.sip_start_date), progress.monthsCompleted + 1)
    : null

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Title + on-track badge */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{inv._name}</p>
          <p className="text-[10px] text-white/30 mt-0.5">
            ₹{sipAmtRs.toLocaleString('en-IN')}/{inv.sip_frequency || 'month'}
            {nextDate && ` · Next: ${format(nextDate, 'dd MMM')}`}
          </p>
        </div>
        {progress.onTrack
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          : <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[10px] text-white/30 mb-1">
          <span>{progress.monthsCompleted} payments logged</span>
          <span>{progress.targetMonths} months target</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress.completionPct}%`,
              background: 'linear-gradient(90deg, #6366F1, #10B981)',
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Total Paid',    value: formatINRCompact(progress.totalPaidPaise) },
          { label: 'Est. Value',    value: formatINRCompact(progress.expectedValuePaise), color: '#10B981' },
          { label: 'Wealth Gain',   value: formatINRCompact(Math.max(0, progress.expectedValuePaise - progress.totalPaidPaise)), color: '#10B981' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px] text-white/30 mb-0.5">{label}</p>
            <p className="text-[11px] font-bold font-numeric" style={{ color: color || 'rgba(255,255,255,0.7)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Log payment */}
      {logOpen
        ? <LogPaymentForm inv={inv} onSaved={() => { setLogOpen(false); onRefresh() }} onCancel={() => setLogOpen(false)} />
        : (
          <button
            onClick={() => setLogOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all border border-emerald-500/15"
          >
            <Plus className="w-3.5 h-3.5" /> Log SIP Payment
          </button>
        )
      }

      <p className="text-[9px] text-white/20">
        Est. value at assumed {DEFAULT_RATE}% p.a. — actual returns may vary.
      </p>
    </div>
  )
}

// ─── Non-SIP MF card (shows "Mark as SIP" option) ────────────────────────────

function NonSIPCard({ inv, onRefresh }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: '#1C1B29', border: '1px dashed rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white/70">{inv._name}</p>
          <p className="text-[10px] text-white/25">Not marked as SIP</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] text-indigo-400/70 hover:text-indigo-400 transition-colors"
        >
          <TrendingUp className="w-3 h-3" />
          Mark as SIP
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
      {open && (
        <MarkSIPForm inv={inv} onSaved={() => { setOpen(false); onRefresh() }} onCancel={() => setOpen(false)} />
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SIPTracker({ mutualFunds, onRefresh }) {
  if (!mutualFunds?.length) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-sm text-white/40">No mutual fund investments tracked yet.</p>
        <p className="text-xs text-white/25 mt-1">Add a mutual fund to start tracking your SIPs.</p>
      </div>
    )
  }

  const sipFunds    = mutualFunds.filter((i) => i.is_sip)
  const nonSipFunds = mutualFunds.filter((i) => !i.is_sip)

  return (
    <div className="space-y-4">
      {/* Summary */}
      {sipFunds.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div
            className="flex-1 min-w-[160px] rounded-xl p-3"
            style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Monthly SIP Total</p>
            <p className="text-lg font-bold font-numeric text-indigo-300">
              {formatINRCompact(sipFunds.reduce((s, i) => s + (i.sip_amount_paise || 0), 0))}
            </p>
          </div>
          <div
            className="flex-1 min-w-[160px] rounded-xl p-3"
            style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Active SIPs</p>
            <p className="text-lg font-bold font-numeric text-white/80">{sipFunds.length}</p>
          </div>
        </div>
      )}

      {/* SIP cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sipFunds.map((inv) => (
          <SIPCard key={inv.id} inv={inv} onRefresh={onRefresh} />
        ))}
        {nonSipFunds.map((inv) => (
          <NonSIPCard key={inv.id} inv={inv} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  )
}
