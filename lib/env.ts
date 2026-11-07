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
