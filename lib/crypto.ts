import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'

import { db } from './db'
import { brainEnv } from './env'
import { connections, dataKeys, type Connection } from './db/schema'

/**
 * Envelope encryption.
 *
 * A per-user data key encrypts every credential. The master key, held only in
 * the runtime environment, encrypts the data key. The DEK is never persisted in
 * plaintext, and a value is never rendered back to a human after creation.
 *
 * There is no tool that reads a credential and none may be added. Granted
 * credentials arrive in the boot payload as an env map — injection, not
 * retrieval.
 */

const ALGORITHM = 'aes-256-gcm'

export class MissingMasterKeyError extends Error {
  constructor() {
    super(
      'OPENBRAIN_MASTER_KEY is not set. Connections are unavailable until it is. ' +
        'Generate one with: openssl rand -base64 32',
    )
    this.name = 'MissingMasterKeyError'
  }
}

export function credentialsEnabled(): boolean {
  return Boolean(brainEnv('MASTER_KEY'))
}

function masterKey(): Buffer {
  const raw = brainEnv('MASTER_KEY')
  if (!raw) throw new MissingMasterKeyError()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('OPENBRAIN_MASTER_KEY must be 32 bytes, base64 encoded.')
  }
  return key
}

/**
 * Fails closed rather than quietly serving a store whose credentials can't be
 * read. Called wherever a credential is about to matter.
 */
export async function assertCryptoReady(): Promise<void> {
  if (credentialsEnabled()) {
    masterKey()
    return
  }
  const [any] = await db.select({ id: connections.id }).from(connections).limit(1)
  if (any) throw new MissingMasterKeyError()
}

type Sealed = { ciphertext: string; iv: string; authTag: string }

function seal(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

function open(key: Buffer, sealed: Sealed): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function unwrap(row: typeof dataKeys.$inferSelect): Buffer {
  return Buffer.from(
    open(masterKey(), { ciphertext: row.wrappedKey, iv: row.iv, authTag: row.authTag }),
    'base64',
  )
}

/**
 * The DEK, unwrapped in memory for the duration of one request. Never written.
 * The oldest one, if two first encryptions ever raced and made a pair — every
 * credential records which key sealed it, so either way it opens.
 */
async function dataKeyFor(userId: string): Promise<{ id: string; key: Buffer }> {
  const [existing] = await db
    .select()
    .from(dataKeys)
    .where(eq(dataKeys.userId, userId))
    .orderBy(asc(dataKeys.createdAt))
    .limit(1)
  if (existing) return { id: existing.id, key: unwrap(existing) }

  const key = randomBytes(32)
  const wrapped = seal(masterKey(), key.toString('base64'))
  const [created] = await db
    .insert(dataKeys)
    .values({
      userId,
      wrappedKey: wrapped.ciphertext,
      iv: wrapped.iv,
      authTag: wrapped.authTag,
    })
    .returning()
  return { id: created.id, key }
}

export async function encryptCredential(
  userId: string,
  plaintext: string,
): Promise<Sealed & { dekId: string; lastFour: string }> {
  const { id, key } = await dataKeyFor(userId)
  return {
    ...seal(key, plaintext),
    dekId: id,
    lastFour: plaintext.slice(-4),
  }
}

/** Only ever called to inject into a boot payload. Never to render to a human. */
export async function decryptCredential(connection: Connection): Promise<string | null> {
  if (!credentialsEnabled()) return null
  try {
    const [row] = await db
      .select()
      .from(dataKeys)
      .where(and(eq(dataKeys.id, connection.dekId), eq(dataKeys.userId, connection.userId)))
      .limit(1)
    if (!row) throw new Error(`data key ${connection.dekId} is missing`)
    return open(unwrap(row), {
      ciphertext: connection.ciphertext,
      iv: connection.iv,
      authTag: connection.authTag,
    })
  } catch (error) {
    console.error('[open-brain] could not decrypt a credential:', error)
    return null
  }
}
