import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Plus, ChevronDown, ChevronUp, Check, Pencil, Trash2, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndUpdate, deleteRecord } from '../../db/helpers.js'
import { formatINRFromPaise, formatINRCompact, fromRupees, toPaise } from '../../utils/currency.js'
import { calculateGoalStatus, getGoalTypeMeta } from '../../utils/goalStatus.js'
import AddSavingsModal from './AddSavingsModal.jsx'
import GoalCelebration from './GoalCelebration.jsx'

const STATUS_STYLES = {
  'Completed': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'Ahead':     'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'On Track':  'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  'At Risk':   'bg-red-500/15 text-red-400 border-red-500/25',
}

// ─── Inline edit modal ───────────────────────────────────────────────────────

function EditGoalModal({ goal, onClose, onUpdated, cryptoKey }) {
  const [name, setName] = useState(goal.name ?? '')
  const [target, setTarget] = useState(goal.target_amount ? String(Math.round(Number(goal.target_amount) / 100)) : '')
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [priority, setPriority] = useState(goal.priority ?? 'Medium')
  const [notes, setNotes] = useState(goal.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    const rupees = parseFloat(target)
    if (!rupees || rupees <= 0) { setError('Enter a valid target amount'); return }
    if (!deadline) { setError('Deadline is required'); return }
    if (new Date(deadline) <= new Date()) { setError('Deadline must be in the future'); return }

    setSaving(true)
    try {
      const updates = {
        name: name.trim(),
        target_amount: toPaise(fromRupees(rupees)),
        deadline,
        priority,
        notes: notes.trim(),
      }
      await encryptAndUpdate('goals', goal.id, updates, cryptoKey)
      onUpdated({ ...goal, ...updates })
      onClose()
    } catch (err) {
      console.error('[finio/EditGoalModal]', err)
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
        className="w-full max-w-md mx-4 rounded-2xl p-6 space-y-4"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <h3 className="text-base font-semibold text-white">Edit Goal</h3>

        <div className="space-y-3">
          <Field label="Goal Name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }}
              placeholder="Goal name" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Amount (₹)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">₹</span>
                <input type="number" value={target} onChange={(e) => setTarget(e.target.value)}
                  className="w-full border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }}
                  placeholder="0" />
              </div>
            </Field>
            <Field label="Deadline">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff', colorScheme: 'dark' }} />
            </Field>
          </div>
          <Field label="Priority">
            <div className="flex gap-2">
              {['High', 'Medium', 'Low'].map((p) => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    priority === p
                      ? p === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : p === 'Medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/10 text-white/60 border border-white/15'
                      : 'bg-white/5 text-white/30 border border-white/8 hover:bg-white/8'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-colors resize-none h-16"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }}
              placeholder="Any notes…" />
          </Field>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/6 text-white/60 text-sm hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-white/40 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

// ─── Three-dot menu ──────────────────────────────────────────────────────────

function GoalMenu({ onEdit, onDelete, onMarkComplete, onActivate, completed, isDraft }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 w-44 rounded-xl shadow-xl z-30 overflow-hidden"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          {isDraft ? (
            <button onClick={() => { setOpen(false); onActivate() }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-indigo-400 hover:bg-white/6 transition-colors">
              <Zap className="w-3.5 h-3.5" /> Activate Goal
            </button>
          ) : (
            <>
              <button onClick={() => { setOpen(false); onEdit() }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-white/70 hover:bg-white/6 transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              {!completed && (
                <button onClick={() => { setOpen(false); onMarkComplete() }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-emerald-400 hover:bg-white/6 transition-colors">
                  <Check className="w-3.5 h-3.5" /> Mark Complete
                </button>
              )}
            </>
          )}
          <button onClick={() => { setOpen(false); onDelete() }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Goal Card ───────────────────────────────────────────────────────────────

export default function GoalCard({ goal: initialGoal, surplusPaise, onDeleted, onActivated, onNewGoal }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [goal, setGoal] = useState(initialGoal)
  const [expanded, setExpanded] = useState(false)
  const [showAddSavings, setShowAddSavings] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isDraft = goal.status === 'Draft'

  const typeMeta = getGoalTypeMeta(goal.type)
  const status = calculateGoalStatus(goal, surplusPaise)
  const { pctComplete, monthsRemaining, requiredPerMonth, shortfallPerMonth, projectedDate } = status

  const targetPaise = Number(goal.target_amount) || 0
  const savedPaise = Number(goal.saved_amount) || 0

  async function handleMarkComplete() {
    try {
      await encryptAndUpdate('goals', goal.id, { saved_amount: targetPaise, status: 'Completed' }, cryptoKey)
      setGoal((g) => ({ ...g, saved_amount: targetPaise, status: 'Completed' }))
    } catch (err) {
      console.error('[finio/GoalCard] markComplete:', err)
    }
  }

  async function handleActivate() {
    try {
      await encryptAndUpdate('goals', goal.id, { status: 'Active' }, cryptoKey)
      setGoal((g) => ({ ...g, status: 'Active' }))
      onActivated?.()
    } catch (err) {
      console.error('[finio/GoalCard] activate:', err)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${goal.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteRecord('goals', goal.id)
      onDeleted(goal.id)
    } catch (err) {
      console.error('[finio/GoalCard] delete:', err)
      setDeleting(false)
    }
  }

  const deadlineStr = goal.deadline
    ? format(new Date(goal.deadline), 'd MMM yyyy')
    : '—'

  const priorityColor = goal.priority === 'High'
    ? 'text-red-400'
    : goal.priority === 'Medium'
    ? 'text-amber-400'
    : 'text-white/30'

  return (
    <>
      <div
        className={`rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/30 ${deleting ? 'opacity-40 pointer-events-none' : ''}`}
        style={{
          background: isDraft ? 'rgba(28,27,41,0.6)' : '#1C1B29',
          border: isDraft ? '1px dashed rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.08)',
          opacity: isDraft ? 0.85 : 1,
        }}
      >
        {/* Coloured header band */}
        <div
          className={`px-5 py-3 bg-gradient-to-r ${typeMeta.colorClass} flex items-center justify-between`}
          style={{ opacity: isDraft ? 0.6 : 1 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{typeMeta.icon}</span>
            <span className="text-xs font-medium text-white/50">{typeMeta.label}</span>
            {isDraft && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/40 border border-white/15">
                Draft
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isDraft && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status.status] ?? STATUS_STYLES['On Track']}`}>
                {status.status}
              </span>
            )}
            <GoalMenu
              isDraft={isDraft}
              completed={status.status === 'Completed'}
              onEdit={() => setShowEdit(true)}
              onMarkComplete={handleMarkComplete}
              onActivate={handleActivate}
              onDelete={handleDelete}
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white leading-tight">{goal.name}</h3>
              <p className="text-xs text-white/30 mt-0.5">
                Target: {formatINRFromPaise(targetPaise)} · Due {deadlineStr}
              </p>
            </div>
            <span className={`text-xs font-medium ${priorityColor}`}>{goal.priority}</span>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">{formatINRCompact(savedPaise)} saved</span>
              <span className="font-semibold text-white">{pctComplete}%</span>
            </div>
            <div className="h-2.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pctComplete}%`,
                  background: pctComplete >= 100 ? '#10B981'
                    : pctComplete >= 60 ? 'linear-gradient(90deg, #6366F1, #06B6D4)'
                    : '#6366F1',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/25">
              <span>{monthsRemaining > 0 ? `${monthsRemaining} months remaining` : 'Deadline passed'}</span>
              <span>{formatINRCompact(targetPaise)}</span>
            </div>
          </div>

          {/* Action row */}
          {isDraft ? (
            <button
              onClick={handleActivate}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 text-xs font-semibold transition-colors border border-indigo-500/20"
            >
              <Zap className="w-3.5 h-3.5" /> Activate Goal — commit to your budget
            </button>
          ) : status.status !== 'Completed' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAddSavings(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-semibold transition-colors border border-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5" /> Add Savings
              </button>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/8 text-white/40 text-xs transition-colors"
              >
                Details {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* Expanded details */}
          {expanded && (
            <div className="pt-2 border-t border-white/6 space-y-3">
              <DetailRow label="Monthly required" value={formatINRCompact(requiredPerMonth)} />
              <DetailRow label="Your current surplus" value={formatINRCompact(surplusPaise)} />
              {shortfallPerMonth > 0 && (
                <DetailRow label="Shortfall per month" value={formatINRCompact(shortfallPerMonth)} valueColor="text-red-400" />
              )}
              {projectedDate && (
                <DetailRow
                  label="Projected completion"
                  value={format(projectedDate, 'MMM yyyy')}
                  valueColor={status.onTrack ? 'text-green-400' : 'text-red-400'}
                />
              )}
              {goal.notes && (
                <p className="text-xs text-white/30 leading-relaxed pt-1">{goal.notes}</p>
              )}
              {goal._feasibilityNote && (
                <div className="px-3 py-2.5 rounded-xl bg-white/4 border border-white/6">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">AI Note</p>
                  <p className="text-xs text-white/50 leading-relaxed">{goal._feasibilityNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddSavings && (
        <AddSavingsModal
          goal={goal}
          onClose={() => setShowAddSavings(false)}
          onUpdated={(updated) => {
            setGoal(updated)
            const saved  = Number(updated.saved_amount)  || 0
            const target = Number(updated.target_amount) || 0
            if (target > 0 && saved >= target) setShowCelebration(true)
          }}
        />
      )}

      {showCelebration && (
        <GoalCelebration
          goal={goal}
          onArchive={async () => {
            await handleMarkComplete()
            setShowCelebration(false)
          }}
          onNewGoal={() => { setShowCelebration(false); onNewGoal?.() }}
          onDismiss={() => setShowCelebration(false)}
        />
      )}

      {showEdit && (
        <EditGoalModal
          goal={goal}
          cryptoKey={cryptoKey}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => setGoal(updated)}
        />
      )}
    </>
  )
}

function DetailRow({ label, value, valueColor = 'text-white' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-white/35">{label}</span>
      <span className={`text-xs font-semibold font-numeric ${valueColor}`}>{value}</span>
    </div>
  )
}
