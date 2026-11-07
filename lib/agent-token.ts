import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Opaque bearer tokens, not JWTs — revocation has to be instant, and a token
 * you can't revoke is the wrong primitive here. We store sha256(token), show
 * the plaintext exactly once, and keep a prefix for display.
 */

const PREFIX = 'obr_'

export type IssuedToken = {
  /** Shown to the user once, at creation, and never retrievable again. */
  plaintext: string
  hash: string
  prefix: string
}

export function issueToken(): IssuedToken {
  const plaintext = PREFIX + randomBytes(24).toString('base64url')
  return {
    plaintext,
    hash: hashToken(plaintext),
    prefix: plaintext.slice(0, 12),
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

export function tokensMatch(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** `obr_a1b2…` — the only form of a token that ever appears after creation. */
export function displayToken(prefix: string): string {
  return `${prefix}…`
}

export function bearerFrom(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}
