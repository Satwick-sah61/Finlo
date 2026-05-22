import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore.js'
import { decryptAndLoadAll } from '../db/helpers.js'
import { computeGoalAllocation } from '../utils/goalStatus.js'

export function useGoals() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [goals, setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [tick, setTick]     = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!cryptoKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    decryptAndLoadAll('goals', cryptoKey)
      .then((data) => {
        if (cancelled) return
        setGoals(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[finio/useGoals] Load failed:', err)
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [cryptoKey, tick])

  const derived = useMemo(() => {
    const activeGoals    = goals.filter(g => g.status !== 'Draft' && g.status !== 'Completed')
    const draftGoals     = goals.filter(g => g.status === 'Draft')
    const completedGoals = goals.filter(g => g.status === 'Completed')

    const totalMonthlyCommitment = computeGoalAllocation(activeGoals)

    const totalTargetAmount = goals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0)
    const totalSavedAmount  = goals.reduce((s, g) => s + (Number(g.saved_amount)  || 0), 0)
    const overallProgress   = totalTargetAmount > 0
      ? Math.round((totalSavedAmount / totalTargetAmount) * 100)
      : 0

    // Goals whose deadline is already past and not completed — always at risk
    const now = new Date()
    const atRiskGoals = activeGoals.filter(g => g.deadline && new Date(g.deadline) < now)

    return {
      activeGoals,
      draftGoals,
      completedGoals,
      totalMonthlyCommitment,
      totalTargetAmount,
      totalSavedAmount,
      overallProgress,
      atRiskGoals,
    }
  }, [goals])

  return { goals, loading, error, refresh, ...derived }
}
