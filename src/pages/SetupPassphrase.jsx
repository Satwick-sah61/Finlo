import { useState } from 'react'
import { Shield, Eye, EyeOff, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { setupVault } from '../crypto/vault.js'
import { configSet } from '../db/schema.js'
import { useAppStore } from '../store/appStore.js'

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-green-500', 'bg-emerald-500']
const STRENGTH_TEXT = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-emerald-400']

function measureStrength(pw) {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 14) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

export default function SetupPassphrase() {
  const { unlock } = useAppStore()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const strength = measureStrength(passphrase)
  const mismatch = confirm.length > 0 && passphrase !== confirm
  const matches = confirm.length > 0 && passphrase === confirm
  const canSubmit = passphrase.length >= 8 && matches && !loading

  async function handleSetup(e) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')

    try {
      const { salt, key, sentinel } = await setupVault(passphrase)
      await configSet('salt', salt)
      await configSet('sentinel', JSON.stringify(sentinel))
      // needsOnboarding = true — first-time user goes to the wizard
      unlock(key, true)
    } catch (err) {
      console.error('[finio] Vault setup failed:', err)
      setError('Setup failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">
            Welcome to <span className="text-gradient">Finio</span>
          </h1>
          <p className="text-white/50 text-sm">
            Your data lives only on this device, encrypted with your passphrase.
          </p>
        </div>

        <form onSubmit={handleSetup} className="glass rounded-2xl p-8 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Create your vault passphrase</h2>
            <p className="text-white/40 text-xs">
              This is the only key to your financial data. There is no reset or recovery — choose something memorable.
            </p>
          </div>

          {/* Passphrase */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Passphrase</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/60 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {passphrase.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i <= strength ? STRENGTH_COLORS[strength] : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs ${STRENGTH_TEXT[strength]}`}>{STRENGTH_LABELS[strength]}</p>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Confirm Passphrase</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your passphrase"
                autoComplete="new-password"
                className={`w-full bg-white/5 border rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 focus:outline-none transition-all ${
                  mismatch
                    ? 'border-red-500/60'
                    : matches
                    ? 'border-green-500/60'
                    : 'border-white/10 focus:border-indigo-500/60'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {mismatch && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Passphrases do not match
              </p>
            )}
            {matches && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Passphrases match
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg px-4 py-3 text-amber-400/80 text-xs flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              There is no passphrase recovery. If you forget it, your data cannot be retrieved. Write it somewhere safe.
            </span>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 glow-indigo disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Encrypting vault…
              </span>
            ) : (
              'Create Vault & Continue'
            )}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          All data is encrypted on this device. Nothing is sent to any server.
        </p>
      </div>
    </div>
  )
}
