/**
 * InvestmentSkeleton — animated pulse placeholder shown while useInvestments
 * is decrypting. Matches the summary bar + investment card dimensions.
 */

function Box({ className = '', style }) {
  return <div className={`animate-pulse bg-white/6 rounded-xl ${className}`} style={style} />
}

function CardSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Title row */}
      <div className="flex items-center gap-3">
        <Box className="w-10 h-10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Box className="h-3 w-2/3" />
          <Box className="h-2 w-1/3" />
        </div>
      </div>
      {/* Value stats */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <Box className="h-2 w-12" />
            <Box className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Bar */}
      <Box className="h-1.5 w-full" />
      <Box className="h-7 w-full" />
    </div>
  )
}

export default function InvestmentSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary bar — 5 stat placeholders */}
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 min-w-[140px] rounded-2xl p-4 space-y-2"
            style={{ background: '#1C1B29', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Box className="h-2 w-16" />
            <Box className="h-5 w-24" />
            <Box className="h-2 w-12" />
          </div>
        ))}
      </div>

      {/* Card grid — 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  )
}
