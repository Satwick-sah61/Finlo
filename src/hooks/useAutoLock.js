import { useEffect, useRef } from 'react'
import { useAppStore, APP_STATE } from '../store/appStore.js'

const TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove']

export function useAutoLock() {
  const { appState, lock } = useAppStore()
  const timerRef = useRef(null)
  const lockRef = useRef(lock)

  // Keep lockRef current without re-running the effect
  lockRef.current = lock

  useEffect(() => {
    if (appState !== APP_STATE.UNLOCKED) return

    const reset = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => lockRef.current(), TIMEOUT_MS)
    }

    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, reset, { passive: true }))
    reset() // Arm immediately on mount

    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, reset))
    }
  }, [appState])
}
