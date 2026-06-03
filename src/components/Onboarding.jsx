/**
 * Onboarding — 5-step goal-first flow.
 *
 * Step 1: Welcome + privacy promise (unchanged)
 * Step 2: Goal selection → pre-applies framework to app_config
 * Step 3: Income entry (unchanged)
 * Step 4: Expense entry (upgraded — framework targets + daily/monthly toggle)
 * Step 5: Review + deviation analysis (upgraded — framework score + suggestions)
 */

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Shield, Cpu, Server, Plus, Trash2, ChevronRight, ChevronLeft,
  CheckCircle2, TrendingUp, ArrowRight, Sparkles, Check,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { configSet } from '../db/schema.js'
import { encryptAndSave } from '../db/helpers.js'
import { INCOME_TYPES, FREQUENCY_OPTIONS, EXPENSE_CATEGORIES } from '../utils/finance.js'
import { formatINR, fromRupees } from '../utils/currency.js'
import { FRAMEWORK_PRESETS } from '../utils/frameworkMapping.js'
import { analyzeFramework } from '../utils/frameworkAnalysis.js'
import DailyMonthlyToggle from './shared/DailyMonthlyToggle.jsx'

// ─── Categories that get a daily/monthly toggle ───────────────────────────────

const TOGGLE_CATEGORIES = new Set(['food', 'transport', 'lifestyle', 'miscellaneous'])

// ─── Goal → framework mapping ────────────────────────────────────────────────

const ONBOARDING_GOALS = [
  {
    id:          'clear_debt',
    emoji:       '🏠',
    title:       'Clear My Debt Faster',
    description: 'Focus on paying off loans and becoming debt-free',
    frameworkId: 'finio_smart',
  },
  {
    id:          'safety_net',
    emoji:       '💰',
    title:       'Build My Safety Net',
    description: 'Create an emergency fund and build stable savings',
    frameworkId: '60_20_20',
  },
  {
    id:          'grow_wealth',
    emoji:       '📈',
    title:       'Grow My Wealth',
    description: 'Invest consistently for long-term financial growth',
    frameworkId: '75_15_10',
  },
  {
    id:          'save_big',
    emoji:       '✈️',
    title:       'Save for Something Big',
    description: 'A trip, house, wedding, or major purchase',
    frameworkId: '50_30_20',
  },
  {
    id:          'balance',
    emoji:       '⚖️',
    title:       'Balance Lifestyle & Savings',
    description: 'Enjoy life while building financial stability',
    frameworkId: '50_30_20',
  },
  {
    id:          'custom',
    emoji:       '🎯',
    title:       "I'll Define My Own",
    description: 'Set your own allocation targets',
    frameworkId: null,
  },
]

function findFramework(id) {
  return FRAMEWORK_PRESETS.find((f) => f.id === id) || null
}

// ─── Compute per-category framework target ────────────────────────────────────

