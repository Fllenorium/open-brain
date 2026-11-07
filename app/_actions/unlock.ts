'use server'

import { cookies, headers } from 'next/headers'

import { OWNER_COOKIE, ownerCookieValue, ownerKeyConfigured, ownerKeyMatches } from '@/lib/auth'

/**
 * The cookie holds proof of the key, never the key. A year is fine: revoking
 * means changing OPENBRAIN_OWNER_KEY, which invalidates every cookie at once.
 */
export async function unlock(key: string) {
  if (!ownerKeyConfigured()) return { error: 'This deployment has no owner key set.' }

  const from = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (throttled(from)) {
    return { error: 'Too many wrong keys from here. Wait fifteen minutes, then try again.' }
  }
  if (!ownerKeyMatches(key)) {
    failures.set(from, [...recent(from), Date.now()])
    await new Promise((resolve) => setTimeout(resolve, 400))
    return { error: 'That key does not match. Check it and try again.' }
  }
  failures.delete(from)

  const jar = await cookies()
  jar.set(OWNER_COOKIE, ownerCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true as const }
}

export async function lock() {
  const jar = await cookies()
  jar.delete(OWNER_COOKIE)
  return { ok: true as const }
}

/**
 * Ten wrong keys per address per fifteen minutes. A courtesy, not a defence:
 * it counts per process, and x-forwarded-for is whatever the client says unless
 * a proxy in front overwrites it. The key's length is what actually protects
 * the owner, which is why the app won't boot with a short one.
 */
const WINDOW = 15 * 60_000
const LIMIT = 10
const failures = new Map<string, number[]>()

function recent(from: string): number[] {
  const cutoff = Date.now() - WINDOW
  return (failures.get(from) ?? []).filter((at) => at > cutoff)
}

function throttled(from: string): boolean {
  return recent(from).length >= LIMIT
}
