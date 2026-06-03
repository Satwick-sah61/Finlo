/**
 * Investments page — Phase 3 Week 13 (updated)
 *
 * Additions over Week 12:
 *   - Investment reminder banners (FD maturing, price update needed, PPF March)
 *   - InvestmentDetail extracted to its own file (enhanced: price chart, FD countdown, PPF table)
 *   - BenchmarkComparison chart (week 13)
 *   - DiversificationChart (sector + risk profile, week 13)
 */
import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  BarChart3, Plus, RefreshCw,
  MoreHorizontal, Pencil, Trash2,
  ChevronDown, ChevronUp, Bell, X,
} from 'lucide-react'
import { useInvestments } from '../hooks/useInvestments.js'
import { useAppStore } from '../store/appStore.js'
import { deleteRecord } from '../db/helpers.js'
import { formatINRCompact } from '../utils/currency.js'
import { generateInvestmentReminders } from '../utils/investmentReminders.js'
import { ASSET_META } from '../components/investments/AssetAllocationChart.jsx'
import AddInvestmentModal from '../components/investments/AddInvestmentModal.jsx'
import UpdatePriceModal from '../components/investments/UpdatePriceModal.jsx'
import AssetAllocationChart from '../components/investments/AssetAllocationChart.jsx'
import PortfolioValueChart from '../components/investments/PortfolioValueChart.jsx'
import BenchmarkComparison from '../components/investments/BenchmarkComparison.jsx'
import DiversificationChart from '../components/investments/DiversificationChart.jsx'
import InvestmentDetail from '../components/investments/InvestmentDetail.jsx'

// ─── Filter / sort config ─────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'stocks',      label: 'Stocks' },
  { id: 'mutual_fund', label: 'Mutual Funds' },
  { id: 'fd',          label: 'FDs' },
  { id: 'gold',        label: 'Gold' },
  { id: 'ppf_nps',     label: 'PPF / NPS' },
  { id: 'real_estate', label: 'Real Estate' },
]

const SORTS = [
  { id: 'value',  label: 'Value ↓' },
  { id: 'gain',   label: 'Gain % ↓' },
  { id: 'loss',   label: 'Loss % ↑' },
  { id: 'recent', label: 'Newest first' },
  { id: 'class',  label: 'Asset class' },
]

// ─── Summary pills ────────────────────────────────────────────────────────────

