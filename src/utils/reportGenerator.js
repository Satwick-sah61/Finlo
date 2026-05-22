import { format } from 'date-fns'
import { formatINRFromPaise, formatINRCompact } from './currency.js'
import { getCategoryMeta } from './finance.js'

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function row(...cells) {
  return `<tr>${cells.map((c, i) => `<td class="${i === cells.length - 1 ? 'num' : ''}">${c}</td>`).join('')}</tr>`
}

export function generateReport({ summary, incomeStreams, monthlyHistory, activeLoans = [] }) {
  const {
    totalMonthlyIncomePaise,
    totalMonthlyExpensesPaise,
    surplusPaise,
    savingsRate,
    expenseByCategory,
    healthScore,
  } = summary

  const now = new Date()
  const monthLabel = format(now, 'MMMM yyyy')
  const generatedAt = format(now, "d MMM yyyy, h:mm a")

  // Expense category rows
  const catRows = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => {
      const meta = getCategoryMeta(cat)
      const pct = totalMonthlyExpensesPaise > 0
        ? Math.round((amt / totalMonthlyExpensesPaise) * 100)
        : 0
      return row(esc(meta?.label ?? cat), `${pct}%`, esc(formatINRFromPaise(amt)))
    })
    .join('')

  // Income stream rows
  const streamRows = incomeStreams
    .map((s) => row(esc(s.name), esc(s.frequency ?? '—'), esc(formatINRFromPaise(Number(s.amount) || 0))))
    .join('')

  // Monthly history rows
  const histRows = [...monthlyHistory]
    .reverse()
    .slice(0, 6)
    .map((m) => {
      const sr = m.income > 0 ? Math.round((m.surplus / m.income) * 100) : 0
      const surplusColor = m.surplus >= 0 ? '#22C55E' : '#EF4444'
      return `<tr>
        <td>${esc(m.label)}</td>
        <td class="num">${esc(formatINRCompact(m.income))}</td>
        <td class="num">${esc(formatINRCompact(m.expenses))}</td>
        <td class="num" style="color:${surplusColor}">${m.surplus >= 0 ? '' : '−'}${esc(formatINRCompact(Math.abs(m.surplus)))}</td>
        <td class="num">${sr}%</td>
      </tr>`
    })
    .join('')

  const scoreColor = healthScore >= 70 ? '#22C55E' : healthScore >= 40 ? '#F59E0B' : '#EF4444'

  // Loan rows
  const totalEMIPaise     = activeLoans.reduce((s, l) => s + (l._emi ?? 0), 0)
  const totalOutstanding  = activeLoans.reduce((s, l) => s + (l._outstandingPaise ?? 0), 0)
  const totalInterestLeft = activeLoans.reduce((s, l) => s + (l._interestRemaining ?? 0), 0)
  const dtiPct = totalMonthlyIncomePaise > 0
    ? Math.round((totalEMIPaise / totalMonthlyIncomePaise) * 100)
    : null

  const loanRows = activeLoans
    .sort((a, b) => (b._outstandingPaise ?? 0) - (a._outstandingPaise ?? 0))
    .map(l => `<tr>
      <td>${esc(l.name)}</td>
      <td>${esc(l.lender || '—')}</td>
      <td class="num">${esc(l.annual_rate)}%</td>
      <td class="num">${esc(formatINRCompact(l._outstandingPaise ?? 0))}</td>
      <td class="num">${esc(formatINRCompact(l._emi ?? 0))}</td>
      <td class="num">${l._monthsRemaining ?? '—'} mo</td>
    </tr>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Finio Financial Report — ${esc(monthLabel)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-family: Inter, system-ui, sans-serif; font-size: 14px; color: #1a1a2e; }
  body { background: #fff; padding: 48px 40px; max-width: 860px; margin: 0 auto; }
  h1 { font-size: 26px; font-weight: 700; color: #1a1a2e; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6366F1; margin-bottom: 12px; margin-top: 32px; }
  .subtitle { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .header { border-bottom: 2px solid #6366F1; padding-bottom: 20px; margin-bottom: 32px; }
  .badge { display: inline-block; background: #6366F1; color: #fff; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; vertical-align: middle; margin-left: 10px; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 8px; }
  .stat { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin-bottom: 6px; }
  .stat-value { font-size: 20px; font-weight: 700; }
  .green { color: #22C55E; } .red { color: #EF4444; } .amber { color: #F59E0B; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 9px 10px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 24px 20px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Finio Financial Report <span class="badge">${esc(monthLabel)}</span></h1>
  <p class="subtitle">Generated on ${esc(generatedAt)} · All data is stored locally on your device</p>
</div>

<h2>Summary</h2>
<div class="stat-grid">
  <div class="stat">
    <div class="stat-label">Monthly Income</div>
    <div class="stat-value green">${esc(formatINRFromPaise(totalMonthlyIncomePaise))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Monthly Expenses</div>
    <div class="stat-value" style="color:#F97316">${esc(formatINRFromPaise(totalMonthlyExpensesPaise))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">${surplusPaise >= 0 ? 'Surplus' : 'Deficit'}</div>
    <div class="stat-value ${surplusPaise >= 0 ? 'green' : 'red'}">${surplusPaise < 0 ? '−' : ''}${esc(formatINRFromPaise(Math.abs(surplusPaise)))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Savings Rate</div>
    <div class="stat-value ${savingsRate >= 20 ? 'green' : savingsRate >= 10 ? 'amber' : 'red'}">${savingsRate}%</div>
  </div>
</div>
<p style="font-size:12px;color:#9ca3af;margin-top:8px">
  Financial Health Score: <strong style="color:${scoreColor}">${healthScore}/100</strong>
</p>

<h2>Expense Breakdown</h2>
${Object.keys(expenseByCategory).length > 0 ? `
<table>
  <thead><tr><th>Category</th><th>Share</th><th class="num">Amount</th></tr></thead>
  <tbody>${catRows}</tbody>
</table>` : '<p style="color:#9ca3af;font-size:13px">No expenses recorded this month.</p>'}

<h2>Income Streams</h2>
${incomeStreams.length > 0 ? `
<table>
  <thead><tr><th>Source</th><th>Frequency</th><th class="num">Monthly Amount</th></tr></thead>
  <tbody>${streamRows}</tbody>
</table>` : '<p style="color:#9ca3af;font-size:13px">No income streams configured.</p>'}

${activeLoans.length > 0 ? `
<h2>Active Loans</h2>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
  <div class="stat">
    <div class="stat-label">Total Outstanding</div>
    <div class="stat-value red">${esc(formatINRCompact(totalOutstanding))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Monthly EMIs</div>
    <div class="stat-value" style="color:#F97316">${esc(formatINRCompact(totalEMIPaise))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Debt-to-Income</div>
    <div class="stat-value ${dtiPct === null ? '' : dtiPct >= 40 ? 'red' : dtiPct >= 30 ? 'amber' : 'green'}">${dtiPct !== null ? `${dtiPct}%` : '—'}</div>
  </div>
</div>
<table>
  <thead><tr><th>Loan Name</th><th>Lender</th><th class="num">Rate</th><th class="num">Outstanding</th><th class="num">EMI</th><th class="num">Remaining</th></tr></thead>
  <tbody>${loanRows}</tbody>
</table>
${totalInterestLeft > 0 ? `<p style="font-size:12px;color:#9ca3af;margin-top:8px">Total interest remaining across all loans: <strong style="color:#EF4444">${esc(formatINRCompact(totalInterestLeft))}</strong></p>` : ''}
` : ''}

<h2>Monthly Cash Flow History</h2>
${monthlyHistory.length > 0 ? `
<table>
  <thead><tr><th>Month</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Surplus</th><th class="num">Rate</th></tr></thead>
  <tbody>${histRows}</tbody>
</table>` : '<p style="color:#9ca3af;font-size:13px">No history available.</p>'}

<div class="footer">
  <span>Finio · Privacy-first personal finance</span>
  <span>${esc(generatedAt)}</span>
</div>
</body>
</html>`
}
