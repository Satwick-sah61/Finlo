import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { formatINRCompact } from '../../utils/currency.js'

const TOOLTIP_STYLE = {
  background: '#1C1B29',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

function NetWorthTooltip({ active, payload, label, totalOutstanding }) {
  if (!active || !payload?.length) return null
  const savings = payload[0]?.value ?? 0
  const liabilities = totalOutstanding ?? 0
  const netWorth = savings - liabilities
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Savings</span>
          <span style={{ color: '#06B6D4', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
            {savings >= 0 ? '' : '−'}{formatINRCompact(Math.abs(savings))}
          </span>
        </div>
        {liabilities > 0 && (
          <>
            <div className="flex justify-between gap-6">
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Liabilities</span>
              <span style={{ color: '#EF4444', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                −{formatINRCompact(liabilities)}
              </span>
            </div>
            <div className="border-t border-white/10 pt-1 flex justify-between gap-6">
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Net Worth</span>
              <span style={{
                color: netWorth >= 0 ? '#10B981' : '#EF4444',
                fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
              }}>
                {netWorth >= 0 ? '' : '−'}{formatINRCompact(Math.abs(netWorth))}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CurrentMonthLabel({ viewBox }) {
  if (!viewBox) return null
  return (
    <text
      x={viewBox.x}
      y={viewBox.y - 8}
      fill="#06B6D4"
      fontSize={10}
      textAnchor="middle"
      fontFamily="Inter, sans-serif"
    >
      Now
    </text>
  )
}

function LiabilityLabel({ viewBox }) {
  if (!viewBox) return null
  return (
    <text
      x={(viewBox.x ?? 0) + 8}
      y={(viewBox.y ?? 0) - 5}
      fill="#EF4444"
      fontSize={10}
      fontFamily="Inter, sans-serif"
    >
      Liabilities
    </text>
  )
}

export default function NetWorthChart({ monthlyHistory, totalOutstanding = 0 }) {
  if (!monthlyHistory?.length) return null

  let running = 0
  const chartData = monthlyHistory.map((m) => {
    running += m.surplus
    return { label: m.label, netWorth: running }
  })

  const hasData = monthlyHistory.some((m) => Math.abs(m.surplus) > 0)
  const currentLabel = chartData.at(-1)?.label

  const tickStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11 }
  const allValues = chartData.map((d) => d.netWorth)
  // Include liabilities line in domain calculation
  const liabilityLine = totalOutstanding > 0 ? -totalOutstanding : 0
  const minVal = Math.min(...allValues, liabilityLine, 0)
  const maxVal = Math.max(...allValues, 1)

  const pad = (maxVal - minVal) * 0.12 || 1000
  const yDomain = [minVal - pad, maxVal + pad]

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <p className="text-xs text-white/30 text-center">
          Log income and expenses to track your net worth growth
        </p>
      </div>
    )
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tickFormatter={(v) => formatINRCompact(Math.abs(v))}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={yDomain}
          />
          <Tooltip
            content={<NetWorthTooltip totalOutstanding={totalOutstanding} />}
            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
          />

          {minVal < 0 && (
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          )}

          <ReferenceLine
            x={currentLabel}
            stroke="rgba(6,182,212,0.3)"
            strokeDasharray="4 3"
            label={<CurrentMonthLabel />}
          />

          {totalOutstanding > 0 && (
            <ReferenceLine
              y={-totalOutstanding}
              stroke="rgba(239,68,68,0.45)"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={<LiabilityLabel />}
            />
          )}

          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="#06B6D4"
            strokeWidth={2.5}
            fill="url(#nwGrad)"
            dot={false}
            activeDot={{ r: 5, fill: '#0F0E17', stroke: '#06B6D4', strokeWidth: 2 }}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
