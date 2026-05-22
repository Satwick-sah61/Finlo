import { MessageSquare, Sparkles, Shield, Zap } from 'lucide-react'

const SAMPLE_PROMPTS = [
  'Should I pay off my home loan early or invest in SIP?',
  'Am I saving enough for retirement at 40?',
  'How long will it take to reach my ₹50L emergency fund goal?',
  'Analyse my expense categories — where am I overspending?',
  'What\'s the optimal EMI prepayment strategy for my loans?',
]

const CAPABILITIES = [
  { icon: MessageSquare, label: 'Conversational', desc: 'Ask anything about your finances in plain English' },
  { icon: Sparkles, label: 'Actionable', desc: 'AI can suggest adding goals or adjusting your plan' },
  { icon: Shield, label: 'Private', desc: 'Only anonymized summaries sent — never raw data' },
  { icon: Zap, label: 'Context-aware', desc: 'Understands your full financial picture before answering' },
]

export default function AiChat() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-5 h-5 text-indigo-400" />
        <h2 className="text-xl font-semibold text-white">AI Advisor</h2>
      </div>

      <div className="glass rounded-2xl flex flex-col items-center text-center p-12 gap-8">
        <div>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 mb-6">
            <Sparkles className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-white/70 mb-2">
            Your private financial advisor
          </h3>
          <p className="text-sm text-white/30 max-w-sm leading-relaxed">
            Ask anything about your finances. The AI advisor works on anonymized summaries of your
            data — your actual numbers never leave your device.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full max-w-lg text-left">
          {CAPABILITIES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-white/3 border border-white/6 rounded-xl p-4 flex items-start gap-3">
              <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white/60">{label}</p>
                <p className="text-xs text-white/25 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="w-full max-w-lg space-y-2">
          <p className="text-xs text-white/30 uppercase tracking-wider font-medium text-left">Sample questions</p>
          {SAMPLE_PROMPTS.map((p) => (
            <div key={p} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/3 border border-white/6 text-left cursor-not-allowed opacity-60">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="text-sm text-white/50">{p}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-white/20">Full AI chat engine coming in Phase 4 (Week 16)</p>
      </div>
    </div>
  )
}
