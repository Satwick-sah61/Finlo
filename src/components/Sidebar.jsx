import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Target,
  CreditCard, BarChart3, MessageSquare, Sliders, Lock, Shield, Settings,
} from 'lucide-react'
import { useAppStore } from '../store/appStore.js'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/income',      icon: TrendingUp,       label: 'Income'      },
  { to: '/expenses',    icon: ShoppingCart,     label: 'Expenses'    },
  { to: '/goals',       icon: Target,           label: 'Goals'       },
  { to: '/loans',       icon: CreditCard,       label: 'Loans'       },
  { to: '/investments', icon: BarChart3,        label: 'Investments' },
  { to: '/whatif',      icon: Sliders,          label: 'What-If'     },
  { to: '/ai',          icon: MessageSquare,    label: 'AI Advisor'  },
]

export default function Sidebar({ collapsed, onClose }) {
  const { lock } = useAppStore()

  function handleNav() {
    // Close the mobile drawer when the user taps a nav item
    onClose?.()
  }

  return (
    <aside className="flex flex-col h-full w-full">

      {/* Logo */}
      <div
        className={`flex items-center gap-3 px-4 py-5 mb-2 ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-indigo-400" />
        </div>
        {!collapsed && <span className="text-lg font-bold text-gradient">Finio</span>}
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            onClick={handleNav}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-indigo-400' : ''}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-3 space-y-0.5 border-t border-white/5 pt-2 mt-2">
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          onClick={handleNav}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
              collapsed ? 'justify-center' : ''
            } ${
              isActive
                ? 'bg-white/8 text-white/70 border border-white/10'
                : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
            }`
          }
        >
          <Settings className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
          {!collapsed && <span>Settings</span>}
        </NavLink>

        <button
          onClick={() => { handleNav(); lock() }}
          title={collapsed ? 'Lock vault' : undefined}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/30 hover:text-red-400/80 hover:bg-red-500/5 transition-all border border-transparent ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Lock className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Lock Vault</span>}
        </button>
      </div>

    </aside>
  )
}
