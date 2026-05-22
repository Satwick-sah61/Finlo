import { encryptData } from '../crypto/vault.js'

// ─── Snapshot builder ────────────────────────────────────────────────────────

export function buildGoalsExport(goals) {
  const active    = goals.filter(g => g.status !== 'Draft' && g.status !== 'Completed')
  const draft     = goals.filter(g => g.status === 'Draft')
  const completed = goals.filter(g => g.status === 'Completed')

  const totalTargetPaise = goals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0)
  const totalSavedPaise  = goals.reduce((s, g) => s + (Number(g.saved_amount)  || 0), 0)

  return {
    exported_at: new Date().toISOString(),
    app: 'Finio',
    version: 1,
    goals: goals.map(g => ({
      name:                g.name,
      type:                g.type,
      target_amount_paise: Number(g.target_amount) || 0,
      saved_amount_paise:  Number(g.saved_amount)  || 0,
      deadline:            g.deadline ?? null,
      priority:            g.priority ?? 'Medium',
      status:              g.status   ?? 'Active',
      notes:               g.notes    ?? null,
      created_at:          g.created_at,
    })),
    summary: {
      total:                goals.length,
      active:               active.length,
      draft:                draft.length,
      completed:            completed.length,
      total_target_paise:   totalTargetPaise,
      total_saved_paise:    totalSavedPaise,
      overall_progress_pct: totalTargetPaise > 0
        ? Math.round((totalSavedPaise / totalTargetPaise) * 100)
        : 0,
    },
  }
}

// ─── Download helpers ────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadGoalsJSON(exportData) {
  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const stamp = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `finio-goals-${stamp}.json`)
}

export async function downloadGoalsEncrypted(exportData, cryptoKey) {
  const json = JSON.stringify(exportData)
  const { ciphertext, iv } = await encryptData(cryptoKey, json)
  const payload = JSON.stringify({ encrypted: true, app: 'Finio', version: 1, exported_at: exportData.exported_at, ciphertext, iv })
  const blob = new Blob([payload], { type: 'application/json' })
  const stamp = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `finio-goals-encrypted-${stamp}.json`)
}
