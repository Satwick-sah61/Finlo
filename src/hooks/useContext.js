/**
 * useFinioContext — builds and caches the anonymized AI context.
 *
 * - Builds on mount (and when the vault key changes).
 * - Rebuilds automatically when `dataVersion` changes (the DATA_CHANGED event;
 *   call useAppStore.getState().notifyDataChanged() after any DB write).
 * - Caches the result in Zustand (`finioContext`) for the session.
 * - rebuild() forces an immediate rebuild.
 *
 * Returns: { context, loading, error, rebuild }
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { buildContext } from '../ai/contextBuilder.js'

export function useFinioContext() {
  const cryptoKey       = useAppStore((s) => s.cryptoKey)
  const dataVersion     = useAppStore((s) => s.dataVersion)
  const cached          = useAppStore((s) => s.finioContext)
  const setFinioContext = useAppStore((s) => s.setFinioContext)

  const [loading, setLoading] = useState(!cached)
  const [error,   setError]   = useState(null)
  const reqId = useRef(0)

  const build = useCallback(async () => {
    if (!cryptoKey) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const ctx = await buildContext(cryptoKey)
      if (id !== reqId.current) return // superseded
      setFinioContext(ctx)
    } catch (err) {
      if (id !== reqId.current) return
      console.error('[finio/useFinioContext] build error:', err)
      setError(err.message)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [cryptoKey, setFinioContext])

  // Build on unlock + rebuild when data changes
  useEffect(() => {
    if (cryptoKey) build()
  }, [cryptoKey, dataVersion, build])

  const rebuild = useCallback(() => build(), [build])

  return { context: cached, loading, error, rebuild }
}
