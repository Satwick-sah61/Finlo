import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-[#0F0E17] overflow-hidden">
      {/* Sidebar */}
      <div
        className={`flex-shrink-0 border-r border-white/5 bg-[#0F0E17] transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
