---
name: boltnew-app architecture
description: Korean queer social app structure, shared backend, key files and constraints
---

## App overview
Korean queer social drinking-meetup matching app in `artifacts/boltnew-app`.
Routes: `App.tsx` (main user app, ~8500 lines), `AdminApp.tsx` (admin panel), `TestDashboard.tsx` (**read-only — never modify**).

## Shared backend (as of 2026-07-24)
`localdb.ts` was completely rewritten from localStorage → HTTP client calling the API server.
- All data lives in **`artifacts/api-server/src/routes/db.ts`** (in-memory store on the server)
- Frontend `fetch('/api/db/...')` → API server at `/api`
- **Real-time**: SSE at `GET /api/db/events` — one global `EventSource` shared by all channels
- **Storage**: images POSTed to `/api/db/storage-upload`, served via `GET /api/db/storage-image?p=...`
- **Why**: localStorage is per-device; users scanning the same QR would each get isolated state. SSE broadcasts DB changes to all connected clients.

**Why:** path-to-regexp v8 (used by Express 5 / router@2.2.0) does not support `/*` or `:path(*)` wildcards — use named params like `:key` or query strings instead.

## Key identifiers
- `MATCHING_USER_KEY = 'matching_app_user_id'` — stored in browser localStorage (per-device), points to a profile ID in the shared server DB
- `MainScreen` is a module-level component (not inside `App`), receives `newMsgCount` as prop from `App`
- Admin password hardcoded: `116606`; admin phone: `010-3878-6740`

## Seat schema
12 tables × 8 seats = 96 total. Seeded in `db.ts` on first start.

## Constraints
- `TestDashboard.tsx` must never be modified
- `express.json({ limit: '50mb' })` required for image uploads (base64)
