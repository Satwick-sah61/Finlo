import { useState, useEffect, useMemo, useCallback } from 'react'
import { addMonths, differenceInCalendarMonths, format } from 'date-fns'
import {
  Sliders, RotateCcw, Save, Trash2,
  ChevronDown, ChevronUp, TrendingUp, Target, CreditCard,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { useLoans } from '../hooks/useLoans.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { configGet, configSet } from '../db/schema.js'
import { toMonthlyPaise, EXPENSE_CATEGORIES } from '../utils/finance.js'
import { calculateHealthScore } from '../utils/healthScore.js'
import { getGoalTypeMeta } from '../utils/goalStatus.js'
import { formatINRCompact, formatINRFromPaise } from '../utils/currency.js'
import { generateStrategies } from '../utils/repaymentStrategy.js'
import { currentMonth } from '../hooks/useFinancials.js'

const SCENARIOS_KEY  = 'whatif_scenarios'
const MAX_SCENARIOS  = 5

// ─── Slider ───────────────────────────────────────────────────────────────────

function SimSlider({ label, value, min, max, step, onChange, display, note, accent = false }) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50 truncate">{label}</span>
        <span className={`text-xs font-bold font-numeric flex-shrink-0 ${accent ? 'text-indigo-300' : 'text-white'}`}>
          {display}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{ width: `${pct}%`, background: accent ? '#6366F1' : 'rgba(255,255,255,0.25)' }}
          />
        </div>
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ height: '100%' }}
        />
      </div>
      {note && <p className="text-[10px] text-white/20">{note}</p>}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, collapsible = false }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="space-y-3">
      <button
        disabled={!collapsible}
        onClick={() => collapsible && setOpen(o => !o)}
        className={`w-full flex items-center justify-between ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">{title}</span>
        {collapsible && (open
          ? <ChevronUp   className="w-3.5 h-3.5 text-white/25" />
          : <ChevronDown className="w-3.5 h-3.5 text-white/25" />
        )}
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </div>
  )
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function Delta({ value, unit = '', invert = false }) {
  if (value === 0) return <span className="text-[10px] text-white/25 ml-1">no change</span>
  const positive = invert ? value < 0 : value > 0
  return (
    <span className={`text-[10px] font-semibold ml-1 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {typeof unit === 'string' && unit.startsWith('₹')
        ? `${value > 0 ? '+' : ''}${formatINRCompact(Math.abs(value))}`
        : `${value > 0 ? '+' : ''}${value}${unit}`}
    </span>
  )
}

// ─── Result metric card ───────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'text-white', delta, deltaUnit, invertDelta }) {
  return (
    <div className="p-4 rounded-2xl space-y-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-numeric leading-tight ${color}`}>{value}</p>
      <div className="flex items-center flex-wrap">
        {sub && <p className="text-[11px] text-white/35">{sub}</p>}
        {delta !== undefined && <Delta value={delta} unit={deltaUnit} invert={invertDelta} />}
      </div>
    </div>
  )
}

// ─── Net worth projection row ─────────────────────────────────────────────────

