// AES-256-GCM encryption via Web Crypto API (SubtleCrypto)
// Key derivation: PBKDF2-SHA256, 600,000 iterations
// Salt: 16 bytes, stored in app_config (not sensitive)
// IV: 12 bytes, generated fresh per encryption, stored alongside ciphertext
// The passphrase and derived CryptoKey are NEVER stored — held in Zustand memory only

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_LENGTH = 256
const SENTINEL = 'finio-vault-verified-v1'

function buf2b64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function b642buf(b64) {
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

export function generateSalt() {
  return buf2b64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer)
}

async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b642buf(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(cryptoKey, plaintext) {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    enc.encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext))
  )

  return {
    ciphertext: buf2b64(ciphertext),
    iv: buf2b64(iv.buffer),
  }
}

export async function decryptData(cryptoKey, ciphertextB64, ivB64) {
  const dec = new TextDecoder()

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b642buf(ivB64) },
    cryptoKey,
    b642buf(ciphertextB64)
  )

  return dec.decode(plainBuffer)
}

// First-time setup: generate salt, derive key, create and return encrypted sentinel
export async function setupVault(passphrase) {
  const salt = generateSalt()
  const key = await deriveKey(passphrase, salt)
  const { ciphertext, iv } = await encryptData(key, SENTINEL)

  return { salt, key, sentinel: { ciphertext, iv } }
}

// Returning user: derive key and verify against stored sentinel
// Returns CryptoKey on success, throws on wrong passphrase
export async function unlockVault(passphrase, saltB64, sentinelCiphertext, sentinelIv) {
  const key = await deriveKey(passphrase, saltB64)

  let decrypted
  try {
    decrypted = await decryptData(key, sentinelCiphertext, sentinelIv)
  } catch {
    throw new Error('Wrong passphrase')
  }

  if (decrypted !== SENTINEL) {
    throw new Error('Wrong passphrase')
  }

  return key
}
