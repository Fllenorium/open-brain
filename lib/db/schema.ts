import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Open Brain schema — ARCHITECTURE.md §2.
 *
 * Single user. One owner, many agents. There is no organization, team, role,
 * member, or seat in this file, and there is not going to be one. Ownership is
 * a `user_id` column, and every query filters on it.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  /** Set once the first agent has connected — gates the single gilt moment. */
  firstConnectionSeenAt: timestamp('first_connection_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Exactly one row per user has parent_id = null: the root. */
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Collection path with no leading slash. The root's path is ''. */
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('collections_user_idx').on(t.userId),
    index('collections_parent_idx').on(t.parentId),
    uniqueIndex('collections_user_path_idx').on(t.userId, t.path),
  ],
)

export const entryKinds = ['rule', 'context', 'skill'] as const
export type EntryKind = (typeof entryKinds)[number]

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    /** rule | context | skill */
    kind: text('kind').notNull().default('context'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** collection path + slug, e.g. engineering/web-app/deploys. Rebuilt on any move or rename. */
    path: text('path').notNull(),
    description: text('description').notNull().default(''),
    body: text('body').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    /** manual | import:<origin> */
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').notNull().default('user'),
  },
  (t) => [
    index('entries_user_idx').on(t.userId),
    index('entries_collection_idx').on(t.collectionId),
    // Two entries can never share a path. §13.
    uniqueIndex('entries_user_path_idx').on(t.userId, t.path),
  ],
)

export const entryVersions = pgTable(
  'entry_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    name: text('name').notNull().default(''),
    /** user | agent */
    authorType: text('author_type').notNull().default('user'),
    authorId: text('author_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entry_versions_entry_idx').on(t.entryId),
    uniqueIndex('entry_versions_entry_version_idx').on(t.entryId, t.version),
  ],
)

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** sha256 of the plaintext token. The plaintext is shown exactly once. */
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    /**
     * Always 'propose'. Direct write was removed: nothing an agent sends is
     * written without the owner seeing it. The column stays so old rows load.
     */
    writePolicy: text('write_policy').notNull().default('propose'),
    /**
     * Whether this agent may accept and reject proposals for the owner — so the
     * owner can review from a chat instead of the app. Set only by the owner;
     * no MCP tool reads or changes it. Never covers the agent's own proposals.
     */
    canReview: boolean('can_review').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agents_user_idx').on(t.userId),
    uniqueIndex('agents_token_hash_idx').on(t.tokenHash),
  ],
)

export const agentBindings = pgTable(
  'agent_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('agent_bindings_pair_idx').on(t.agentId, t.collectionId)],
)

/** Skills only. An ungranted skill does not exist as far as the agent is concerned. */
export const agentGrants = pgTable(
  'agent_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('agent_grants_pair_idx').on(t.agentId, t.entryId)],
)

/** Where a proposed new entry wants to land, until the owner accepts it into the tree. */
export type NewEntryTarget = {
  path: string
  kind: EntryKind
  name: string
  description: string
}

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The entry this rewrites — null when the proposal is a brand new entry that
     * doesn't exist yet. A creation stays out of the tree entirely until the
     * owner accepts it, so nothing an agent hasn't earned is ever visible to
     * another agent. `new_entry` says where it would land.
     */
    entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'cascade' }),
    /** Set only for a creation: the path, kind, name, and description of the entry to make. */
    newEntry: jsonb('new_entry').$type<NewEntryTarget>(),
    /** Null when the second hand is Ask rather than a connected agent. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Display name of the hand that wrote it: an agent's name, or "Ask". */
    authorLabel: text('author_label').notNull().default('Agent'),
    /** The entry's version the patch was written against, or 0 for a creation. */
    baseVersion: integer('base_version').notNull(),
    /** Unified diff against the body at base_version; for a creation, against an empty body. */
    patch: text('patch').notNull(),
    rationale: text('rationale').notNull().default(''),
    /** pending | accepted | rejected | superseded */
    status: text('status').notNull().default('pending'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('proposals_user_idx').on(t.userId),
    index('proposals_entry_idx').on(t.entryId),
    index('proposals_status_idx').on(t.status),
  ],
)

/** Powers "no agent has opened this in N days" in Review. We serve the reads, so we know. */
export const entryReads = pgTable(
  'entry_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entry_reads_entry_idx').on(t.entryId),
    index('entry_reads_user_idx').on(t.userId),
  ],
)

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** user | agent | system */
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull().default('you'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetLabel: text('target_label'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_user_idx').on(t.userId),
    index('activity_created_idx').on(t.createdAt),
  ],
)

