/**
 * Open Brain's own settings, read as OPENBRAIN_<name>.
 *
 * This project was called Papyrus, and a deployment from before the rename has
 * PAPYRUS_<name> set. Those still work. Dropping them would be worse than
 * untidy: a master key that silently stops being read is every stored
 * credential becoming unreadable.
 *
 * No `server-only` here, because instrumentation.ts reads it too.
 */
export type BrainSetting =
  | 'OWNER_KEY'
  | 'MASTER_KEY'
  | 'GIT_DIR'
  | 'GIT_MIRROR'
  | 'GIT_REMOTE'
  | 'SEED_CLERK_ID'

export function brainEnv(name: BrainSetting): string | undefined {
  return process.env[`OPENBRAIN_${name}`] || process.env[`PAPYRUS_${name}`] || undefined
}

/**
 * The owner key is the whole of sign-in, and the unlock throttle can't be
 * trusted to slow a guesser down — it counts per process, keyed on a header a
 * client can set. So length is the protection. `openssl rand -base64 24` gives 32.
 */
export const MIN_OWNER_KEY_LENGTH = 24
