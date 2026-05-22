// All monetary values in Finio are integers in paise (1 INR = 100 paise)
// Never use floating point for money — always go through these helpers
// Using dinero.js v2-alpha API

import { dinero, add, subtract, multiply, toDecimal, compare, lessThan, greaterThan } from 'dinero.js'

// INR is not yet exported in the alpha bundle — defined per ISO 4217
const INR = { code: 'INR', base: 10, exponent: 2 }

export function fromRupees(rupees) {
  const paise = Math.round(Number(rupees) * 100)
  return dinero({ amount: paise, currency: INR })
}

export function fromPaise(paise) {
  return dinero({ amount: Math.round(paise), currency: INR })
}

export function toRupees(d) {
  return Number(toDecimal(d))
}

export function toPaise(d) {
  return Math.round(toRupees(d) * 100)
}

export function formatINR(d, opts = {}) {
  const amount = toRupees(d)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(amount)
}

export function formatINRFromPaise(paise, opts = {}) {
  return formatINR(fromPaise(paise), opts)
}

export function formatINRCompact(paise) {
  const amount = paise / 100
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)}L`
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function addMoney(a, b) { return add(a, b) }
export function subtractMoney(a, b) { return subtract(a, b) }
export function multiplyMoney(d, factor) { return multiply(d, factor) }
export function compareMoney(a, b) { return compare(a, b) }
export function isLess(a, b) { return lessThan(a, b) }
export function isGreater(a, b) { return greaterThan(a, b) }

export { dinero, INR }
