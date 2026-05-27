# OpenBoard AI

An AI-native infinite whiteboard. Drop shapes on a canvas, select them, and ask Claude to reason about or generate alongside them — text, images, and video all land back on the board as movable, persistent objects.

> **Status:** early / pre-1.0. Account-gated — each user signs in and owns their own boards. No realtime collaboration yet.

---

## Features

- **Accounts** — Sign in with email/password or GitHub OAuth (powered by [Better Auth](https://better-auth.com)). Boards are private to your account.
- **AI text generation** — Cmd/Ctrl+K opens a prompt bar. Streams Claude's reply into a card on the canvas.
- **Selection-aware context** — Selected shapes (sticky notes, text, geo, images, prior AI cards) are sent as context. Vision-capable for `image` and `ai-image` shapes.
- **AI images** — Generate via Google Gemini 2.5 Flash Image (configurable). 1:1, 16:9, 9:16 aspects.
- **AI video** — Generate via Google Veo 3.1 Fast (configurable). Text-to-video or image-to-video, with optional audio.
- **Presentation mode** — Press `P` to hide chrome; `L` for laser pointer; `Esc` to exit.
- **Snapshots** — Boards persist to Postgres on every change; reload restores the canvas.
- **BYOK** — Each user supplies their own OpenRouter API key in-app (stored in `localStorage`, sent per-request). The server never holds a key.

---

## Tech stack

| Layer    | Stack |
|----------|-------|
| Frontend | React 19, Vite 7, TypeScript, Tailwind 4, [tldraw](https://tldraw.dev) v4, [Vercel AI SDK](https://sdk.vercel.ai) |
| Backend  | [Hono](https://hono.dev) on Node 22, Drizzle ORM, Postgres 16 |
| AI       | [OpenRouter](https://openrouter.ai) (Anthropic Claude Haiku 4.5 for text, Google Gemini for images, Google Veo for video) |
| Tooling  | pnpm workspaces, Docker Compose, drizzle-kit |

---

## Quick start

**Prerequisites**

- Node.js ≥ 22
- pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- Docker (for the local Postgres container)
- An OpenRouter account — grab a key at <https://openrouter.ai/keys> after install

**Setup**

```bash
git clone <your-fork-url> openboard-ai
cd openboard-ai

pnpm install
cp .env.example .env          # adjust ports/models if you like
pnpm db:up                    # boots Postgres on :5436
pnpm db:migrate               # applies Drizzle migrations
pnpm dev                      # web on :5173, api on :3001
```

Before `pnpm dev`, set a session signing secret in `.env` — accounts won't work without it:

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
```

Open <http://localhost:5173>. You'll first create an account or sign in (email/password, or GitHub if configured — see [Authentication](#authentication)). After signing in you're prompted for your OpenRouter API key — paste it and it's saved to `localStorage` for that browser. The key never leaves your browser except as the `X-OpenRouter-Key` header on AI requests, and is never persisted server-side.

**Stop the database** with `pnpm db:down`.

---

## How it works

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────┐
│  Browser (web)  │ ──key── │  API (Hono)      │ ──────► │ OpenRouter │
│  tldraw canvas  │         │  /api/ai/*       │         └────────────┘
│  BYOK key in    │ snapshot│  /api/boards/*   │
│  localStorage   │ ◄─────► │  /api/images/*   │ ◄──────► Postgres
└─────────────────┘         └──────────────────┘
```

- **Custom shapes** (`AiCardShapeUtil`, `AiImageShapeUtil`, `AiVideoShapeUtil`) render React inside tldraw's `HTMLContainer`.
- **AI streaming**: `useAiGenerate` creates a `pending` card, POSTs to `/api/ai/generate`, then appends every streamed chunk into the card's `text` prop.
- **Vision**: Selected image shapes get resolved server-side — `ai-image` from the DB (`aiImages.bytes`), native `image` from its asset's data URL — and attached as multi-modal `image` parts on the last user message.
- **Persistence**: tldraw store snapshots are written to `boards.snapshot` (jsonb) on a debounced timer.

---

## Project layout

```
apps/
  web/      Vite + React frontend (the whiteboard)
  api/      Hono backend (AI proxy + persistence)
packages/
  shared/   Zod schemas + types shared by web and api
docker-compose.yml   Local Postgres on :5436
```

---

## Common scripts

From the repo root:

| Command           | What it does                                   |
|-------------------|-----------------------------------------------|
| `pnpm dev`        | Run web + api in parallel with hot reload     |
| `pnpm build`      | Type-check and build both apps                |
| `pnpm db:up`      | Start Postgres in Docker                      |
| `pnpm db:down`    | Stop Postgres                                 |
| `pnpm db:generate`| Generate a new Drizzle migration from schema  |
| `pnpm db:migrate` | Apply pending migrations                      |

Inside `apps/api`: `pnpm db:studio` opens Drizzle Studio.

---

## Configuration

`BETTER_AUTH_SECRET` is **required**; everything else has a working default in `.env.example`.

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://openboard_ai:openboard_ai@localhost:5436/openboard_ai` | Postgres connection |
| `BETTER_AUTH_SECRET` | — (**required**) | Session signing secret; generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3001` | API origin Better Auth serves from (web proxies `/api` here) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | — | Comma-separated extra origins for deployed environments (e.g. `https://app.example.com`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Enable "Sign in with GitHub" when both are set (see below) |
| `API_PORT` | `3001` | API server port (web proxies `/api` here) |
| `OPENROUTER_APP_NAME` | `openboard-ai` | Sent as `X-Title` to OpenRouter (attribution) |
| `OPENROUTER_APP_URL` | `http://localhost:5173` | Sent as `HTTP-Referer` to OpenRouter |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-2.5-flash-image` | Image model id |
| `OPENROUTER_VIDEO_MODEL` | `google/veo-3.1-fast` | Video model id |

There is intentionally **no** server-side `OPENROUTER_API_KEY` — every request carries the user's key.

### Authentication

Email/password sign-in works out of the box once `BETTER_AUTH_SECRET` is set. To also offer
**Sign in with GitHub**, register an OAuth App at <https://github.com/settings/developers> →
*New OAuth App*:

- **Homepage URL:** `http://localhost:5173`
- **Authorization callback URL:** `http://localhost:3001/api/auth/callback/github`
  — this is the **API** origin (`BETTER_AUTH_URL`), not the web origin.

Copy the Client ID and a generated Client Secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
in `.env` and restart the API. The button appears automatically when both are set. For production,
register a second OAuth App with the public callback `https://<your-domain>/api/auth/callback/github`
and set `BETTER_AUTH_TRUSTED_ORIGINS` to your deployed origin.

---

## Contributing

Issues and PRs welcome. This is an early project, so a quick issue describing what you want to change before opening a large PR is appreciated.

Before opening a PR:
- `pnpm build` passes (typechecks both apps)
- Match the existing code style (no comments unless they explain *why*)

---

## License

MIT — see [LICENSE](./LICENSE).

**Third-party notice**: this project currently depends on [tldraw](https://tldraw.dev), which is distributed under the [tldraw SDK License](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) — production deployments must either display tldraw's "Made with tldraw" watermark or obtain a commercial license from tldraw. This is independent of OpenBoard AI's MIT license on its own code.