export const imports = pgTable(
  'imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. paste, upload, folder, github.com/you/web-app */
    origin: text('origin').notNull(),
    /** preview | imported | discarded */
    status: text('status').notNull().default('preview'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('imports_user_idx').on(t.userId)],
)

export const importItems = pgTable(
  'import_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importId: uuid('import_id')
      .notNull()
      .references(() => imports.id, { onDelete: 'cascade' }),
    proposedPath: text('proposed_path').notNull(),
    proposedKind: text('proposed_kind').notNull(),
    proposedName: text('proposed_name').notNull(),
    proposedDescription: text('proposed_description').notNull().default(''),
    body: text('body').notNull(),
    /** "CLAUDE.md, lines 14–38" — shown under every proposed entry. */
    sourceLabel: text('source_label').notNull().default(''),
    selected: boolean('selected').notNull().default(true),
    position: integer('position').notNull().default(0),
    resultEntryId: uuid('result_entry_id').references(() => entries.id, { onDelete: 'set null' }),
  },
  (t) => [index('import_items_import_idx').on(t.importId)],
)

/**
 * A connection is anything an agent can *reach*, as opposed to anything it can
 * read. An endpoint plus the credential to get through it, plus a sentence
 * saying what it's for so the agent knows when to reach for it.
 *
 * A bare secret is the degenerate case: no endpoint, just the credential. That
 * is why there is one table here and not two.
 */
export const connectionKinds = ['mcp', 'api', 'database', 'secret'] as const
export type ConnectionKind = (typeof connectionKinds)[number]

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** mcp | api | database | secret */
    kind: text('kind').notNull().default('secret'),
    /** Also the environment variable the credential arrives in. */
    name: text('name').notNull(),
    /** What it is and when to reach for it. The agent reads this. */
    description: text('description').notNull().default(''),
    /** The part that isn't a secret: a base URL, a host, an MCP endpoint. */
    endpoint: text('endpoint').notNull().default(''),
    /** bearer | header | query | basic | none — how the credential is presented. */
    authScheme: text('auth_scheme').notNull().default('bearer'),
    /** Header or query parameter name, when the scheme needs one. */
    authParam: text('auth_param').notNull().default('Authorization'),
    /** Transport for mcp, extra headers, anything else shape-specific. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    /** AES-256-GCM under a per-user DEK, which is itself encrypted by the master key. */
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    dekId: uuid('dek_id').notNull(),
    /** Last four characters of the plaintext. Never more than this. */
    lastFour: text('last_four').notNull().default(''),

    /** What this reaches, stated plainly, for the grant screen. */
    note: text('note').notNull().default(''),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('connections_user_idx').on(t.userId),
    uniqueIndex('connections_user_name_idx').on(t.userId, t.name),
  ],
)

/** Per-user data key, encrypted by the master key held only in the environment. */
export const dataKeys = pgTable(
  'data_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wrappedKey: text('wrapped_key').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('data_keys_user_idx').on(t.userId)],
)

/** Explicit and narrow: per agent, per connection. No wildcards, no inheritance. */
export const connectionGrants = pgTable(
  'connection_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    /**
     * Null means the grant stands until you take it away. A time-boxed grant
     * stops being handed over the moment it lapses — the next boot simply
     * doesn't include it, with no cached copy anywhere.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('connection_grants_pair_idx').on(t.agentId, t.connectionId)],
)

/**
 * Every time a credential is handed to an agent.
 *
 * "Handed to", not "used": Open Brain injects at boot and never sees the call, so
 * claiming otherwise would be a lie. What it can say exactly is which agent was
 * given which credential, and when — and since it serves every boot, that
 * record is complete.
 */
export const connectionInjections = pgTable(
  'connection_injections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    /** open | config — the boot payload, or the MCP client config endpoint. */
    via: text('via').notNull().default('open'),
    injectedAt: timestamp('injected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('connection_injections_connection_idx').on(t.connectionId),
    index('connection_injections_user_idx').on(t.userId),
  ],
)

export type User = typeof users.$inferSelect
export type Collection = typeof collections.$inferSelect
export type Entry = typeof entries.$inferSelect
export type Agent = typeof agents.$inferSelect
export type Proposal = typeof proposals.$inferSelect
export type Activity = typeof activity.$inferSelect
export type ImportItem = typeof importItems.$inferSelect
export type Connection = typeof connections.$inferSelect
