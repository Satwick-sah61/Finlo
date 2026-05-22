import { useState, useRef, useEffect } from 'react'
import { Eye, EyeOff, AlertTriangle, ShieldCheck } from 'lucide-react'
import { unlockVault } from '../crypto/vault.js'
import { configGet } from '../db/schema.js'
import { useAppStore } from '../store/appStore.js'

export default function Unlock() {
  const { unlock } = useAppStore()
  const [passphrase, setPassphrase] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleUnlock(e) {
    e.preventDefault()
    if (!passphrase || loading) return
    setLoading(true)
    setError('')

    try {
      const salt = await configGet('salt')
      const sentinelRaw = await configGet('sentinel')

      if (!salt || !sentinelRaw) {
        setError('Vault configuration not found. Please reload the app.')
        setLoading(false)
        return
      }

      const { ciphertext, iv } = JSON.parse(sentinelRaw)
      const key = await unlockVault(passphrase, salt, ciphertext, iv)

      // Check if onboarding was completed
      const onboardingDone = await configGet('onboarding_complete')
      unlock(key, !onboardingDone)
    } catch {
      const next = attempts + 1
      setAttempts(next)
      setError(
        next >= 5
          ? 'Too many failed attempts. Verify your passphrase carefully.'
          : 'Incorrect passphrase. Please try again.'
      )
      setPassphrase('')
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <ShieldCheck className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            <span className="text-gradient">Finio</span>
          </h1>
          <p className="text-white/40 text-sm">Enter your passphrase to unlock</p>
        </div>

        <form onSubmit={handleUnlock} className="glass rounded-2xl p-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Passphrase</label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPass ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Your vault passphrase"
                autoComplete="current-password"
                className={`w-full bg-white/5 border rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 focus:outline-none transition-all ${
                  error
                    ? 'border-red-500/60 bg-red-500/5 animate-shake'
                    : 'border-white/10 focus:border-indigo-500/60'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!passphrase || loading}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 glow-indigo disabled:shadow-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Unlocking…
              </>
            ) : (
              'Unlock Vault'
            )}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          Wrong passphrase = no access. This is by design.
        </p>
      </div>
    </div>
  )
}
