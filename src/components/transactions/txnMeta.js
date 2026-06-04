/**
 * txnMeta — shared transaction-type metadata (icon + color + label).
 */
import { ArrowDownLeft, CreditCard, TrendingUp, Target, ShoppingCart } from 'lucide-react'

export const TXN_META = {
  income:      { label: 'Income',       color: '#10B981', icon: ArrowDownLeft },
  loan_emi:    { label: 'Loan EMI',     color: '#EF4444', icon: CreditCard },
  sip:         { label: 'SIP',          color: '#8B5CF6', icon: TrendingUp },
  goal_saving: { label: 'Goal Saving',  color: '#06B6D4', icon: Target },
  expense:     { label: 'Expense',      color: '#94A3B8', icon: ShoppingCart },
}
