---
name: SSE broadcast security fixes
description: Data leak vulnerabilities found and fixed in api-server SSE broadcast logic
---

## Rules
- `sanitizeProfile(row)` must be called before any `broadcastAll` of a profiles row — removes phone_number, kakao_id, instagram_id.
- `PRIVATE_TABLES` = messages, likes, chats, contact_shares, contact_share_events, chat_reads. Never broadcastAll for these.
- `admin_event_end_reset`: private tables get `RESET` event (no row data), profiles get sanitized DELETE, public tables get full DELETE.
- `/broadcast` endpoint has IP-based rate limit (30 req / 5s window). This is intentional — do not remove.

**Why:** admin_event_end_reset previously leaked full rows of messages/likes/chats/contact_shares to all clients. admin_update_profile leaked phone/kakao/instagram to everyone on each admin edit. smartBroadcast for profiles also leaked contact data on every INSERT/UPDATE.

**How to apply:** Any new broadcastAll call for profiles table must use sanitizeProfile(). Any new RPC that deletes private table rows should skip broadcasting row data.
