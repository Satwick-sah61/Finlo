// Generates a printable bank-style payment receipt.
// Opens in a new tab; user can File → Print → Save as PDF from the browser.

import { format } from 'date-fns'
import { LOAN_TYPES } from './amortization.js'

function rupeesFromPaise(paise) {
  const amount = (paise ?? 0) / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function openPaymentReceipt(loan, payment) {
  const meta      = LOAN_TYPES[loan.type] || LOAN_TYPES.other
  const receiptNo = `FINIO-${loan.id}-P${payment.period}`
  const printDate = format(new Date(), 'dd MMMM yyyy, hh:mm a')
  const payDate   = payment.date
    ? format(new Date(payment.date), 'dd MMMM yyyy')
    : '—'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Payment Receipt — ${loan.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; color: #111; }
    .page { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }

    /* Header */
    .header { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; padding: 32px 36px 24px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .brand-sub { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    .receipt-tag { background: rgba(255,255,255,0.18); border-radius: 6px; padding: 4px 12px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
    .header-title { margin-top: 20px; font-size: 15px; opacity: 0.85; }
    .header-loan { font-size: 20px; font-weight: 700; margin-top: 4px; }

    /* Status banner */
    .status { background: #ECFDF5; border-left: 4px solid #10B981; padding: 12px 36px; display: flex; align-items: center; gap: 10px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #10B981; flex-shrink: 0; }
    .status-text { font-size: 13px; font-weight: 600; color: #065F46; }
    .status-sub { font-size: 11px; color: #6EE7B7; margin-top: 1px; }

    /* Body */
    .body { padding: 28px 36px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #9CA3AF; margin-bottom: 14px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 0; border-bottom: 1px solid #F3F4F6; }
    .row:last-child { border-bottom: none; }
    .row-label { font-size: 13px; color: #6B7280; }
    .row-value { font-size: 13px; font-weight: 600; color: #111; text-align: right; }
    .row-value.green { color: #059669; }
    .row-value.red   { color: #DC2626; }
    .row-value.big   { font-size: 20px; color: #4F46E5; }

    /* Amount box */
    .amount-box { background: #F5F3FF; border-radius: 10px; padding: 18px 24px; margin: 20px 0; text-align: center; }
    .amount-label { font-size: 11px; color: #7C3AED; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
    .amount-value { font-size: 32px; font-weight: 800; color: #4F46E5; margin-top: 4px; letter-spacing: -1px; }

    /* Breakdown */
    .breakdown { background: #FAFAFA; border-radius: 10px; padding: 16px 20px; margin: 16px 0; }
    .breakdown-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; }
    .breakdown-label { color: #6B7280; }
    .breakdown-value { font-weight: 600; }
    .breakdown-value.indigo { color: #4F46E5; }
    .breakdown-value.red    { color: #DC2626; }
    .divider { border: none; border-top: 1px dashed #E5E7EB; margin: 6px 0; }

    /* Footer */
    .footer { border-top: 1px solid #F3F4F6; padding: 20px 36px; display: flex; justify-content: space-between; align-items: center; }
    .footer-note { font-size: 10px; color: #9CA3AF; line-height: 1.5; }
    .footer-receipt { font-size: 10px; color: #9CA3AF; text-align: right; }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; max-width: 100%; border-radius: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-top">
        <div>
          <div class="brand">Finio</div>
          <div class="brand-sub">Personal Finance Vault</div>
        </div>
        <div class="receipt-tag">PAYMENT RECEIPT</div>
      </div>
      <div class="header-title">${meta.icon} ${meta.label}</div>
      <div class="header-loan">${loan.name}</div>
    </div>

    <div class="status">
      <div class="status-dot"></div>
      <div>
        <div class="status-text">EMI Payment Recorded</div>
        <div class="status-sub">Period ${payment.period} of ${loan._schedule?.length ?? loan.tenure_months ?? '?'} · ${payDate}</div>
      </div>
    </div>

    <div class="body">
      <div class="amount-box">
        <div class="amount-label">Amount Paid</div>
        <div class="amount-value">${rupeesFromPaise(payment.emi_paise)}</div>
      </div>

      <div class="breakdown">
        <div class="breakdown-row">
          <span class="breakdown-label">Principal component</span>
          <span class="breakdown-value indigo">${rupeesFromPaise(payment.principal_paise)}</span>
        </div>
        <hr class="divider" />
        <div class="breakdown-row">
          <span class="breakdown-label">Interest component</span>
          <span class="breakdown-value red">${rupeesFromPaise(payment.interest_paise)}</span>
        </div>
      </div>

      <p class="section-title">Loan Details</p>
      <div class="row">
        <span class="row-label">Lender</span>
        <span class="row-value">${loan.lender || '—'}</span>
      </div>
      <div class="row">
        <span class="row-label">Interest Rate</span>
        <span class="row-value">${loan.annual_rate}% per annum</span>
      </div>
      <div class="row">
        <span class="row-label">Outstanding After</span>
        <span class="row-value red">${rupeesFromPaise(loan._schedule?.[payment.period - 1]?.outstanding ?? 0)}</span>
      </div>
      <div class="row">
        <span class="row-label">Periods Remaining</span>
        <span class="row-value">${(loan._schedule?.length ?? 0) - payment.period} months</span>
      </div>
    </div>

    <div class="footer">
      <div class="footer-note">
        Generated by Finio · All data stored locally on your device<br/>
        This receipt is for personal record-keeping only
      </div>
      <div class="footer-receipt">
        Receipt: ${receiptNo}<br/>
        Printed: ${printDate}
      </div>
    </div>
  </div>

  <script>
    window.onload = function() { window.print() }
  </script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
