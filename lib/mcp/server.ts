import 'server-only'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { buildBootPayload, renderBootDocument } from '../boot-payload'
import type { AgentSession } from './auth'
import { openTool } from './tools/open'
import { listTool } from './tools/list'
import { searchTool } from './tools/search'
import { readTool } from './tools/read'
import { proposeTool } from './tools/propose'
import { createTool } from './tools/create'
import { decideTool, pendingTool } from './tools/review'

/**
 * The MCP surface, shaped like a filesystem on purpose.
 *
 * Agents already know list / search / open. Matching that pattern means an
 * agent uses Open Brain correctly on its first attempt with no explanation of how
 * the API works. Open Brain is the working directory for everything that isn't a
 * repo.
 *
 * Never exposed here: bindings, grants, write policy, agent CRUD, secrets
 * management, other agents. An agent cannot see or change its own permissions.
 * That line is enforced by the absence of a tool, not by configuration.
 */
export function buildServer(session: AgentSession): McpServer {
  const server = new McpServer(
    { name: 'open-brain', version: '1.0.0' },
    {
      instructions:
        `Call brain_open before you answer anything in this session. It is not optional and it ` +
        `is not only for questions about Open Brain: it returns ${session.owner.name?.trim() || 'the owner'}'s ` +
        'standing rules, which govern how you work on everything — how they ship, how they write, ' +
        'what they never want done — plus an index of the context and skills available to you.\n\n' +
        'It costs a few hundred tokens and it is the difference between working from their ' +
        'standards and guessing at them. After that: brain_read a path when the index says an ' +
        'entry is relevant, brain_search to grep, brain_list to browse. When you learn ' +
        'something durable about their work, brain_propose an edit to the entry that covers it, ' +
        'or brain_create a new entry when nothing does. Both wait for the owner before anything ' +
        'is written.' +
        (session.agent.canReview
          ? '\n\nThe owner has made you a reviewer. When they ask what is waiting, call ' +
            'brain_pending and show them each change. Call brain_decide only for what they tell you ' +
            'to accept or reject — never on your own judgement, and never for your own proposals.'
          : ''),
    },
  )

  // Some clients attach resources at the start of a session rather than waiting
  // for the model to choose a tool. For those, the boot payload is just there.
  server.registerResource(
    'brain',
    'brain://boot',
    {
      title: `${session.owner.name?.trim() || 'The owner'}'s brain`,
      description:
        'Standing rules in full, plus an index of every context entry and granted skill. ' +
        'Read this before answering anything.',
      mimeType: 'text/markdown',
    },
    async () => {
      const payload = await buildBootPayload(session.agent, { includeSecretValues: true })
      return {
        contents: [
          {
            uri: 'brain://boot',
            mimeType: 'text/markdown',
            text: renderBootDocument(payload),
          },
        ],
      }
    },
  )

  server.registerTool(
    'brain_open',
    {
      title: 'Open the brain',
      description:
        'CALL THIS FIRST, before answering anything, in every session. Returns the standing rules ' +
        'you are expected to follow — how the owner ships, writes, and works — plus an index of ' +
        'every context entry and granted skill. Not just for questions about Open Brain: the rules ' +
        'govern all your work. Bodies are not included; read them by path when the index says they ' +
        'are relevant.',
      inputSchema: {},
    },
    () => openTool(session),
  )

  server.registerTool(
    'brain_list',
    {
      title: 'List entries',
      description:
        'Directory listing. Entries under a path prefix, optionally filtered by kind or tags. ' +
        'Defaults to everything you can see.',
      inputSchema: {
        under: z.string().optional().describe('Path prefix, e.g. engineering/web-app'),
        kind: z.enum(['rule', 'context', 'skill']).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    (args) => listTool(session, args),
  )

  server.registerTool(
    'brain_search',
    {
      title: 'Search the brain',
      description:
        'Grep across names, descriptions, tags, and bodies. Returns the path plus the matching ' +
        'line with a little surrounding text.',
      inputSchema: {
        query: z.string().min(1),
        kind: z.enum(['rule', 'context', 'skill']).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    (args) => searchTool(session, args),
  )

  server.registerTool(
    'brain_read',
    {
      title: 'Read entries',
      description:
        'Full bodies by path. Batched — pass one path, or several at once, in either field.',
      inputSchema: {
        path: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('An entry path, or a list of them'),
        paths: z.array(z.string()).optional().describe('Several entry paths'),
      },
    },
    (args) => readTool(session, args),
  )

  server.registerTool(
    'brain_propose',
    {
      title: 'Propose an edit',
      description:
        'Suggest a change to an entry as a unified diff against its current body. Say why in ' +
        'rationale — the owner reads it before accepting. What has to be right is the context ' +
        'and - lines: they must match the body exactly. @@ line numbers and counts are ' +
        'recalculated, so a miscount is fine. If the patch does not apply for any reason, the ' +
        'error says why and returns the current body so you can rebuild it and retry in this turn.',
      inputSchema: {
        path: z.string(),
        patch: z.string().describe('Unified diff against the current body'),
        rationale: z.string().describe('Why this change, in one or two sentences'),
      },
    },
    (args) => proposeTool(session, args),
  )

  server.registerTool(
    'brain_create',
    {
      title: 'Propose a new entry',
      description:
        'Add a new entry when no existing one covers what you learned — a rule, a piece of ' +
        'context, or a skill. It waits for the owner exactly like an edit does; nothing is written ' +
        'and no other agent sees it until they accept. Use brain_propose instead when an entry ' +
        'already covers this. You can only add inside a collection you are bound to.',
      inputSchema: {
        path: z
          .string()
          .describe('Where it should live, e.g. engineering/web-app/deploys. Folders are made as needed.'),
        title: z.string().optional().describe('The entry title. Defaults to the last path segment.'),
        kind: z.enum(['rule', 'context', 'skill']).optional().describe('Defaults to context.'),
        body: z.string().describe('The full entry, in Markdown'),
        description: z.string().optional().describe('One line for the index — what it is and when to read it'),
        rationale: z.string().describe('Why this belongs, in one or two sentences — the owner reads it'),
      },
    },
    (args) => createTool(session, args),
  )

  // Only for an agent the owner made a reviewer. For every other agent these
  // tools don't exist, which is how the line is held.
  if (session.agent.canReview) {
    server.registerTool(
      'brain_pending',
      {
        title: 'What is waiting for review',
        description:
          'Proposals waiting for the owner, on what you can read: who proposed each, why, and the ' +
          'diff. Show the owner each change before they decide. Some may be your own — you cannot ' +
          'decide those.',
        inputSchema: {},
      },
      () => pendingTool(session),
    )

    server.registerTool(
      'brain_decide',
      {
        title: 'Accept or reject for the owner',
        description:
          'Accept or reject proposals on the owner\'s behalf, by the handle brain_pending gave. ' +
          'Only when the owner has told you to in this conversation, after you have shown them ' +
          'the change. Never on your own judgement, and never for your own proposals — those are ' +
          'refused. Every decision is recorded under your name.',
        inputSchema: {
          handles: z.array(z.string()).min(1).describe('Handles from brain_pending, e.g. ["a1b2c3d4"]'),
          decision: z.enum(['accept', 'reject']),
        },
      },
      (args) => decideTool(session, args),
    )
  }

  return server
}

/**
 * The spec names these tools brain.open, brain.list, and so on. MCP clients
 * that bridge tools into a model API need names matching [a-zA-Z0-9_-], so the
 * registered names use underscores and dotted names are accepted as aliases.
 *
 * Before the rename these were papyrus_open and friends, and an agent's own
 * instructions may still say so. Those names keep working.
 */
export function canonicalToolName(name: string): string {
  return name.replace(/^(?:brain|papyrus)[._]/, 'brain_')
}
