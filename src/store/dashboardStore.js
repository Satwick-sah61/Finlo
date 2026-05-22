import { create } from 'zustand'
import { getMonth } from 'date-fns'

export const RANGES = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
]

export function rangeToNumMonths(rangeId) {
  if (rangeId === '3m') return 3
  if (rangeId === '6m') return 6
  if (rangeId === 'ytd') return Math.max(2, getMonth(new Date()) + 1)
  if (rangeId === 'all') return 24
  return 6
}

export const useDashboardStore = create((set) => ({
  range: '6m',
  setRange: (range) => set({ range }),
}))
