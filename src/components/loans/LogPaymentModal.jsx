import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { X, Clock, LayoutList } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate } from '../../db/helpers.js'
import { formatINRCompact } from '../../utils/currency.js'

/**
 * LogPaymentModal — detailed payment entry for a single loan.
 * Shows scheduled amounts by default; lets user switch to custom mode to adjust
 * date, total EMI, principal, and interest independently.
 */
export default function LogPaymentModal({ loan, onClose, onSaved }) {
  const cryptoKey = useAppStore(s => s.cryptoKey)
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [custom, setCustom] = useState(false)   // false = use schedule amounts

  const nextRow    = loan._nextScheduleRow
  const nextPeriod = loan._nextPeriod

  // Editable fields (paise internally, rupee inputs for display)
  const [date, setDate]             = useState(format(new Date(), 'yyyy-MM-dd'))
  const [emiRupees, setEmiRupees]   = useState(((nextRow?.emi ?? loan._emi ?? 0) / 100).toFixed(2))
  const [priRupees, setPriRupees]   = useState(((nextRow?.principal ?? 0) / 100).toFixed(2))
  const [intRupees, setIntRupees]   = useState(((nextRow?.interest  ?? 0) / 100).toFixed(2))

  // Sync from schedule when switching back to scheduled mode
  useEffect(() => {
    if (!custom && nextRow) {
      setEmiRupees((nextRow.emi      / 100).toFixed(2))
      setPriRupees((nextRow.principal / 100).toFixed(2))
      setIntRupees((nextRow.interest  / 100).toFixed(2))
    }
  }, [custom, nextRow])

  // When EMI changes in custom mode, keep principal fixed, adjust interest
  function handleEmiChange(v) {
    setEmiRupees(v)
    const emi = parseFloat(v) || 0
    const pri = parseFloat(priRupees) || 0
    setIntRupees(Math.max(0, emi - pri).toFixed(2))
  }

  // When principal changes, adjust interest to keep EMI constant
  function handlePriChange(v) {
    setPriRupees(v)
    const emi = parseFloat(emiRupees) || 0
    const pri = parseFloat(v) || 0
    setIntRupees(Math.max(0, emi - pri).toFixed(2))
  }

  const emiPaise = Math.round((parseFloat(emiRupees) || 0) * 100)
  const priPaise = Math.round((parseFloat(priRupees) || 0) * 100)
  const intPaise = Math.round((parseFloat(intRupees) || 0) * 100)
  const outstandingAfter = Math.max(0, (loan._outstandingPaise ?? 0) - priPaise)

  async function handleSave() {
    if (emiPaise <= 0 || saving) return
    setSaving(true)
    const newPayment = {
      date,
      period:          nextPeriod,
      emi_paise:       emiPaise,
      principal_paise: priPaise,
      interest_paise:  intPaise,
    }
    try {
      const updatedPayments = [...(loan.payments ?? []), newPayment]
      await encryptAndUpdate('loans', loan.id, { ...loan, payments: updatedPayments }, cryptoKey)
      setDone(true)
      setTimeout(() => { onSaved(); onClose() }, 1400)
    } catch (err) {
      console.error('[finio/LogPayment]', err)
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '8px 12px',
    color: '#ffffff',
    caretColor: '#ffffff',
    outline: 'none',
    fontSize: 13,
    width: '100%',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl p-6 space-y-5"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Log Payment</h3>
            <p className="text-xs text-white/40 mt-0.5 truncate max-w-[220px]">
              {loan.name} · Period {nextPeriod}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-4xl">✅</div>
            <p className="text-sm font-semibold text-emerald-400">Payment recorded!</p>
            <p className="text-xs text-white/40">Outstanding updated</p>
          </div>
        ) : (
          <>
            {/* Date */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-white/50">
                <Clock className="w-3 h-3" />
                Payment Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </div>

            {/* Scheduled / Custom toggle */}
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
            >
              {[
                { id: false, label: '📅 Scheduled', desc: 'Use amortization amounts' },
                { id: true,  label: '✏️ Custom',    desc: 'Enter actual amounts' },
              ].map(opt => (
                <button
                  key={String(opt.id)}
                  onClick={() => setCustom(opt.id)}
                  className="flex-1 py-2 text-center transition-colors"
                  style={{
                    background: custom === opt.id ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: custom === opt.id ? '#A5B4FC' : 'rgba(255,255,255,0.35)',
                    borderRight: opt.id === false ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  }}
                >
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-[9px] opacity-60 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Amount breakdown */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              {[
                { label: 'Total EMI',  value: emiRupees, onChange: handleEmiChange,  color: 'text-white',      bold: true },
                { label: 'Principal',  value: priRupees, onChange: handlePriChange,  color: 'text-indigo-300', bold: false },
                { label: 'Interest',   value: intRupees, onChange: v => setIntRupees(v), color: 'text-red-400', bold: false },
              ].map((row, i) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                  style={{
                    borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  <span className="text-xs text-white/40 flex-shrink-0">{row.label}</span>
                  {custom ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-white/30">₹</span>
                      <input
                        type="number"
                        value={row.value}
                        onChange={e => row.onChange(e.target.value)}
                        className={`text-sm font-bold font-numeric text-right bg-transparent outline-none w-28 ${row.color}`}
                        step="0.01"
                        min="0"
                      />
                    </div>
                  ) : (
                    <span className={`text-sm font-bold font-numeric ${row.color}`}>
                      {formatINRCompact(Math.round(parseFloat(row.value) * 100))}
                    </span>
                  )}
                </div>
              ))}

              {/* Outstanding after */}
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-xs text-white/30">Outstanding after</span>
                <span className="text-xs font-semibold font-numeric text-white/50">
                  {formatINRCompact(outstandingAfter)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || emiPaise <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: saving ? 'rgba(16,185,129,0.4)' : '#10B981' }}
              >
                {saving ? 'Saving…' : 'Log Payment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
