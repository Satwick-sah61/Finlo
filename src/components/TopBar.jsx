import { Menu, Bell, ShieldCheck } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES = {
  '/dashboard':   'Dashboard',
  '/income':      'Income Streams',
  '/expenses':    'Expenses',
  '/goals':       'Goals',
  '/loans':       'Loan Manager',
  '/investments': 'Investments',
  '/whatif':      'What-If Simulator',
  '/ai':          'AI Advisor',
  '/settings':    'Settings',
}

export default function TopBar({ onToggleSidebar }) {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Finio'

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 bg-[#0F0E17]/80 backdrop-blur-md flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <Menu className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold text-white/80">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Encryption badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/8 border border-green-500/15">
          <ShieldCheck className="w-3 h-3 text-green-400" />
          <span className="text-green-400/80 text-xs font-medium">Encrypted</span>
        </div>

        {/* Notifications placeholder */}
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all relative">
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
