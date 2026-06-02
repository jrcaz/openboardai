# PostHog Analytics Plan

## Goal

Capture privacy-conscious quantitative usage data that explains how people move through OpenBoard AI and where product work should focus next. Analytics must never include prompts, generated responses, board titles, emails, API keys, raw board ids, raw share tokens, or canvas content.

## Current Coverage

- Page views with board routes normalized to `/b/:boardId` and the board id hashed.
- Landing CTA clicks.
- Board creation from legacy entry points.
- Board open and active-heartbeat snapshots with aggregate shape counts.
- Board import, export, and asset clearing.
- AI text, image, video, and HTML generation outcomes with model, mode, prompt-length bucket, context counts, latency, and error category.
- HTML import outcomes with file-size buckets.
- Presentation, laser pointer, tools-panel, model preference, BYOK, and analytics opt-out changes.

## Gaps From Latest `main`

- Auth funnel: email signup/login, GitHub OAuth starts, auth failures, and authenticated landing CTA destinations.
- Dashboard: board list load, create/open/rename/delete/export from the dashboard.
- Board ownership and sharing: legacy board claim attempts, public sharing toggles, link regeneration, share-copy behavior, and public-board views.
- Projects sidebar: expansion, board switching, dashboard navigation, and sidebar-created boards.
- Prompt bar: collapse/expand, mode changes, auto-connect preference changes, and HTML import button usage.
- New content types: markdown imports and spreadsheet tool usage.
- Agent access settings: agent key creation/revoke/copy and integration-guide tab selection.
- External agent surfaces: REST agent and MCP tool calls happen outside the browser, so browser-only PostHog cannot measure them. Server-side analytics should be added later if we need actual agent usage volume.

## Event Principles

- Use behavioral event names in past tense or action form, for example `dashboard_board_created`, `board_share_toggled`, and `markdown_imported`.
- Include only dimensions needed for product decisions: source, status, route, modality, mode, counts, buckets, booleans, and hashed ids.
- Use hashed board ids and hashed public tokens only when grouping repeated interactions matters.
- Track successes and important failures with `status` or `error_category` so funnels are measurable.
- Keep PostHog disabled unless the relevant key is configured; honor browser Do Not Track and the in-app opt-out.

## Implementation Plan

1. Resolve the `origin/main` conflicts by keeping current app flows and layering analytics providers/tracking calls on top.
2. Extend client analytics helpers with reusable hash/bucket utilities where needed.
3. Instrument the new browser surfaces: auth, landing, dashboard, board sharing/claiming, public viewer, projects sidebar, prompt bar, markdown import, and agent-key settings.
4. Update README privacy notes to mention account-era aggregate events while preserving the no-content/no-secret guarantees.
5. Regenerate the lockfile from `package.json` so `posthog-js` is represented cleanly after the merge.
6. Run typecheck/build or the closest available verification command.

## Deferred Server-Side Plan

Add a small API analytics module gated by `POSTHOG_KEY`/`POSTHOG_HOST`, with hashed user/board ids and no request bodies. Capture `agent_rest_called` and `mcp_tool_called` with tool name, status, latency bucket, and content kind. This is intentionally deferred because external-agent tracking has different consent and deployment implications than browser analytics.
