# BINPC2 Architecture (AI / Dev map)

짧은 지도입니다. 기능 수정 전에 이 파일만 읽고, 아래 “어디를 열지” 목록의 소수 파일만 보세요.

## Stack

- **Frontend:** `artifacts/boltnew-app` → Netlify (`binpc2.netlify.app`)
- **API:** `artifacts/api-server` → Render (`binpc2.onrender.com`)
- **DB:** Postgres (`app_kv_rows` JSON store) + in-memory cache on API
- **Realtime:** 커스텀 SSE (`/api/db/events`) + Postgres LISTEN/NOTIFY  
  (Supabase Realtime 아님. 클라이언트 `localdb.ts`가 Supabase-like API를 에뮬)

Prefer **single Render instance**. Multi-instance는 NOTIFY로 일부 동기화되지만 SSE는 프로세스 로컬.

## Directory roles

| Path | Role |
|------|------|
| `artifacts/boltnew-app/src/App.tsx` | 유저 앱 셸: 세션/라우팅/설정/프로필 로드. 채팅·프로필은 메인 위에 오버레이(메인 언마운트 금지) |
| `artifacts/boltnew-app/src/hooks/useChat.ts` | 1:1 채팅 상태·전송·재시도·오프라인 큐 |
| `artifacts/boltnew-app/src/hooks/useHearts.ts` | 하트/좋아요·연락처 공유 |
| `artifacts/boltnew-app/src/hooks/useGroupChat.ts` | 단체 채팅 |
| `artifacts/boltnew-app/src/lib/localdb.ts` | SSE·`/op`·auth 토큰·Supabase 에뮬 |
| `artifacts/boltnew-app/src/lib/net-health.ts` | 네트워크 UI·reconnect·backoff |
| `artifacts/boltnew-app/src/lib/diag.ts` | 관측/`__BINPC_DIAG__` |
| `artifacts/boltnew-app/src/components/MainScreen.tsx` | 메인 탭 UI |
| `artifacts/boltnew-app/src/components/ChatScreen.tsx` | 채팅 UI |
| `artifacts/boltnew-app/src/AdminApp.tsx` | 관리자 셸 (로그인·대시보드 배선) |
| `artifacts/boltnew-app/src/admin/` | 관리자 탭 UI (HeartsTab, ChatsTab, CredentialsTab 등) |
| `artifacts/api-server/src/routes/db.ts` | `/op`, RPC, SSE, persist (핵심) |
| `artifacts/api-server/src/lib/db-sanitize.ts` | 입력/SSE sanitize |
| `artifacts/api-server/src/lib/db-chat-ids.ts` | `chatPairKey` / `deterministicChatId` |
| `artifacts/api-server/src/lib/db-broadcast-targets.ts` | SSE 수신자 목록 (순수) |
| `artifacts/api-server/src/lib/db-rate-limit.ts` | IP rate-limit 맵/헬퍼 |
| `scripts/verify-all-features.mjs` | 프로덕션 스모크 |

## Feature → files (읽기 범위)

### Chat (1:1)
UI: `ChatScreen.tsx` → state: `useChat.ts` + `chat-reducers.ts` + `chat-pair.ts` → API: `localdb.ts` → server: `db.ts` (`messages`/`chats`, persist-before-broadcast, advisory lock)

### Hearts / matching
UI: `MainScreen.tsx`, `LikeConfirmDialog.tsx`, `ProfileDetail.tsx` → `useHearts.ts` → `localdb.ts` → `db.ts` (`likes`, rate limits)

