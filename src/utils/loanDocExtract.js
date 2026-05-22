// Calls Claude API to extract loan details from a scanned document.
// Requires the user's Anthropic API key (stored encrypted in vault).
// dangerouslyAllowBrowser is intentional — this is a local-first app,
// the key never leaves the user's device except to call Anthropic's API.

import Anthropic from '@anthropic-ai/sdk'
import { encryptData, decryptData } from '../crypto/vault.js'
import { configSet, configGet } from '../db/schema.js'

const CONFIG_KEY = 'anthropic_api_key'

// Store API key encrypted with the vault key
export async function saveApiKey(apiKey, cryptoKey) {
  if (!apiKey.trim()) {
    await configSet(CONFIG_KEY, '')
    return
  }
  const { ciphertext, iv } = await encryptData(cryptoKey, apiKey.trim())
  await configSet(CONFIG_KEY, JSON.stringify({ ciphertext, iv }))
}

// Read and decrypt the stored API key
export async function loadApiKey(cryptoKey) {
  const stored = await configGet(CONFIG_KEY)
  if (!stored) return null
  try {
    const { ciphertext, iv } = JSON.parse(stored)
    return await decryptData(cryptoKey, ciphertext, iv)
  } catch {
    return null
  }
}

// Convert a File object to base64 string
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // result is "data:<type>;base64,<data>" — strip the prefix
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const EXTRACT_PROMPT = `Extract loan details from this document and return ONLY a valid JSON object.

Required fields:
{
  "lender": "bank or NBFC name as written",
  "loan_type": one of: "home_loan" | "car_loan" | "personal_loan" | "education_loan" | "gold_loan" | "credit_card" | "business_loan" | "other",
  "loan_name": "a short descriptive name, e.g. 'SBI Home Loan'",
  "principal_amount": <number in Indian Rupees, digits only, no commas or symbols>,
  "annual_rate": <annual interest rate as a number, e.g. 8.5 for 8.5%>,
  "tenure_months": <loan tenure in months as integer>,
  "emi_amount": <monthly EMI in Indian Rupees, digits only>,
  "start_date": "<disbursement or sanction date as YYYY-MM-DD, or null if not found>",
  "loan_reference": "loan account number or reference number, or null"
}

Rules:
- Return ONLY the JSON object, no markdown, no explanation
- Use null for any field you cannot confidently extract
- For tenure: if given in years, multiply by 12
- For amounts: extract the numeric value only (e.g. "₹25,00,000" → 2500000)
- Infer loan_type from context (home loan, vehicle loan, etc.)
`

// Main extraction function. Returns parsed loan data object.
export async function extractLoanFromDocument(file, apiKey) {
  if (!apiKey) throw new Error('No API key provided')

  const base64 = await fileToBase64(file)
  const mediaType = file.type  // e.g. 'application/pdf', 'image/jpeg'

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  let contentPart
  if (mediaType === 'application/pdf') {
    contentPart = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    }
  } else {
    // image/jpeg, image/png, image/webp
    contentPart = {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    }
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [contentPart, { type: 'text', text: EXTRACT_PROMPT }],
    }],
  })

  const text = response.content[0]?.text?.trim() ?? ''
  // Strip markdown code fences if model wraps in them
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(clean)
}
