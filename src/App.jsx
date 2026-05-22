import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore, APP_STATE } from './store/appStore.js'
import { configGet } from './db/schema.js'
import { useAutoLock } from './hooks/useAutoLock.js'
import Layout from './components/Layout.jsx'
import Onboarding from './components/Onboarding.jsx'
import SetupPassphrase from './pages/SetupPassphrase.jsx'
import Unlock from './pages/Unlock.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Income from './pages/Income.jsx'
import Expenses from './pages/Expenses.jsx'
import Goals from './pages/Goals.jsx'
import Loans from './pages/Loans.jsx'
import Investments from './pages/Investments.jsx'
import AiChat from './pages/AiChat.jsx'
import Settings from './pages/Settings.jsx'
import WhatIf from './pages/WhatIf.jsx'

function AutoLockWatcher() {
  useAutoLock()
  return null
}

function AppGate() {
  const { appState, setAppState } = useAppStore()

  useEffect(() => {
    async function detectVaultState() {
      try {
        const salt = await configGet('salt')
        setAppState(salt ? APP_STATE.LOCKED : APP_STATE.SETUP)
      } catch (err) {
        console.error('[finio] Failed to read vault state:', err)
        setAppState(APP_STATE.SETUP)
      }
    }
    detectVaultState()
  }, [setAppState])

  if (appState === APP_STATE.LOADING) {
    return (
      <div className="min-h-screen bg-[#0F0E17] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Initialising vault…</p>
        </div>
      </div>
    )
  }

  if (appState === APP_STATE.SETUP) return <SetupPassphrase />
  if (appState === APP_STATE.LOCKED) return <Unlock />
  if (appState === APP_STATE.ONBOARDING) return <Onboarding />

  // UNLOCKED — render the full app
  return (
    <>
      <AutoLockWatcher />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/income" element={<Income />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/ai" element={<AiChat />} />
          <Route path="/whatif" element={<WhatIf />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppGate />
    </BrowserRouter>
  )
}
