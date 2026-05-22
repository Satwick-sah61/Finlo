import { useState, useEffect, useCallback } from 'react'
import { format, getDaysInMonth } from 'date-fns'
import {
  TrendingUp, Plus, Pencil, Trash2, X, AlertCircle,
  ChevronDown, ArrowUp, ArrowDown, Minus, CalendarDays,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { encryptAndSave, encryptAndUpdate, deleteRecord, decryptAndLoadAll } from '../db/helpers.js'
import { INCOME_TYPES, FREQUENCY_OPTIONS, toMonthlyPaise } from '../utils/finance.js'
import { formatINRFromPaise, formatINRCompact } from '../utils/currency.js'

// ─── Constants ────────────────────────────────────────────────────────────────

// Hex bar colours that match each income type's Tailwind token
const TYPE_BAR_COLOR = {
  salary: '#22C55E',
  freelance: '#3B82F6',
  business: '#F97316',
  rental: '#8B5CF6',
  interest: '#06B6D4',
  pension: '#F59E0B',
  side_hustle: '#EC4899',
  other: 'rgba(255,255,255,0.25)',
}

function getTypeMeta(typeValue) {
  return INCOME_TYPES.find((t) => t.value === typeValue) ?? INCOME_TYPES.at(-1)
}

function getFreqLabel(freqValue) {
  return FREQUENCY_OPTIONS.find((f) => f.value === freqValue)?.label ?? freqValue
}

// ─── Annual Projection Card ───────────────────────────────────────────────────

function AnnualProjectionCard({ totalMonthlyPaise }) {
  if (totalMonthlyPaise === 0) return null

  const annualPaise = totalMonthlyPaise * 12
  const now = new Date()
  // Months fully elapsed this year (Jan = 0, so Jan is 0 complete months)
  const monthsComplete = now.getMonth()
  const dayOfMonth = now.getDate()
  const daysInCurrentMonth = getDaysInMonth(now)
  // YTD estimate: completed months + fraction of current month
  const ytdPaise =
    totalMonthlyPaise * monthsComplete +
    Math.round((totalMonthlyPaise * dayOfMonth) / daysInCurrentMonth)
  const yearPct = Math.round(((monthsComplete * 30 + dayOfMonth) / 365) * 100)

  return (
    <div className="glass rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-indigo-400" />
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Annual Projection</p>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold font-numeric text-white">
            {formatINRCompact(annualPaise)}
          </p>
          <p className="text-xs text-white/40 mt-0.5">projected this year</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold font-numeric text-indigo-400">
            {formatINRCompact(ytdPaise)}
          </p>
          <p className="text-xs text-white/40 mt-0.5">earned so far</p>
        </div>
      </div>
      {/* Year progress bar */}
      <div className="space-y-1">
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${yearPct}%` }}
          />
        </div>
        <p className="text-xs text-white/30">{yearPct}% of year elapsed</p>
      </div>
    </div>
  )
}

// ─── Income Breakdown (proportion bars) ──────────────────────────────────────

function IncomeBreakdown({ streams, totalPaise }) {
  if (streams.length < 2) return null // proportion only meaningful with multiple streams

  const sorted = [...streams].sort((a, b) => {
    const pa = toMonthlyPaise(Number(a.amount) || 0, a.frequency)
    const pb = toMonthlyPaise(Number(b.amount) || 0, b.frequency)
    return pb - pa
  })

  return (
    <div className="glass rounded-xl px-5 py-4 space-y-3">
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Income Breakdown</p>
      <div className="space-y-3">
        {sorted.map((s) => {
          const streamPaise = toMonthlyPaise(Number(s.amount) || 0, s.frequency)
          const pct = totalPaise > 0 ? (streamPaise / totalPaise) * 100 : 0
          const color = TYPE_BAR_COLOR[s.type] ?? TYPE_BAR_COLOR.other

          return (
            <div key={s.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-white/75 truncate">{s.name}</span>
                <span className="text-xs text-white/40 font-numeric flex-shrink-0">
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month-over-Month Badge ───────────────────────────────────────────────────

function MoMBadge({ streams }) {
  const currentMonth = format(new Date(), 'yyyy-MM')

  // Estimate what last month's total would have been: exclude streams added
  // this month (they didn't exist in the previous month)
  const prevMonthPaise = streams.reduce((sum, s) => {
    const addedMonth = s.created_at ? format(new Date(s.created_at), 'yyyy-MM') : ''
    if (addedMonth === currentMonth) return sum // this stream is new this month
    return sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency)
  }, 0)

  const currentPaise = streams.reduce(
    (sum, s) => sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency),
    0
  )

  const delta = currentPaise - prevMonthPaise

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-white/30 px-2 py-1 rounded-lg bg-white/5">
        <Minus className="w-3 h-3" />
        Stable
      </span>
    )
  }

  const isUp = delta > 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-numeric ${
        isUp
          ? 'text-green-400 bg-green-500/10'
          : 'text-red-400 bg-red-500/10'
      }`}
    >
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}
      {formatINRFromPaise(Math.abs(delta))} vs last month
    </span>
  )
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ streams }) {
  const totalPaise = streams.reduce(
    (sum, s) => sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency),
    0
  )

  if (streams.length === 0) return null

  return (
    <div className="glass rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">Total Monthly Income</p>
          <p className="text-2xl font-bold font-numeric text-green-400">
            {formatINRFromPaise(totalPaise)}
          </p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs text-white/30">
            {streams.length} source{streams.length !== 1 ? 's' : ''}
          </p>
          <p className="text-sm text-white/50 font-numeric">
            {formatINRCompact(totalPaise * 12)} / year
          </p>
          <MoMBadge streams={streams} />
        </div>
      </div>
    </div>
  )
}

