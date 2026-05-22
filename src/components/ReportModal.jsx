import { useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { generateReport } from '../utils/reportGenerator.js'

export default function ReportModal({ summary, incomeStreams, monthlyHistory, activeLoans = [], onClose }) {
  const iframeRef = useRef(null)

  const html = generateReport({ summary, incomeStreams, monthlyHistory, activeLoans })

  useEffect(() => {
    const el = iframeRef.current
    if (!el) return
    const doc = el.contentDocument || el.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
  }, [html])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handlePrint() {
    iframeRef.current?.contentWindow?.print()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex flex-col w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
           style={{ height: 'min(90vh, 760px)', background: '#1C1B29', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
          <span className="text-sm font-semibold text-white">Financial Report</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report iframe */}
        <iframe
          ref={iframeRef}
          title="Financial Report"
          className="flex-1 w-full bg-white"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  )
}
