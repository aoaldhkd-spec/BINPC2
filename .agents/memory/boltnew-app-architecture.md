---
name: boltnew-app architecture
description: Core architecture decisions and patterns for the boltnew-app artifact
---

## Backend
- Shared backend via `artifacts/api-server` — SSE (`/api/db/events`) + HTTP (`/api/db/op`)
- Local SQLite DB written with custom `localdb` layer; Supabase JS client proxied to this server
- **Do NOT use real Supabase cloud** — all queries go through the local api-server

## Frontend
- React + Vite at `artifacts/boltnew-app`
- Main entry: `src/App.tsx` (was 9041 lines → now ~1,393 lines after refactoring)
- Admin UI: `src/AdminApp.tsx` (~4,400 lines)
- Per-device identity stored in localStorage only (`MATCHING_USER_KEY`)

## Custom Hooks (src/hooks/)
Extracted from App.tsx. All hooks are **stateful but NOT subscribed to realtime**:
- `useSeating(currentUserId)` — seats, seatDialog, autoRegisterSeat, loadSeats, handleRegisterSeat(seat, seatingLocked, currentUserSeat)
- `useGames(currentUserId, seats, profiles)` — balanceGames, voteCounts, myVotes, broadcast channel useEffect included
- `useHearts(currentUserId, profiles, profileMap, onOpenChat)` — all likes/hearts/contact state & handlers
- `useChat({currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif})` — chat state, both chat subscription useEffects included

**Why hooks are NOT subscribed to realtime:**
The big useEffect (~300 lines, App.tsx) subscribes 8 Supabase channels. These callbacks call setters from MULTIPLE hooks + App.tsx own state. Extracting to `useRealtime` would require ~15-20 setter parameters — too fragile.

## useRealtime extraction verdict: DON'T
The 8-channel subscription block calls setters from useHearts, useSeating, and App.tsx's own state (setProfiles, setShareEventNotif, setContactViewShare, setRejectionNotif, setActiveNotif, setShowWelcomeNotice, setBottomNotif). It's a cross-cutting concern best left in App.tsx.

**Why:** A `useRealtime(...)` hook signature would need ~15-20 callback parameters. Zero benefit over keeping it in App.tsx. If global state becomes unmanageable, migrate to Zustand/Jotai instead.

## path-to-regexp
v8 uses named groups only — no wildcard `/*` syntax. Use `:path(.*)` or omit.

## playCuteSound
Extracted to `src/lib/sounds.ts`. Import directly — do NOT use dynamic import inside event callbacks (esbuild will error).

## TS errors baseline (pre-existing, not introduced by refactoring)
- TS2305 ×51: `cn` not exported from `@/lib/utils` in shadcn/ui components
- TS2339 ×5: wrong property names in AdminApp.tsx (from_profile_id, to_profile_id)
- TS2347 ×1, TS2322 ×1: minor pre-existing mismatches

## Hook call order in App()
Must respect dependencies:
1. `useSeating` (no deps from other hooks)
2. `useGames(currentUserId, seats, profiles)` — needs `seats` from useSeating
3. `useChat(...)` — needs stable refs from App.tsx state
4. `useHearts(currentUserId, profiles, profileMap, openChat)` — needs `profileMap` useMemo + `openChat` from useChat
