// Pure amortization math — no React, no side effects, no external imports.
// All monetary values in paise (integers). Annual rate in percent (e.g. 8.5).

export const LOAN_TYPES = {
  home_loan:      { label: 'Home Loan',      icon: '🏠', color: '#6366F1' },
  car_loan:       { label: 'Car Loan',       icon: '🚗', color: '#06B6D4' },
  personal_loan:  { label: 'Personal Loan',  icon: '👤', color: '#F59E0B' },
  education_loan: { label: 'Education Loan', icon: '🎓', color: '#10B981' },
  gold_loan:      { label: 'Gold Loan',      icon: '🥇', color: '#EAB308' },
  credit_card:    { label: 'Credit Card',    icon: '💳', color: '#EF4444' },
  business_loan:  { label: 'Business Loan',  icon: '🏢', color: '#8B5CF6' },
  other:          { label: 'Other',          icon: '📋', color: '#6B7280' },
}

// EMI = P × r × (1+r)^n / ((1+r)^n − 1)
// Returns integer paise.
export function calculateEMI(principalPaise, annualRatePct, tenureMonths) {
  if (!principalPaise || !tenureMonths) return 0
  if (annualRatePct === 0) return Math.round(principalPaise / tenureMonths)
  const r = annualRatePct / 12 / 100
  const pow = Math.pow(1 + r, tenureMonths)
  return Math.round(principalPaise * r * pow / (pow - 1))
}

// n = log(E / (E − P×r)) / log(1+r)
// Returns integer months, or null if EMI is too small to cover monthly interest.
export function calculateTenure(principalPaise, annualRatePct, emiPaise) {
  if (!principalPaise || !emiPaise) return null
  if (annualRatePct === 0) return Math.ceil(principalPaise / emiPaise)
  const r = annualRatePct / 12 / 100
  const minPayment = principalPaise * r
  if (emiPaise <= minPayment) return null
  return Math.ceil(Math.log(emiPaise / (emiPaise - minPayment)) / Math.log(1 + r))
}

// Generates a standard amortization schedule.
// Each period: { period, emi, principal, interest, outstanding }
// Returns { emi, schedule, totalInterest, totalPayment }
export function generateAmortization(principalPaise, annualRatePct, tenureMonths) {
  const emi = calculateEMI(principalPaise, annualRatePct, tenureMonths)
  const r = annualRatePct / 12 / 100
  let outstanding = principalPaise
  const schedule = []

  for (let i = 0; i < tenureMonths && outstanding > 0; i++) {
    const interest = annualRatePct === 0 ? 0 : Math.round(outstanding * r)
    const principal = Math.min(emi - interest, outstanding)
    outstanding = Math.max(0, outstanding - principal)
    schedule.push({ period: i + 1, emi: principal + interest, principal, interest, outstanding })
  }

  const totalInterest = schedule.reduce((s, p) => s + p.interest, 0)
  const totalPayment  = schedule.reduce((s, p) => s + p.emi, 0)
  return { emi, schedule, totalInterest, totalPayment }
}

// Amortization with extra monthly payment on top of base EMI.
// Caps at 600 periods to prevent infinite loop if extra === 0.
// Returns { schedule, totalInterest, totalPayment }
export function generateAmortizationWithExtra(principalPaise, annualRatePct, emiPaise, extraMonthlyPaise) {
  const r = annualRatePct / 12 / 100
  let outstanding = principalPaise
  const schedule = []

  while (outstanding > 0 && schedule.length < 600) {
    const interest = annualRatePct === 0 ? 0 : Math.round(outstanding * r)
    const payment = Math.min(emiPaise + extraMonthlyPaise, outstanding + interest)
    const principal = Math.max(0, payment - interest)
    outstanding = Math.max(0, outstanding - principal)
    schedule.push({
      period: schedule.length + 1,
      emi: payment,
      principal,
      interest,
      outstanding,
    })
    if (outstanding === 0) break
  }

  const totalInterest = schedule.reduce((s, p) => s + p.interest, 0)
  const totalPayment  = schedule.reduce((s, p) => s + p.emi, 0)
  return { schedule, totalInterest, totalPayment }
}
