# OpenBoard AI

An AI-native infinite whiteboard. Drop shapes on a canvas, select them, and ask Claude to reason about, expand, or generate alongside them — text, images, and video all land back on the board as movable, persistent objects.

> **Status:** early / pre-1.0. Single-user, single-board-per-id, no realtime collaboration yet.

---

## Features

- **AI text generation** — Cmd/Ctrl+K opens a prompt bar. Streams Claude's reply into a card on the canvas.
- **Selection-aware context** — Selected shapes (sticky notes, text, geo, images, prior AI cards) are sent as context. Vision-capable for `image` and `ai-image` shapes.
- **AI images** — Generate via Google Gemini 2.5 Flash Image (configurable). 1:1, 16:9, 9:16 aspects.
- **AI video** — Generate via Google Veo 3.1 Fast (configurable). Text-to-video or image-to-video, with optional audio.
- **Expand** — Fan four short follow-up cards out from any source shape, arrow-connected back.
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
cp .env.example .env          # adjust if you want non-default ports/models
pnpm db:up                    # boots Postgres on :5436
pnpm db:migrate               # applies Drizzle migrations
pnpm dev                      # web on :5173, api on :3001
```

Open <http://localhost:5173>. On first load you'll be prompted for your OpenRouter API key — paste it and it's saved to `localStorage` for that browser. The key never leaves your browser except as the `X-OpenRouter-Key` header on AI requests, and is never persisted server-side.

**Stop the database** with `pnpm db:down`.

---

## Self-host with Docker

For running OpenBoard AI on your own infrastructure (a VPS, a homelab box,
anywhere with Docker) the repo ships a multi-stage `Dockerfile` and a
compose profile that brings up the web app **and** Postgres together as a
single group.

```bash
cp .env.example .env          # tweak ports / model overrides if you want
docker compose --profile app up -d --build
```

That's it — once the `app` container reports healthy, open
<http://localhost:3001> and you're in.

What the `app` profile does:

- Builds a single image that bundles the Vite-built web assets and the Hono
  API into one Node process (the API serves `/` as static assets and `/api/*`
  as routes).
- Starts Postgres 16 with a persistent volume (`openboard-ai-pgdata`).
- Waits for Postgres to be healthy, then runs Drizzle migrations on
  startup before booting the server.
- Re-uses the same `.env` file as local dev. The `DATABASE_URL` inside the
  app container is overridden by compose to point at the `postgres` service
  on the internal network — your host-side `.env` value (which uses
  `localhost:5436`) is left untouched so `pnpm dev` keeps working.

Useful commands:

```bash
docker compose --profile app up -d --build    # build + start full stack
docker compose --profile app logs -f app      # tail app logs
docker compose --profile app down             # stop (keeps the db volume)
docker compose --profile app down -v          # stop AND wipe the db volume
```

Notes for production:

- The image runs as the non-root `node` user and exposes a `/health` HTTP
  check that the container healthcheck uses.
- To use a managed Postgres instead of the bundled one, set `DATABASE_URL`
  in `.env` and run only the `app` service:
  `docker compose run --rm app` (or remove the `postgres` dependency).
- The tldraw license key is baked into the web bundle at build time. Set
  `VITE_TLDRAW_LICENSE_KEY` in `.env` before `--build` if you have one;
  otherwise the bundle ships with tldraw's "Made with tldraw" watermark
  (required by the tldraw SDK license — see the bottom of this README).
- Migrations run automatically on every boot. Set `SKIP_MIGRATIONS=1` in
  the app container's environment to disable that if you'd rather run
  them out-of-band.

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

All optional — defaults in `.env.example` work out of the box.

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://openboard_ai:openboard_ai@localhost:5436/openboard_ai` | Postgres connection |
| `API_PORT` | `3001` | API server port (web proxies `/api` here) |
| `OPENROUTER_APP_NAME` | `openboard-ai` | Sent as `X-Title` to OpenRouter (attribution) |
| `OPENROUTER_APP_URL` | `http://localhost:5173` | Sent as `HTTP-Referer` to OpenRouter |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-2.5-flash-image` | Image model id |
| `OPENROUTER_VIDEO_MODEL` | `google/veo-3.1-fast` | Video model id |

There is intentionally **no** server-side `OPENROUTER_API_KEY` — every request carries the user's key.

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
