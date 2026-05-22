// NEW — src/components/charts/HealthScoreGauge.jsx
// D3.js semicircle arc gauge with animated needle.
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const W = 280
const H = 178
const CX = W / 2        // 140
const CY = H - 28       // 150 — pivot at bottom-center of SVG
const R_OUTER = 108
const R_INNER = 76
const NEEDLE_LENGTH = R_INNER - 6

// Score 0 maps to -π/2 (left), score 100 maps to +π/2 (right)
const angleScale = d3.scaleLinear().domain([0, 100]).range([-Math.PI / 2, Math.PI / 2])

const ZONES = [
  { min: 0,  max: 40,  color: '#EF4444' },  // red
  { min: 40, max: 70,  color: '#F59E0B' },  // amber
  { min: 70, max: 100, color: '#22C55E' },  // green
]

function scoreColor(score) {
  if (score <= 40) return '#EF4444'
  if (score <= 70) return '#F59E0B'
  return '#22C55E'
}

function scoreLabel(score) {
  if (score <= 40) return 'Needs Work'
  if (score <= 70) return 'Getting There'
  if (score <= 85) return 'Good'
  return 'Excellent'
}

function FactorPill({ factor }) {
  const bg = factor.impact === 'positive'
    ? 'bg-green-500/10 border-green-500/20 text-green-400'
    : factor.impact === 'negative'
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : 'bg-white/5 border-white/10 text-white/40'

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${bg}`}>
      <span className="font-medium truncate">{factor.factor}</span>
      <span className="font-numeric ml-2 flex-shrink-0 opacity-80">
        {factor.points}/{factor.maxPoints}
      </span>
    </div>
  )
}

export default function HealthScoreGauge({ score = 0, factors = [] }) {
  const svgRef = useRef(null)
  const prevScoreRef = useRef(0)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const arcGen = d3.arc().innerRadius(R_INNER).outerRadius(R_OUTER)

    // ── Background track ──────────────────────────────────────────────────
    svg.append('path')
      .datum({ startAngle: -Math.PI / 2, endAngle: Math.PI / 2 })
      .attr('d', arcGen)
      .attr('transform', `translate(${CX}, ${CY})`)
      .attr('fill', 'rgba(255,255,255,0.05)')

    // ── Zone arcs (dimmed) ────────────────────────────────────────────────
    ZONES.forEach(({ min, max, color }) => {
      svg.append('path')
        .datum({ startAngle: angleScale(min), endAngle: angleScale(max) })
        .attr('d', arcGen)
        .attr('transform', `translate(${CX}, ${CY})`)
        .attr('fill', color)
        .attr('opacity', 0.18)
    })

    // ── Active arc (animates from previous score to current) ──────────────
    const prevAngle = angleScale(prevScoreRef.current)
    const targetAngle = angleScale(score)
    const color = scoreColor(score)

    const activePath = svg.append('path')
      .datum({ startAngle: -Math.PI / 2, endAngle: prevAngle })
      .attr('d', arcGen)
      .attr('transform', `translate(${CX}, ${CY})`)
      .attr('fill', color)
      .attr('opacity', 0.85)

    activePath
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attrTween('d', function () {
        const interp = d3.interpolate(prevAngle, targetAngle)
        return (t) => arcGen({ startAngle: -Math.PI / 2, endAngle: interp(t) })
      })

    // ── Tick marks at 20-point intervals ─────────────────────────────────
    ;[0, 20, 40, 60, 80, 100].forEach((tick) => {
      const angle = angleScale(tick) // radians from vertical
      const innerR = R_OUTER + 5
      const outerR = R_OUTER + 10
      // Convert from "0=up, clockwise" to SVG x/y
      const x1 = CX + innerR * Math.sin(angle)
      const y1 = CY - innerR * Math.cos(angle)
      const x2 = CX + outerR * Math.sin(angle)
      const y2 = CY - outerR * Math.cos(angle)

      svg.append('line')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', tick % 20 === 0 ? 1.5 : 0.8)

      // Tick labels at 0, 50, 100
      if (tick === 0 || tick === 50 || tick === 100) {
        const labelR = R_OUTER + 20
        const lx = CX + labelR * Math.sin(angle)
        const ly = CY - labelR * Math.cos(angle)
        svg.append('text')
          .attr('x', lx).attr('y', ly)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'rgba(255,255,255,0.25)')
          .attr('font-size', 10)
          .attr('font-family', 'Inter, sans-serif')
          .text(tick)
      }
    })

    // ── Needle ────────────────────────────────────────────────────────────
    const prevDeg = prevScoreRef.current * 1.8 - 90  // -90 to +90
    const targetDeg = score * 1.8 - 90

    const needleGroup = svg.append('g')
      .attr('transform', `translate(${CX}, ${CY}) rotate(${prevDeg})`)

    // Needle line from center upward
    needleGroup.append('line')
      .attr('x1', 0).attr('y1', 4)
      .attr('x2', 0).attr('y2', -NEEDLE_LENGTH)
      .attr('stroke', 'white')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.92)

    needleGroup
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr('transform', `translate(${CX}, ${CY}) rotate(${targetDeg})`)

    // Pivot circle (drawn last so it's on top)
    svg.append('circle')
      .attr('cx', CX).attr('cy', CY)
      .attr('r', 7)
      .attr('fill', 'white')
      .attr('opacity', 0.92)

    svg.append('circle')
      .attr('cx', CX).attr('cy', CY)
      .attr('r', 3.5)
      .attr('fill', color)

    prevScoreRef.current = score
  }, [score])

  const color = scoreColor(score)
  const label = scoreLabel(score)

  // Top 3 factors: most impactful positives and negatives first
  const sortedFactors = [...factors].sort((a, b) => {
    const rank = { negative: 0, neutral: 1, positive: 2 }
    return rank[a.impact] - rank[b.impact]
  })
  const displayFactors = sortedFactors.slice(0, 3)

  // Insight
  const topNegative = factors.find((f) => f.impact === 'negative')
  const topPositive = [...factors].filter((f) => f.impact === 'positive').sort((a, b) => b.points - a.points)[0]
  const insight = topNegative
    ? `Score ${score}/100. ${topNegative.detail}`
    : topPositive
    ? `Score ${score}/100. ${topPositive.detail}`
    : `Financial health score: ${score}/100`

  return (
    <div className="space-y-4">
      {/* Gauge SVG */}
      <div className="relative flex justify-center">
        <svg ref={svgRef} width={W} height={H} style={{ overflow: 'visible' }} />
        {/* Score overlay — centered below pivot */}
        <div
          className="absolute flex flex-col items-center"
          style={{ bottom: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}
        >
          <span
            className="text-4xl font-bold font-numeric leading-none"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {label}
          </span>
        </div>
      </div>

      {/* Factor pills */}
      <div className="space-y-1.5">
        {displayFactors.map((f) => (
          <FactorPill key={f.factor} factor={f} />
        ))}
      </div>

      {/* Insight */}
      <p className="text-xs text-white/40 border-t border-white/5 pt-3">{insight}</p>
    </div>
  )
}
