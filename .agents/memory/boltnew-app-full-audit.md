---
name: boltnew-app full-feature audit results
description: Complete audit findings and fixes from the 2026-07-31 full-feature inspection. What was fixed, what remains, and permanent guard-rails established.
---

# Full-feature audit (2026-07-31)

## Fixed in this session

### Server (artifacts/api-server/src/routes/db.ts)
- `/admin/clear-db-errors` — changed `if (expectedPw && ...)` → `if (!expectedPw || ...)` (CRITICAL: was bypassable when no password set)
- `/health` — removed `recentErrors` array from public response (hid internal DB error strings)
- `/storage-upload` — added path sanitization (no `..`, no leading `/`, alphanum only), MIME allowlist (jpeg/png/webp/gif only), 5MB size cap
- `/push/subscribe` — added per-user 5-subscription sliding-window cap (oldest evicted on overflow)
- Likes — added per-user global 20-likes/minute bucket on top of existing per-combination 500ms throttle
- `_userLikeMinuteBuckets` map added near top of file alongside `_likesLastInsert`

### Client hooks
- `useHearts.ts` — `loadLikes`/`loadReceivedLikes`/`loadContactShareData`: added try/catch
- `useHearts.ts` — `handleHeartResponse`: added in-flight lock (heartResponseInFlightRef), try/catch, and optimistic rollback on failure
- `useHearts.ts` — `handleContactShare`: `contact_share_events` insert failure is now non-fatal with console.warn instead of silent ignore
- `useHearts.ts` — `handleContactShareReject`: added try/catch (non-fatal; modal always closes)
- `useChat.ts` — `deleteChat`/`deleteAllChats`/`deleteMessage`: UI updates only after server confirms; rollback on error; partial-delete handled for deleteAllChats
- `useChat.ts` — `sendImage`: orphan cleanup — `storage.remove([data.path])` called if message insert fails
- `useSeating.ts` — `handleRegisterSeat`: wrapped entire body in try/catch; generic alert on unexpected error

### Client components
- `SeatingMap.tsx` — `handleMoveTo`: added `moveBusyRef = useRef(false)` to prevent double-tap force-move; fixed missing `useRef` in import

## Known remaining gaps (proposed as follow-up tasks #46–48)
- `/broadcast` role check: any authenticated SSE-token holder can send arbitrary events to all clients
- Invalid birth dates (Feb 30 etc.) silently accepted; fortune calculations normalize them incorrectly
- Profile photo upload: orphaned file if profile update step fails (only chat images are cleaned by Task #20)

## Architecture invariants to maintain
- RPC endpoint is `/api/db/rpc/:name` (not `/api/db/rpc`) and uses `p_admin_password` field
- Admin password seed default: `'116606'` (app_settings.admin_password)
- `/broadcast` requires `x-broadcast-token` + `x-broadcast-userid` headers (HMAC SSE token)
- Per-user like bucket key: `liker_id` string in `_userLikeMinuteBuckets` Map
- Push subscription cap: `USER_MAX_PUSH_SUBS = 5` (oldest evicted on overflow)