### Signal (시그널)
UI: `SignalTab.tsx` + MainScreen tab `signal` + `SignalNudgeBanner.tsx` + `BottomNotification` signal CTAs  
Match: `lib/signal-match.ts` (OR: my ideal↔their features, their ideal↔my features, shared interests)  
Unlock: deck only after today's mission 3/3 (unique outgoing hearts, all types). Before that: 시그널 설명서 + progress (왼쪽=패스, 오른쪽=시그널)  
Pool: all profiles with OR match — not limited to incoming likes. Exclude self/blocked/hidden/already-hearted/already-signaled  
Hearts/chat reuse: `handleLike` / `LikeConfirmDialog` / `openChat` — do not reimplement likes or 1:1 send  
Signal send: private table `signal_sends` + `onSendSignal` / `onPassSignal`. Inbox: 내 상태 `받은 시그널` (incoming sends only)  
Swipe: left = pass, right = send signal. Chat still unlocks on mutual hearts.  
Mission: count distinct `liked_id` today from outgoing `likes` SELECT (KST), all heart types including green

### Realtime / network recovery
`localdb.ts` + `net-health.ts` + `ReconnectOverlay.tsx` + server SSE in `db.ts`  
**건드리면 안 됨:** persist-before-broadcast, SSE ring buffer, merge-by-id resync, subscription cleanup, retry/backoff.

### Admin
`AdminApp.tsx` (데이터 로드/RPC) + `src/admin/*Tab.tsx`. Settings RPC: `admin_update_settings` / `patchAdminSettings`.

## Data flow (happy path)

1. Client writes via `supabase.from(...).insert/update` → Netlify `/api/*` proxy → Render `/api/db/op`
2. Server validates + sanitizes → writes memory `store` → **awaits DB persist** (critical tables) → SSE broadcast (+ NOTIFY)
3. Other clients receive SSE → merge into React state (hooks)

## Rules when editing

1. Do **not** remove retry / reconnect / idempotency / dedupe / resync / validation “to shrink code”.
2. Do **not** force-push, hard-reset, or commit `.env`.
3. New free-text fields → `FIELD_LIMITS` in `db-sanitize.ts`.
4. New RPC → `ALLOWED_RPCS` in `db.ts`.
5. New private table → broadcast targets + SELECT ownership checks in `db.ts`.
6. Chat pair identity: FE `chat-pair.ts` and BE `db-chat-ids.ts` must stay sort-compatible.
7. After repo changes: commit + `git push origin main` (Render/Netlify auto-deploy), then smoke.

## Ops notes (known, not code bugs)

- **NAT 429:** 같은 공인 IP(행사장 Wi‑Fi)에서 IP rate-limit이 묶이면 429. 로그인·업로드·SSE는 user-key + 넉넉한 IP 버스트. 남은 IP 한도는 의도적 방어.
- **Cold-start:** Render 유휴/재시작 후 첫 요청 지연. `scripts/keep-api-warm` / GitHub Action(10분)으로 완화. 클라이언트는 502/503/429를 첫 실패에 에러 UI 없이 재시도.
- **Multi-instance:** SSE는 인스턴스 로컬 → `render.yaml` `numInstances: 1` 로 고정.

## Legacy remnant cleanup (seating / heart_drain / heart_balances)

Removed features must **not** come back via stale Postgres rows or `/op` access.

| Mechanism | What it does |
|-----------|----------------|
| `cleanupLegacyTables()` | After `seedIfNeeded`, deletes `LEGACY_KV_TABLES` rows (`seats`, `seating`, …) and strips `heart_drain_*` / seating keys from `app_settings` + `session_history` in Postgres |
| 5-minute interval | Re-runs cleanup if boot-time purge failed |
| `ALLOWED_OP_TABLES` | `/op` on legacy table names → **400 INVALID_TABLE** |
| `admin_drain_unused_hearts` RPC | **404** (feature removed; guard against re-add) |
| `mergeAppSettings` / admin RPC | Incoming legacy settings keys stripped before persist |
| `/ready` | Exposes `legacy_leftovers` counts (no PII) for ops smoke |

Pure strip helpers: `artifacts/api-server/src/lib/db-legacy-cleanup.ts`. Tests: `db-legacy-cleanup.test.ts`, `db-security.test.ts`, longevity guards.

**Do not delete** cleanup SQL or block lists to “shrink” `db.ts`.

## Do not touch casually

`db.ts` persist/SSE/`/op` 경로, `localdb.ts` SSE client, `useChat` offline queue, `net-health` quiet/error windows.
