import { useAppStore } from '../store/appStore.js'
import { encryptedAdd, encryptedGetAll, encryptedGet, encryptedUpdate, encryptedDelete } from '../db/schema.js'

// Convenience hook — components use this instead of calling db helpers directly
export function useVault() {
  const { isUnlocked } = useAppStore()

  return {
    isUnlocked: isUnlocked(),
    add: encryptedAdd,
    getAll: encryptedGetAll,
    get: encryptedGet,
    update: encryptedUpdate,
    remove: encryptedDelete,
  }
}
