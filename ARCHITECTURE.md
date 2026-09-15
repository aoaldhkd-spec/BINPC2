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
| `artifacts/boltnew-app/src/App.tsx` | 유저 앱 셸: 훅·배선·compose. nickname/registration + profile/privacy loaders peeled |
| `artifacts/boltnew-app/src/hooks/useNicknameRegistration.ts` | 닉네임 등록·복구·reset (App은 setState 배선) |
| `artifacts/boltnew-app/src/hooks/useProfilePrivacyLoaders.ts` | profiles/signals/blocked/visitors 로드 (App은 setState 배선) |
| `artifacts/boltnew-app/src/hooks/useChat.ts` | 1:1 채팅 상태·전송·재시도·오프라인 큐 |
| `artifacts/boltnew-app/src/hooks/useHearts.ts` | 하트/좋아요·연락처 공유 |
| `artifacts/boltnew-app/src/hooks/useGroupChat.ts` | 단체 채팅 |
| `artifacts/boltnew-app/src/hooks/useParticipantSoTResync.ts` | 포그라운드/SSE 재연결 SoT 배선 (App은 콜백만) |
| `artifacts/boltnew-app/src/hooks/useSseFallbackPoll.ts` | SSE unhealthy 폴링 fallback (App은 로더만) |
| `artifacts/boltnew-app/src/hooks/useUserRealtimeChannel.ts` | profiles + likes/contact_shares + privacy + signals SSE 구독/라우트 (App은 apply 콜백) |
| `artifacts/boltnew-app/src/hooks/useAppShellRealtimeChannels.ts` | app_settings + notifications + contact_share_events SSE 구독/라우트 (App은 apply 콜백) |
| `artifacts/boltnew-app/src/hooks/useSessionReadyBootstrap.ts` | `/ready` mount bootstrap + settings poll (App은 wipe/setState 배선) |
| `artifacts/boltnew-app/src/hooks/useProfileBootMachine.ts` | loading-main 프로필 확인/백오프 (App은 enter/recover 결과 적용) |
| `artifacts/boltnew-app/src/components/AppEntryGates.tsx` | 입장/대기/복구/닉네임 early gate JSX (App 셸은 null 후 메인) |
| `artifacts/boltnew-app/src/components/AppMainShell.tsx` | 메인 탭 셸 JSX (inert + MainScreen; App은 props만) |
| `artifacts/boltnew-app/src/components/AppOverlays.tsx` | 오버레이/모달/프로필·채팅·그룹 JSX fan-in (App은 props·콜백) |
| `artifacts/boltnew-app/src/lib/localdb.ts` | SSE·`/op`·auth 토큰·Supabase 에뮬 |
| `artifacts/boltnew-app/src/lib/net-health.ts` | 네트워크 UI·reconnect·backoff |
| `artifacts/boltnew-app/src/lib/diag.ts` | 관측/`__BINPC_DIAG__` |
| `artifacts/boltnew-app/src/components/MainScreen.tsx` | 메인 탭 UI |
| `artifacts/boltnew-app/src/components/ChatScreen.tsx` | 채팅 UI |
| `artifacts/boltnew-app/src/AdminApp.tsx` | 관리자 셸 (로그인·대시보드 배선) |
| `artifacts/boltnew-app/src/admin/` | 관리자 탭 UI (HeartsTab, ChatsTab, CredentialsTab 등) |
| `artifacts/api-server/src/routes/db.ts` | `/op`, RPC, SSE, persist (핵심) |
| `artifacts/api-server/src/lib/db-sanitize.ts` | 입력/SSE sanitize |
| `artifacts/api-server/src/lib/db-op-filters.ts` | `/op` FilterSpec match/apply (순수) |
| `artifacts/api-server/src/lib/db-panel-secrets.ts` | 패널 비밀번호 collect/match (순수; prod는 factory default 거부) |
| `artifacts/api-server/src/lib/db-sse-ring.ts` | SSE Last-Event-ID ring buffer (순수) |
| `artifacts/api-server/src/lib/db-merged-id-map.ts` | chat/group merged-id maps (순수) |
| `artifacts/api-server/src/lib/db-table-policy.ts` | `/op` allowlist + critical persist sets |
| `artifacts/api-server/src/lib/db-sse-fanout-policy.ts` | SSE private/admin sets + smart-broadcast plan (순수) |
| `artifacts/api-server/src/lib/db-op-request.ts` | `/op` scalar validate + filter/order normalize (순수) |
| `artifacts/api-server/src/lib/db-chat-ids.ts` | `chatPairKey` / `deterministicChatId` |
| `artifacts/api-server/src/lib/db-broadcast-targets.ts` | SSE 수신자 목록 (순수) |
| `artifacts/api-server/src/lib/db-rate-limit.ts` | IP rate-limit 맵/헬퍼 |
| `scripts/verify-all-features.mjs` | 프로덕션 스모크 |