// ─── Income Form Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', type: 'salary', amount: '', frequency: 'monthly' }

function IncomeFormModal({ initial, existingNames, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const isEdit = !!initial

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const canSave = form.name.trim().length > 0 && Number(form.amount) > 0

  // Duplicate detection: case-insensitive name match, exclude the stream being edited
  const isDuplicate =
    form.name.trim().length > 0 &&
    existingNames.some((n) => n.toLowerCase() === form.name.trim().toLowerCase())

  const monthlyEquiv =
    Number(form.amount) > 0 && form.frequency !== 'monthly'
      ? toMonthlyPaise(Math.round(Number(form.amount) * 100), form.frequency)
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Income Stream' : 'Add Income Stream'}
          </h3>
          <button onClick={onCancel} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {isDuplicate && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            A stream named "{form.name.trim()}" already exists. Consider using a distinct name.
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Google Salary, Freelance Project, Flat Rent"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Type</label>
          <div className="relative">
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              className="w-full appearance-none bg-[#1C1B29] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer pr-10"
            >
              {INCOME_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* Amount + Frequency */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0"
                min="0"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-3 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all font-numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Frequency</label>
            <div className="relative">
              <select
                value={form.frequency}
                onChange={(e) => set('frequency', e.target.value)}
                className="w-full appearance-none bg-[#1C1B29] border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer pr-8"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Monthly preview for non-monthly frequencies */}
        {monthlyEquiv !== null && (
          <p className="text-xs text-white/40 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            Monthly equivalent:{' '}
            <span className="font-numeric text-green-400">
              {formatINRFromPaise(monthlyEquiv)}
            </span>
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white/80 text-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/25 text-green-400 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
            ) : isEdit ? 'Save Changes' : 'Add Income'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Income Card ──────────────────────────────────────────────────────────────

function IncomeCard({ stream, onEdit, onDelete }) {
  const type = getTypeMeta(stream.type)
  const amountPaise = Number(stream.amount) || 0
  const monthlyPaise = toMonthlyPaise(amountPaise, stream.frequency)
  const isMonthly = stream.frequency === 'monthly'

  return (
    <div className="glass-hover rounded-xl p-4 flex items-center gap-4 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">{stream.name}</p>
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${type.color}`}>
            {type.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-white/40">
            {formatINRFromPaise(amountPaise)} · {getFreqLabel(stream.frequency)}
          </p>
          {!isMonthly && (
            <p className="text-xs text-green-400/70">
              ≈ {formatINRFromPaise(monthlyPaise)}/mo
            </p>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-base font-bold font-numeric text-green-400">
          {formatINRFromPaise(monthlyPaise)}
        </p>
        <p className="text-xs text-white/30">per month</p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onEdit(stream)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(stream)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({ stream, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Delete income stream?</h3>
            <p className="text-xs text-white/40 mt-1">
              "<span className="text-white/60">{stream.name}</span>" will be permanently removed from your vault.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white/80 text-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-400 text-sm font-medium transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            ) : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Income() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [streams, setStreams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    if (!cryptoKey) return
    try {
      const rows = await decryptAndLoadAll('income_streams', cryptoKey)
      setStreams(rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    } catch (err) {
      console.error('[finio/Income] Load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey])

  useEffect(() => { load() }, [load])

  // ── Add ──────────────────────────────────────────────────────────────────

  async function handleAdd(form) {
    setSaving(true)
    setFormError('')

    const amountPaise = Math.round(Number(form.amount) * 100)
    const record = {
      name: form.name.trim(),
      type: form.type,
      amount: amountPaise,
      frequency: form.frequency,
    }

    const tempId = `tmp-${Date.now()}`
    const tempRecord = { id: tempId, created_at: new Date(), ...record }
    setStreams((prev) => [tempRecord, ...prev])
    setShowForm(false)

    try {
      const newId = await encryptAndSave('income_streams', record, cryptoKey)
      setStreams((prev) => prev.map((s) => (s.id === tempId ? { ...s, id: newId } : s)))
    } catch (err) {
      console.error('[finio/Income] Save failed:', err)
      setStreams((prev) => prev.filter((s) => s.id !== tempId))
      setShowForm(true)
      setFormError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(stream) {
    setEditTarget(stream)
    setFormError('')
  }

  async function handleEdit(form) {
    if (!editTarget) return
    setSaving(true)
    setFormError('')

    const amountPaise = Math.round(Number(form.amount) * 100)
    const updates = {
      name: form.name.trim(),
      type: form.type,
      amount: amountPaise,
      frequency: form.frequency,
    }

    const prev = streams.find((s) => s.id === editTarget.id)
    setStreams((list) => list.map((s) => (s.id === editTarget.id ? { ...s, ...updates } : s)))
    setEditTarget(null)

    try {
      await encryptAndUpdate('income_streams', editTarget.id, updates, cryptoKey)
    } catch (err) {
      console.error('[finio/Income] Update failed:', err)
      if (prev) setStreams((list) => list.map((s) => (s.id === editTarget.id ? prev : s)))
      setEditTarget(editTarget)
      setFormError('Failed to update. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)

    const snapshot = streams.find((s) => s.id === deleteTarget.id)
    setStreams((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    setDeleteTarget(null)

    try {
      await deleteRecord('income_streams', snapshot.id)
    } catch (err) {
      console.error('[finio/Income] Delete failed:', err)
      if (snapshot) setStreams((prev) => [snapshot, ...prev])
    } finally {
      setDeleting(false)
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalMonthlyPaise = streams.reduce(
    (sum, s) => sum + toMonthlyPaise(Number(s.amount) || 0, s.frequency),
    0
  )

  // Names of existing streams — used for duplicate detection.
  // When editing, exclude the stream under edit so it doesn't warn against itself.
  const existingNames = streams
    .filter((s) => !editTarget || s.id !== editTarget.id)
    .map((s) => s.name ?? '')

  const formInitial = editTarget
    ? {
        name: editTarget.name ?? '',
        type: editTarget.type ?? 'salary',
        amount: editTarget.amount ? String(editTarget.amount / 100) : '',
        frequency: editTarget.frequency ?? 'monthly',
      }
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h2 className="text-xl font-semibold text-white">Income Streams</h2>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-400 text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Income
        </button>
      </div>

      {/* Summary */}
      <SummaryBar streams={streams} />

      {/* Annual projection */}
      <AnnualProjectionCard totalMonthlyPaise={totalMonthlyPaise} />

      {/* Proportion breakdown (only when 2+ streams) */}
      <IncomeBreakdown streams={streams} totalPaise={totalMonthlyPaise} />

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : streams.length === 0 ? (
        <div className="glass rounded-2xl flex flex-col items-center text-center p-16 gap-5">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/15 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-green-400/60" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white/60 mb-1">No income streams yet</h3>
            <p className="text-sm text-white/30 max-w-xs leading-relaxed">
              Add your first source of income — salary, freelance, rental, or anything else.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 text-green-400 text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add first income stream
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {streams.map((s) => (
            <IncomeCard
              key={s.id}
              stream={s}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showForm || editTarget) && (
        <IncomeFormModal
          initial={formInitial}
          existingNames={existingNames}
          onSave={editTarget ? handleEdit : handleAdd}
          onCancel={() => { setShowForm(false); setEditTarget(null); setFormError('') }}
          saving={saving}
          error={formError}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          stream={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
