import { MIN_OWNER_KEY_LENGTH, brainEnv } from './lib/env'

/**
 * Startup checks: an owner key long enough to be the whole of sign-in, and a
 * credential store that can actually decrypt.
 *
 * This deliberately does not touch the database: instrumentation is compiled
 * separately from the server bundle, and dragging the Postgres driver into it
 * breaks the build. The data-dependent half of the rule lives where it
 * actually matters — `buildBootPayload` refuses to hand an agent a session at
 * all if it has been granted a credential the runtime cannot decrypt.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Holding the key is the whole of sign-in, so it has to be unguessable, and
  // a deployment with a guessable one should not be serving at all.
  const owner = brainEnv('OWNER_KEY')
  if (owner && owner.length < MIN_OWNER_KEY_LENGTH) {
    refuse(
      `[open-brain] OPENBRAIN_OWNER_KEY is ${owner.length} characters. It is the only thing between ` +
        `the internet and your brain, so it needs at least ${MIN_OWNER_KEY_LENGTH}. ` +
        'Generate one with: openssl rand -base64 24',
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
    refuse(
      '[open-brain] OPENBRAIN_MASTER_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32',
    )
  }
}

/**
 * Exits rather than throws. Next.js catches a throw here, logs it, and keeps
 * serving a 500 on every route — a process that looks alive to whatever
 * supervises it. Exiting is what makes a bad config a failed deploy.
 */
function refuse(message: string): never {
  console.error(message)
  process.exit(1)
}
