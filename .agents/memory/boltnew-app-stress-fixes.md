---
name: boltnew-app stress-test fixes
description: 100-user stress audit findings and fixes applied — race conditions, hooks violations, pool config
---

## Key Findings & Fixes

**likeInFlight race (useHearts.ts)**
- Was: `useState(false)` — two concurrent calls both read stale `false` before re-render
- Fix: `useRef(false)` + `try/finally` block — synchronous lock, always released
- **Why:** React state updates are batched; refs are mutated synchronously

**sendMessage double-send (useChat.ts)**
- Was: no in-flight lock; `__opt_${Date.now()}` could collide at same ms
- Fix: `sendInFlightRef = useRef(false)` guard + `crypto.randomUUID()` for optimistic IDs + `try/finally` release
- **Why:** Enter+click or rapid taps both fired before Supabase returned

**loadMessages stale-state race (useChat.ts)**
- Was: slow load for chat A could overwrite chat B's messages after switching
- Fix: `loadGenRef` generation counter — discards results if chatId changed mid-flight

**App.tsx loading-main infinite spinner**
- Was: no timeout; network/DB failure on registration left user stuck
- Fix: `useEffect` with 10s `setTimeout(() => setView('main'))` — placed BEFORE any conditional returns
- **Why:** useEffect MUST be before conditional returns (Rules of Hooks)

**Rules of Hooks violation (App.tsx)**
- Was: `useEffect` added after `if (showWaiting) return` — broke hook order on every re-render
- Fix: moved all useEffects above all conditional returns

**PostgreSQL pool exhaustion (api-server/db.ts)**
- Was: `new pg.Pool({ connectionString })` — default max=10 connections
- Fix: `max: 50, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000`
- **Why:** 100 concurrent users all making DB-backed writes would exhaust pool

**SSE token userId spoofing (api-server/db.ts)**
- Was: `/sse-token` signed any userId without verifying it existed
- Fix: checks in-memory profiles store first, falls back to DB query; returns 403 for unknown userId

**Avatars expanded (NicknameSetupScreen.tsx)**
- 18 avatars total: 10 인물, 4 음식, 4 동물
- Stored in `public/avatars/av1.png`–`av18.png`
- Picker UI uses `AVATAR_CATEGORIES` with category labels + 5-col grid per category