## Feature → files (읽기 범위)

### Chat (1:1)
UI: `ChatScreen.tsx` → state: `useChat.ts` + `chat-reducers.ts` + `chat-pair.ts` → API: `localdb.ts` → server: `db.ts` (`messages`/`chats`, persist-before-broadcast, advisory lock)

### Hearts / matching
UI: `MainScreen.tsx`, `LikeConfirmDialog.tsx`, `ProfileDetail.tsx` → `useHearts.ts` → `localdb.ts` → `db.ts` (`likes`, rate limits)

### Bottom tabs
UI: `MainScreen.tsx` — 참여자 / 하트, 채팅(내 상태+내 채팅) / 통계 / 랭킹 / 설정  
궁합: 프로필 카드·상세·채팅 모달 (`FortuneTab.tsx`, `ChatCompatModal.tsx`). 개인 운세 탭/FAB 없음.

### Profile tags (`user_signals`)
한마디·이상형·특징: `lib/signal-match.ts` + `SignalTagPicker.tsx` + `user_signals` 테이블 (전광판·카드 뒷면).  
시그널 탭/전송 기능은 제거됨. `signal_sends` 테이블은 레거시로 유지(스키마 삭제 안 함).

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


## Whole-app attach / detach skeleton (NOT chat-only)

Coding skeleton is **OK to attach/detach features incrementally** across the **entire participant app**, not only chat cursors.

### App shell stages (attach order)

| Stage | What attaches | Primary modules |
|-------|---------------|-----------------|
| **entry** | gate / password / recovery | `entry-gate.ts`, `EntryGateScreen`, `ProfileRecoveryScreen` |
| **waiting** | session inactive overlay | `WaitingOverlay`, `/ready` + `session-ready-settings.ts` |
| **main** | tabs shell (profiles stay mounted under overlays) | `MainScreen.tsx`, `App.tsx` view routing |
| **hearts** | likes / received / contact share | `useHearts.ts`, `received-like-update.ts`, `sent-like-insert.ts`, `pending-hearts.ts`, `heart-toast.ts`, heart dialogs |
| **chat** | 1:1 list + room | `useChat.ts`, `chat-*.ts`, `ChatScreen.tsx` |
| **group** | catalog + room | `useGroupChat.ts`, `group-*.ts`, `GroupChatScreen.tsx` |
| **contact** | share / view / QR | contact modals + `contact-share-event.ts` + `loadContactShareData` |
| **admin / test** | separate shells | `AdminApp.tsx`, `TestDashboard.tsx` |

Detach = stop wiring the domain hook/callbacks into `App.tsx` / screens; keep pure `lib/*` planners so re-attach is additive.

### Layer status

| Layer | Status |
|-------|--------|
| Pure helpers (`lib/chat-*.ts`, `participant-sot-resync.ts`, `session-ready-settings.ts`, `app-settings-realtime.ts`, `received-like-update.ts`, `sent-like-insert.ts`, `contact-share-event.ts`, `pending-hearts.ts`, `sse-fallback-poll.ts`, `user-signal-merge.ts`, `realtime-row-upsert.ts`, `entry-gate.ts`, …) | Modular — easy attach/detach |
| Domain hooks (`useChat`, `useHearts`, `useGroupChat`, `useParticipantSoTResync`, `useSseFallbackPoll`, `useUserRealtimeChannel`, `useAppShellRealtimeChannels`, `useHeartsRealtimeApply`, `useSocialLockGuards`, `useSessionReadyBootstrap`, `useProfileBootMachine`, `useNicknameRegistration`, `useProfilePrivacyLoaders`, `useDarkModeStorageSync`) | Mostly modular |
| Screens | Prefer **flags + callbacks** (`onRefreshStatus`, `onRefreshChat`, guarded open/join) — do **not** grow App `useState` for peels |
| `App.tsx` (~1.27k lines, peeling) | Wiring shell (hooks + compose) — registration/profile loaders + hearts/group peeled |

