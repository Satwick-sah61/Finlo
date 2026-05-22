import { useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate } from '../../db/helpers.js'
import { fromRupees, toPaise, formatINRCompact } from '../../utils/currency.js'

export default function AddSavingsModal({ goal, onClose, onUpdated }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  const targetPaise = Number(goal.target_amount) || 0
  const savedPaise = Number(goal.saved_amount) || 0

  const addPaise = toPaise(fromRupees(parseFloat(amount) || 0))
  const newSavedPaise = savedPaise + addPaise
  const prevPct = targetPaise > 0 ? Math.min(100, Math.round((savedPaise / targetPaise) * 100)) : 0
  const newPct = targetPaise > 0 ? Math.min(100, Math.round((newSavedPaise / targetPaise) * 100)) : 0

  async function handleSave() {
    const rupees = parseFloat(amount)
    if (!rupees || rupees <= 0) { setError('Enter a valid amount'); return }

    setSaving(true)
    setError(null)

    try {
      await encryptAndUpdate('goals', goal.id, { saved_amount: newSavedPaise }, cryptoKey)
      setDone(true)
      setTimeout(() => {
        onUpdated({ ...goal, saved_amount: newSavedPaise })
        onClose()
      }, 1500)
    } catch (err) {
      console.error('[finio/AddSavingsModal]', err)
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl p-6 space-y-5"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Add Savings</h3>
            <p className="text-xs text-white/40 mt-0.5 truncate max-w-[200px]">{goal.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-4xl">🎉</div>
            <p className="text-sm font-semibold text-green-400">Added!</p>
            <p className="text-xs text-white/40">
              {formatINRCompact(addPaise)} added · You're now {newPct}% there
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-wider mb-2 block">
                How much did you save? (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-numeric">₹</span>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  className="w-full border border-white/10 rounded-xl pl-7 pr-4 py-3 text-lg font-numeric focus:outline-none focus:border-indigo-500/60 transition-colors placeholder:text-white/15"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }}
                  placeholder="0"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            </div>

            {/* Progress preview */}
            {addPaise > 0 && (
              <div className="space-y-2 p-3 rounded-xl bg-white/4">
                <div className="flex justify-between text-xs text-white/40">
                  <span>{prevPct}% → {newPct}%</span>
                  <span>{formatINRCompact(newSavedPaise)} / {formatINRCompact(targetPaise)}</span>
                </div>
                <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${newPct}%`,
                      background: 'linear-gradient(90deg, #6366F1, #22C55E)',
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !amount || parseFloat(amount) <= 0}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Add to Goal'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
