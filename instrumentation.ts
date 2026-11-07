import { brainEnv } from './lib/env'

/**
 * Startup check for the credential store.
 *
 * This deliberately does not touch the database: instrumentation is compiled
 * separately from the server bundle, and dragging the Postgres driver into it
 * breaks the build. The data-dependent half of the rule lives where it
 * actually matters — `buildBootPayload` refuses to hand an agent a session at
 * all if it has been granted a credential the runtime cannot decrypt.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Holding the key is the whole of sign-in, so it has to be unguessable.
  // `openssl rand -base64 24` gives 32 characters. A warning, not a refusal:
  // refusing to boot would lock the owner out of a deployment that works today.
  const owner = brainEnv('OWNER_KEY')
  if (owner && owner.length < 24) {
    console.error(
      '[open-brain] OPENBRAIN_OWNER_KEY is too short to be the only thing between the internet and ' +
        'your brain. Replace it with at least 24 characters: openssl rand -base64 24',
    )
  }

  const key = brainEnv('MASTER_KEY')
  if (!key) {
    console.warn(
      '[open-brain] OPENBRAIN_MASTER_KEY is not set. The credential store is off, and any agent ' +
        'granted a credential will fail to open its session rather than start without one.',
    )
    return
  }

  if (Buffer.from(key, 'base64').length !== 32) {
    throw new Error(
      '[open-brain] OPENBRAIN_MASTER_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32',
    )
  }
}