function NwRow({ label, adjusted, baseline }) {
  const delta = adjusted - baseline
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <div className="text-right">
        <span className="text-sm font-bold font-numeric text-white">
          {adjusted < 0 ? '-' : ''}{formatINRCompact(Math.abs(adjusted))}
        </span>
        <Delta value={delta} unit="₹" />
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/6 rounded-xl ${className}`} />
}

// ─── Scenario save modal ──────────────────────────────────────────────────────

function SaveModal({ onSave, onClose }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <h3 className="text-base font-semibold text-white">Name this scenario</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          placeholder="e.g. Cut lifestyle by 20%"
          className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff', caretColor: '#ffffff' }}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/6 text-white/50 text-sm hover:bg-white/10 transition-colors">Cancel</button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave(name.trim())}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhatIf() {
  const cryptoKey = useAppStore(s => s.cryptoKey)

  // Loan data from hook
  const {
    activeLoans,
    totalOutstandingPaise,
    totalMonthlyEMI,
    projectedDebtFreeDate,
    loading: loansLoading,
  } = useLoans()

  // Base financial data (loaded once)
  const [baseData, setBaseData]   = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Slider state
  const [incomeAdj, setIncomeAdj]         = useState(0)          // rupees delta
  const [categoryMults, setCategoryMults] = useState({})         // catId → pct
  const [goalOverrides, setGoalOverrides] = useState({})         // goalId → paise/mo
  const [extraSavings, setExtraSavings]   = useState(0)          // rupees/mo extra
  const [windfall, setWindfall]           = useState(0)          // rupees one-time
  const [loanExtra, setLoanExtra]         = useState(0)          // rupees/mo extra to loans

  // Scenarios
  const [scenarios, setScenarios]           = useState([])
  const [showSaveModal, setShowSaveModal]   = useState(false)
  const [compareIdx, setCompareIdx]         = useState(null)
  const [savingScenario, setSavingScenario] = useState(false)

  // ── Load base data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false

    Promise.all([
      decryptAndLoadAll('income_streams', cryptoKey),
      decryptAndLoadAll('expenses', cryptoKey, { month: currentMonth() }),
      decryptAndLoadAll('goals', cryptoKey),
      configGet(SCENARIOS_KEY),
    ]).then(([streams, expenses, goals, scenJson]) => {
      if (cancelled) return

      const income = streams.reduce(
        (s, st) => s + toMonthlyPaise(Number(st.amount) || 0, st.frequency), 0
      )

      const expByCategory = {}
      for (const e of expenses) {
        const cat = e.category ?? 'miscellaneous'
        expByCategory[cat] = (expByCategory[cat] ?? 0) + (Number(e.amount) || 0)
      }
      const totalExpense = Object.values(expByCategory).reduce((s, v) => s + v, 0)
      const surplus      = income - totalExpense
      const activeGoals  = goals.filter(g => g.status !== 'Draft' && g.status !== 'Completed')
      const now          = new Date()

      const goalsWithReq = activeGoals.map(g => {
        const remaining = Math.max(0, (Number(g.target_amount) || 0) - (Number(g.saved_amount) || 0))
        let months = 12
        try { months = Math.max(1, differenceInCalendarMonths(new Date(g.deadline), now)) } catch {}
        return { ...g, _remaining: remaining, _requiredPerMonth: Math.ceil(remaining / months) }
      })

      setBaseData({ income, totalExpense, expByCategory, surplus, activeGoals: goalsWithReq })

      const initMults = {}
      for (const cat of Object.keys(expByCategory)) initMults[cat] = 100
      setCategoryMults(initMults)

      const initOverrides = {}
      for (const g of goalsWithReq) initOverrides[g.id] = g._requiredPerMonth
      setGoalOverrides(initOverrides)

      try { setScenarios(scenJson ? JSON.parse(scenJson) : []) } catch { setScenarios([]) }
    }).catch(err => {
      if (cancelled) return
      console.error('[WhatIf] load:', err)
      setLoadError(err.message)
    })

    return () => { cancelled = true }
  }, [cryptoKey])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (!baseData) return
    setIncomeAdj(0)
    setExtraSavings(0)
    setWindfall(0)
    setLoanExtra(0)
    const initMults = {}
    for (const cat of Object.keys(baseData.expByCategory)) initMults[cat] = 100
    setCategoryMults(initMults)
    const initOverrides = {}
    for (const g of baseData.activeGoals) initOverrides[g.id] = g._requiredPerMonth
    setGoalOverrides(initOverrides)
    setCompareIdx(null)
  }, [baseData])

  // ── Loan paydown helpers ───────────────────────────────────────────────────
  // Estimate total outstanding at month M using repayment strategy snapshots
  const loanStrategies = useMemo(() => {
    if (!activeLoans?.length || loanExtra === 0) return null
    return generateStrategies(activeLoans, loanExtra * 100)
  }, [activeLoans, loanExtra])

  // Monthly interest on current outstanding (for linear paydown estimate)
  const monthlyLoanInterest = useMemo(() => {
    if (!activeLoans?.length) return 0
    return activeLoans.reduce((s, l) => {
      const r = (Number(l.annual_rate) || 0) / 12 / 100
      return s + Math.round((l._outstandingPaise ?? 0) * r)
    }, 0)
  }, [activeLoans])

  const monthlyPrincipalPaydown = Math.max(0, totalMonthlyEMI - monthlyLoanInterest)

  function outstandingAtMonth(M) {
    // Linear approximation: each month outstanding reduces by base principal + extra
    const monthlyPaydown = monthlyPrincipalPaydown + loanExtra * 100
    return Math.max(0, totalOutstandingPaise - M * monthlyPaydown)
  }

  // Debt-free month with extra payments
  const debtFreeMonthWithExtra = useMemo(() => {
    if (loanStrategies) return loanStrategies.avalanche?.debtFreeMonth ?? null
    if (!activeLoans?.length) return null
    return generateStrategies(activeLoans, 0)?.avalanche?.debtFreeMonth ?? null
  }, [loanStrategies, activeLoans])

  const debtFreeMonthBaseline = useMemo(() => {
    if (!activeLoans?.length) return null
    return generateStrategies(activeLoans, 0)?.avalanche?.debtFreeMonth ?? null
  }, [activeLoans])

  // ── Main simulation ────────────────────────────────────────────────────────
  const sim = useMemo(() => {
    if (!baseData) return null

    const adjIncomePaise = baseData.income + incomeAdj * 100

    // Include loan EMI in expense total (they're tracked separately, inject here)
    let adjTotalExpense = totalMonthlyEMI // loan EMIs always present
    for (const [cat, base] of Object.entries(baseData.expByCategory)) {
      // Skip 'loans' category if manually entered (avoid double-count)
      if (cat === 'loans') {
        adjTotalExpense += Math.round(base * ((categoryMults[cat] ?? 100) / 100))
      } else {
        adjTotalExpense += Math.round(base * ((categoryMults[cat] ?? 100) / 100))
      }
    }

    const loanExtraPaise    = loanExtra * 100
    adjTotalExpense += loanExtraPaise // extra loan payment reduces available surplus

    const totalGoalCommit   = Object.values(goalOverrides).reduce((s, v) => s + v, 0)
    const extraSavingsPaise = extraSavings * 100
    const windfallPaise     = windfall * 100

    const adjSurplus   = adjIncomePaise - adjTotalExpense
    const savingsPool  = Math.max(0, adjSurplus) + extraSavingsPaise
    const freePool     = savingsPool - totalGoalCommit

    const adjSavingsRate = adjIncomePaise > 0
      ? Math.round((adjSurplus / adjIncomePaise) * 100)
      : 0

    const dti = adjIncomePaise > 0 ? (totalMonthlyEMI + loanExtraPaise) / adjIncomePaise : null

    const { score: adjHealth } = calculateHealthScore({
      savingsRate:               adjSavingsRate,
      totalMonthlyIncomePaise:   adjIncomePaise,
      totalMonthlyExpensesPaise: adjTotalExpense,
      debtToIncomeRatio:         dti,
    })

    const baseSavingsRate = baseData.income > 0
      ? Math.round(((baseData.surplus - totalMonthlyEMI) / baseData.income) * 100)
      : 0
    const baseDti = baseData.income > 0 ? totalMonthlyEMI / baseData.income : null
    const { score: baseHealth } = calculateHealthScore({
      savingsRate:               baseSavingsRate,
      totalMonthlyIncomePaise:   baseData.income,
      totalMonthlyExpensesPaise: baseData.totalExpense + totalMonthlyEMI,
      debtToIncomeRatio:         baseDti,
    })

    // Windfall distributed proportionally by goal remaining balance
    const totalRemaining = baseData.activeGoals.reduce((s, g) => s + g._remaining, 0)

    const goalResults = baseData.activeGoals.map(g => {
      const windfallShare      = totalRemaining > 0 ? (g._remaining / totalRemaining) * windfallPaise : 0
      const remainingAfterWind = Math.max(0, g._remaining - windfallShare)
      const monthlyForGoal     = goalOverrides[g.id] ?? g._requiredPerMonth
      const newMonths          = monthlyForGoal > 0 ? Math.ceil(remainingAfterWind / monthlyForGoal) : Infinity
      const baseMonths         = g._requiredPerMonth > 0 ? Math.ceil(g._remaining / g._requiredPerMonth) : Infinity
      const monthsSaved        = isFinite(baseMonths) && isFinite(newMonths) ? baseMonths - newMonths : 0

      return {
        ...g,
        monthlyForGoal,
        newMonths,
        monthsSaved,
        newCompletion: isFinite(newMonths) ? addMonths(new Date(), newMonths) : null,
      }
    })

    // Net worth projection: savings accumulated + loan principal paid down - remaining liability
    const monthlyGrowth     = savingsPool
    const baseMonthlyGrowth = Math.max(0, baseData.surplus - totalMonthlyEMI)

    function nwAtYear(years) {
      const months          = years * 12
      const savingsAccum    = months * monthlyGrowth + windfallPaise
      const liabilityNow    = totalOutstandingPaise
      const liabilityThen   = outstandingAtMonth(months)
      const liabilityPaidDown = liabilityNow - liabilityThen
      return savingsAccum + liabilityPaidDown
    }
    function baseNwAtYear(years) {
      const months        = years * 12
      const savingsAccum  = months * baseMonthlyGrowth
      // Baseline: standard paydown with no extra
      const basePaydown   = Math.min(totalOutstandingPaise, months * monthlyPrincipalPaydown)
      return savingsAccum + basePaydown
    }

    const nw     = { yr1: nwAtYear(1), yr3: nwAtYear(3), yr5: nwAtYear(5) }
    const baseNw = { yr1: baseNwAtYear(1), yr3: baseNwAtYear(3), yr5: baseNwAtYear(5) }

    return {
      adjIncomePaise, adjTotalExpense, adjSurplus,
      savingsPool, freePool,
      adjSavingsRate, adjHealth, baseHealth,
      goalResults, nw, baseNw,
      totalGoalCommit, windfallPaise,
      loanExtraPaise, dti,
    }
  }, [
    baseData, incomeAdj, categoryMults, goalOverrides,
    extraSavings, windfall, loanExtra,
    totalMonthlyEMI, totalOutstandingPaise, monthlyPrincipalPaydown,
  ])

  // ── Scenario persistence ───────────────────────────────────────────────────
  async function saveScenario(name) {
    if (!sim || savingScenario) return
    setSavingScenario(true)
    const snap = {
      name, saved_at: new Date().toISOString(),
      incomeAdj, categoryMults, goalOverrides,
      extraSavings, windfall, loanExtra,
      adjSurplus: sim.adjSurplus,
      adjHealth:  sim.adjHealth,
    }
    const next = [snap, ...scenarios].slice(0, MAX_SCENARIOS)
    try {
      await configSet(SCENARIOS_KEY, JSON.stringify(next))
      setScenarios(next)
    } catch (err) {
      console.error('[WhatIf] save scenario:', err)
    }
    setSavingScenario(false)
    setShowSaveModal(false)
  }

  async function deleteScenario(idx) {
    const next = scenarios.filter((_, i) => i !== idx)
    try { await configSet(SCENARIOS_KEY, JSON.stringify(next)) } catch {}
    setScenarios(next)
    if (compareIdx === idx) setCompareIdx(null)
  }

  function loadScenario(s) {
    setIncomeAdj(s.incomeAdj ?? 0)
    setCategoryMults(s.categoryMults ?? {})
    setGoalOverrides(s.goalOverrides ?? {})
    setExtraSavings(s.extraSavings ?? 0)
    setWindfall(s.windfall ?? 0)
    setLoanExtra(s.loanExtra ?? 0)
  }

  // ── Active expense categories ──────────────────────────────────────────────
  const activeCats = useMemo(() => {
    if (!baseData) return []
    return EXPENSE_CATEGORIES.filter(c => (baseData.expByCategory[c.id] ?? 0) > 0)
  }, [baseData])

  // Max extra loan payment slider = 1× monthly EMI in rupees
  const maxLoanExtra = Math.max(5000, Math.round(totalMonthlyEMI / 100 / 500) * 500)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-sm text-red-400">Failed to load financial data.</p>
        <p className="text-xs text-white/30">{loadError}</p>
      </div>
    )
  }

  const isLoading = !baseData

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-xl font-semibold text-white">What-If Simulator</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Adjust sliders and see how your finances change — instantly
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/8 hover:text-white/60 transition-colors border border-white/8 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={isLoading || savingScenario}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> Save Scenario
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-48" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">

          {/* ── LEFT: Controls ─────────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-5 space-y-6"
            style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Income */}
            <Section title="Income">
              <SimSlider
                label="Monthly income adjustment"
                value={incomeAdj}
                min={-20000}
                max={20000}
                step={500}
                onChange={setIncomeAdj}
                display={incomeAdj === 0 ? 'No change' : `${incomeAdj > 0 ? '+' : ''}₹${Math.abs(incomeAdj).toLocaleString('en-IN')}/mo`}
                note={`Base: ${formatINRFromPaise(baseData.income)}/mo`}
                accent={incomeAdj !== 0}
              />
            </Section>

            <div className="h-px bg-white/6" />

            {/* Expenses */}
            {activeCats.length > 0 && (
              <Section title="Monthly Expenses" collapsible>
                {activeCats.map(cat => {
                  const base = baseData.expByCategory[cat.id] ?? 0
                  const mult = categoryMults[cat.id] ?? 100
                  const adj  = Math.round(base * mult / 100)
                  return (
                    <SimSlider
                      key={cat.id}
                      label={`${cat.emoji} ${cat.label}`}
                      value={mult}
                      min={0}
                      max={200}
                      step={5}
                      onChange={v => setCategoryMults(m => ({ ...m, [cat.id]: v }))}
                      display={mult === 100 ? formatINRCompact(base) : `${formatINRCompact(adj)} (${mult}%)`}
                      note={`Currently ${formatINRCompact(base)}/mo`}
                      accent={mult !== 100}
                    />
                  )
                })}
              </Section>
            )}

            {activeCats.length > 0 && <div className="h-px bg-white/6" />}

            {/* Loans */}
            {activeLoans.length > 0 && (
              <>
                <Section title="Loan Paydown" collapsible>
                  <div
                    className="flex items-center justify-between p-3 rounded-xl text-xs"
                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-white/50">Current debt</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold font-numeric text-red-400">
                        {formatINRCompact(totalOutstandingPaise)}
                      </span>
                      <span className="text-white/30 ml-1.5 text-[10px]">
                        EMI: {formatINRCompact(totalMonthlyEMI)}/mo
                      </span>
                    </div>
                  </div>
                  <SimSlider
                    label="Extra monthly payment toward loans"
                    value={loanExtra}
                    min={0}
                    max={maxLoanExtra}
                    step={500}
                    onChange={setLoanExtra}
                    display={loanExtra === 0 ? 'No extra' : `+₹${loanExtra.toLocaleString('en-IN')}/mo`}
                    note="Applied using Avalanche strategy (highest rate first)"
                    accent={loanExtra > 0}
                  />
                  {loanExtra > 0 && debtFreeMonthBaseline && debtFreeMonthWithExtra && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-white/30">Debt-free:</span>
                      <span className="text-emerald-400 font-semibold">
                        {format(addMonths(new Date(), debtFreeMonthWithExtra), 'MMM yyyy')}
                      </span>
                      {debtFreeMonthBaseline > debtFreeMonthWithExtra && (
                        <span className="text-emerald-400">
                          ({debtFreeMonthBaseline - debtFreeMonthWithExtra} mo sooner)
                        </span>
                      )}
                    </div>
                  )}
                </Section>
                <div className="h-px bg-white/6" />
              </>
            )}

            {/* Goals */}
            {baseData.activeGoals.length > 0 && (
              <Section title="Goal Commitments" collapsible>
                {baseData.activeGoals.map(g => {
                  const meta     = getGoalTypeMeta(g.type)
                  const override = goalOverrides[g.id] ?? g._requiredPerMonth
                  const maxVal   = Math.max(g._requiredPerMonth * 3, 100000)
                  return (
                    <SimSlider
                      key={g.id}
                      label={`${meta.icon} ${g.name}`}
                      value={override}
                      min={0}
                      max={maxVal}
                      step={500}
                      onChange={v => setGoalOverrides(o => ({ ...o, [g.id]: v }))}
                      display={formatINRCompact(override) + '/mo'}
                      note={`Required: ${formatINRCompact(g._requiredPerMonth)}/mo`}
                      accent={override !== g._requiredPerMonth}
                    />
                  )
                })}
              </Section>
            )}

            {baseData.activeGoals.length > 0 && <div className="h-px bg-white/6" />}

            {/* Boosts */}
            <Section title="Boosts">
              <SimSlider
                label="Extra monthly savings"
                value={extraSavings}
                min={0}
                max={50000}
                step={500}
                onChange={setExtraSavings}
                display={extraSavings === 0 ? 'None' : `+${formatINRCompact(extraSavings * 100)}/mo`}
                note="Additional amount you commit to saving each month"
                accent={extraSavings > 0}
              />
              <SimSlider
                label="One-time windfall"
                value={windfall}
                min={0}
                max={1000000}
                step={5000}
                onChange={setWindfall}
                display={windfall === 0 ? 'None' : formatINRCompact(windfall * 100)}
                note="Bonus, gift, or lump sum — applied to goals immediately"
                accent={windfall > 0}
              />
            </Section>
          </div>

          {/* ── RIGHT: Results ──────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Surplus & savings rate */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Adjusted Surplus"
                value={formatINRFromPaise(Math.abs(sim.adjSurplus))}
                color={sim.adjSurplus >= 0 ? 'text-emerald-400' : 'text-red-400'}
                delta={sim.adjSurplus - (baseData.surplus - totalMonthlyEMI)}
                deltaUnit="₹"
                sub={sim.adjSurplus < 0 ? 'Deficit' : `${formatINRCompact(Math.max(0, sim.freePool))} free`}
              />
              <MetricCard
                label="Savings Rate"
                value={`${Math.max(0, sim.adjSavingsRate)}%`}
                color={sim.adjSavingsRate >= 20 ? 'text-emerald-400' : sim.adjSavingsRate >= 10 ? 'text-amber-400' : 'text-red-400'}
                delta={sim.adjSavingsRate - (baseData.income > 0 ? Math.round(((baseData.surplus - totalMonthlyEMI) / baseData.income) * 100) : 0)}
                deltaUnit=" pts"
              />
            </div>

            {/* Loan metrics (only if loans exist) */}
            {activeLoans.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Debt-to-Income"
                  value={sim.dti !== null ? `${Math.round(sim.dti * 100)}%` : '—'}
                  color={
                    sim.dti === null ? 'text-white/30'
                    : sim.dti < 0.3  ? 'text-emerald-400'
                    : sim.dti < 0.5  ? 'text-amber-400'
                    : 'text-red-400'
                  }
                  sub={sim.dti !== null
                    ? sim.dti < 0.3 ? 'Healthy' : sim.dti < 0.5 ? 'Moderate' : 'High'
                    : 'No income data'}
                />
                <MetricCard
                  label="Debt-Free Date"
                  value={debtFreeMonthWithExtra
                    ? format(addMonths(new Date(), debtFreeMonthWithExtra), 'MMM yyyy')
                    : '—'}
                  color="text-indigo-300"
                  sub={loanExtra > 0 && debtFreeMonthBaseline && debtFreeMonthWithExtra && debtFreeMonthBaseline > debtFreeMonthWithExtra
                    ? `${debtFreeMonthBaseline - debtFreeMonthWithExtra} mo sooner`
                    : 'Based on current EMIs'}
                />
              </div>
            )}

            {/* Health score */}
            <div
              className="rounded-2xl p-4 flex items-center justify-between gap-4"
              style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div>
                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Health Score</p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-3xl font-bold font-numeric ${sim.adjHealth >= 70 ? 'text-emerald-400' : sim.adjHealth >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {sim.adjHealth}
                  </p>
                  <p className="text-sm text-white/30">/100</p>
                  <Delta value={sim.adjHealth - sim.baseHealth} unit=" pts" />
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-2xl">
                    {sim.adjHealth >= 80 ? '🏆' : sim.adjHealth >= 60 ? '👍' : sim.adjHealth >= 40 ? '⚠️' : '🚨'}
                  </span>
                </div>
              </div>
            </div>

            {/* Goal completion */}
            {sim.goalResults.length > 0 && (
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <p className="text-sm font-semibold text-white">Goal Completion</p>
                </div>
                {sim.goalResults.map(g => {
                  const meta = getGoalTypeMeta(g.type)
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base flex-shrink-0">{meta.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{g.name}</p>
                          <p className="text-[10px] text-white/35">
                            {formatINRCompact(g.monthlyForGoal)}/mo committed
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-white">
                          {g.newCompletion ? format(g.newCompletion, 'MMM yyyy') : '∞'}
                        </p>
                        {g.monthsSaved !== 0 && (
                          <p className={`text-[10px] font-semibold ${g.monthsSaved > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {g.monthsSaved > 0 ? `${g.monthsSaved}mo faster` : `${Math.abs(g.monthsSaved)}mo slower`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Net worth projection */}
            <div
              className="rounded-2xl p-4"
              style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <p className="text-sm font-semibold text-white">Net Worth Projection</p>
              </div>
              <NwRow label="In 1 year"  adjusted={sim.nw.yr1}  baseline={sim.baseNw.yr1} />
              <NwRow label="In 3 years" adjusted={sim.nw.yr3}  baseline={sim.baseNw.yr3} />
              <NwRow label="In 5 years" adjusted={sim.nw.yr5}  baseline={sim.baseNw.yr5} />
              <p className="text-[10px] text-white/20 mt-3">
                Includes savings accumulation + loan principal paid down.
                Does not include investment returns.
              </p>
            </div>

            {/* Saved scenarios */}
            {scenarios.length > 0 && (
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Saved Scenarios</p>
                {scenarios.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-colors ${compareIdx === i ? 'bg-indigo-500/12 border border-indigo-500/20' : 'bg-white/4 border border-transparent'}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-white/30">
                        Surplus {formatINRCompact(s.adjSurplus)} · Health {s.adjHealth}/100
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => loadScenario(s)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 text-[11px] font-semibold hover:bg-indigo-500/25 transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteScenario(i)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {scenarios.length < MAX_SCENARIOS && (
                  <p className="text-[10px] text-white/20 text-center">
                    {MAX_SCENARIOS - scenarios.length} slot{MAX_SCENARIOS - scenarios.length !== 1 ? 's' : ''} remaining
                  </p>
                )}
              </div>
            )}

            {/* Empty goals state */}
            {baseData.activeGoals.length === 0 && activeLoans.length === 0 && (
              <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Target className="w-8 h-8 text-white/15 mx-auto" />
                <p className="text-sm text-white/30">No active goals or loans to simulate</p>
                <p className="text-xs text-white/20">Add goals and loans to see projections here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showSaveModal && (
        <SaveModal onSave={saveScenario} onClose={() => setShowSaveModal(false)} />
      )}
    </div>
  )
}
