import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function Layout({ children }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleToggle() {
    // On mobile use the drawer; on desktop toggle collapse
    if (window.innerWidth < 768) setMobileOpen((o) => !o)
    else setCollapsed((c) => !c)
  }

  return (
    <div className="flex h-screen bg-[#0F0E17] overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ───────────────────────── */}
      <div
        className={`hidden md:flex flex-shrink-0 border-r border-white/5 bg-[#0F0E17] transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <Sidebar collapsed={collapsed} />
      </div>

      {/* ── Mobile drawer overlay (hidden on desktop) ─────────────────── */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 md:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />
      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-[#0F0E17] border-r border-white/5 transform transition-transform duration-300 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
      </div>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onToggleSidebar={handleToggle} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

    </div>
  )
}
