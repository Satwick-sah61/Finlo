import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { X, ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertTriangle, TrendingUp, BookmarkCheck } from 'lucide-react'
import { differenceInCalendarMonths, format } from 'date-fns'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndSave } from '../../db/helpers.js'
import { fromRupees, toPaise, formatINRCompact, formatINRFromPaise } from '../../utils/currency.js'
import { GOAL_TYPES, getGoalTypeMeta } from '../../utils/goalStatus.js'
import { getCategoryMeta } from '../../utils/finance.js'
import { analyzeGoalFeasibility } from '../../ai/goalAnalysis.js'

// ─── CSS-only confetti ────────────────────────────────────────────────────────

const CONFETTI_PIECES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  color: ['#6366F1', '#06B6D4', '#22C55E', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316'][i % 7],
  left: `${(i * 3.8 + 4) % 93}%`,
  delay: `${((i * 0.11) % 0.9).toFixed(2)}s`,
  dur: `${(1.1 + (i % 7) * 0.14).toFixed(2)}s`,
  size: i % 4 === 0 ? 9 : i % 3 === 0 ? 5 : 7,
  rotate: i % 2 === 0 ? 660 : -480,
  shape: i % 5 === 0 ? '50%' : '2px',
}))

function Confetti() {
  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-12px) rotate(0deg) scale(1); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(260px) rotate(var(--cf-r)) scale(0.7); opacity: 0; }
        }
        .cf { position: absolute; top: 0; animation: confetti-fall var(--cf-d) var(--cf-del) ease-out forwards; border-radius: var(--cf-br); }
      `}</style>
      <div className="absolute inset-x-0 top-0 h-0 overflow-visible pointer-events-none" aria-hidden>
        {CONFETTI_PIECES.map((p) => (
          <div
            key={p.id}
            className="cf"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              '--cf-d': p.dur,
              '--cf-del': p.delay,
              '--cf-r': `${p.rotate}deg`,
              '--cf-br': p.shape,
            }}
          />
        ))}
      </div>
    </>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Type', 'Details', 'Analysis', 'Done']

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-1">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
            i < step ? 'bg-indigo-600/30 text-indigo-400'
            : i === step ? 'bg-indigo-600 text-white'
            : 'bg-white/5 text-white/25'
          }`}>
            {i < step ? <CheckCircle2 className="w-3 h-3" /> : <span>{i + 1}</span>}
            <span className="hidden sm:inline">{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`w-4 h-px ${i < step ? 'bg-indigo-500/50' : 'bg-white/10'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step 0: Type selector ────────────────────────────────────────────────────

function TypeSelector({ selected, onSelect }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">What are you saving for?</h2>
        <p className="text-sm text-white/40 mt-1">Choose a goal type to get started</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {GOAL_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => onSelect(type.id)}
            className={`flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all text-left ${
              selected === type.id
                ? 'border-indigo-500/60 bg-indigo-500/15 shadow-md shadow-indigo-900/30'
                : 'border-white/8 bg-white/4 hover:bg-white/7 hover:border-white/15'
            }`}
          >
            <span className="text-2xl">{type.icon}</span>
            <div>
              <p className={`text-sm font-semibold ${selected === type.id ? 'text-white' : 'text-white/70'}`}>
                {type.label}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">{type.example}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 1: Details form ─────────────────────────────────────────────────────

const DEFAULT_NAMES = {
  purchase: 'Big Purchase Fund',
  travel: 'Travel Fund',
  education: 'Education Fund',
  emergency: 'Emergency Fund',
  wedding: 'Wedding Fund',
  custom: '',
}

// Uncontrolled inputs so the browser owns the DOM state — avoids controlled-input
// update-cycle issues that can make typed text invisible in certain React renders.
// Parent reads values via ref only when "Next" is clicked.
const DetailsForm = forwardRef(function DetailsForm({ goalType, initialName, error }, ref) {
  const typeMeta = getGoalTypeMeta(goalType)
  const today = format(new Date(), 'yyyy-MM-dd')
  const [priority, setPriority] = useState('Medium')
  const nameRef = useRef(null)
  const targetRef = useRef(null)
  const deadlineRef = useRef(null)
  const notesRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getValues: () => ({
      name: nameRef.current?.value ?? '',
      target: targetRef.current?.value ?? '',
      deadline: deadlineRef.current?.value ?? '',
      priority,
      notes: notesRef.current?.value ?? '',
    }),
  }))

  const INPUT = 'w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-colors placeholder:text-white/20'
  const INPUT_STYLE = { background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{typeMeta.icon}</span>
          <h2 className="text-lg font-semibold text-white">Goal Details</h2>
        </div>
        <p className="text-sm text-white/40">Tell us more about your goal</p>
      </div>

      <div className="space-y-3">
        <FormField label="Goal Name">
          <input
            ref={nameRef}
            type="text"
            defaultValue={initialName ?? ''}
            className={INPUT}
            style={INPUT_STYLE}
            placeholder={DEFAULT_NAMES[goalType] || 'My goal'}
            autoFocus
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Target Amount (₹)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-sm font-numeric">₹</span>
              <input
                ref={targetRef}
                type="number"
                min="1"
                defaultValue=""
                className={INPUT.replace('px-3', 'pl-7 pr-3')}
                style={INPUT_STYLE}
                placeholder="50000"
              />
            </div>
          </FormField>

          <FormField label="Target Date">
            <input
              ref={deadlineRef}
              type="date"
              defaultValue=""
              min={today}
              className={INPUT}
              style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
            />
          </FormField>
        </div>

        <FormField label="Priority">
          <div className="flex gap-2">
            {['High', 'Medium', 'Low'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  priority === p
                    ? p === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : p === 'Medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-white/10 text-white/50 border-white/20'
                    : 'bg-white/4 text-white/25 border-white/8 hover:bg-white/7'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Notes (optional)">
          <textarea
            ref={notesRef}
            defaultValue=""
            className={`${INPUT} resize-none`}
            style={INPUT_STYLE}
            rows={2}
            placeholder="Any extra context…"
          />
        </FormField>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
})

function FormField({ label, children }) {
  return (
    <div>
      <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

// ─── Step 2: AI Analysis ──────────────────────────────────────────────────────

const TIER_CONFIG = {
  affordable: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    icon: '🏆', titleColor: 'text-emerald-400',
    title: "You're all set!",
  },
  tight: {
    bg: 'bg-amber-500/10 border-amber-500/20',
    icon: '⚡', titleColor: 'text-amber-400',
    title: 'Doable with small adjustments',
  },
  stretch: {
    bg: 'bg-orange-500/10 border-orange-500/20',
    icon: '🤔', titleColor: 'text-orange-400',
    title: 'Ambitious — but possible',
  },
  overreach: {
    bg: 'bg-red-500/10 border-red-500/20',
    icon: '❤️', titleColor: 'text-red-400',
    title: "Let's be honest with each other",
  },
}

const ADJUSTABLE_CATS = ['lifestyle', 'food', 'transport', 'miscellaneous']

function AnalysisResult({ analysis, form, tier, gap, effectiveSurplus, monthlyIncome, expenseByCategory }) {
  if (!analysis) return null

  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.affordable
  const monthlyRequired = analysis.monthly_required ?? 0
  const targetPaise = toPaise(fromRupees(parseFloat(form?.target) || 0))
  const incomeSharePct = monthlyIncome > 0 ? Math.round((monthlyRequired / monthlyIncome) * 100) : 0

  // Build expense-cut suggestions for tight/stretch/overreach
  const expenseSuggestions = []
  if (gap > 0 && expenseByCategory) {
    let remaining = gap
    for (const catId of ADJUSTABLE_CATS) {
      if (remaining <= 0) break
      const spent = expenseByCategory[catId] ?? 0
      if (spent <= 0) continue
      const cut = Math.min(spent, Math.ceil(remaining))
      const catMeta = getCategoryMeta(catId)
      const pct = Math.round((cut / spent) * 100)
      expenseSuggestions.push({ catMeta, cut, spent, pct })
      remaining -= cut
    }
  }

  const hardTruth = {
    tight: `This goal needs ${formatINRCompact(gap)}/mo more than your current free money. The good news: small cuts to non-essential spending can cover this gap without much pain.`,
    stretch: `To afford this goal, you'd need to cut ${formatINRCompact(gap)}/mo from your spending — that's a significant change. It's absolutely achievable, but it requires real commitment. Consider whether the timeline can be extended, or save this as a draft and activate it when your income grows.`,
    overreach: `This goal would take ${incomeSharePct}% of your monthly income. We know this matters to you — and that's exactly why we're being straight with you. At this level, even small unexpected expenses could derail everything. Saving it as a draft isn't giving up; it's planning smart. When your income grows or expenses drop, you'll be ready to activate it.`,
  }[tier] ?? analysis.message

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h2 className="text-lg font-semibold text-white">Feasibility Analysis</h2>
        {analysis.isFallback && (
          <span className="text-[10px] text-white/25 bg-white/5 px-1.5 py-0.5 rounded-full">rule-based</span>
        )}
      </div>

      {/* Result card */}
      <div className={`p-4 rounded-2xl border ${cfg.bg}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{cfg.icon}</span>
          <span className={`text-sm font-bold ${cfg.titleColor}`}>{cfg.title}</span>
        </div>
        <p className="text-sm text-white/65 leading-relaxed">{hardTruth}</p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-white/4 border border-white/6">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Monthly</p>
          <p className="text-base font-bold font-numeric text-white">{formatINRCompact(monthlyRequired)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/4 border border-white/6">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Target</p>
          <p className="text-base font-bold font-numeric text-white">{formatINRCompact(targetPaise)}</p>
        </div>
        <div className={`p-3 rounded-xl border ${gap > 0 ? 'bg-red-500/8 border-red-500/20' : 'bg-emerald-500/8 border-emerald-500/20'}`}>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{gap > 0 ? 'Gap' : 'Spare'}</p>
          <p className={`text-base font-bold font-numeric ${gap > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatINRCompact(gap > 0 ? gap : effectiveSurplus - monthlyRequired)}
          </p>
        </div>
      </div>

      {/* Expense adjustments — shown for tight/stretch/overreach */}
      {expenseSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Suggested expense adjustments
          </p>
          {expenseSuggestions.map(({ catMeta, cut, spent, pct }, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/4 border border-white/6">
              <div className="flex items-center gap-2">
                <span>{catMeta.emoji}</span>
                <div>
                  <p className="text-xs text-white/70">{catMeta.label}</p>
                  <p className="text-[10px] text-white/30">Currently {formatINRCompact(spent)}/mo</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-amber-400">−{formatINRCompact(cut)}/mo</p>
                <p className="text-[10px] text-white/30">reduce by {pct}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* High priority callout for overreach */}
      {tier === 'overreach' && form?.priority === 'High' && (
        <div className="px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-indigo-300 leading-relaxed">
            Because you marked this <strong>High priority</strong>, you can still activate it — but we strongly recommend reviewing your expenses first to make room for this commitment.
          </p>
        </div>
      )}

      {/* AI suggestions (when available) */}
      {tier === 'affordable' && analysis.suggestions?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-white/40 uppercase tracking-wider">Tips</p>
          {analysis.suggestions.map((s, i) => (
            <p key={i} className="flex items-start gap-2 text-sm text-white/55">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>{s}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Success ──────────────────────────────────────────────────────────

function SuccessStep({ goal }) {
  const isDraft = goal?.status === 'Draft'
  return (
    <div className="relative text-center py-8 space-y-4">
      {!isDraft && <Confetti />}
      <div className="text-5xl">{isDraft ? '📋' : '🎯'}</div>
      <div>
        <h2 className="text-xl font-bold text-white">
          {isDraft ? 'Saved as Draft' : 'Goal Created!'}
        </h2>
        <p className="text-sm text-white/40 mt-1">"{goal?.name}"</p>
      </div>
      {isDraft ? (
        <div className="mx-auto max-w-xs space-y-2">
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-left">
            <BookmarkCheck className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-300 leading-relaxed">
              This goal is saved as a draft and <strong>won't count against your monthly budget</strong>. Activate it from the Goals page when you're ready — when income grows or expenses come down.
            </p>
          </div>
          <p className="text-xs text-white/25">No pressure. Planning ahead is the smart move.</p>
        </div>
      ) : (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/25">
          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm text-indigo-300 font-medium">
            Target: {goal ? formatINRFromPaise(Number(goal.target_amount)) : '—'}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main flow ────────────────────────────────────────────────────────────────

export default function GoalCreationFlow({ onClose, onCreated, summary, existingGoalsCount, goalAllocatedPaise = 0, initialType = null }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)

  const [step, setStep] = useState(initialType ? 1 : 0)
  const [goalType, setGoalType] = useState(initialType)
  const [initialName, setInitialName] = useState(initialType ? (DEFAULT_NAMES[initialType] || '') : '')
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedGoal, setSavedGoal] = useState(null)
  const [tier, setTier] = useState('affordable')
  const [gap, setGap] = useState(0)
  const detailsRef = useRef(null)

  const monthlyIncome = summary?.totalMonthlyIncomePaise ?? 0
  const grossSurplus = summary?.surplusPaise ?? 0
  const effectiveSurplus = Math.max(0, grossSurplus - goalAllocatedPaise)

  // Trigger AI analysis when entering step 2
  useEffect(() => {
    if (step !== 2 || !form) return
    setAnalyzing(true)
    setAnalysis(null)
    setTier('affordable')
    setGap(0)

    const targetPaise = toPaise(fromRupees(parseFloat(form.target) || 0))
    const monthsRemaining = form.deadline
      ? Math.max(0, differenceInCalendarMonths(new Date(form.deadline), new Date()))
      : 0

    analyzeGoalFeasibility({
      surplus: grossSurplus,
      savingsRate: summary?.savingsRate ?? 0,
      goalTarget: targetPaise,
      goalDeadline: form.deadline,
      monthsRemaining,
      existingGoalsCount: existingGoalsCount ?? 0,
    }).then((result) => {
      const goalMonthly = result.monthly_required ?? 0
      const computedGap = Math.max(0, goalMonthly - effectiveSurplus)
      let computedTier = 'affordable'
      if (computedGap > 0) {
        const incomeShare = monthlyIncome > 0 ? goalMonthly / monthlyIncome : 1
        if (incomeShare >= 0.5) computedTier = 'overreach'
        else if (computedGap > Math.max(grossSurplus * 0.2, 50000)) computedTier = 'stretch'
        else computedTier = 'tight'
      }
      setTier(computedTier)
      setGap(computedGap)
      setAnalysis(result)
      setAnalyzing(false)
    })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function validateStep0() {
    if (!goalType) { setFormError('Please select a goal type'); return false }
    return true
  }

  function validateStep1(values) {
    if (!values.name.trim()) { setFormError('Goal name is required'); return false }
    const rupees = parseFloat(values.target)
    if (!rupees || rupees <= 0) { setFormError('Enter a valid target amount'); return false }
    if (!values.deadline) { setFormError('Target date is required'); return false }
    if (new Date(values.deadline) <= new Date()) { setFormError('Target date must be in the future'); return false }
    return true
  }

  function handleNext() {
    setFormError(null)
    if (step === 0 && !validateStep0()) return
    if (step === 1) {
      const values = detailsRef.current?.getValues()
      if (!values || !validateStep1(values)) return
      setForm(values)
    }
    setStep((s) => s + 1)
  }

  function handleBack() {
    setFormError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  function handleTypeSelect(type) {
    setGoalType(type)
    setInitialName(DEFAULT_NAMES[type] || '')
    setFormError(null)
  }

  async function persistGoal(status) {
    if (!form) return
    setSaving(true)
    setFormError(null)
    try {
      const targetPaise = toPaise(fromRupees(parseFloat(form.target) || 0))
      const goal = {
        type: goalType,
        name: form.name.trim(),
        target_amount: targetPaise,
        saved_amount: 0,
        deadline: form.deadline,
        priority: form.priority,
        notes: form.notes.trim(),
        status,
        _feasibilityNote: analysis?.message ?? null,
        _tier: tier,
        created_at: new Date(),
      }
      const id = await encryptAndSave('goals', goal, cryptoKey)
      const saved = { ...goal, id }
      setSavedGoal(saved)
      onCreated(saved)
      setStep(3)
    } catch (err) {
      console.error('[finio/GoalCreationFlow] save:', err)
      setFormError('Failed to save goal. Please try again.')
      setSaving(false)
    }
  }

  const doSave = () => persistGoal('Active')
  const doSaveDraft = () => persistGoal('Draft')

  const showBack = step > 0 && step < 3
  const isLastActionStep = step === 2

  // Footer button config per tier
  const footerButtons = (() => {
    if (!isLastActionStep || analyzing) return null
    if (tier === 'affordable') {
      return <button onClick={doSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">{saving ? 'Saving…' : '✓ Save Goal'}</button>
    }
    if (tier === 'tight') {
      return (
        <>
          <button onClick={doSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">{saving ? 'Saving…' : 'Commit to Goal'}</button>
          <button onClick={doSaveDraft} disabled={saving} className="px-4 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/50 text-sm transition-colors">Save Draft</button>
        </>
      )
    }
    if (tier === 'stretch') {
      return (
        <>
          <button onClick={doSaveDraft} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">{saving ? 'Saving…' : '📋 Save as Draft'}</button>
          <button onClick={doSave} disabled={saving} className="px-4 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-amber-400/70 text-sm transition-colors">Commit Anyway</button>
        </>
      )
    }
    // overreach
    const isHighPriority = form?.priority === 'High'
    return (
      <>
        <button onClick={doSaveDraft} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">{saving ? 'Saving…' : '📋 Save as Draft'}</button>
        {isHighPriority && (
          <button onClick={doSave} disabled={saving} className="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs border border-red-500/20 transition-colors">High Priority — Activate</button>
        )}
      </>
    )
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — visual only, separated from content so backdrop-filter doesn't swallow keyboard events */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.82)' }}
        onClick={step < 3 ? onClose : undefined}
      />
      <div
        className="relative w-full max-w-xl rounded-2xl flex flex-col"
        style={{
          background: '#1C1B29',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
          <StepBar step={step} />
          {step < 3 && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <TypeSelector selected={goalType} onSelect={handleTypeSelect} />}
          {step === 1 && <DetailsForm ref={detailsRef} goalType={goalType} initialName={initialName} error={formError} />}
          {step === 2 && (
            analyzing ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-white/40">Analysing feasibility…</p>
              </div>
            ) : (
              <AnalysisResult
                analysis={analysis}
                form={form}
                tier={tier}
                gap={gap}
                effectiveSurplus={effectiveSurplus}
                monthlyIncome={monthlyIncome}
                expenseByCategory={summary?.expenseByCategory ?? {}}
              />
            )
          )}
          {step === 3 && <SuccessStep goal={savedGoal} />}
          {step === 0 && formError && (
            <p className="text-xs text-red-400 mt-3">{formError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex-shrink-0">
          {step === 3 ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
            >
              View My Goals
            </button>
          ) : (
            <div className="flex gap-3">
              {showBack && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/6 text-white/50 text-sm hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}

              {isLastActionStep ? (
                footerButtons
              ) : (
                <button
                  onClick={handleNext}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                >
                  {step === 0 ? 'Continue' : 'Analyse with AI →'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
