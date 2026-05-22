import { useState } from 'react'
import { format } from 'date-fns'
import {
  Shield, Cpu, Server, Plus, Trash2, ChevronRight, ChevronLeft,
  CheckCircle2, TrendingUp, ArrowRight, Sparkles,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { configSet } from '../db/schema.js'
import { encryptAndSave } from '../db/helpers.js'
import { INCOME_TYPES, FREQUENCY_OPTIONS, EXPENSE_CATEGORIES } from '../utils/finance.js'
import { formatINR, fromRupees } from '../utils/currency.js'

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }) {
  return (
    <div className="space-y-8 text-center">
      <div>
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
          <Shield className="w-10 h-10 text-indigo-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          Welcome to <span className="text-gradient">Finio</span>
        </h1>
        <p className="text-white/50 max-w-md mx-auto leading-relaxed">
          Your complete financial picture — private by design, intelligent by choice.
          Takes 2 minutes to set up.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">AES-256 Encrypted</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              Every byte of your data is encrypted with your passphrase before touching storage.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Server className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Zero Data Sharing</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              Nothing leaves your device. We never see, store, or touch your financial data.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">AI That Forgets</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              The AI advisor works only on anonymized summaries and retains nothing between sessions.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-base transition-all glow-indigo"
      >
        <Sparkles className="w-4 h-4" />
        Let's set up your finances
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Step 2: Income ───────────────────────────────────────────────────────────

const EMPTY_INCOME = () => ({ name: '', type: 'salary', amount: '', frequency: 'monthly' })

function StepIncome({ income, setIncome, onNext, onBack }) {
  function addRow() {
    setIncome((prev) => [...prev, EMPTY_INCOME()])
  }

  function removeRow(i) {
    setIncome((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateRow(i, field, value) {
    setIncome((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  const hasValid = income.some((r) => r.name.trim() && Number(r.amount) > 0)

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/15 mb-4">
          <TrendingUp className="w-6 h-6 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Your income sources</h2>
        <p className="text-white/40 text-sm">Tell Finio how money comes in. You can always add more later.</p>
      </div>

      <div className="space-y-3">
        {income.map((row, i) => (
          <IncomeRow key={i} row={row} index={i} onChange={updateRow} onRemove={removeRow} canRemove={income.length > 1} />
        ))}

        <button
          type="button"
          onClick={addRow}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Add another income source
        </button>
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        canNext={true}
        nextLabel={hasValid ? 'Continue' : 'Skip for now'}
      />
    </div>
  )
}

function IncomeRow({ row, index, onChange, onRemove, canRemove }) {
  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/30 font-medium uppercase tracking-wider">
          Income source {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-white/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input
            type="text"
            value={row.name}
            onChange={(e) => onChange(index, 'name', e.target.value)}
            placeholder="e.g. Google Salary, Freelance, Rent from flat"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>

        <select
          value={row.type}
          onChange={(e) => onChange(index, 'type', e.target.value)}
          className="bg-[#1C1B29] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
        >
          {INCOME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={row.frequency}
          onChange={(e) => onChange(index, 'frequency', e.target.value)}
          className="bg-[#1C1B29] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
        >
          {FREQUENCY_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <div className="col-span-2 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium">₹</span>
          <input
            type="number"
            value={row.amount}
            onChange={(e) => onChange(index, 'amount', e.target.value)}
            placeholder="0"
            min="0"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all font-numeric"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Expenses ─────────────────────────────────────────────────────────

function StepExpenses({ expenses, setExpenses, onNext, onBack }) {
  function updateAmount(id, value) {
    setExpenses((prev) => ({ ...prev, [id]: value }))
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/15 mb-4">
          <span className="text-2xl">🧾</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Map your monthly spending</h2>
        <p className="text-white/40 text-sm">
          Rough estimates are fine — enter 0 for categories that don't apply to you.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EXPENSE_CATEGORIES.map((cat) => (
          <div key={cat.id} className="glass rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">{cat.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{cat.label}</p>
              <p className="text-xs text-white/30 truncate">{cat.hint}</p>
            </div>
            <div className="flex-shrink-0 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-xs">₹</span>
              <input
                type="number"
                value={expenses[cat.id] ?? ''}
                onChange={(e) => updateAmount(cat.id, e.target.value)}
                placeholder="0"
                min="0"
                className="w-24 bg-white/5 border border-white/10 rounded-lg pl-5 pr-2 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all font-numeric text-right"
              />
            </div>
          </div>
        ))}
      </div>

      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel="Review →" />
    </div>
  )
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function StepReview({ income, expenses, onComplete, onBack, completing }) {
  const monthlyIncomePaise = income.reduce((sum, r) => {
    if (!r.amount || Number(r.amount) <= 0) return sum
    const amountPaise = Math.round(Number(r.amount) * 100)
    const opt = FREQUENCY_OPTIONS.find((f) => f.value === r.frequency)
    const monthly = opt ? Math.round((amountPaise * opt.perYear) / 12) : amountPaise
    return sum + monthly
  }, 0)

  const monthlyExpensePaise = Object.values(expenses).reduce((sum, v) => {
    const n = Number(v)
    return sum + (n > 0 ? Math.round(n * 100) : 0)
  }, 0)

  const surplusPaise = monthlyIncomePaise - monthlyExpensePaise
  const savingsRate =
    monthlyIncomePaise > 0 ? Math.round((surplusPaise / monthlyIncomePaise) * 100) : 0

  const filledExpenses = EXPENSE_CATEGORIES.filter(
    (c) => Number(expenses[c.id]) > 0
  )
  const filledIncome = income.filter((r) => r.name.trim() && Number(r.amount) > 0)

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/15 mb-4">
          <CheckCircle2 className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Here's your financial picture</h2>
        <p className="text-white/40 text-sm">
          This data will be saved encrypted to your vault.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Monthly Income</p>
          <p className="text-2xl font-bold font-numeric text-green-400">
            {formatINR(fromRupees(monthlyIncomePaise / 100))}
          </p>
          <p className="text-xs text-white/30 mt-1">{filledIncome.length} source{filledIncome.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Monthly Expenses</p>
          <p className="text-2xl font-bold font-numeric text-red-400">
            {formatINR(fromRupees(monthlyExpensePaise / 100))}
          </p>
          <p className="text-xs text-white/30 mt-1">{filledExpenses.length} categor{filledExpenses.length !== 1 ? 'ies' : 'y'}</p>
        </div>

        <div className={`glass rounded-2xl p-5 text-center ${surplusPaise >= 0 ? 'border-green-500/20' : 'border-red-500/20'}`}>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
            {surplusPaise >= 0 ? 'Monthly Surplus' : 'Monthly Deficit'}
          </p>
          <p className={`text-2xl font-bold font-numeric ${surplusPaise >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatINR(fromRupees(Math.abs(surplusPaise) / 100))}
          </p>
          <p className="text-xs text-white/30 mt-1">
            {monthlyIncomePaise > 0 ? `${Math.abs(savingsRate)}% savings rate` : '—'}
          </p>
        </div>
      </div>

      {filledIncome.length === 0 && monthlyExpensePaise === 0 && (
        <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl px-5 py-4 text-amber-400/80 text-sm text-center">
          You skipped income and expenses — no problem. You can add them from the app anytime.
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold transition-all glow-indigo disabled:opacity-50"
        >
          {completing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Enter Finio
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Shared nav ───────────────────────────────────────────────────────────────

function StepNav({ onBack, onNext, canNext, nextLabel = 'Continue' }) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-sm"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold transition-all disabled:opacity-30"
      >
        {nextLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ step, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < step
              ? 'w-6 h-1.5 bg-indigo-500'
              : i === step
              ? 'w-4 h-1.5 bg-indigo-400'
              : 'w-2 h-1.5 bg-white/15'
          }`}
        />
      ))}
      <span className="text-xs text-white/30 ml-1">
        Step {step + 1} of {total}
      </span>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4

export default function Onboarding() {
  const { completeOnboarding } = useAppStore()
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)

  const [income, setIncome] = useState([EMPTY_INCOME()])
  const [expenses, setExpenses] = useState({})

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  async function handleComplete() {
    setCompleting(true)
    try {
      const cryptoKey = useAppStore.getState().cryptoKey
      const month = format(new Date(), 'yyyy-MM')
      const today = format(new Date(), 'yyyy-MM-dd')

      await Promise.all([
        ...income
          .filter((r) => r.name.trim() && Number(r.amount) > 0)
          .map((r) =>
            encryptAndSave(
              'income_streams',
              {
                name: r.name.trim(),
                type: r.type,
                amount: Math.round(Number(r.amount) * 100),
                frequency: r.frequency,
              },
              cryptoKey,
            )
          ),
        ...EXPENSE_CATEGORIES
          .filter((cat) => Number(expenses[cat.id]) > 0)
          .map((cat) =>
            encryptAndSave(
              'expenses',
              {
                category: cat.id,
                subcategory: cat.label,
                amount: Math.round(Number(expenses[cat.id]) * 100),
                date: today,
                month,
                notes: '',
              },
              cryptoKey,
              ['month'],
            )
          ),
      ])

      await configSet('onboarding_complete', 'true')
      completeOnboarding()
    } catch (err) {
      console.error('[finio] Onboarding completion failed:', err)
      setCompleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex flex-col items-center justify-start p-4 pt-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl flex flex-col items-center gap-8">
        {step > 0 && (
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="text-sm font-semibold text-gradient">Finio</span>
            </div>
            <ProgressDots step={step} total={TOTAL_STEPS} />
          </div>
        )}

        <div className="w-full">
          {step === 0 && <StepWelcome onNext={next} />}
          {step === 1 && <StepIncome income={income} setIncome={setIncome} onNext={next} onBack={back} />}
          {step === 2 && <StepExpenses expenses={expenses} setExpenses={setExpenses} onNext={next} onBack={back} />}
          {step === 3 && (
            <StepReview
              income={income}
              expenses={expenses}
              onBack={back}
              onComplete={handleComplete}
              completing={completing}
            />
          )}
        </div>
      </div>
    </div>
  )
}
