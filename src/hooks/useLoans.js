import { useState, useEffect, useCallback, useMemo } from 'react'
import { differenceInMonths, addMonths, format } from 'date-fns'
import { useAppStore } from '../store/appStore.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { configGet, configSet } from '../db/schema.js'
import { generateAmortization } from '../utils/amortization.js'

const MILESTONE_PCTS = [25, 50, 75, 100]
const MILESTONES_CONFIG_KEY = 'loan_milestones'

export function useLoans() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [loans, setLoans]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tick, setTick]       = useState(0)

  // Milestone state
  const [pendingMilestones, setPendingMilestones] = useState([])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  // ── Load loans ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    decryptAndLoadAll('loans', cryptoKey)
      .then((data) => {
        if (cancelled) return
        setLoans(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[finio/useLoans] Load failed:', err)
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [cryptoKey, tick])

  // ── Derived loan calculations ──────────────────────────────────────────────
  const derived = useMemo(() => {
    const now = new Date()
    const currentMonthStr = format(now, 'yyyy-MM')

    const enriched = loans.map((loan) => {
      const principal  = Number(loan.principal_paise) || 0
      const rate       = Number(loan.annual_rate) || 0
      const tenure     = Number(loan.tenure_months) || 0
      const startDate  = loan.start_date ? new Date(loan.start_date) : now
      const payments   = Array.isArray(loan.payments) ? loan.payments : []

      const { emi, schedule, totalInterest } = generateAmortization(principal, rate, tenure)

      // payments array is authoritative; fall back to elapsed months when empty
      const elapsedMonths = Math.max(0, differenceInMonths(now, startDate))
      const paidPeriods   = payments.length > 0 ? payments.length : Math.min(elapsedMonths, schedule.length)

      let outstandingPaise
      if (paidPeriods <= 0) {
        outstandingPaise = principal
      } else if (paidPeriods >= schedule.length) {
        outstandingPaise = 0
      } else {
        outstandingPaise = schedule[paidPeriods - 1].outstanding
      }

      const remainingSchedule  = schedule.slice(paidPeriods)
      const interestRemaining  = remainingSchedule.reduce((s, p) => s + p.interest, 0)
      const monthsRemaining    = remainingSchedule.length
      const debtFreeDate       = addMonths(startDate, schedule.length)

      // Next due date = first day of the month after last payment
      const nextDueDate = addMonths(startDate, paidPeriods)

      // Is this month's payment already logged?
      const lastPayment        = payments.at(-1)
      const isCurrentMonthPaid = lastPayment
        ? format(new Date(lastPayment.date), 'yyyy-MM') === currentMonthStr
        : false

      const nextPeriod      = paidPeriods + 1
      const nextScheduleRow = schedule[paidPeriods] ?? null

      const pctPaid = principal > 0
        ? Math.min(100, Math.round(((principal - outstandingPaise) / principal) * 100))
        : 0

      return {
        ...loan,
        payments,
        _emi:               emi,
        _schedule:          schedule,
        _outstandingPaise:  outstandingPaise,
        _interestRemaining: interestRemaining,
        _monthsRemaining:   monthsRemaining,
        _debtFreeDate:      debtFreeDate,
        _paidPeriods:       paidPeriods,
        _totalInterest:     totalInterest,
        _pctPaid:           pctPaid,
        _nextDueDate:       nextDueDate,
        _isCurrentMonthPaid: isCurrentMonthPaid,
        _nextPeriod:        nextPeriod,
        _nextScheduleRow:   nextScheduleRow,
      }
    })

    const activeLoans  = enriched.filter((l) => l.status !== 'closed')
    const closedLoans  = enriched.filter((l) => l.status === 'closed')

    const totalOutstandingPaise  = activeLoans.reduce((s, l) => s + l._outstandingPaise, 0)
    const totalMonthlyEMI        = activeLoans.reduce((s, l) => s + l._emi, 0)
    const totalInterestRemaining = activeLoans.reduce((s, l) => s + l._interestRemaining, 0)

    const projectedDebtFreeDate = activeLoans.length
      ? activeLoans.reduce((latest, l) =>
          l._debtFreeDate > latest ? l._debtFreeDate : latest, new Date(0))
      : null

    return {
      activeLoans,
      closedLoans,
      enrichedLoans: enriched,
      totalOutstandingPaise,
      totalMonthlyEMI,
      totalInterestRemaining,
      projectedDebtFreeDate,
    }
  }, [loans])

  // ── Milestone detection (idempotent — safe to run many times) ─────────────
  useEffect(() => {
    if (!cryptoKey || !derived.enrichedLoans.length) return
    let cancelled = false

    async function checkMilestones() {
      try {
        const firedJson = await configGet(MILESTONES_CONFIG_KEY)
        const fired = firedJson ? JSON.parse(firedJson) : {} // { "loanId_pct": true }

        const newFired = {}
        const toShow   = []

        for (const loan of derived.enrichedLoans) {
          // Only track active loans with a principal > 0
          if (!loan.principal_paise || loan.status === 'closed') continue
          for (const pct of MILESTONE_PCTS) {
            const key = `${loan.id}_${pct}`
            if (!fired[key] && loan._pctPaid >= pct) {
              newFired[key] = true
              toShow.push({ loanId: loan.id, loanName: loan.name, pct })
            }
          }
        }

        if (!cancelled && Object.keys(newFired).length > 0) {
          // Persist before showing to stay idempotent on re-renders
          await configSet(MILESTONES_CONFIG_KEY, JSON.stringify({ ...fired, ...newFired }))
          if (!cancelled) {
            setPendingMilestones(prev => [...prev, ...toShow])
          }
        }
      } catch (err) {
        console.error('[finio/useLoans] Milestone check failed:', err)
      }
    }

    checkMilestones()
    return () => { cancelled = true }
  }, [derived.enrichedLoans, cryptoKey])

  // ── Dismiss a milestone toast ──────────────────────────────────────────────
  const dismissMilestone = useCallback((milestone) => {
    setPendingMilestones(prev =>
      prev.filter(m => !(m.loanId === milestone.loanId && m.pct === milestone.pct))
    )
  }, [])

  return {
    loans,
    loading,
    error,
    refresh,
    pendingMilestones,
    dismissMilestone,
    ...derived,
  }
}
