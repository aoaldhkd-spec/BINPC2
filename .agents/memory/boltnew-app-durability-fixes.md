---
name: boltnew-app durability fixes
description: Idempotency and rate-limiter details for messages/likes under 100-VU concurrent load.
---

# boltnew-app durability fixes

## Messages idempotency
`useChat.sendMessage` sends `client_id: optimisticId.replace('__opt_', '')` (a UUID).
Server INSERT handler checks `tableData.find(r => r.client_id === effectiveRow.client_id)` before inserting — returns existing row on duplicate. Key: the `client_id` must be a stable UUID (not timestamp-based) so retries on network drop always match.

## Likes time-bucket rate limiter
`_likesLastInsert: Map<string, number>` keyed on `${liker_id}:${liked_id}:${heart_type}` with 500 ms cooldown.
**Critical**: the key MUST include `heart_type`. If keyed on `liker:liked` only, 100 concurrent sends of different heart types from the same user are all blocked — breaking the legitimate 4-hearts-per-person flow.

**Why:** JS is single-threaded so in-memory check+push is race-free, but the rate limiter is belt-and-suspenders for burst protection.

## Health endpoint alarms
`GET /api/db/health` returns `ok: boolean`, `alarms: string[]`, `lag: { messages, likes }`.
Alarm threshold: `LOSS_ALARM_THRESHOLD = 5` rows difference between in-memory count and DB count.
`_likesLastInsert` is pruned every 10 s to prevent unbounded growth.

## Stress test
Script: `artifacts/api-server/scripts/stress-test.mjs`. Run with `BASE_URL=http://localhost:8080 node scripts/stress-test.mjs`.
Verified: 100 VU messages p99=99ms, 100 VU likes p99=67ms, 0% loss, 0 alarms.
