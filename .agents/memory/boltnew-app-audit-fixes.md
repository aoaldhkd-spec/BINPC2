---
name: boltnew-app audit fixes
description: Security and reliability bugs found in a deep audit; what was fixed and what remains.
---

## Fixed (2026-07-30)

### Admin auth gaps
`admin_create_session` and `admin_update_profile` in `db.ts` were NOT calling `checkPassword()`.
Result: anyone could create an admin session or modify any profile without the admin password.
**Fix:** added `checkPassword()` at the top of both cases.

### sendMessage push notify always 403
`useChat.ts sendMessage` was calling `fetch('/api/db/push/notify', ...)` but the server requires
`x-internal-secret` header (value = SESSION_SECRET). Client never has this secret.
Server already auto-pushes on SSE insert event. Client call was redundant and noisy.
**Fix:** removed the client-side push notify call entirely.

### sendMessage lastMessage wrong revert on error
On network error, `sendMessage` was doing `c.lastMessage === content ? '' : c.lastMessage`.
If two messages had identical content, the wrong one could be cleared.
**Fix:** capture `prevLastMessage` from `chatListRef.current` before the optimistic update; restore it exactly on error.

### sendImage missing in-flight guard + Date.now() collision
`sendImage` had no lock, so double-tap could upload the same file twice.
Also used `Date.now()` as the storage path, which can collide under load.
**Fix:** added `sendImageInFlightRef`, UUID-based path that matches `client_id` (ON CONFLICT DO NOTHING).

### unread badge zero on app restart
`syncUnreadCounts` was only called on `visibilitychange` and `onSseReconnect`.
After app restart/refresh, badge showed 0 until tab switch or SSE reconnect.
**Fix:** added `useEffect(() => { if (currentUserId) void syncUnreadCounts(); }, [currentUserId, syncUnreadCounts])`.

## Chat deep-fix (2026-07-30)
- openChat() race: openChatGenRef — generation guard prevents stale slow response overwriting newer chatId
- loadChatList() race: loadChatListGenRef — same pattern, stale response discarded
- sendMessage closure pollution: snapshot chatId/currentUserId at call time; setMessages checks chatIdRef.current before adding optimistic msg
- New chat chatList insert: openChat now adds new Chat to chatList immediately → per-chat SSE subscription activates
- newMsgCount badge: when opening a chat, subtract removed unread count from newMsgCount (was never decremented before)
- handleSend async: saves input before clearing, restores on throw; onSend prop type now Promise<void>|void
- sendMessage throws on error: ChatScreen can catch and restore input
- Scroll: instant on initial load (prev===0,cur>1), smooth only for my msgs or when near bottom (<100px); messagesContainerRef added

## Still open / covered by tasks
- Push subscribe endpoint accepts arbitrary userId (Task #21)
- sendImage orphaned storage file on DB insert failure (Task #20)  
- 9000 PIN exhaustion no friendly error (Task #22 / Task #15)
- SSE onerror: onSseReconnect only fires on first message after reconnect (not on reconnect itself)
