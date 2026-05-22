/**
 * AddInvestmentModal — two-step investment entry modal.
 *
 * Step 1: Asset class selection (6 active + 2 coming-soon cards)
 * Step 2: Dynamic form fields per asset class
 *
 * Props:
 *   onClose       () => void
 *   onSaved       () => void
 *   editInvestment  enriched investment object | null
 */
import { useState, useMemo } from 'react'
import { addMonths, format } from 'date-fns'
import { X, ArrowLeft, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore.js'
import { encryptAndSave, encryptAndUpdate } from '../../db/helpers.js'
import { computeFDMaturityValue } from '../../hooks/useInvestments.js'

// ─── Asset class catalogue ────────────────────────────────────────────────────

const ASSET_CLASSES = [
  {
    key:   'stocks',
    label: 'Stocks',
    icon:  '📈',
    color: '#6366F1',
    desc:  'NSE / BSE equities',
  },
  {
    key:   'mutual_fund',
    label: 'Mutual Funds',
    icon:  '🔄',
    color: '#8B5CF6',
    desc:  'SIP & lump sum',
  },
  {
    key:   'fd',
    label: 'Fixed Deposit',
    icon:  '🏦',
    color: '#06B6D4',
    desc:  'Bank FDs & RDs',
  },
  {
    key:   'ppf_nps',
    label: 'PPF / NPS',
    icon:  '🏛️',
    color: '#10B981',
    desc:  'Govt-backed schemes',
  },
  {
    key:   'gold',
    label: 'Gold',
    icon:  '🪙',
    color: '#F59E0B',
    desc:  'Physical & digital',
  },
  {
    key:   'real_estate',
    label: 'Real Estate',
    icon:  '🏠',
    color: '#F97316',
    desc:  'Property holdings',
  },
  {
    key:      'us_stocks',
    label:    'US Stocks',
    icon:     '🌐',
    color:    '#6B7280',
    desc:     'Coming soon',
    disabled: true,
  },
  {
    key:      'crypto',
    label:    'Crypto',
    icon:     '₿',
    color:    '#6B7280',
    desc:     'Coming soon',
    disabled: true,
  },
]

const SECTORS = ['IT', 'Banking', 'Pharma', 'FMCG', 'Auto', 'Energy', 'Infrastructure', 'Other']
const FUND_TYPES = ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index']
const GOLD_FORMS = ['Physical', 'SGB', 'Gold ETF', 'Digital Gold']
const PROPERTY_TYPES = ['Residential', 'Commercial', 'Plot']

// ─── Shared styled form primitives ───────────────────────────────────────────

function Field({ label, children, hint, required }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-white/50">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-white/30 leading-snug">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500/60 focus:bg-white/8 transition-all placeholder:text-white/20'
const inputStyle = { color: '#ffffff', caretColor: '#ffffff' }

function Input({ ...props }) {
  return <input className={inputCls} style={inputStyle} {...props} />
}

function Select({ options, placeholder, ...props }) {
  return (
    <select
      className={inputCls}
      style={{ color: '#ffffff', colorScheme: 'dark' }}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  )
}

function Row({ children }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function PreviewPill({ label, value, color }) {
  return (
    <div
      className="flex-1 rounded-lg p-3 text-center"
      style={{ background: `${color}10`, border: `1px solid ${color}25` }}
    >
      <p className="text-xs font-bold font-numeric" style={{ color }}>{value}</p>
      <p className="text-[10px] text-white/35 mt-0.5">{label}</p>
    </div>
  )
}

// ─── Per-class form sections ──────────────────────────────────────────────────

function StocksForm({ data, onChange }) {
  return (
    <div className="space-y-4">
      <Row>
        <Field label="Stock Name" required>
          <Input
            placeholder="e.g. Reliance Industries"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </Field>
        <Field label="Ticker Symbol" hint="NSE/BSE code (optional)">
          <Input
            placeholder="e.g. RELIANCE"
            value={data.ticker || ''}
            onChange={(e) => onChange('ticker', e.target.value.toUpperCase())}
          />
        </Field>
      </Row>
      <Field label="Sector">
        <Select
          options={SECTORS}
          value={data.sector || ''}
          placeholder="Select sector"
          onChange={(e) => onChange('sector', e.target.value)}
        />
      </Field>
      <Row>
        <Field label="Quantity (shares)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="100"
            value={data.quantity || ''}
            onChange={(e) => onChange('quantity', e.target.value)}
          />
        </Field>
        <Field label="Avg Buy Price (₹/share)" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="2500.00"
            value={data.buy_price || ''}
            onChange={(e) => onChange('buy_price', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Current Price (₹/share)" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="2750.00"
            value={data.current_price || ''}
            onChange={(e) => onChange('current_price', e.target.value)}
          />
        </Field>
        <Field label="Buy Date" required>
          <Input
            type="date"
            value={data.buy_date || ''}
            onChange={(e) => onChange('buy_date', e.target.value)}
          />
        </Field>
      </Row>
      {data.quantity && data.buy_price && data.current_price && (
        <div className="flex gap-3">
          <PreviewPill
            label="Invested"
            value={`₹${Math.round(Number(data.quantity) * Number(data.buy_price)).toLocaleString('en-IN')}`}
            color="#6366F1"
          />
          <PreviewPill
            label="Current Value"
            value={`₹${Math.round(Number(data.quantity) * Number(data.current_price)).toLocaleString('en-IN')}`}
            color="#06B6D4"
          />
          <PreviewPill
            label="Gain / Loss"
            value={`${Number(data.current_price) >= Number(data.buy_price) ? '+' : ''}${Math.round(((Number(data.current_price) - Number(data.buy_price)) / Number(data.buy_price)) * 100)}%`}
            color={Number(data.current_price) >= Number(data.buy_price) ? '#10B981' : '#EF4444'}
          />
        </div>
      )}
    </div>
  )
}

function MutualFundForm({ data, onChange }) {
  return (
    <div className="space-y-4">
      <Field label="Fund Name" required>
        <Input
          placeholder="e.g. Mirae Asset Large Cap Fund"
          value={data.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </Field>
      <Row>
        <Field label="Fund Type" required>
          <Select
            options={FUND_TYPES}
            placeholder="Select type"
            value={data.fund_type || ''}
            onChange={(e) => onChange('fund_type', e.target.value)}
          />
        </Field>
        <Field label="Buy Date" required>
          <Input
            type="date"
            value={data.buy_date || ''}
            onChange={(e) => onChange('buy_date', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Units Held" required>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="125.432"
            value={data.units || ''}
            onChange={(e) => onChange('units', e.target.value)}
          />
        </Field>
        <Field label="NAV at Purchase (₹)" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="45.50"
            value={data.purchase_nav || ''}
            onChange={(e) => onChange('purchase_nav', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Current NAV (₹)" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="62.80"
            value={data.current_nav || ''}
            onChange={(e) => onChange('current_nav', e.target.value)}
          />
        </Field>
        <Field label="Folio Number" hint="Optional">
          <Input
            placeholder="e.g. 123456789"
            value={data.folio_number || ''}
            onChange={(e) => onChange('folio_number', e.target.value)}
          />
        </Field>
      </Row>
      {data.units && data.purchase_nav && data.current_nav && (
        <div className="flex gap-3">
          <PreviewPill
            label="Invested"
            value={`₹${Math.round(Number(data.units) * Number(data.purchase_nav)).toLocaleString('en-IN')}`}
            color="#8B5CF6"
          />
          <PreviewPill
            label="Current Value"
            value={`₹${Math.round(Number(data.units) * Number(data.current_nav)).toLocaleString('en-IN')}`}
            color="#06B6D4"
          />
          <PreviewPill
            label="NAV Return"
            value={`${Number(data.current_nav) >= Number(data.purchase_nav) ? '+' : ''}${Math.round(((Number(data.current_nav) - Number(data.purchase_nav)) / Number(data.purchase_nav)) * 100)}%`}
            color={Number(data.current_nav) >= Number(data.purchase_nav) ? '#10B981' : '#EF4444'}
          />
        </div>
      )}
    </div>
  )
}

function FDForm({ data, onChange }) {
  const maturityDateStr = useMemo(() => {
    if (!data.start_date || !data.tenure_months) return null
    const d = addMonths(new Date(data.start_date), Number(data.tenure_months))
    return format(d, 'dd MMM yyyy')
  }, [data.start_date, data.tenure_months])

  const maturityValue = useMemo(() => {
    if (!data.principal || !data.interest_rate || !data.tenure_months || !data.interest_type) return null
    return computeFDMaturityValue(
      Math.round(Number(data.principal) * 100),
      Number(data.interest_rate),
      Number(data.tenure_months),
      data.interest_type
    )
  }, [data.principal, data.interest_rate, data.tenure_months, data.interest_type])

  const interestEarned = maturityValue ? maturityValue - Math.round(Number(data.principal) * 100) : null

  return (
    <div className="space-y-4">
      <Field label="Bank / Institution Name" required>
        <Input
          placeholder="e.g. SBI, HDFC Bank"
          value={data.bank_name || ''}
          onChange={(e) => onChange('bank_name', e.target.value)}
        />
      </Field>
      <Row>
        <Field label="Principal Amount (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="100000"
            value={data.principal || ''}
            onChange={(e) => onChange('principal', e.target.value)}
          />
        </Field>
        <Field label="Interest Rate (% p.a.)" required>
          <Input
            type="number"
            min="0"
            max="30"
            step="0.01"
            placeholder="7.25"
            value={data.interest_rate || ''}
            onChange={(e) => onChange('interest_rate', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Tenure (months)" required>
          <Input
            type="number"
            min="1"
            max="240"
            step="1"
            placeholder="12"
            value={data.tenure_months || ''}
            onChange={(e) => onChange('tenure_months', e.target.value)}
          />
        </Field>
        <Field label="Start Date" required>
          <Input
            type="date"
            value={data.start_date || ''}
            onChange={(e) => onChange('start_date', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Interest Type" required>
          <Select
            options={[
              { value: 'compound', label: 'Compound (Quarterly)' },
              { value: 'simple',   label: 'Simple' },
            ]}
            placeholder="Select type"
            value={data.interest_type || ''}
            onChange={(e) => onChange('interest_type', e.target.value)}
          />
        </Field>
        <Field label="Payout Type" required>
          <Select
            options={[
              { value: 'cumulative', label: 'Cumulative' },
              { value: 'monthly',    label: 'Monthly Payout' },
            ]}
            placeholder="Select payout"
            value={data.payout_type || ''}
            onChange={(e) => onChange('payout_type', e.target.value)}
          />
        </Field>
      </Row>
      {maturityDateStr && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}
        >
          <p className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider">Maturity Preview</p>
          <div className="flex gap-3">
            <PreviewPill label="Matures On" value={maturityDateStr} color="#06B6D4" />
            {maturityValue && (
              <PreviewPill
                label="Maturity Value"
                value={`₹${Math.round(maturityValue / 100).toLocaleString('en-IN')}`}
                color="#10B981"
              />
            )}
            {interestEarned && (
              <PreviewPill
                label="Interest Earned"
                value={`+₹${Math.round(interestEarned / 100).toLocaleString('en-IN')}`}
                color="#F59E0B"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PPFNPSForm({ data, onChange }) {
  const defaultRate = data.account_type === 'NPS' ? '10' : '7.1'
  return (
    <div className="space-y-4">
      <Field label="Account Type" required>
        <div className="flex gap-3">
          {['PPF', 'NPS'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange('account_type', t); if (!data.expected_return_rate) onChange('expected_return_rate', t === 'NPS' ? '10' : '7.1') }}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: data.account_type === t ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${data.account_type === t ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: data.account_type === t ? '#34D399' : 'rgba(255,255,255,0.4)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Row>
        <Field label="Annual Contribution (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="150000"
            value={data.annual_contribution || ''}
            onChange={(e) => onChange('annual_contribution', e.target.value)}
          />
        </Field>
        <Field label="Current Corpus (₹)" required hint="Balance currently in your account">
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="500000"
            value={data.current_corpus || ''}
            onChange={(e) => onChange('current_corpus', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Account Opening Date" required>
          <Input
            type="date"
            value={data.account_opening_date || ''}
            onChange={(e) => onChange('account_opening_date', e.target.value)}
          />
        </Field>
        <Field label="Expected Return Rate (%)" hint={`Default: ${defaultRate}%`}>
          <Input
            type="number"
            min="0"
            max="30"
            step="0.1"
            placeholder={defaultRate}
            value={data.expected_return_rate || ''}
            onChange={(e) => onChange('expected_return_rate', e.target.value)}
          />
        </Field>
      </Row>
    </div>
  )
}

function GoldForm({ data, onChange }) {
  const invested = data.quantity_grams && data.buy_price_per_gram
    ? Math.round(Number(data.quantity_grams) * Number(data.buy_price_per_gram))
    : null
  const current = data.quantity_grams && data.current_price_per_gram
    ? Math.round(Number(data.quantity_grams) * Number(data.current_price_per_gram))
    : null

  return (
    <div className="space-y-4">
      <Field label="Gold Form" required>
        <Select
          options={GOLD_FORMS}
          placeholder="Select form"
          value={data.form || ''}
          onChange={(e) => onChange('form', e.target.value)}
        />
      </Field>
      <Row>
        <Field label="Quantity (grams)" required>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="10.000"
            value={data.quantity_grams || ''}
            onChange={(e) => onChange('quantity_grams', e.target.value)}
          />
        </Field>
        <Field label="Buy Date" required>
          <Input
            type="date"
            value={data.buy_date || ''}
            onChange={(e) => onChange('buy_date', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Buy Price / gram (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="6200"
            value={data.buy_price_per_gram || ''}
            onChange={(e) => onChange('buy_price_per_gram', e.target.value)}
          />
        </Field>
        <Field label="Current Price / gram (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="7100"
            value={data.current_price_per_gram || ''}
            onChange={(e) => onChange('current_price_per_gram', e.target.value)}
          />
        </Field>
      </Row>
      {invested !== null && current !== null && (
        <div className="flex gap-3">
          <PreviewPill label="Invested" value={`₹${invested.toLocaleString('en-IN')}`} color="#F59E0B" />
          <PreviewPill label="Current Value" value={`₹${current.toLocaleString('en-IN')}`} color="#06B6D4" />
          <PreviewPill
            label="Gain / Loss"
            value={`${current >= invested ? '+' : ''}${Math.round(((current - invested) / invested) * 100)}%`}
            color={current >= invested ? '#10B981' : '#EF4444'}
          />
        </div>
      )}
    </div>
  )
}

function RealEstateForm({ data, onChange }) {
  const gain = data.purchase_price && data.current_estimated_value
    ? Math.round(Number(data.current_estimated_value)) - Math.round(Number(data.purchase_price))
    : null

  return (
    <div className="space-y-4">
      <Row>
        <Field label="Property Type" required>
          <Select
            options={PROPERTY_TYPES}
            placeholder="Select type"
            value={data.property_type || ''}
            onChange={(e) => onChange('property_type', e.target.value)}
          />
        </Field>
        <Field label="Purchase Date" required>
          <Input
            type="date"
            value={data.purchase_date || ''}
            onChange={(e) => onChange('purchase_date', e.target.value)}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Purchase Price (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="5000000"
            value={data.purchase_price || ''}
            onChange={(e) => onChange('purchase_price', e.target.value)}
          />
        </Field>
        <Field label="Current Estimated Value (₹)" required>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="7500000"
            value={data.current_estimated_value || ''}
            onChange={(e) => onChange('current_estimated_value', e.target.value)}
          />
        </Field>
      </Row>
      <Field label="Monthly Rental Income (₹)" hint="Leave blank if not rented">
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="25000"
          value={data.rental_income || ''}
          onChange={(e) => onChange('rental_income', e.target.value)}
        />
      </Field>
      {gain !== null && (
        <div className="flex gap-3">
          <PreviewPill
            label="Purchase Price"
            value={`₹${Math.round(Number(data.purchase_price)).toLocaleString('en-IN')}`}
            color="#F97316"
          />
          <PreviewPill
            label="Current Value"
            value={`₹${Math.round(Number(data.current_estimated_value)).toLocaleString('en-IN')}`}
            color="#06B6D4"
          />
          <PreviewPill
            label="Appreciation"
            value={`${gain >= 0 ? '+' : ''}${Math.round((gain / Number(data.purchase_price)) * 100)}%`}
            color={gain >= 0 ? '#10B981' : '#EF4444'}
          />
        </div>
      )}
    </div>
  )
}

// ─── Form renderer ────────────────────────────────────────────────────────────

function renderForm(assetClass, data, onChange) {
  switch (assetClass) {
    case 'stocks':      return <StocksForm      data={data} onChange={onChange} />
    case 'mutual_fund': return <MutualFundForm   data={data} onChange={onChange} />
    case 'fd':          return <FDForm           data={data} onChange={onChange} />
    case 'ppf_nps':     return <PPFNPSForm       data={data} onChange={onChange} />
    case 'gold':        return <GoldForm         data={data} onChange={onChange} />
    case 'real_estate': return <RealEstateForm   data={data} onChange={onChange} />
    default:            return null
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(assetClass, data) {
  const err = {}
  switch (assetClass) {
    case 'stocks':
      if (!data.name?.trim())        err.name         = 'Required'
      if (!data.quantity)            err.quantity     = 'Required'
      if (!data.buy_price)           err.buy_price    = 'Required'
      if (!data.current_price)       err.current_price = 'Required'
      if (!data.buy_date)            err.buy_date     = 'Required'
      break
    case 'mutual_fund':
      if (!data.name?.trim())        err.name         = 'Required'
      if (!data.fund_type)           err.fund_type    = 'Required'
      if (!data.units)               err.units        = 'Required'
      if (!data.purchase_nav)        err.purchase_nav = 'Required'
      if (!data.current_nav)         err.current_nav  = 'Required'
      if (!data.buy_date)            err.buy_date     = 'Required'
      break
    case 'fd':
      if (!data.bank_name?.trim())   err.bank_name    = 'Required'
      if (!data.principal)           err.principal    = 'Required'
      if (!data.interest_rate)       err.interest_rate = 'Required'
      if (!data.tenure_months)       err.tenure_months = 'Required'
      if (!data.start_date)          err.start_date   = 'Required'
      if (!data.interest_type)       err.interest_type = 'Required'
      if (!data.payout_type)         err.payout_type  = 'Required'
      break
    case 'ppf_nps':
      if (!data.account_type)        err.account_type = 'Required'
      if (!data.annual_contribution) err.annual_contribution = 'Required'
      if (!data.current_corpus)      err.current_corpus = 'Required'
      if (!data.account_opening_date) err.account_opening_date = 'Required'
      break
    case 'gold':
      if (!data.form)                err.form         = 'Required'
      if (!data.quantity_grams)      err.quantity_grams = 'Required'
      if (!data.buy_price_per_gram)  err.buy_price_per_gram = 'Required'
      if (!data.current_price_per_gram) err.current_price_per_gram = 'Required'
      if (!data.buy_date)            err.buy_date     = 'Required'
      break
    case 'real_estate':
      if (!data.property_type)       err.property_type = 'Required'
      if (!data.purchase_price)      err.purchase_price = 'Required'
      if (!data.current_estimated_value) err.current_estimated_value = 'Required'
      if (!data.purchase_date)       err.purchase_date = 'Required'
      break
    default: break
  }
  return err
}

// ─── Record builder (form data → DB record) ──────────────────────────────────

function buildRecord(assetClass, data) {
  const today = new Date().toISOString()

  switch (assetClass) {
    case 'stocks': {
      const buyPaise     = Math.round(Number(data.buy_price) * 100)
      const currentPaise = Math.round(Number(data.current_price) * 100)
      const ph = [{ date: data.buy_date, price: buyPaise }]
      if (currentPaise !== buyPaise) ph.push({ date: today.slice(0, 10), price: currentPaise })
      return {
        name:                data.name.trim(),
        ticker:              data.ticker?.trim() || '',
        sector:              data.sector || 'Other',
        quantity:            Number(data.quantity),
        buy_price_paise:     buyPaise,
        current_price_paise: currentPaise,
        buy_date:            data.buy_date,
        price_history:       ph,
      }
    }
    case 'mutual_fund': {
      const purchasePaise = Math.round(Number(data.purchase_nav) * 100)
      const currentPaise  = Math.round(Number(data.current_nav) * 100)
      const ph = [{ date: data.buy_date, price: purchasePaise }]
      if (currentPaise !== purchasePaise) ph.push({ date: today.slice(0, 10), price: currentPaise })
      return {
        name:               data.name.trim(),
        fund_type:          data.fund_type,
        units:              Number(data.units),
        purchase_nav_paise: purchasePaise,
        current_nav_paise:  currentPaise,
        buy_date:           data.buy_date,
        folio_number:       data.folio_number?.trim() || '',
        price_history:      ph,
      }
    }
    case 'fd': {
      const startDate    = new Date(data.start_date)
      const maturityDate = addMonths(startDate, Number(data.tenure_months))
      return {
        bank_name:       data.bank_name.trim(),
        principal_paise: Math.round(Number(data.principal) * 100),
        interest_rate:   Number(data.interest_rate),
        tenure_months:   Number(data.tenure_months),
        start_date:      data.start_date,
        maturity_date:   maturityDate.toISOString().slice(0, 10),
        interest_type:   data.interest_type,
        payout_type:     data.payout_type,
        price_history:   [],
      }
    }
    case 'ppf_nps': {
      const defaultRate = data.account_type === 'NPS' ? 10 : 7.1
      return {
        account_type:              data.account_type,
        annual_contribution_paise: Math.round(Number(data.annual_contribution) * 100),
        current_corpus_paise:      Math.round(Number(data.current_corpus) * 100),
        account_opening_date:      data.account_opening_date,
        expected_return_rate:      Number(data.expected_return_rate) || defaultRate,
        price_history:             [],
      }
    }
    case 'gold': {
      const buyPaise     = Math.round(Number(data.buy_price_per_gram) * 100)
      const currentPaise = Math.round(Number(data.current_price_per_gram) * 100)
      const ph = [{ date: data.buy_date, price: buyPaise }]
      if (currentPaise !== buyPaise) ph.push({ date: today.slice(0, 10), price: currentPaise })
      return {
        form:                          data.form,
        quantity_grams:                Number(data.quantity_grams),
        buy_price_per_gram_paise:      buyPaise,
        current_price_per_gram_paise:  currentPaise,
        buy_date:                      data.buy_date,
        price_history:                 ph,
      }
    }
    case 'real_estate':
      return {
        property_type:                 data.property_type,
        purchase_price_paise:          Math.round(Number(data.purchase_price) * 100),
        current_estimated_value_paise: Math.round(Number(data.current_estimated_value) * 100),
        purchase_date:                 data.purchase_date,
        rental_income_paise:           data.rental_income ? Math.round(Number(data.rental_income) * 100) : 0,
        price_history:                 [],
      }
    default:
      return {}
  }
}

// ─── Edit: hydrate form from saved record ────────────────────────────────────

function hydrateForm(inv) {
  if (!inv) return {}
  const ac = inv.asset_class
  switch (ac) {
    case 'stocks':
      return {
        name:          inv.name || '',
        ticker:        inv.ticker || '',
        sector:        inv.sector || '',
        quantity:      String(inv.quantity || ''),
        buy_price:     String((inv.buy_price_paise || 0) / 100),
        current_price: String((inv.current_price_paise || 0) / 100),
        buy_date:      inv.buy_date || '',
      }
    case 'mutual_fund':
      return {
        name:         inv.name || '',
        fund_type:    inv.fund_type || '',
        units:        String(inv.units || ''),
        purchase_nav: String((inv.purchase_nav_paise || 0) / 100),
        current_nav:  String((inv.current_nav_paise || 0) / 100),
        buy_date:     inv.buy_date || '',
        folio_number: inv.folio_number || '',
      }
    case 'fd':
      return {
        bank_name:     inv.bank_name || '',
        principal:     String((inv.principal_paise || 0) / 100),
        interest_rate: String(inv.interest_rate || ''),
        tenure_months: String(inv.tenure_months || ''),
        start_date:    inv.start_date || '',
        interest_type: inv.interest_type || '',
        payout_type:   inv.payout_type || '',
      }
    case 'ppf_nps':
      return {
        account_type:          inv.account_type || 'PPF',
        annual_contribution:   String((inv.annual_contribution_paise || 0) / 100),
        current_corpus:        String((inv.current_corpus_paise || 0) / 100),
        account_opening_date:  inv.account_opening_date || '',
        expected_return_rate:  String(inv.expected_return_rate || ''),
      }
    case 'gold':
      return {
        form:                     inv.form || '',
        quantity_grams:           String(inv.quantity_grams || ''),
        buy_price_per_gram:       String((inv.buy_price_per_gram_paise || 0) / 100),
        current_price_per_gram:   String((inv.current_price_per_gram_paise || 0) / 100),
        buy_date:                 inv.buy_date || '',
      }
    case 'real_estate':
      return {
        property_type:           inv.property_type || '',
        purchase_price:          String((inv.purchase_price_paise || 0) / 100),
        current_estimated_value: String((inv.current_estimated_value_paise || 0) / 100),
        purchase_date:           inv.purchase_date || '',
        rental_income:           inv.rental_income_paise ? String(inv.rental_income_paise / 100) : '',
      }
    default:
      return {}
  }
}

// ─── Step 1: Asset class selector ────────────────────────────────────────────

function AssetClassSelector({ onSelect }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 text-center">What type of asset do you want to track?</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ASSET_CLASSES.map((ac) => (
          <button
            key={ac.key}
            disabled={ac.disabled}
            onClick={() => !ac.disabled && onSelect(ac.key)}
            className="relative flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: ac.disabled ? 'rgba(255,255,255,0.03)' : `${ac.color}0d`,
              border: `1px solid ${ac.disabled ? 'rgba(255,255,255,0.06)' : `${ac.color}30`}`,
            }}
          >
            {ac.disabled && (
              <div
                className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider text-white/60"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                Soon
              </div>
            )}
            <span className="text-2xl">{ac.icon}</span>
            <div>
              <p className="text-xs font-semibold text-white/80">{ac.label}</p>
              <p className="text-[10px] text-white/35 mt-0.5">{ac.desc}</p>
            </div>
            {!ac.disabled && (
              <ChevronRight className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-white/20" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function AddInvestmentModal({ onClose, onSaved, editInvestment = null }) {
  const cryptoKey = useAppStore((s) => s.cryptoKey)

  const initClass = editInvestment?.asset_class ?? null
  const [selectedClass, setSelectedClass] = useState(initClass)
  const [formData,      setFormData]      = useState(hydrateForm(editInvestment))
  const [errors,        setErrors]        = useState({})
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState('')

  const assetMeta = ASSET_CLASSES.find((a) => a.key === selectedClass)

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const e = { ...prev }; delete e[field]; return e })
  }

  function handleSelectClass(key) {
    setSelectedClass(key)
    setFormData({})
    setErrors({})
    setSaveError('')
  }

  async function handleSave() {
    const errs = validate(selectedClass, formData)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    setSaveError('')
    try {
      const record = buildRecord(selectedClass, formData)
      record.asset_class = selectedClass // stored plaintext for indexing

      if (editInvestment) {
        // Preserve price_history from existing record when editing (don't wipe it)
        if (!record.price_history || !record.price_history.length) {
          record.price_history = editInvestment.price_history ?? []
        }
        await encryptAndUpdate(
          'investments',
          editInvestment.id,
          record,
          cryptoKey,
          ['asset_class']
        )
      } else {
        await encryptAndSave('investments', record, cryptoKey, ['asset_class'])
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error('[AddInvestmentModal] save failed:', err)
      setSaveError('Save failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col shadow-2xl"
        style={{
          background: '#1C1B29',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            {selectedClass && !editInvestment && (
              <button
                onClick={() => setSelectedClass(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {assetMeta && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                style={{ background: `${assetMeta.color}18` }}
              >
                {assetMeta.icon}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white">
                {editInvestment
                  ? `Edit ${assetMeta?.label ?? 'Investment'}`
                  : selectedClass
                    ? `Add ${assetMeta?.label ?? 'Investment'}`
                    : 'Add Investment'}
              </p>
              {selectedClass && (
                <p className="text-[10px] text-white/35 mt-0.5">{assetMeta?.desc}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!selectedClass
            ? <AssetClassSelector onSelect={handleSelectClass} />
            : renderForm(selectedClass, formData, handleChange)
          }
        </div>

        {/* Footer */}
        {selectedClass && (
          <div
            className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            {saveError
              ? <p className="text-xs text-red-400">{saveError}</p>
              : Object.keys(errors).length > 0
                ? <p className="text-xs text-amber-400">Please fill in all required fields</p>
                : <span />
            }
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                style={{
                  background: assetMeta?.color ?? '#6366F1',
                }}
              >
                {saving ? 'Saving…' : editInvestment ? 'Save Changes' : 'Add Investment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