function SummaryPill({ label, value, sub, valueColor = 'text-white' }) {
  return (
    <div
      className="flex-1 min-w-[140px] rounded-2xl p-4"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-xl font-bold font-numeric leading-tight ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Reminder banners ─────────────────────────────────────────────────────────

const URGENCY_STYLE = {
  high:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   icon: '🔴', textColor: '#FCA5A5' },
  medium: { bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.25)',  icon: '🟡', textColor: '#FDE68A' },
  low:    { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', icon: '🔵', textColor: '#A5B4FC' },
}

function ReminderBanners({ reminders, onDismiss }) {
  if (!reminders.length) return null
  return (
    <div className="space-y-2">
      {reminders.map((r) => {
        const s = URGENCY_STYLE[r.urgency] || URGENCY_STYLE.low
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
          >
            <Bell className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: s.textColor }} />
            <p className="text-xs flex-1 leading-relaxed" style={{ color: s.textColor }}>
              {r.message}
            </p>
            <button
              onClick={() => onDismiss(r.id)}
              className="flex-shrink-0 text-white/20 hover:text-white/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Investment card ──────────────────────────────────────────────────────────

function InvestmentCard({ inv, onRefresh, onEdit, onUpdatePrice }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const meta      = ASSET_META[inv.asset_class] || ASSET_META.other
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isGain         = inv._gain_loss_paise >= 0
  const canUpdatePrice = ['stocks', 'mutual_fund', 'gold'].includes(inv.asset_class)

  const holdingDays = inv._holding_period_days
  const holdingStr  =
    holdingDays >= 365 ? `${Math.floor(holdingDays / 365)}y ${Math.floor((holdingDays % 365) / 30)}m`
    : holdingDays >= 30 ? `${Math.floor(holdingDays / 30)}m`
    : `${holdingDays}d`

  async function handleDelete() {
    if (!window.confirm(`Delete "${inv._name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteRecord('investments', inv.id)
      onRefresh()
    } catch (err) {
      console.error('[InvestmentCard] delete failed:', err)
      setDeleting(false)
    }
  }

  return (
    <div
      className="rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="p-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
            >
              {meta.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{inv._name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  {meta.label}
                </span>
                {holdingDays > 0 && (
                  <span className="text-[10px] text-white/30">{holdingStr} held</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions + menu */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {canUpdatePrice && (
              <button
                onClick={() => onUpdatePrice(inv)}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors hover:bg-white/8"
                style={{ color: meta.color }}
                title="Update current price"
              >
                Update Price
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-8 z-20 w-40 rounded-xl py-1.5 shadow-2xl"
                    style={{ background: '#252436', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <button
                      onClick={() => { onEdit(inv); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <div className="my-1 border-t border-white/6" />
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Value stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Invested</p>
            <p className="text-sm font-bold font-numeric text-white/70">
              {formatINRCompact(inv._invested_paise)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Current</p>
            <p className="text-sm font-bold font-numeric text-white/90">
              {formatINRCompact(inv._current_value_paise)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Return</p>
            <p
              className="text-sm font-bold font-numeric"
              style={{ color: isGain ? '#10B981' : '#EF4444' }}
            >
              {isGain ? '+' : ''}{inv._gain_loss_pct.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Gain/loss bar */}
        <div
          className="h-1.5 rounded-full overflow-hidden mb-4"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, Math.abs(inv._gain_loss_pct))}%`,
              background: isGain
                ? 'linear-gradient(90deg, #10B981, #34D399aa)'
                : 'linear-gradient(90deg, #EF4444, #F87171aa)',
            }}
          />
        </div>

        {/* Gain/loss absolute */}
        <div className="flex items-center justify-between text-[10px] mb-3">
          <span className="text-white/30 font-numeric">
            {isGain ? '+' : '−'}{formatINRCompact(Math.abs(inv._gain_loss_paise))} {isGain ? 'gain' : 'loss'}
          </span>
          {inv._buy_date_str && (
            <span className="text-white/25">
              Since {format(new Date(inv._buy_date_str), 'dd MMM yyyy')}
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Hide details</>
            : <><ChevronDown className="w-3.5 h-3.5" /> View details</>}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5">
          <InvestmentDetail inv={inv} onUpdatePrice={onUpdatePrice} />
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/6 rounded-xl ${className}`} />
}

// ─── Chart section wrapper ────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Investments() {
  const {
    enrichedInvestments,
    totalInvested, currentValue, totalGainLoss, totalGainLossPct,
    bestPerformer, worstPerformer, assetAllocation,
    sectorAllocation, portfolioRiskLabel, highRiskPct,
    totalAnnualizedReturn,
    loading, error, refresh,
  } = useInvestments()

  const [filter,      setFilter]      = useState('all')
  const [sort,        setSort]        = useState('value')
  const [showAdd,     setShowAdd]     = useState(false)
  const [editInv,     setEditInv]     = useState(null)
  const [updateInv,   setUpdateInv]   = useState(null)
  const [showCharts,  setShowCharts]  = useState(true)

  // Dismissed reminder IDs (session-only)
  const [dismissed, setDismissed] = useState(new Set())

  // Generate reminders
  const allReminders = useMemo(
    () => (!loading && enrichedInvestments.length ? generateInvestmentReminders(enrichedInvestments) : []),
    [enrichedInvestments, loading]
  )
  const visibleReminders = allReminders.filter((r) => !dismissed.has(r.id))

  function dismissReminder(id) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  const displayed = useMemo(() => {
    let list = filter === 'all'
      ? enrichedInvestments
      : enrichedInvestments.filter((i) => i.asset_class === filter)

    return [...list].sort((a, b) => {
      if (sort === 'value')  return b._current_value_paise - a._current_value_paise
      if (sort === 'gain')   return b._gain_loss_pct - a._gain_loss_pct
      if (sort === 'loss')   return a._gain_loss_pct - b._gain_loss_pct
      if (sort === 'recent') {
        const da  = a._buy_date_str ? new Date(a._buy_date_str) : new Date(0)
        const db_ = b._buy_date_str ? new Date(b._buy_date_str) : new Date(0)
        return db_ - da
      }
      if (sort === 'class') return (a.asset_class || '').localeCompare(b.asset_class || '')
      return 0
    })
  }, [enrichedInvestments, filter, sort])

  const isGain  = totalGainLoss >= 0
  const hasData = enrichedInvestments.length > 0

  // Does any eligible holding have price history to compute benchmark?
  const hasBenchmarkHistory = enrichedInvestments.some(
    (i) => i._holding_period_days > 30 && i._invested_paise > 0
  )

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-semibold text-white">Investments</h2>
          {!loading && hasData && (
            <span className="text-xs text-white/30 bg-white/6 px-2 py-0.5 rounded-full">
              {enrichedInvestments.length} holdings
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <button
              onClick={() => setShowCharts((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{
                background: showCharts ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${showCharts ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.1)'}`,
                color: showCharts ? '#A5B4FC' : 'rgba(255,255,255,0.5)',
              }}
            >
              <BarChart3 className="w-4 h-4" />
              Charts
              {showCharts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#6366F1' }}
          >
            <Plus className="w-4 h-4" />
            Add Investment
          </button>
        </div>
      </div>

      {/* ── Reminders ─────────────────────────────────────────────────────── */}
      {!loading && visibleReminders.length > 0 && (
        <ReminderBanners reminders={visibleReminders} onDismiss={dismissReminder} />
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-red-400">Failed to load investments</p>
          <button onClick={refresh} className="flex items-center gap-1.5 mx-auto text-xs text-white/40 hover:text-white/60 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="flex-1 h-20" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52" />)}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !error && !hasData && (
        <div
          className="rounded-2xl p-12 flex flex-col items-center text-center gap-5"
          style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            📈
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No investments tracked yet</p>
            <p className="text-sm text-white/40 mt-1.5 max-w-sm leading-relaxed">
              Track your entire portfolio — stocks, mutual funds, FDs, PPF, gold, and real estate.
              See allocation, gain/loss, and portfolio trends in one place.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full max-w-md">
            {['📈 Stocks', '🔄 Mutual Funds', '🏦 Fixed Deposits', '🪙 Gold', '🏛️ PPF / NPS', '🏠 Real Estate'].map((a) => (
              <div key={a} className="rounded-xl p-2.5 text-xs text-white/40" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {a}
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#6366F1' }}
          >
            <Plus className="w-4 h-4" />
            Add Your First Investment
          </button>
        </div>
      )}

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      {!loading && hasData && (
        <div className="flex flex-wrap gap-3">
          <SummaryPill
            label="Total Invested"
            value={formatINRCompact(totalInvested)}
            sub={`${enrichedInvestments.length} holdings`}
            valueColor="text-indigo-300"
          />
          <SummaryPill
            label="Current Value"
            value={formatINRCompact(currentValue)}
            sub={isGain ? 'Portfolio is up' : 'Portfolio is down'}
            valueColor="text-white"
          />
          <SummaryPill
            label={isGain ? 'Total Gain' : 'Total Loss'}
            value={`${isGain ? '+' : '−'}${formatINRCompact(Math.abs(totalGainLoss))}`}
            sub={`${isGain ? '+' : ''}${totalGainLossPct.toFixed(2)}% overall`}
            valueColor={isGain ? 'text-emerald-400' : 'text-red-400'}
          />
          {bestPerformer && (
            <SummaryPill
              label="Best Performer"
              value={bestPerformer._name}
              sub={`+${bestPerformer._gain_loss_pct.toFixed(2)}%`}
              valueColor="text-emerald-400"
            />
          )}
          {worstPerformer && worstPerformer.id !== bestPerformer?.id && (
            <SummaryPill
              label="Worst Performer"
              value={worstPerformer._name}
              sub={`${worstPerformer._gain_loss_pct.toFixed(2)}%`}
              valueColor="text-red-400"
            />
          )}
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {!loading && hasData && showCharts && (
        <div className="space-y-5">
          {/* Row 1 — Allocation + Value over time */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="Asset Allocation"
              subtitle="Distribution of your portfolio by asset class"
            >
              <AssetAllocationChart assetAllocation={assetAllocation} currentValue={currentValue} />
            </ChartCard>

            <ChartCard
              title="Portfolio Value Over Time"
              subtitle="Invested capital vs estimated market value"
            >
              <PortfolioValueChart enrichedInvestments={enrichedInvestments} />
            </ChartCard>
          </div>

          {/* Row 2 — Benchmark + Diversification */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="Benchmark Comparison"
              subtitle="Your annualized return vs approximate historical benchmarks"
            >
              <BenchmarkComparison
                totalAnnualizedReturn={totalAnnualizedReturn}
                hasHistory={hasBenchmarkHistory}
              />
            </ChartCard>

            <ChartCard
              title="Diversification & Risk"
              subtitle="Sector concentration and risk profile of your portfolio"
            >
              <DiversificationChart
                sectorAllocation={sectorAllocation}
                assetAllocation={assetAllocation}
                portfolioRiskLabel={portfolioRiskLabel}
                highRiskPct={highRiskPct}
                enrichedInvestments={enrichedInvestments}
              />
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── Filter + sort ─────────────────────────────────────────────────── */}
      {!loading && hasData && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8 overflow-x-auto">
            {FILTERS.map((f) => {
              const count = f.id === 'all'
                ? enrichedInvestments.length
                : enrichedInvestments.filter((i) => i.asset_class === f.id).length
              if (f.id !== 'all' && count === 0) return null
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    filter === f.id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {f.label}
                  {count > 0 && <span className="ml-1 text-[9px] opacity-60">{count}</span>}
                </button>
              )
            })}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white/50 bg-white/5 border border-white/8 cursor-pointer outline-none"
            style={{ colorScheme: 'dark' }}
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {/* ── Investment cards ───────────────────────────────────────────────── */}
      {!loading && displayed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map((inv) => (
            <InvestmentCard
              key={inv.id}
              inv={inv}
              onRefresh={refresh}
              onEdit={(i) => setEditInv(i)}
              onUpdatePrice={(i) => setUpdateInv(i)}
            />
          ))}
        </div>
      )}

      {/* ── No results for filter ──────────────────────────────────────────── */}
      {!loading && hasData && displayed.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-white/30">No {FILTERS.find((f) => f.id === filter)?.label} investments</p>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showAdd && (
        <AddInvestmentModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { refresh(); setShowAdd(false) }}
        />
      )}
      {editInv && (
        <AddInvestmentModal
          editInvestment={editInv}
          onClose={() => setEditInv(null)}
          onSaved={() => { refresh(); setEditInv(null) }}
        />
      )}
      {updateInv && (
        <UpdatePriceModal
          investment={updateInv}
          onClose={() => setUpdateInv(null)}
          onSaved={() => { refresh(); setUpdateInv(null) }}
        />
      )}
    </div>
  )
}
