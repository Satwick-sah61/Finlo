import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, parseISO, differenceInCalendarMonths } from 'date-fns'
import {
  ShoppingCart, Plus, Pencil, Trash2, X, AlertCircle,
  ChevronLeft, ChevronRight, ChevronDown, Search, SlidersHorizontal,
  RefreshCw, TriangleAlert, Wallet, Target, TrendingUp, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { encryptAndSave, encryptAndUpdate, deleteRecord, decryptAndLoadAll } from '../db/helpers.js'
import { configGet, configSet } from '../db/schema.js'
import { EXPENSE_CATEGORIES, getCategoryMeta, toMonthlyPaise } from '../utils/finance.js'
import { formatINRFromPaise, formatINRCompact } from '../utils/currency.js'
import { getGoalTypeMeta } from '../utils/goalStatus.js'

// ─── Month navigation ─────────────────────────────────────────────────────────

function MonthNav({ month, onChange }) {
  const current = format(new Date(), 'yyyy-MM')
  const isCurrentMonth = month >= current
  const prev = () => onChange(format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))
  const next = () => onChange(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prev}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold text-white min-w-[120px] text-center">
        {format(parseISO(`${month}-01`), 'MMMM yyyy')}
      </span>
      <button
        onClick={next}
        disabled={isCurrentMonth}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Search / Filter Bar ──────────────────────────────────────────────────────

function SearchBar({ query, setQuery, categoryFilter, setCategoryFilter, open }) {
  if (!open) return null

  return (
    <div className="glass rounded-xl px-4 py-3 space-y-3">
      {/* Keyword */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or notes…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/40 transition-all"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter('')}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            categoryFilter === ''
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'text-white/40 border border-white/10 hover:border-white/20'
          }`}
        >
          All
        </button>
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id === categoryFilter ? '' : c.id)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
              categoryFilter === c.id
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-white/40 border border-white/10 hover:border-white/20'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Overspend Alert Banner ───────────────────────────────────────────────────

function OverspendBanner({ expenses, budgets }) {
  const overspentCats = EXPENSE_CATEGORIES.filter((cat) => {
    const budget = Number(budgets[cat.id]) || 0
    if (budget === 0) return false
    const spent = expenses
      .filter((e) => e.category === cat.id)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    return spent > budget
  })

  if (overspentCats.length === 0) return null

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
      <TriangleAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <span className="text-red-400 font-medium">Over budget: </span>
        <span className="text-red-400/80">
          {overspentCats.map((c) => `${c.emoji} ${c.label}`).join(', ')}
        </span>
      </div>
    </div>
  )
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  category: 'housing',
  subcategory: '',
  amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
}

function ExpenseFormModal({ initial, month, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(
    initial
      ? {
          category: initial.category ?? 'housing',
          subcategory: initial.subcategory ?? '',
          amount: initial.amount ? String(initial.amount / 100) : '',
          date: initial.date ?? format(new Date(), 'yyyy-MM-dd'),
          notes: initial.notes ?? '',
        }
      : { ...EMPTY_FORM, date: `${month}-${format(new Date(), 'dd')}` }
  )
  const isEdit = !!initial

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  const catMeta = getCategoryMeta(form.category)
  const canSave = Number(form.amount) > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Expense' : 'Add Expense'}
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

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Category</label>
          <div className="relative">
            <select
              value={form.category}
              onChange={(e) => { set('category', e.target.value); set('subcategory', '') }}
              className="w-full appearance-none bg-[#1C1B29] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer pr-10"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* Subcategory */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Subcategory</label>
          <input
            list={`sub-${form.category}`}
            value={form.subcategory}
            onChange={(e) => set('subcategory', e.target.value)}
            placeholder={catMeta.subcategories[0]}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
          <datalist id={`sub-${form.category}`}>
            {catMeta.subcategories.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Amount + Date */}
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
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-3 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all font-numeric"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className="w-full bg-[#1C1B29] border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Notes (optional)</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any details…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>

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
            className="flex-1 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/25 text-indigo-300 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
              : isEdit ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Budget Edit (inline) ─────────────────────────────────────────────────────

function BudgetCell({ categoryId, budget, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    setDraft(budget > 0 ? String(budget / 100) : '')
    setEditing(true)
  }

  function commit() {
    const paise = Math.round(Number(draft) * 100)
    onSave(categoryId, paise >= 0 ? paise : 0)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-white/30 text-xs">₹</span>
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          autoFocus
          placeholder="budget"
          className="w-20 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white font-numeric focus:outline-none focus:border-indigo-500/50"
        />
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="text-xs text-white/25 hover:text-white/50 transition-colors font-numeric"
      title="Set monthly budget"
    >
      {budget > 0 ? `/ ${formatINRFromPaise(budget)}` : '+ budget'}
    </button>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteModal({ expense, onConfirm, onCancel, deleting }) {
  const cat = getCategoryMeta(expense.category)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Delete expense?</h3>
            <p className="text-xs text-white/40 mt-1">
              {cat.emoji} {expense.subcategory || cat.label} —{' '}
              <span className="text-white/60 font-numeric">
                {formatINRFromPaise(Number(expense.amount) || 0)}
              </span>
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
            {deleting
              ? <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
              : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expense Row ──────────────────────────────────────────────────────────────

function ExpenseRow({ expense, isRecurring, onEdit, onDelete }) {
  const cat = getCategoryMeta(expense.category)
  const amountPaise = Number(expense.amount) || 0
  let dateLabel = ''
  try { dateLabel = format(parseISO(expense.date), 'd MMM') } catch { dateLabel = expense.date ?? '' }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] rounded-lg group transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-white/80 truncate">
            {expense.subcategory || cat.label}
          </p>
          {isRecurring && (
            <span
              title="Same amount appeared last month — possibly recurring"
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 flex-shrink-0"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Recurring
            </span>
          )}
        </div>
        {expense.notes && (
          <p className="text-xs text-white/30 truncate">{expense.notes}</p>
        )}
      </div>
      <p className="text-xs text-white/30 flex-shrink-0">{dateLabel}</p>
      <p className="text-sm font-numeric font-medium text-white/80 flex-shrink-0">
        {formatINRFromPaise(amountPaise)}
      </p>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onEdit(expense)}
          className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-indigo-400 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(expense)}
          className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Goal Allocations Panel (shown inside Savings section) ───────────────────

function GoalAllocationPanel({ goals, surplusPaise }) {
  const now = new Date()

  const activeGoals = goals.filter((g) => {
    const saved = Number(g.saved_amount) || 0
    const target = Number(g.target_amount) || 0
    return saved < target && g.status !== 'Completed' && target > 0
  })

  if (activeGoals.length === 0) return null

  const goalsWithAlloc = activeGoals.map((g) => {
    const saved = Number(g.saved_amount) || 0
    const target = Number(g.target_amount) || 0
    const remaining = Math.max(0, target - saved)
    let months = 12
    try { months = Math.max(1, differenceInCalendarMonths(new Date(g.deadline), now)) } catch {}
    const requiredPerMonth = Math.ceil(remaining / months)
    const typeMeta = getGoalTypeMeta(g.type)
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
    return { ...g, requiredPerMonth, monthsRemaining: months, remaining, typeMeta, pct }
  })

  const totalAllocation = goalsWithAlloc.reduce((s, g) => s + g.requiredPerMonth, 0)
  const shortfall = totalAllocation - surplusPaise
  const canAfford = shortfall <= 0
  const effectiveFree = surplusPaise - totalAllocation

  // Rule-based suggestions
  const suggestions = []
  if (!canAfford) {
    suggestions.push({
      icon: '✂️',
      text: `Reduce monthly expenses by ${formatINRCompact(shortfall)} to cover all goal commitments`,
    })
    const sorted = [...goalsWithAlloc].sort((a, b) => b.requiredPerMonth - a.requiredPerMonth)
    const biggest = sorted[0]
    if (biggest && surplusPaise > 0) {
      const newMonthlyForBiggest = biggest.requiredPerMonth - shortfall
      if (newMonthlyForBiggest > 0) {
        const newMonths = Math.ceil(biggest.remaining / newMonthlyForBiggest)
        const extra = newMonths - biggest.monthsRemaining
        if (extra > 0 && extra < 60) {
          suggestions.push({
            icon: '📅',
            text: `Extend "${biggest.name}" deadline by ${extra} month${extra !== 1 ? 's' : ''} — reduces monthly load by ${formatINRCompact(shortfall)}`,
          })
        }
      }
    }
    const PRIORITY_RANK = { Low: 0, Medium: 1, High: 2 }
    const lowest = [...goalsWithAlloc].sort((a, b) =>
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    )[0]
    if (lowest) {
      suggestions.push({
        icon: '⏸️',
        text: `Pause "${lowest.name}" (${lowest.priority} priority) to free ${formatINRCompact(lowest.requiredPerMonth)}/mo`,
      })
    }
    suggestions.push({
      icon: '📈',
      text: `Add a new income stream — even ${formatINRCompact(shortfall)}/mo extra covers the gap`,
    })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-500/10">
        <Target className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-sm font-semibold text-indigo-300">Goal Allocations</span>
        <span className="text-[10px] text-indigo-400/50 bg-indigo-500/10 px-1.5 py-0.5 rounded-full ml-1">auto</span>
        <span className="ml-auto text-xs font-numeric text-indigo-300 font-semibold">
          {formatINRCompact(totalAllocation)}<span className="text-indigo-400/40 font-normal">/mo</span>
        </span>
      </div>

      {/* Goal rows */}
      <div className="divide-y divide-white/4">
        {goalsWithAlloc.map((g) => (
          <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-base flex-shrink-0">{g.typeMeta.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate">{g.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden max-w-[80px]">
                  <div className="h-full rounded-full bg-indigo-500/60" style={{ width: `${g.pct}%` }} />
                </div>
                <span className="text-[10px] text-white/30 font-numeric">{g.pct}%</span>
                <span className="text-[10px] text-white/25">·</span>
                <span className="text-[10px] text-white/30">{g.monthsRemaining}mo left</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold font-numeric text-white/70">{formatINRCompact(g.requiredPerMonth)}</p>
              <p className="text-[10px] text-white/30">per month</p>
            </div>
          </div>
        ))}
      </div>

      {/* Affordability row */}
      <div className={`px-4 py-3 border-t ${canAfford ? 'border-emerald-500/15 bg-emerald-500/6' : 'border-red-500/15 bg-red-500/6'}`}>
        <div className="flex items-center gap-2">
          {canAfford
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            : <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          }
          <p className={`text-xs font-semibold ${canAfford ? 'text-emerald-400' : 'text-red-400'}`}>
            {canAfford
              ? `All goals covered · ${formatINRCompact(effectiveFree)} truly free after goals`
              : `${formatINRCompact(shortfall)}/mo over your current surplus`
            }
          </p>
        </div>

        {/* Suggestions */}
        {!canAfford && suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Ways to close the gap
            </p>
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-white/50 leading-relaxed">
                <span className="flex-shrink-0">{s.icon}</span>
                {s.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Category Group ───────────────────────────────────────────────────────────

function CategoryGroup({ cat, expenses, totalIncomePaise, budget, onBudgetSave, recurringIds, onEdit, onDelete }) {
  const catTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const pct = totalIncomePaise > 0 ? Math.min(100, (catTotal / totalIncomePaise) * 100) : 0

  // Budget status
  const hasBudget = budget > 0
  const budgetPct = hasBudget ? Math.min(100, (catTotal / budget) * 100) : 0
  const overBudget = hasBudget && catTotal > budget
  const nearBudget = hasBudget && !overBudget && budgetPct >= 80

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <span className="text-base">{cat.emoji}</span>
        <span className="text-sm font-semibold text-white flex-1">{cat.label}</span>

        {/* Budget vs actual */}
        {hasBudget && (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${budgetPct}%`,
                  backgroundColor: overBudget ? '#EF4444' : nearBudget ? '#F59E0B' : '#22C55E',
                }}
              />
            </div>
            <span
              className={`text-xs font-numeric ${
                overBudget ? 'text-red-400' : nearBudget ? 'text-amber-400' : 'text-white/40'
              }`}
            >
              {Math.round(budgetPct)}%
            </span>
          </div>
        )}

        {/* Income percentage mini bar (only when no budget set) */}
        {!hasBudget && pct > 0 && (
          <div className="w-16 h-1 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: cat.barColor }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <BudgetCell categoryId={cat.id} budget={budget} onSave={onBudgetSave} />
          <span className="text-sm font-numeric font-semibold text-white/80">
            {formatINRFromPaise(catTotal)}
          </span>
        </div>
      </div>

      {/* Budget progress detail row */}
      {hasBudget && (
        <div
          className={`px-4 py-1.5 text-xs flex items-center justify-between border-b border-white/5 ${
            overBudget ? 'bg-red-500/5 text-red-400/80' : nearBudget ? 'bg-amber-500/5 text-amber-400/70' : 'text-white/30'
          }`}
        >
          <span>
            {overBudget
              ? `Over budget by ${formatINRFromPaise(catTotal - budget)}`
              : `${formatINRFromPaise(budget - catTotal)} remaining`}
          </span>
          <span className="font-numeric">Budget: {formatINRFromPaise(budget)}</span>
        </div>
      )}

      {/* Rows */}
      <div className="py-1">
        {expenses.map((exp) => (
          <ExpenseRow
            key={exp.id}
            expense={exp}
            isRecurring={recurringIds.has(exp.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Sticky Running Total Footer ──────────────────────────────────────────────

function RunningTotalFooter({ currentTotal, prevTotal, month }) {
  if (currentTotal === 0) return null

  const delta = currentTotal - prevTotal
  const hasPrev = prevTotal > 0

  return (
    <div className="sticky bottom-0 mt-4 -mx-6 px-6 py-3 bg-[#0F0E17]/95 backdrop-blur border-t border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Wallet className="w-3.5 h-3.5" />
        <span>{format(parseISO(`${month}-01`), 'MMMM')} spend</span>
      </div>
      <div className="flex items-center gap-3">
        {hasPrev && (
          <span className={`text-xs font-numeric ${delta > 0 ? 'text-red-400/70' : 'text-green-400/70'}`}>
            {delta > 0 ? '+' : ''}{formatINRFromPaise(delta)} vs last month
          </span>
        )}
        <span className="text-sm font-bold font-numeric text-white">
          {formatINRFromPaise(currentTotal)}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Expenses() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [expenses, setExpenses] = useState([])
  const [prevMonthExpenses, setPrevMonthExpenses] = useState([])
  const [totalIncomePaise, setTotalIncomePaise] = useState(0)
  const [budgets, setBudgets] = useState({}) // { [categoryId]: paise }
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [goals, setGoals] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')
  // Search / filter
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const prevMonth = format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM')

  const load = useCallback(async () => {
    if (!cryptoKey) return
    setLoading(true)
    try {
      const [exps, prevExps, streams, budgetsJson, goalsData] = await Promise.all([
        decryptAndLoadAll('expenses', cryptoKey, { month }),
        decryptAndLoadAll('expenses', cryptoKey, { month: prevMonth }),
        decryptAndLoadAll('income_streams', cryptoKey),
        configGet('expense_budgets'),
        decryptAndLoadAll('goals', cryptoKey),
      ])
      setExpenses(exps)
      setPrevMonthExpenses(prevExps)
      setGoals(goalsData)
      const incTotal = streams.reduce(
        (s, r) => s + toMonthlyPaise(Number(r.amount) || 0, r.frequency),
        0
      )
      setTotalIncomePaise(incTotal)
      try { setBudgets(budgetsJson ? JSON.parse(budgetsJson) : {}) } catch { setBudgets({}) }
    } catch (err) {
      console.error('[finio/Expenses] Load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey, month, prevMonth])

  useEffect(() => { load() }, [load])

  // ── Budget save ───────────────────────────────────────────────────────────

  async function handleBudgetSave(categoryId, paise) {
    const next = { ...budgets, [categoryId]: paise }
    setBudgets(next)
    await configSet('expense_budgets', JSON.stringify(next))
  }

  // ── Recurring detection ───────────────────────────────────────────────────
  // An expense is flagged recurring if the same category + exact paise amount
  // appears at least once in the previous month.

  const recurringIds = useMemo(() => {
    const prevSignatures = new Set(
      prevMonthExpenses.map((e) => `${e.category}:${e.amount}`)
    )
    const ids = new Set()
    for (const exp of expenses) {
      const sig = `${exp.category}:${exp.amount}`
      if (prevSignatures.has(sig)) ids.add(exp.id)
    }
    return ids
  }, [expenses, prevMonthExpenses])

  // ── Add ──────────────────────────────────────────────────────────────────

  async function handleAdd(form) {
    setSaving(true)
    setFormError('')

    const expMonth = form.date.slice(0, 7)
    const record = {
      category: form.category,
      subcategory: form.subcategory.trim() || getCategoryMeta(form.category).label,
      amount: Math.round(Number(form.amount) * 100),
      date: form.date,
      month: expMonth,
      notes: form.notes.trim(),
    }

    const tempId = `tmp-${Date.now()}`
    const tempRecord = { id: tempId, created_at: new Date(), ...record }
    setExpenses((prev) => [tempRecord, ...prev])
    setShowForm(false)

    try {
      const newId = await encryptAndSave('expenses', record, cryptoKey, ['month'])
      setExpenses((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: newId } : e)))
    } catch (err) {
      console.error('[finio/Expenses] Save failed:', err)
      setExpenses((prev) => prev.filter((e) => e.id !== tempId))
      setShowForm(true)
      setFormError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function handleEdit(form) {
    if (!editTarget) return
    setSaving(true)
    setFormError('')

    const expMonth = form.date.slice(0, 7)
    const updates = {
      category: form.category,
      subcategory: form.subcategory.trim() || getCategoryMeta(form.category).label,
      amount: Math.round(Number(form.amount) * 100),
      date: form.date,
      month: expMonth,
      notes: form.notes.trim(),
    }

    const prev = expenses.find((e) => e.id === editTarget.id)
    setExpenses((list) => list.map((e) => (e.id === editTarget.id ? { ...e, ...updates } : e)))
    setEditTarget(null)

    try {
      await encryptAndUpdate('expenses', editTarget.id, updates, cryptoKey, ['month'])
    } catch (err) {
      console.error('[finio/Expenses] Update failed:', err)
      if (prev) setExpenses((list) => list.map((e) => (e.id === editTarget.id ? prev : e)))
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

    const snapshot = expenses.find((e) => e.id === deleteTarget.id)
    setExpenses((prev) => prev.filter((e) => e.id !== deleteTarget.id))
    setDeleteTarget(null)

    try {
      await deleteRecord('expenses', snapshot.id)
    } catch (err) {
      console.error('[finio/Expenses] Delete failed:', err)
      if (snapshot) setExpenses((prev) => [snapshot, ...prev])
    } finally {
      setDeleting(false)
    }
  }

  // ── Filtered expenses (search) ────────────────────────────────────────────

  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (categoryFilter) list = list.filter((e) => e.category === categoryFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (e) =>
          (e.subcategory ?? '').toLowerCase().includes(q) ||
          (e.notes ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [expenses, query, categoryFilter])

  // ── Group by category ─────────────────────────────────────────────────────

  const byCategory = {}
  for (const exp of filteredExpenses) {
    const cat = exp.category ?? 'miscellaneous'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(exp)
  }

  const orderedCats = EXPENSE_CATEGORIES.filter((c) => byCategory[c.id]?.length > 0)
  const totalExpensePaise = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const prevTotalPaise = prevMonthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const isFiltered = query.trim() !== '' || categoryFilter !== ''
  const surplusPaise = totalIncomePaise - totalExpensePaise
  const hasActiveGoals = goals.some((g) => {
    const saved = Number(g.saved_amount) || 0
    const target = Number(g.target_amount) || 0
    return saved < target && g.status !== 'Completed' && target > 0
  })
  const savingsCatInList = orderedCats.some((c) => c.id === 'savings')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-orange-400" />
          <h2 className="text-xl font-semibold text-white">Expenses</h2>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav month={month} onChange={(m) => { setMonth(m); setQuery(''); setCategoryFilter('') }} />
          <button
            onClick={() => setSearchOpen((o) => !o)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
              searchOpen || isFiltered
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                : 'border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
            title="Search & filter"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowForm(true); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/20 text-orange-400 text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Search bar */}
      <SearchBar
        query={query}
        setQuery={setQuery}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        open={searchOpen}
      />

      {/* Overspend banner */}
      <OverspendBanner expenses={expenses} budgets={budgets} />

      {/* Month summary */}
      {expenses.length > 0 && (
        <div className="glass rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">
              Total Spent · {format(parseISO(`${month}-01`), 'MMMM yyyy')}
            </p>
            <p className="text-2xl font-bold font-numeric text-orange-400">
              {formatINRFromPaise(totalExpensePaise)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/30">
              {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
            </p>
            {totalIncomePaise > 0 && (
              <p className="text-sm text-white/50 font-numeric mt-0.5">
                {Math.round((totalExpensePaise / totalIncomePaise) * 100)}% of income
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orderedCats.length === 0 ? (
        isFiltered ? (
          <div className="glass rounded-xl flex flex-col items-center text-center p-12 gap-3">
            <Search className="w-8 h-8 text-white/20" />
            <p className="text-sm text-white/40">No expenses match your filters.</p>
            <button
              onClick={() => { setQuery(''); setCategoryFilter('') }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass rounded-2xl flex flex-col items-center text-center p-16 gap-5">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center">
                <ShoppingCart className="w-8 h-8 text-orange-400/60" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white/60 mb-1">
                  No expenses for {format(parseISO(`${month}-01`), 'MMMM')}
                </h3>
                <p className="text-sm text-white/30 max-w-xs leading-relaxed">
                  Log your first expense for this month to start tracking your spending.
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/20 text-orange-400 text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                Add first expense
              </button>
            </div>
            {hasActiveGoals && (
              <div className="glass rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                  <span className="text-base">💰</span>
                  <span className="text-sm font-semibold text-white flex-1">Savings</span>
                  <span className="text-xs text-white/30">goal commitments</span>
                </div>
                <div className="p-3">
                  <GoalAllocationPanel goals={goals} surplusPaise={surplusPaise} />
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {orderedCats.map((cat) => (
            <div key={cat.id}>
              <CategoryGroup
                cat={cat}
                expenses={byCategory[cat.id]}
                totalIncomePaise={totalIncomePaise}
                budget={Number(budgets[cat.id]) || 0}
                onBudgetSave={handleBudgetSave}
                recurringIds={recurringIds}
                onEdit={(e) => { setEditTarget(e); setFormError('') }}
                onDelete={setDeleteTarget}
              />
              {cat.id === 'savings' && hasActiveGoals && (
                <div className="mt-2">
                  <GoalAllocationPanel goals={goals} surplusPaise={surplusPaise} />
                </div>
              )}
            </div>
          ))}
          {/* Show goal panel under a standalone savings header if no savings expenses logged */}
          {!savingsCatInList && hasActiveGoals && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <span className="text-base">💰</span>
                <span className="text-sm font-semibold text-white flex-1">Savings</span>
                <span className="text-xs text-white/30">goal commitments</span>
              </div>
              <div className="p-3">
                <GoalAllocationPanel goals={goals} surplusPaise={surplusPaise} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky running total */}
      <RunningTotalFooter
        currentTotal={totalExpensePaise}
        prevTotal={prevTotalPaise}
        month={month}
      />

      {/* Modals */}
      {(showForm || editTarget) && (
        <ExpenseFormModal
          initial={editTarget}
          month={month}
          onSave={editTarget ? handleEdit : handleAdd}
          onCancel={() => { setShowForm(false); setEditTarget(null); setFormError('') }}
          saving={saving}
          error={formError}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          expense={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
