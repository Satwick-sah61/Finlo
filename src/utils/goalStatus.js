import { addMonths, differenceInCalendarMonths } from 'date-fns'

export const GOAL_TYPES = [
  { id: 'purchase', label: 'Big Purchase', icon: '🛍️', example: 'e.g. Buy a laptop or phone', colorClass: 'from-violet-600/20 to-violet-600/5', accent: '#8B5CF6' },
  { id: 'travel', label: 'Travel', icon: '✈️', example: 'e.g. International trip', colorClass: 'from-cyan-600/20 to-cyan-600/5', accent: '#06B6D4' },
  { id: 'education', label: 'Education', icon: '📚', example: 'e.g. MBA or certification', colorClass: 'from-indigo-600/20 to-indigo-600/5', accent: '#6366F1' },
  { id: 'emergency', label: 'Emergency Fund', icon: '🛡️', example: 'e.g. 6 months of expenses', colorClass: 'from-emerald-600/20 to-emerald-600/5', accent: '#10B981' },
  { id: 'wedding', label: 'Wedding / Life Event', icon: '💍', example: 'e.g. Wedding savings', colorClass: 'from-pink-600/20 to-pink-600/5', accent: '#EC4899' },
  { id: 'custom', label: 'Custom Goal', icon: '🎯', example: 'e.g. Anything you want', colorClass: 'from-amber-600/20 to-amber-600/5', accent: '#F59E0B' },
]

export function getGoalTypeMeta(typeId) {
  return GOAL_TYPES.find((t) => t.id === typeId) ?? GOAL_TYPES.at(-1)
}

// Sum of required monthly savings across all active (non-completed) goals.
export function computeGoalAllocation(goals = []) {
  const now = new Date()
  return goals.reduce((sum, g) => {
    const saved = Number(g.saved_amount) || 0
    const target = Number(g.target_amount) || 0
    if (saved >= target || g.status === 'Completed' || g.status === 'Draft') return sum
    const remaining = Math.max(0, target - saved)
    let months = 12
    try { months = Math.max(1, differenceInCalendarMonths(new Date(g.deadline), now)) } catch {}
    return sum + Math.ceil(remaining / months)
  }, 0)
}

export function calculateGoalStatus(goal, currentSurplusPaise = 0) {
  const targetPaise = Number(goal.target_amount) || 0
  const savedPaise = Number(goal.saved_amount) || 0

  if (savedPaise >= targetPaise && targetPaise > 0) {
    return {
      status: 'Completed',
      pctComplete: 100,
      monthsRemaining: 0,
      projectedDate: new Date(),
      onTrack: true,
      shortfallPerMonth: 0,
      requiredPerMonth: 0,
    }
  }

  const pctComplete = targetPaise > 0 ? Math.min(99, Math.round((savedPaise / targetPaise) * 100)) : 0
  const remainingPaise = Math.max(0, targetPaise - savedPaise)
  const now = new Date()

  let monthsToDeadline = 12
  try {
    const deadline = new Date(goal.deadline)
    monthsToDeadline = Math.max(0, differenceInCalendarMonths(deadline, now))
  } catch { /* use default */ }

  const monthsRequired = Math.max(1, monthsToDeadline)
  const requiredPerMonth = Math.ceil(remainingPaise / monthsRequired)
  const shortfallPerMonth = Math.max(0, requiredPerMonth - currentSurplusPaise)

  const monthsNeeded = currentSurplusPaise > 0
    ? Math.ceil(remainingPaise / currentSurplusPaise)
    : Infinity

  const projectedDate = isFinite(monthsNeeded) ? addMonths(now, monthsNeeded) : null

  let status
  if (monthsNeeded === Infinity) {
    status = 'At Risk'
  } else if (monthsNeeded < monthsToDeadline - 1) {
    status = 'Ahead'
  } else if (monthsNeeded <= monthsToDeadline + 1) {
    status = 'On Track'
  } else {
    status = 'At Risk'
  }

  return {
    status,
    pctComplete,
    monthsRemaining: monthsToDeadline,
    projectedDate,
    onTrack: status !== 'At Risk',
    shortfallPerMonth,
    requiredPerMonth,
  }
}