function computeCategoryTargets(framework, monthlyIncomePaise) {
  if (!framework || !monthlyIncomePaise) return {}

  const targets = {}
  const map = framework.categoryMap || {}

  // Count categories per bucket
  const bucketCategories = {}
  for (const [cat, bucket] of Object.entries(map)) {
    if (!bucketCategories[bucket]) bucketCategories[bucket] = []
    bucketCategories[bucket].push(cat)
  }

  for (const bucket of (framework.buckets || [])) {
    const cats = bucketCategories[bucket.id] || []
    if (cats.length === 0) continue
    const bucketPaise = Math.round(monthlyIncomePaise * bucket.targetPct / 100)
    const perCat = Math.round(bucketPaise / cats.length)
    for (const cat of cats) {
      targets[cat] = perCat
    }
  }

  return targets
}

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
        {[
          { Icon: Shield, color: 'indigo', title: 'AES-256 Encrypted', desc: 'Every byte of your data is encrypted with your passphrase before touching storage.' },
          { Icon: Server, color: 'violet', title: 'Zero Data Sharing',  desc: "Nothing leaves your device. We never see, store, or touch your financial data." },
          { Icon: Cpu,    color: 'cyan',   title: 'AI That Forgets',    desc: 'The AI advisor works only on anonymized summaries and retains nothing between sessions.' },
        ].map(({ Icon, color, title, desc }) => (
          <div key={title} className="glass rounded-2xl p-5 space-y-3">
            <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 flex items-center justify-center`}>
              <Icon className={`w-5 h-5 text-${color}-400`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
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

// ─── Step 2: Goal selection ───────────────────────────────────────────────────

function StepGoal({ selectedGoal, setSelectedGoal, onNext, onBack }) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/15 mb-4">
          <span className="text-2xl">🎯</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">What's your financial goal right now?</h2>
        <p className="text-white/40 text-sm">We'll personalise your budget framework to match.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ONBOARDING_GOALS.map((goal) => {
          const isSelected = selectedGoal?.id === goal.id
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => setSelectedGoal(goal)}
              className="relative text-left rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                border:     isSelected ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                minHeight:  80,
              }}
            >
              {isSelected && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: '#6366F1' }}
                >
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{goal.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{goal.title}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-snug">{goal.description}</p>
                  {goal.frameworkId && (
                    <p className="text-[10px] text-indigo-400/60 mt-1">
                      → {findFramework(goal.frameworkId)?.name || 'Custom'}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <StepNav onBack={onBack} onNext={onNext} canNext={!!selectedGoal} nextLabel="Set Up Income →" />
    </div>
  )
}

// ─── Step 3: Income ───────────────────────────────────────────────────────────

const EMPTY_INCOME = () => ({ name: '', type: 'salary', amount: '', frequency: 'monthly' })

function StepIncome({ income, setIncome, onNext, onBack }) {
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
          <IncomeRow key={i} row={row} index={i}
            onChange={(idx, field, val) => setIncome((prev) => prev.map((r, j) => j === idx ? { ...r, [field]: val } : r))}
            onRemove={(idx) => setIncome((prev) => prev.filter((_, j) => j !== idx))}
            canRemove={income.length > 1}
          />
        ))}
        <button
          type="button"
          onClick={() => setIncome((p) => [...p, EMPTY_INCOME()])}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Add another income source
        </button>
      </div>

      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel={hasValid ? 'Continue' : 'Skip for now'} />
    </div>
  )
}

function IncomeRow({ row, index, onChange, onRemove, canRemove }) {
  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/30 font-medium uppercase tracking-wider">Income source {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={() => onRemove(index)} className="text-white/20 hover:text-red-400 transition-colors">
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
            placeholder="e.g. Salary, Freelance, Rent"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
            style={{ color: '#ffffff', caretColor: '#ffffff' }}
          />
        </div>
        <select
          value={row.type}
          onChange={(e) => onChange(index, 'type', e.target.value)}
          className="bg-[#1C1B29] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
        >
          {INCOME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={row.frequency}
          onChange={(e) => onChange(index, 'frequency', e.target.value)}
          className="bg-[#1C1B29] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
        >
          {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
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
            style={{ color: '#ffffff', caretColor: '#ffffff' }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Expenses (with framework targets + daily/monthly toggle) ─────────

function StepExpenses({ expenses, setExpenses, onNext, onBack, framework, monthlyIncomePaise }) {
  const targets = useMemo(
    () => computeCategoryTargets(framework, monthlyIncomePaise),
    [framework, monthlyIncomePaise]
  )

  function updateAmount(id, paise) {
    setExpenses((prev) => ({ ...prev, [id]: paise > 0 ? paise : 0 }))
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/15 mb-4">
          <span className="text-2xl">🧾</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Map your monthly spending</h2>
        {framework && (
          <p className="text-xs text-indigo-400/70 mt-1">
            Targets shown based on <strong>{framework.name}</strong>
            {monthlyIncomePaise > 0 ? ` at ${formatINR(fromRupees(monthlyIncomePaise / 100))} income` : ''}
          </p>
        )}
        <p className="text-white/40 text-sm mt-1">Rough estimates are fine — enter 0 to skip categories.</p>
      </div>

      <div className="space-y-2">
        {EXPENSE_CATEGORIES.map((cat) => (
          <DailyMonthlyToggle
            key={cat.id}
            valuePaise={expenses[cat.id] || 0}
            onChange={(paise) => updateAmount(cat.id, paise)}
            label={cat.label}
            emoji={cat.emoji}
            hint={cat.hint}
            frameworkTarget={targets[cat.id] || 0}
            hasToggle={TOGGLE_CATEGORIES.has(cat.id)}
          />
        ))}
      </div>

      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel="Review →" />
    </div>
  )
}

// ─── Step 5: Review + deviation ───────────────────────────────────────────────

function StepReview({ income, expenses, framework, selectedGoal, onComplete, onBack, completing }) {
  const monthlyIncomePaise = income.reduce((sum, r) => {
    if (!r.amount || Number(r.amount) <= 0) return sum
    const paise = Math.round(Number(r.amount) * 100)
    const opt   = FREQUENCY_OPTIONS.find((f) => f.value === r.frequency)
    return sum + (opt ? Math.round((paise * opt.perYear) / 12) : paise)
  }, 0)

  const expensesAsArray = EXPENSE_CATEGORIES
    .filter((cat) => (expenses[cat.id] || 0) > 0)
    .map((cat) => ({ category: cat.id, amount: expenses[cat.id] / 100 })) // amount in rupees for analysis

  const monthlyExpensePaise = Object.values(expenses).reduce((s, v) => s + (Number(v) || 0), 0)
  const surplusPaise        = monthlyIncomePaise - monthlyExpensePaise
  const savingsRate         = monthlyIncomePaise > 0 ? Math.round((surplusPaise / monthlyIncomePaise) * 100) : 0

  // Run framework analysis
  const analysis = useMemo(() => {
    if (!framework || !monthlyIncomePaise) return null
    return analyzeFramework(framework, monthlyIncomePaise, expensesAsArray, 0, 0)
  }, [framework, monthlyIncomePaise, expensesAsArray])

  const scoreColor = analysis
    ? (analysis.score >= 75 ? '#10B981' : analysis.score >= 50 ? '#F59E0B' : '#EF4444')
    : '#6366F1'

  const filledExpenses = EXPENSE_CATEGORIES.filter((c) => (expenses[c.id] || 0) > 0)
  const filledIncome   = income.filter((r) => r.name.trim() && Number(r.amount) > 0)

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/15 mb-4">
          <CheckCircle2 className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">Here's your financial picture</h2>
        {selectedGoal && (
          <p className="text-sm text-white/40">
            Goal: <span className="text-indigo-300">{selectedGoal.emoji} {selectedGoal.title}</span>
            {framework && <span className="text-white/30"> · {framework.name}</span>}
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Monthly Income',   value: formatINR(fromRupees(monthlyIncomePaise / 100)), color: 'text-green-400', sub: `${filledIncome.length} source${filledIncome.length !== 1 ? 's' : ''}` },
          { label: 'Monthly Expenses', value: formatINR(fromRupees(monthlyExpensePaise / 100)), color: 'text-orange-400', sub: `${filledExpenses.length} categor${filledExpenses.length !== 1 ? 'ies' : 'y'}` },
          { label: surplusPaise >= 0 ? 'Monthly Surplus' : 'Deficit', value: formatINR(fromRupees(Math.abs(surplusPaise) / 100)), color: surplusPaise >= 0 ? 'text-green-400' : 'text-red-400', sub: `${Math.abs(savingsRate)}% savings rate` },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="glass rounded-2xl p-4 text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-xl font-bold font-numeric ${color}`}>{value}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Framework deviation analysis */}
      {analysis && framework && (
        <div className="glass rounded-2xl p-5 space-y-4">
          {/* Score header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Framework Alignment</p>
              <p className="text-[10px] text-white/30 mt-0.5">Using: {framework.name}</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-bold font-numeric" style={{ color: scoreColor }}>{analysis.score}</span>
              <p className="text-[10px] text-white/30">/100</p>
            </div>
          </div>

          {/* Deviation table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Bucket', 'Target', 'Actual', '', 'Variance'].map((h) => (
                    <th key={h} className="py-2 text-left text-[10px] text-white/25 font-medium pr-3 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.buckets.map((b) => {
                  const trafficLight = b.status === 'good' ? '🟢' : b.status === 'warning' ? '🟡' : '🔴'
                  const varSign = b.varPaise > 0 ? '+' : b.varPaise < 0 ? '−' : ''
                  const varAmt  = b.varPaise !== 0
                    ? `${varSign}₹${Math.round(Math.abs(b.varPaise) / 100).toLocaleString('en-IN')}`
                    : '—'
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                          <span className="text-white/60 font-medium">{b.label}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-white/40 font-numeric">
                        ₹{Math.round((b.targetPaise || 0) / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 pr-3 text-white/70 font-numeric">
                        ₹{Math.round((b.actualPaise || 0) / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 pr-3 text-base leading-none">{trafficLight}</td>
                      <td className="py-2 font-numeric font-semibold"
                        style={{ color: b.varPaise > 0 ? '#EF4444' : b.varPaise < 0 ? '#10B981' : 'rgba(255,255,255,0.3)' }}>
                        {varAmt}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* "Your biggest opportunity" insight */}
          {(() => {
            const biggest = [...analysis.buckets]
              .filter((b) => b.varPaise > 0)
              .sort((a, b) => b.varPaise - a.varPaise)[0]
            if (!biggest) return null
            const saving = Math.round(biggest.varPaise / 100).toLocaleString('en-IN')
            return (
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <p className="text-xs text-white/60 leading-relaxed">
                  <span className="text-indigo-300 font-semibold">Your biggest opportunity:</span>{' '}
                  {biggest.label} is ₹{saving} over target — bringing it in line could boost your score significantly.
                </p>
              </div>
            )
          })()}

          {/* Top 2 rule-based suggestions */}
          {(() => {
            const suggestions = analysis.buckets
              .filter((b) => b.varPaise > 0)
              .sort((a, b) => b.varPaise - a.varPaise)
              .slice(0, 2)
              .map((b) => {
                const amt = Math.round(b.varPaise / 100).toLocaleString('en-IN')
                return `${b.label} spending is ₹${amt} over your ${b.targetPct}% target — consider reducing it`
              })
            if (!suggestions.length) return (
              <p className="text-xs text-emerald-400">🎉 Great start — your spending is close to your framework targets.</p>
            )
            return (
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-white/40 leading-relaxed flex items-start gap-1.5">
                    <span className="text-white/20 mt-0.5">→</span> {s}
                  </li>
                ))}
              </ul>
            )
          })()}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Adjust Expenses
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold transition-all glow-indigo disabled:opacity-50"
        >
          {completing ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
          ) : (
            <>Enter Finio <ArrowRight className="w-4 h-4" /></>
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
            i < step  ? 'w-6 h-1.5 bg-indigo-500'
            : i === step ? 'w-4 h-1.5 bg-indigo-400'
            : 'w-2 h-1.5 bg-white/15'
          }`}
        />
      ))}
      <span className="text-xs text-white/30 ml-1">Step {step + 1} of {total}</span>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

export default function Onboarding() {
  const { completeOnboarding } = useAppStore()
  const [step,       setStep]       = useState(0)
  const [completing, setCompleting] = useState(false)

  // Per-step state
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [income,       setIncome]       = useState([EMPTY_INCOME()])
  const [expenses,     setExpenses]     = useState({})

  // Derived framework from selected goal
  const framework = selectedGoal
    ? findFramework(selectedGoal.frameworkId) || null
    : null

  // Monthly income computed for framework target display
  const monthlyIncomePaise = useMemo(() =>
    income.reduce((sum, r) => {
      if (!r.amount || Number(r.amount) <= 0) return sum
      const paise = Math.round(Number(r.amount) * 100)
      const opt   = FREQUENCY_OPTIONS.find((f) => f.value === r.frequency)
      return sum + (opt ? Math.round((paise * opt.perYear) / 12) : paise)
    }, 0),
    [income]
  )

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  async function handleComplete() {
    setCompleting(true)
    try {
      const cryptoKey = useAppStore.getState().cryptoKey
      const month     = format(new Date(), 'yyyy-MM')
      const today     = format(new Date(), 'yyyy-MM-dd')
      const now       = new Date()

      // Persist framework + goal to app_config
      const saveConfigs = [
        configSet('onboarding_complete', 'true'),
        configSet('first_launch', Date.now().toString()),
        selectedGoal?.id && configSet('onboarding_goal', selectedGoal.id),
        framework      && configSet('budget_framework', JSON.stringify(framework)),
      ].filter(Boolean)

      await Promise.all([
        ...saveConfigs,
        // Income streams
        ...income
          .filter((r) => r.name.trim() && Number(r.amount) > 0)
          .map((r) =>
            encryptAndSave('income_streams', {
              name:      r.name.trim(),
              type:      r.type,
              amount:    Math.round(Number(r.amount) * 100),
              frequency: r.frequency,
            }, cryptoKey)
          ),
        // Expenses (amounts already in paise from DailyMonthlyToggle)
        ...EXPENSE_CATEGORIES
          .filter((cat) => (expenses[cat.id] || 0) > 0)
          .map((cat) =>
            encryptAndSave('expenses', {
              category:    cat.id,
              subcategory: cat.label,
              amount:      expenses[cat.id], // already in paise
              date:        today,
              month,
              notes:       '',
            }, cryptoKey, ['month'])
          ),
      ])

      completeOnboarding()
    } catch (err) {
      console.error('[finio] Onboarding completion failed:', err)
      setCompleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex flex-col items-center justify-start p-4 pt-8 pb-16">
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
          {step === 1 && <StepGoal selectedGoal={selectedGoal} setSelectedGoal={setSelectedGoal} onNext={next} onBack={back} />}
          {step === 2 && <StepIncome income={income} setIncome={setIncome} onNext={next} onBack={back} />}
          {step === 3 && (
            <StepExpenses
              expenses={expenses}
              setExpenses={setExpenses}
              onNext={next}
              onBack={back}
              framework={framework}
              monthlyIncomePaise={monthlyIncomePaise}
            />
          )}
          {step === 4 && (
            <StepReview
              income={income}
              expenses={expenses}
              framework={framework}
              selectedGoal={selectedGoal}
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