### SoT / resync (whole-app domains)

`planParticipantSoTReload` + `runParticipantSoTReload` cover **profiles / chatList / likes / receivedLikes / contactShares / sessionReady**.  
`useParticipantSoTResync` owns visibility + SSE-reconnect effects; App only passes loaders + `applySessionReady`.  
`useSseFallbackPoll` owns unhealthy-SSE interval reloads (same loader set).

**Correctness invariants:** real SSE reconnect always reloads (coalesce-only); visibility still skippable when SSE healthy + fresh; visibility always refreshes `/ready` session/lock even when data SoT is skipped; fallback poll skips when EventSource healthy (UI lag).

### App peel progress (incremental)

Moved out of `App.tsx` (planners/hooks, behavior unchanged): SoT resync, SSE fallback poll, dark-mode storage sync, sent/received like planners + toast payloads, contact-share events, pending-hearts badge count, functions-lock kick plan, user-signal merge, realtime row upserts, settings `/ready` poll gap, profile-view debounce, broadcast notif helpers, entry password/reset planners, **profiles + user-bundle + privacy + signals SSE subscribe** (`useUserRealtimeChannel` + apply callbacks), **app_settings + notifications + contact_share_events SSE** (`useAppShellRealtimeChannels` + apply callbacks), `app-settings-realtime` planner, profile SSE apply planners, block/hide planners, **admin reset wipe** (`admin-reset-wipe` plan+run; App thin `applyResetSignal`), **`/ready` bootstrap + settings poll** (`useSessionReadyBootstrap` + `ready-bootstrap-settings`), **loading-main profile boot/backoff** (`profile-boot-machine` + `useProfileBootMachine`), **early entry gates JSX** (`AppEntryGates`), **main shell + overlay JSX fan-in** (`AppMainShell` / `AppOverlays`), **hearts/contact SSE apply** (`useHeartsRealtimeApply`), **hearts/chat/group lock wrappers** (`useSocialLockGuards`), **nickname/registration + recovery/reset** (`useNicknameRegistration` + `nickname-registration` planners), **profile/privacy/signals loaders** (`useProfilePrivacyLoaders` + `profile-select` column lists).

Still in App (intentionally, next peels toward ~9.5): participant session-init effect, residual privacy/signal SSE apply surface, residual admin/`select('*')` elsewhere. **db.ts peel progressing:** `db-op-filters` + `db-panel-secrets` + `db-sse-ring` + `db-merged-id-map` + `db-table-policy` + `db-sse-fanout-policy` + `db-op-request` (re-import; single router export intact). Full `/op`/RPC router split remains a separate mountain.

Path to ~9.5 = **App shell + domain hooks/planners** via incremental peels — not fake-perfect in one PR. `db.ts` remains a separate maintainability track.

### Quality score path (honest, incremental)

| Checkpoint | Estimate | Notes |
|------------|----------|-------|
| Prior (gates/bootstrap peeled) | **~8.4** | App ~1.87k; wiring + early gates |
| Prior (main/overlay JSX + db filter/secrets) | **~8.7** | App ~1.65k compose; `db.ts` first pure slices |
| Prior (hearts/group apply+guards + db ring/map/policy) | **~9.0** | App ~1.44k; more `db.ts` cohesive modules; message/group selects narrowed |
| This peel (registration/profile loaders + db fanout/op-request) | **~9.2–9.3** | App ~1.27k wiring; SSE fanout plan + `/op` request helpers; App profile `select('*')` cleared |
| Toward ~9.5 | session-init peel; more `db.ts` domain slices; residual admin/`select('*')` elsewhere | Not claimed yet |

### Next incremental steps (no big-bang rewrite)

1. Peel participant session-init effect (post-login profile resolve + share QR) without growing `useState`.
2. Screens keep flags/callbacks only — no new App feature state for modularity work.
3. Further narrow residual `select('*')` outside App (admin/TestDashboard) where safe.
4. Continue `db.ts` peel track (admin wipe / write-path clusters + re-import); keep `38_db_single_router_export`.
5. Do **not** claim 9.5 until App is mostly wiring and `db.ts` has more domain slices beyond fanout/op-request/ring/policy.

## Do not touch casually

`db.ts` persist/SSE/`/op` 경로, `localdb.ts` SSE client, `useChat` offline queue, `net-health` quiet/error windows.
