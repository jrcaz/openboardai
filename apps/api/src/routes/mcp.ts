import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import {
  addTextToBoard,
  generateOnBoard,
  listBoards,
  moveItemsOnBoard,
  readBoard,
} from '../lib/agent-actions.js'
import type { AuthEnv } from '../middleware/auth.js'

export const mcp = new Hono<AuthEnv>()

// ---------------------------------------------------------------------------
// Remote MCP server.
//
// Mounted at /api/mcp via the streamable-HTTP transport. Authentication is
// handled BEFORE this handler runs by `bearerOrSessionMiddleware` + `requireAuth`,
// so the user is already resolved on the Hono context when we get here.
//
// We run statelessly — a fresh McpServer + transport per request. Tool
// registration is cheap (in-memory map mutations) and statelessness avoids
// the operational complexity of in-memory session maps across processes.
// ---------------------------------------------------------------------------

function buildServer(userId: string, openRouterKey: string | null) {
  const server = new McpServer({ name: 'openboard-ai', version: '0.1.0' })

  server.registerTool(
    'list_boards',
    {
      title: 'List boards',
      description:
        'List every board owned by the authenticated OpenBoardAI user, sorted by most recently updated.',
      inputSchema: {},
    },
    async () => {
      const boards = await listBoards(userId)
      return {
        content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }],
      }
    },
  )

  server.registerTool(
    'read_board',
    {
      title: 'Read board contents',
      description:
        'Read the contents of one board. Returns a flat list of items (text/notes, AI cards, images, HTML widgets) with their text content and position. Use this to gather board state as context before answering or before adding new content.',
      inputSchema: {
        boardId: z.string().describe('The id of the board to read.'),
        includeSnapshot: z
          .boolean()
          .optional()
          .describe(
            "If true, also return the raw tldraw snapshot. Most agents don't need this — the `items` view is the agent-friendly representation.",
          ),
      },
    },
    async ({ boardId, includeSnapshot }) => {
      const board = await readBoard(userId, boardId, { includeSnapshot })
      if (!board) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Board not found: ${boardId}` }],
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
      }
    },
  )

  server.registerTool(
    'add_text_to_board',
    {
      title: 'Add text or sticky note to a board',
      description:
        "Add a text shape or sticky note onto a board owned by the authenticated user. The shape is placed at the optional (x, y) position in tldraw page coordinates — leave x/y unset to drop it near the origin.",
      inputSchema: {
        boardId: z.string().describe('The id of the board to write to.'),
        text: z.string().min(1).max(4000).describe('The text content to display.'),
        kind: z
          .enum(['text', 'note'])
          .optional()
          .describe(
            "'note' is a tldraw sticky note (yellow by default). 'text' is a plain text shape. Defaults to 'note'.",
          ),
        x: z.number().optional().describe('X coordinate in tldraw page space.'),
        y: z.number().optional().describe('Y coordinate in tldraw page space.'),
        color: z
          .string()
          .optional()
          .describe(
            "tldraw color token: black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red, white.",
          ),
      },
    },
    async ({ boardId, text, kind, x, y, color }) => {
      const result = await addTextToBoard(userId, boardId, {
        kind: kind ?? 'note',
        text,
        x,
        y,
        color,
      })
      if (!result) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Board not found: ${boardId}` }],
        }
      }
      return {
        content: [{ type: 'text', text: `Added shape ${result.shapeId} to board ${boardId}.` }],
      }
    },
  )

  server.registerTool(
    'move_board_items',
    {
      title: 'Move existing board items',
      description:
        'Move one or more existing shapes on a board by setting their top-left tldraw page coordinates. Use read_board first to get item ids and positions. This only moves existing items; it does not create or edit their content.',
      inputSchema: {
        boardId: z.string().describe('The id of the board to update.'),
        moves: z
          .array(
            z.object({
              id: z.string().describe('The existing shape id to move.'),
              x: z
                .number()
                .min(-1_000_000)
                .max(1_000_000)
                .describe('New top-left X coordinate in tldraw page space.'),
              y: z
                .number()
                .min(-1_000_000)
                .max(1_000_000)
                .describe('New top-left Y coordinate in tldraw page space.'),
            }),
          )
          .min(1)
          .max(50)
          .describe('The shape position updates to apply.'),
      },
    },
    async ({ boardId, moves }) => {
      const result = await moveItemsOnBoard(userId, boardId, { moves })
      if (!result) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Board not found: ${boardId}` }],
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  server.registerTool(
    'generate_on_board',
    {
      title: 'Generate AI content onto a board',
      description:
        "Run one of OpenBoardAI's built-in AI generators (text card via Claude, image via Gemini, or interactive HTML widget) and drop the result onto the board as a shape. Requires the user's OpenRouter API key to be configured on the MCP client (sent as the X-OpenRouter-Key header).",
      inputSchema: {
        boardId: z.string().describe('The id of the board to write to.'),
        kind: z
          .enum(['text', 'image', 'html'])
          .describe(
            "'text' generates a text response card. 'image' generates an image via the configured image model. 'html' generates a self-contained interactive HTML widget.",
          ),
        prompt: z.string().min(1).max(4000).describe('The generation prompt.'),
        x: z.number().optional().describe('X coordinate in tldraw page space.'),
        y: z.number().optional().describe('Y coordinate in tldraw page space.'),
        title: z.string().max(120).optional().describe('Optional title (used by html kind).'),
      },
    },
    async ({ boardId, kind, prompt, x, y, title }) => {
      if (!openRouterKey) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                "Missing OpenRouter key. Configure your MCP client to send X-OpenRouter-Key: sk-or-v1-... on every request.",
            },
          ],
        }
      }
      try {
        const result = await generateOnBoard(userId, boardId, {
          kind,
          prompt,
          openRouterKey,
          x,
          y,
          title,
        })
        if (!result) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Board not found: ${boardId}` }],
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        return {
          isError: true,
          content: [{ type: 'text', text: `Generation failed: ${message}` }],
        }
      }
    },
  )

  return server
}

// All HTTP methods funnel through the streamable-HTTP transport (it
// distinguishes POST/GET/DELETE internally per the MCP spec).
mcp.all('/', async (c) => {
  const user = c.get('user')!
  const openRouterKey = c.req.header('x-openrouter-key')?.trim() || null
  const server = buildServer(user.id, openRouterKey)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: each request stands alone — no in-memory session map.
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(c.req.raw)
  } finally {
    // Best-effort cleanup; transport is per-request so leaks would compound.
    void transport.close().catch(() => {})
    void server.close().catch(() => {})
  }
})
