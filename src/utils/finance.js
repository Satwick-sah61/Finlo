// Financial constants, category definitions, and calculation helpers

export const INCOME_TYPES = [
  { value: 'salary', label: 'Salary', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  { value: 'freelance', label: 'Freelance / Consulting', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'business', label: 'Business Income', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { value: 'rental', label: 'Rental Income', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  { value: 'interest', label: 'Interest / Dividends', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  { value: 'pension', label: 'Pension / Allowance', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'side_hustle', label: 'Side Hustle', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  { value: 'other', label: 'Other', color: 'text-white/50 bg-white/5 border-white/10' },
]

export const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly', perYear: 12 },
  { value: 'weekly', label: 'Weekly', perYear: 52 },
  { value: 'fortnightly', label: 'Fortnightly', perYear: 26 },
  { value: 'quarterly', label: 'Quarterly', perYear: 4 },
  { value: 'annual', label: 'Annual', perYear: 1 },
]

// Monthly equivalent in paise — integer math only
export function toMonthlyPaise(amountPaise, frequency) {
  const opt = FREQUENCY_OPTIONS.find((f) => f.value === frequency)
  if (!opt) return amountPaise
  return Math.round((amountPaise * opt.perYear) / 12)
}

export const EXPENSE_CATEGORIES = [
  {
    id: 'housing',
    label: 'Housing',
    emoji: '🏠',
    hint: 'Rent, maintenance, electricity, water, internet',
    subcategories: ['Rent / Home Loan EMI', 'Maintenance', 'Electricity', 'Water & Gas', 'Internet', 'Other'],
    color: 'text-blue-400 bg-blue-500/10',
    barColor: '#3B82F6',
  },
  {
    id: 'food',
    label: 'Food',
    emoji: '🍽️',
    hint: 'Groceries, dining out, delivery, subscriptions',
    subcategories: ['Groceries', 'Dining Out', 'Food Delivery', 'Milk / Subscription', 'Other'],
    color: 'text-orange-400 bg-orange-500/10',
    barColor: '#F97316',
  },
  {
    id: 'transport',
    label: 'Transport',
    emoji: '🚗',
    hint: 'Fuel, metro, cab, vehicle EMI, parking',
    subcategories: ['Fuel', 'Metro / Bus', 'Cab (Ola/Uber)', 'Vehicle EMI', 'Parking & Toll', 'Other'],
    color: 'text-yellow-400 bg-yellow-500/10',
    barColor: '#EAB308',
  },
  {
    id: 'health',
    label: 'Health',
    emoji: '🏥',
    hint: 'Insurance, medicine, doctor, gym',
    subcategories: ['Insurance Premium', 'Medicine', 'Doctor / Hospital', 'Gym & Fitness', 'Other'],
    color: 'text-red-400 bg-red-500/10',
    barColor: '#EF4444',
  },
  {
    id: 'education',
    label: 'Education',
    emoji: '📚',
    hint: 'School fees, courses, books, coaching',
    subcategories: ['School / College Fees', 'Online Courses', 'Books & Stationery', 'Coaching / Tuition', 'Other'],
    color: 'text-indigo-400 bg-indigo-500/10',
    barColor: '#6366F1',
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    emoji: '✨',
    hint: 'Clothing, personal care, entertainment, OTT',
    subcategories: ['Clothing', 'Personal Care / Salon', 'Entertainment', 'OTT Subscriptions', 'Other'],
    color: 'text-pink-400 bg-pink-500/10',
    barColor: '#EC4899',
  },
  {
    id: 'family',
    label: 'Family',
    emoji: '👨‍👩‍👧',
    hint: 'Parents, spouse, children, gifts',
    subcategories: ['Parents', 'Spouse', 'Children', 'Gifts', 'Other'],
    color: 'text-violet-400 bg-violet-500/10',
    barColor: '#8B5CF6',
  },
  {
    id: 'loans',
    label: 'Loans',
    emoji: '💳',
    hint: 'EMI payments tracked here, linked to loan records later',
    subcategories: ['Home Loan EMI', 'Car Loan EMI', 'Personal Loan EMI', 'Other EMI'],
    color: 'text-rose-400 bg-rose-500/10',
    barColor: '#F43F5E',
  },
  {
    id: 'savings',
    label: 'Savings',
    emoji: '💰',
    hint: 'SIP, RD, FD contributions — linked to investments later',
    subcategories: ['SIP', 'Recurring Deposit', 'Fixed Deposit', 'PPF / NPS', 'Other'],
    color: 'text-emerald-400 bg-emerald-500/10',
    barColor: '#10B981',
  },
  {
    id: 'miscellaneous',
    label: 'Miscellaneous',
    emoji: '📦',
    hint: 'Shopping, subscriptions, donations, other',
    subcategories: ['Shopping', 'Subscriptions', 'Donations', 'Other'],
    color: 'text-slate-400 bg-slate-500/10',
    barColor: '#94A3B8',
  },
]

export function getCategoryMeta(categoryId) {
  return EXPENSE_CATEGORIES.find((c) => c.id === categoryId) ?? EXPENSE_CATEGORIES.at(-1)
}

// Simple health score 0–100 — used by Dashboard and AI context
export function computeHealthScore({ savingsRate = 0, hasGoals = false, hasLoans = false, emergencyMonths = 0 }) {
  let score = 0
  score += Math.min(40, Math.round((savingsRate / 20) * 40)) // savings rate (0–40 pts)
  score += Math.min(25, Math.round((emergencyMonths / 6) * 25)) // emergency fund (0–25 pts)
  if (hasGoals) score += 10
  if (!hasLoans) score += 25
  return Math.max(0, Math.min(100, score))
}
