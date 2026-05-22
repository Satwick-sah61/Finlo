import { useState, useEffect } from 'react'
import { Shield, Lock, ShieldCheck, Trash2, AlertTriangle, CheckCircle2, Settings, Sparkles, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../store/appStore.js'
import { nukeDatabase } from '../db/schema.js'
import { saveApiKey, loadApiKey } from '../utils/loanDocExtract.js'

const APP_VERSION = '0.1.0'
const RESET_PHRASE = 'RESET'

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest">{title}</h3>
      <div className="glass rounded-2xl overflow-hidden divide-y divide-white/5">{children}</div>
    </div>
  )
}

function Row({ label, sublabel, right, danger }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${danger ? 'bg-red-500/3' : ''}`}>
      <div>
        <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-white/80'}`}>{label}</p>
        {sublabel && <p className="text-xs text-white/30 mt-0.5">{sublabel}</p>}
      </div>
      {right && <div className="flex-shrink-0 ml-4">{right}</div>}
    </div>
  )
}

function Badge({ color, label }) {
  const colors = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${colors[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color === 'green' ? 'bg-green-400' : 'bg-indigo-400'}`} />
      {label}
    </span>
  )
}

function DangerZone() {
  const { nuke, lock } = useAppStore()
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [step, setStep] = useState(1)

  function openModal() {
    setShowModal(true)
    setConfirmText('')
    setStep(1)
  }

  function closeModal() {
    setShowModal(false)
    setConfirmText('')
    setStep(1)
  }

  async function handleReset() {
    if (confirmText !== RESET_PHRASE) return
    setResetting(true)
    try {
      await nukeDatabase()
      nuke()
    } catch (err) {
      console.error('[finio] Database reset failed:', err)
      // Even if DB deletion has an issue, nuke the in-memory state
      nuke()
    }
  }

  return (
    <>
      <Row
        label="Reset All Data"
        sublabel="Permanently delete your vault and all encrypted data. This cannot be undone."
        danger
        right={
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>
        }
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-md space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Reset all data?</h3>
                <p className="text-sm text-white/40 mt-1">
                  This will permanently delete your vault passphrase, all encrypted financial data,
                  and all settings. This action is irreversible.
                </p>
              </div>
            </div>

            {step === 1 && (
              <>
                <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">You will lose:</p>
                  {['All income streams', 'All expense records', 'All goals and progress', 'All loans and investments', 'Your vault passphrase'].map((item) => (
                    <p key={item} className="text-xs text-red-400/70 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-red-400/50 flex-shrink-0" />
                      {item}
                    </p>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white/80 text-sm transition-all">
                    Cancel
                  </button>
                  <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-sm font-medium transition-all">
                    I understand, continue
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/50">
                    Type <span className="font-mono font-bold text-red-400">{RESET_PHRASE}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoFocus
                    placeholder={RESET_PHRASE}
                    className="w-full bg-white/5 border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-red-500/60 font-mono transition-all"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white/80 text-sm transition-all">
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={confirmText !== RESET_PHRASE || resetting}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {resetting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete Everything
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function AiSection() {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [apiKey, setApiKey]   = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    loadApiKey(cryptoKey).then((k) => { if (k) setApiKey(k) })
  }, [cryptoKey])

  async function handleSave() {
    setSaving(true)
    await saveApiKey(apiKey, cryptoKey)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 44px 10px 12px',
    fontSize: 13,
    color: '#ffffff',
    caretColor: '#ffffff',
    outline: 'none',
    width: '100%',
    fontFamily: apiKey && !showKey ? 'monospace' : 'inherit',
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-white/80">Anthropic API Key</p>
        <p className="text-xs text-white/30 mt-0.5">
          Required for AI document extraction (Loans → Upload Doc).
          Stored encrypted with your vault key — never sent anywhere except Anthropic's API.
        </p>
      </div>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-…"
            style={inputStyle}
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 flex-shrink-0"
          style={{ background: saved ? '#10B981' : '#6366F1' }}
        >
          {saved ? '✓ Saved' : saving ? '…' : 'Save'}
        </button>
      </div>
      <p className="text-[10px] text-white/20">
        Get a key at <span className="text-indigo-400">console.anthropic.com</span> · Billing is pay-per-use (typically &lt;₹1 per document extraction)
      </p>
    </div>
  )
}

export default function SettingsPage() {
  const { lock } = useAppStore()

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-indigo-400" />
        <h2 className="text-xl font-semibold text-white">Settings</h2>
      </div>

      <Section title="Security">
        <Row
          label="Encryption"
          sublabel="All data encrypted with AES-256-GCM before storage"
          right={<Badge color="green" label="AES-256-GCM Active" />}
        />
        <Row
          label="Key Derivation"
          sublabel="PBKDF2-SHA256 · 600,000 iterations · 16-byte random salt"
          right={<Badge color="green" label="Active" />}
        />
        <Row
          label="Auto-Lock"
          sublabel="Vault locks automatically after 15 minutes of inactivity"
          right={<Badge color="indigo" label="15 min" />}
        />
        <Row
          label="Lock Vault Now"
          sublabel="Clears the decryption key from memory immediately"
          right={
            <button
              onClick={lock}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-xs font-medium transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock
            </button>
          }
        />
      </Section>

      <Section title="Privacy">
        <Row
          label="Data Storage"
          sublabel="All financial data stored locally in encrypted IndexedDB"
          right={<Badge color="green" label="Local Only" />}
        />
        <Row
          label="AI Data Sharing"
          sublabel="Only anonymized financial summaries sent to Claude API — no names, accounts, or identifiers"
          right={<Badge color="green" label="Anonymized" />}
        />
        <Row
          label="Analytics"
          sublabel="No tracking, no analytics, no third-party scripts"
          right={<Badge color="green" label="None" />}
        />
      </Section>

      <Section title="About">
        <Row label="Finio" sublabel={`Version ${APP_VERSION} · Phase 0`} right={
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-white/30">Privacy-first</span>
          </div>
        } />
        <Row label="Encryption Standard" sublabel="AES-256-GCM with PBKDF2 key derivation" />
        <Row label="Open Source" sublabel="All encryption logic is auditable in src/crypto/vault.js" />
      </Section>

      <Section title="AI Features">
        <AiSection />
      </Section>

      <Section title="Danger Zone">
        <DangerZone />
      </Section>
    </div>
  )
}
