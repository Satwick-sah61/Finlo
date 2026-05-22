import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Calculator } from 'lucide-react'
import { format } from 'date-fns'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndSave, encryptAndUpdate } from '../../db/helpers.js'
import { LOAN_TYPES, calculateEMI, calculateTenure } from '../../utils/amortization.js'
import { formatINRCompact } from '../../utils/currency.js'

const TYPE_KEYS = Object.keys(LOAN_TYPES)

// Step 0 — pick loan type
function TypeStep({ onSelect }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-white">What type of loan?</h3>
        <p className="text-xs text-white/40 mt-1">Pick the category that best fits</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {TYPE_KEYS.map((key) => {
          const t = LOAN_TYPES[key]
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className="flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-xl flex-shrink-0">{t.icon}</span>
              <span className="text-sm font-medium text-white/80">{t.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/25 ml-auto flex-shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Step 1 — details form
function DetailsStep({ loanType, editLoan, onBack, onSave, saving }) {
  const meta = LOAN_TYPES[loanType] || LOAN_TYPES.other

  const [name, setName]       = useState(editLoan?.name ?? meta.label)
  const [lender, setLender]   = useState(editLoan?.lender ?? '')
  const [principal, setPrincipal] = useState(
    editLoan ? String(Math.round((Number(editLoan.principal_paise) || 0) / 100)) : ''
  )
  const [rate, setRate]       = useState(editLoan ? String(editLoan.annual_rate ?? '') : '')
  const [tenure, setTenure]   = useState(editLoan ? String(editLoan.tenure_months ?? '') : '')
  const [emi, setEmi]         = useState('')
  const [calcMode, setCalcMode] = useState('tenure') // 'tenure' | 'emi'
  const [startDate, setStartDate] = useState(
    editLoan?.start_date ?? format(new Date(), 'yyyy-MM-dd')
  )
  const [status, setStatus]   = useState(editLoan?.status ?? 'active')
  const [notes, setNotes]     = useState(editLoan?.notes ?? '')
  const [error, setError]     = useState(null)

  const principalPaise = Math.round((parseFloat(principal) || 0) * 100)
  const annualRate = parseFloat(rate) || 0
  const tenureMonths = parseInt(tenure, 10) || 0
  const emiPaise = Math.round((parseFloat(emi) || 0) * 100)

  // Auto-calculate EMI from principal + rate + tenure
  const computedEMI = (calcMode === 'tenure' && principalPaise && annualRate && tenureMonths)
    ? calculateEMI(principalPaise, annualRate, tenureMonths)
    : null

  // Auto-calculate tenure from principal + rate + EMI
  const computedTenure = (calcMode === 'emi' && principalPaise && annualRate && emiPaise)
    ? calculateTenure(principalPaise, annualRate, emiPaise)
    : null

  const effectiveTenure = calcMode === 'tenure' ? tenureMonths : (computedTenure ?? 0)
  const effectiveEMI    = calcMode === 'tenure' ? (computedEMI ?? 0) : emiPaise

  const inputStyle = { color: '#ffffff', caretColor: '#ffffff', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none', width: '100%' }
  const labelStyle = { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }

  async function handleSubmit() {
    if (!name.trim())         { setError('Enter a loan name'); return }
    if (!principalPaise)      { setError('Enter the loan amount'); return }
    if (!annualRate)          { setError('Enter the interest rate'); return }
    if (!effectiveTenure)     { setError('Enter a valid tenure or EMI'); return }
    if (!startDate)           { setError('Enter the start date'); return }
    if (calcMode === 'emi' && !computedTenure) { setError('EMI is too low to cover monthly interest'); return }

    const record = {
      name:           name.trim(),
      lender:         lender.trim(),
      type:           loanType,
      principal_paise: principalPaise,
      annual_rate:    annualRate,
      tenure_months:  effectiveTenure,
      emi_paise:      effectiveEMI,
      start_date:     startDate,
      status,
      notes:          notes.trim(),
    }

    setError(null)
    await onSave(record)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        {!editLoan && (
          <button onClick={onBack} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <span className="text-lg">{meta.icon}</span>
        <div>
          <h3 className="text-base font-semibold text-white">{editLoan ? 'Edit Loan' : meta.label}</h3>
          <p className="text-xs text-white/40">Enter the loan details</p>
        </div>
      </div>

      <div className="space-y-3.5">
        {/* Name + Lender */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Loan Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Home Loan SBI"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Lender (optional)</label>
            <input
              value={lender}
              onChange={(e) => setLender(e.target.value)}
              placeholder="Bank / NBFC"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Principal + Rate */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Loan Amount (₹)</label>
            <input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="e.g. 2500000"
              style={inputStyle}
              min="0"
            />
          </div>
          <div>
            <label style={labelStyle}>Annual Rate (%)</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 8.5"
              style={inputStyle}
              min="0"
              max="100"
              step="0.01"
            />
          </div>
        </div>

        {/* Calculator mode toggle */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/8">
          <button
            onClick={() => setCalcMode('tenure')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              calcMode === 'tenure' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Enter Tenure → Auto EMI
          </button>
          <button
            onClick={() => setCalcMode('emi')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              calcMode === 'emi' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Enter EMI → Auto Tenure
          </button>
        </div>

        {/* Tenure or EMI input */}
        {calcMode === 'tenure' ? (
          <div>
            <label style={labelStyle}>Tenure (months)</label>
            <input
              type="number"
              value={tenure}
              onChange={(e) => setTenure(e.target.value)}
              placeholder="e.g. 240 for 20 years"
              style={inputStyle}
              min="1"
              max="600"
            />
            {computedEMI !== null && (
              <div className="flex items-center gap-1.5 mt-2">
                <Calculator className="w-3 h-3 text-indigo-400" />
                <span className="text-xs text-indigo-300">
                  Monthly EMI: <strong>{formatINRCompact(computedEMI)}</strong>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Monthly EMI (₹)</label>
            <input
              type="number"
              value={emi}
              onChange={(e) => setEmi(e.target.value)}
              placeholder="e.g. 21920"
              style={inputStyle}
              min="0"
            />
            {computedTenure !== null && (
              <div className="flex items-center gap-1.5 mt-2">
                <Calculator className="w-3 h-3 text-indigo-400" />
                <span className="text-xs text-indigo-300">
                  Tenure: <strong>{computedTenure} months</strong> ({Math.round(computedTenure / 12 * 10) / 10} yrs)
                </span>
              </div>
            )}
            {computedTenure === null && emiPaise > 0 && principalPaise > 0 && annualRate > 0 && (
              <p className="text-xs text-red-400 mt-2">EMI is too low to cover monthly interest</p>
            )}
          </div>
        )}

        {/* Start date + status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="active">Active</option>
              <option value="closed">Closed / Paid Off</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details…"
            style={inputStyle}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
        style={{ background: saving ? 'rgba(99,102,241,0.4)' : '#6366F1' }}
      >
        {saving ? 'Saving…' : editLoan ? 'Save Changes' : 'Add Loan'}
      </button>
    </div>
  )
}

export default function AddLoanModal({ editLoan, onClose, onSaved }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)
  const [step, setStep]       = useState(editLoan ? 1 : 0)
  const [loanType, setLoanType] = useState(editLoan?.type ?? 'personal_loan')
  const [saving, setSaving]   = useState(false)

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSave(record) {
    setSaving(true)
    try {
      if (editLoan) {
        await encryptAndUpdate('loans', editLoan.id, record, cryptoKey)
      } else {
        await encryptAndSave('loans', record, cryptoKey)
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[finio/AddLoanModal]', err)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Close button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 0 ? (
          <TypeStep onSelect={(type) => { setLoanType(type); setStep(1) }} />
        ) : (
          <DetailsStep
            loanType={loanType}
            editLoan={editLoan}
            onBack={() => setStep(0)}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
