import { useState, useRef } from 'react'
import { X, Upload, FileText, Image, Sparkles, AlertTriangle, CheckCircle, ChevronRight, Eye } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndSave, encryptAndUpdate } from '../../db/helpers.js'
import { fileToBase64, extractLoanFromDocument, loadApiKey } from '../../utils/loanDocExtract.js'
import { LOAN_TYPES, calculateEMI } from '../../utils/amortization.js'
import { formatINRCompact } from '../../utils/currency.js'
import { db } from '../../db/schema.js'

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_MB   = 20

const BEST_DOCS = [
  { icon: '⭐', label: 'Loan Sanction Letter', desc: 'Best — has all terms: amount, rate, tenure, EMI' },
  { icon: '📄', label: 'Loan Agreement', desc: 'Has all details, slightly more verbose' },
  { icon: '💌', label: 'Welcome / Intimation Letter', desc: 'Good — issued after disbursement' },
  { icon: '⚠️', label: 'Bank Statement', desc: 'Last resort — can infer EMI only' },
]

// ─── Editable field row ────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder }) {
  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 13,
    color: '#ffffff',
    caretColor: '#ffffff',
    outline: 'none',
    width: '100%',
  }
  return (
    <div>
      <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>
        {label}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function DocumentUploadModal({ onClose, onSaved }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const fileInputRef = useRef(null)

  // Step: 'guide' | 'pick' | 'extracting' | 'review' | 'saving' | 'done'
  const [step, setStep]         = useState('guide')
  const [file, setFile]         = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [error, setError]       = useState(null)
  const [extracted, setExtracted] = useState(null)

  // Editable extracted fields
  const [loanName, setLoanName]   = useState('')
  const [lender, setLender]       = useState('')
  const [loanType, setLoanType]   = useState('personal_loan')
  const [principal, setPrincipal] = useState('')
  const [rate, setRate]           = useState('')
  const [tenure, setTenure]       = useState('')
  const [emiAmt, setEmiAmt]       = useState('')
  const [startDate, setStartDate] = useState('')
  const [loanRef, setLoanRef]     = useState('')

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)

    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_MB}MB`)
      return
    }
    if (!f.type.match(/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/)) {
      setError('Only PDF, JPG, PNG or WebP files are supported')
      return
    }

    setFile(f)
    if (f.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(f))
    } else {
      setFilePreview(null)
    }
    setStep('pick')
  }

  async function handleExtract() {
    setStep('extracting')
    setError(null)

    const apiKey = await loadApiKey(cryptoKey)
    if (!apiKey) {
      setError('No Anthropic API key found. Add it in Settings → AI Features.')
      setStep('pick')
      return
    }

    try {
      const data = await extractLoanFromDocument(file, apiKey)
      setExtracted(data)

      // Pre-fill editable fields
      setLoanName(data.loan_name ?? (LOAN_TYPES[data.loan_type]?.label ?? ''))
      setLender(data.lender ?? '')
      setLoanType(data.loan_type ?? 'personal_loan')
      setPrincipal(data.principal_amount ? String(data.principal_amount) : '')
      setRate(data.annual_rate != null ? String(data.annual_rate) : '')
      setTenure(data.tenure_months ? String(data.tenure_months) : '')
      setEmiAmt(data.emi_amount ? String(data.emi_amount) : '')
      setStartDate(data.start_date ?? '')
      setLoanRef(data.loan_reference ?? '')
      setStep('review')
    } catch (err) {
      console.error('[finio/extract]', err)
      setError(err.message?.includes('API key') ? 'Invalid API key. Check Settings → AI Features.' : `Extraction failed: ${err.message}`)
      setStep('pick')
    }
  }

  async function handleSave() {
    const principalPaise = Math.round((parseFloat(principal) || 0) * 100)
    const annualRate     = parseFloat(rate) || 0
    const tenureMonths   = parseInt(tenure, 10) || 0
    const emiPaise       = Math.round((parseFloat(emiAmt) || 0) * 100)

    if (!loanName.trim() || !principalPaise || !annualRate || !tenureMonths) {
      setError('Loan name, amount, rate and tenure are required')
      return
    }

    setStep('saving')
    setError(null)

    try {
      // Save the loan record
      const record = {
        name:            loanName.trim(),
        lender:          lender.trim(),
        type:            loanType,
        principal_paise: principalPaise,
        annual_rate:     annualRate,
        tenure_months:   tenureMonths,
        emi_paise:       emiPaise || calculateEMI(principalPaise, annualRate, tenureMonths),
        start_date:      startDate || null,
        status:          'active',
        notes:           loanRef ? `Ref: ${loanRef}` : '',
        has_document:    true,
      }
      const loanId = await encryptAndSave('loans', record, cryptoKey)

      // Store the document linked to this loan
      const base64 = await fileToBase64(file)
      await encryptAndSave(
        'loan_documents',
        { loan_id: loanId, filename: file.name, file_type: file.type, file_data: base64 },
        cryptoKey,
        ['loan_id'], // loan_id stored plaintext for lookup
      )

      setStep('done')
      setTimeout(() => { onSaved(); onClose() }, 1500)
    } catch (err) {
      console.error('[finio/docSave]', err)
      setError('Failed to save. Please try again.')
      setStep('review')
    }
  }

  const computedEMI = principal && rate && tenure
    ? calculateEMI(Math.round(parseFloat(principal) * 100), parseFloat(rate), parseInt(tenure, 10))
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Upload Loan Document</p>
              <p className="text-[10px] text-white/40">AI extracts details automatically</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Guide step ─────────────────────────────────────────────────── */}
          {step === 'guide' && (
            <>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Which document works best?</p>
                <p className="text-xs text-white/40 mb-3">Claude AI reads it and fills in the loan details for you.</p>
                <div className="space-y-2">
                  {BEST_DOCS.map((d) => (
                    <div key={d.label} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-base flex-shrink-0 mt-0.5">{d.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-white/80">{d.label}</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{d.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <p className="text-[10px] text-indigo-300">
                  Requires an Anthropic API key — add it in <strong>Settings → AI Features</strong>.
                  The document is sent only to Anthropic's API for extraction, then stored encrypted on your device.
                </p>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: '#6366F1' }}
              >
                <Upload className="w-4 h-4" />
                Choose File (PDF or image)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}

          {/* ── File picked ─────────────────────────────────────────────────── */}
          {step === 'pick' && file && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {file.type.startsWith('image/') ? (
                  <Image className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <p className="text-[10px] text-white/40">{(file.size / 1024).toFixed(0)} KB · {file.type}</p>
                </div>
                {filePreview && (
                  <img src={filePreview} alt="preview" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('guide'); setFile(null); setFilePreview(null) }}
                  className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  Change file
                </button>
                <button
                  onClick={handleExtract}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
                >
                  <Sparkles className="w-4 h-4" />
                  Extract with AI
                </button>
              </div>
            </>
          )}

          {/* ── Extracting ──────────────────────────────────────────────────── */}
          {step === 'extracting' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Reading document…</p>
                <p className="text-xs text-white/40 mt-1">Claude is extracting loan details</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Review extracted data ───────────────────────────────────────── */}
          {step === 'review' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-300">Extraction complete — review and correct any details below</p>
              </div>

              {/* Loan type picker */}
              <div>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Loan Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(LOAN_TYPES).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => setLoanType(key)}
                      className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-center transition-all text-xs"
                      style={{
                        background: loanType === key ? `${t.color}20` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${loanType === key ? t.color + '50' : 'rgba(255,255,255,0.07)'}`,
                        color: loanType === key ? t.color : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <span className="text-base">{t.icon}</span>
                      <span className="leading-tight font-medium" style={{ fontSize: 9 }}>{t.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Loan Name" value={loanName} onChange={setLoanName} placeholder="e.g. SBI Home Loan" />
                <Field label="Lender" value={lender} onChange={setLender} placeholder="Bank / NBFC" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Principal (₹)" value={principal} onChange={setPrincipal} type="number" placeholder="e.g. 2500000" />
                <Field label="Annual Rate (%)" value={rate} onChange={setRate} type="number" placeholder="e.g. 8.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tenure (months)" value={tenure} onChange={setTenure} type="number" placeholder="e.g. 240" />
                <Field label="EMI (₹)" value={emiAmt} onChange={setEmiAmt} type="number" placeholder="auto-calculated" />
              </div>
              {computedEMI && !emiAmt && (
                <p className="text-[10px] text-indigo-300">
                  Computed EMI: <strong>{formatINRCompact(computedEMI)}</strong>/month
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date" value={startDate} onChange={setStartDate} type="date" />
                <Field label="Loan Reference" value={loanRef} onChange={setLoanRef} placeholder="Account / ref no." />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleSave}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: '#6366F1' }}
              >
                Save Loan <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* ── Saving ──────────────────────────────────────────────────────── */}
          {step === 'saving' && (
            <div className="py-10 flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-white/60">Encrypting and saving…</p>
            </div>
          )}

          {/* ── Done ─────────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <div className="text-5xl">🎉</div>
              <p className="text-base font-semibold text-emerald-400">Loan created!</p>
              <p className="text-xs text-white/40">Document saved and encrypted on your device</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
