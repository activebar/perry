import crypto from 'crypto'

// Friendly base32 without 0/1/O/I
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeCode(code: string) {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatCode(code: string) {
  const n = normalizeCode(code)
  if (n.length <= 4) return n
  // AB3D-K9QX-7M (10)
  if (n.length === 10) return `${n.slice(0,4)}-${n.slice(4,8)}-${n.slice(8)}`
  if (n.length === 8) return `${n.slice(0,4)}-${n.slice(4)}`
  return n
}

export function generateCode(len = 10) {
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

function pepper() {
  return (process.env.EVENT_ACCESS_PEPPER || '').trim() || 'dev-pepper'
}

export function hashCode(code: string) {
  const n = normalizeCode(code)
  return crypto.createHash('sha256').update(n + '|' + pepper()).digest('hex')
}
