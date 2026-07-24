---
name: boltnew-app architecture
description: Korean social/matching app in artifacts/boltnew-app. Data layer, routing, and key component notes.
---

## App
Korean social matching app: "범일NPC 술번개"

**Routes**: App.tsx (main user flow), AdminApp.tsx (admin panel), TestDashboard.tsx

**Data layer**: All Supabase calls replaced with `localdb.ts` (local mock).
- `src/lib/localdb.ts` — Full in-memory + localStorage mock of the Supabase JS client.
- `src/lib/supabase.ts` — Re-exports `supabase` from `./localdb`.

**Why local mock**: App is deployed on Replit with no external Supabase instance. All data persists in localStorage. Cross-tab realtime uses BroadcastChannel named `'localdb-bc'`.

## Local mock key facts
- Tables auto-created on first access (empty array returned if not seeded).
- Seeded on startup: `app_settings` (id=1, admin_password='admin1234') and `seats` (96 rows, 12 tables × 8 positions).
- Uniqueness enforced: `profiles.nickname` returns `{ error: { code: '23505' } }` on duplicate.
- RPC stubs: all `admin_*` RPCs implemented in JS in `localdb.ts`.
- Storage mock: images stored as data URLs in an in-memory Map (not persisted).
- `delete().neq('id', sentinel)` — handled generically by the neq filter; deletes all rows not matching the sentinel UUID.

## AdminApp.tsx
- `adminSupabase` is now a `const` aliased to `supabase` (same local client).
- `setAdminToken` is a no-op that only updates localStorage for session tracking.
- `buildAdminClient` and `createClient` imports removed.
- `SUPABASE_URL` / `SUPABASE_KEY` constants kept for the CredentialsTab display UI.

## MainScreen
Separate module-level component in App.tsx. Props include: `newMsgCount`, `onDeleteAllChats`, `onBroadcastGame`.

## Stale closure fix (profilesRef)
- `profilesRef = useRef<Profile[]>([])` declared after other refs (~line 3141).
- `profilesRef.current = profiles` assigned directly in App render body after `profileMap` useMemo (~line 3201) — safe pattern, no useEffect needed.
- Used in `likesChannel` UPDATE handler (rejection notify) and `chatChannel` INSERT handler (sender nickname).

## Key completed features
- `deleteAllChats`: loops over chatList, deletes messages + chats rows, clears state.
- Chat tab: 전체 삭제 버튼 (red, top-right, only shown when chatList > 0).
- 내 상태 탭: 교환된 연락처 카드 (`receivedContactShares.length > 0` 조건부 표시, 보낸 하트 섹션 위).
- 거부 알림: auto-dismiss after 5s via setTimeout.
- BIO_CATEGORIES: 뜨밤 & 기타에 '집콕' 추가.
