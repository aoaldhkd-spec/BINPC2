---
name: boltnew-app audit findings
description: Key bugs found and fixed during full feature audit (hearts, realtime, chat, entry).
---

## Rules of Hooks in Custom Hooks
useState calls inside a custom hook must be at the TOP of the hook body — not interleaved after function declarations. HMR will catch this as a hook order change even though it's technically in the hook body. Always declare all useState/useRef/useCallback at the top before any `const fn = () => {}` declarations.

## Self-like guard
`useHearts.ts > handleLike` must check `if (profileId === currentUserId) return;` to prevent users liking themselves.

## likeInFlight lock
`useHearts.ts > executeLike` needs an in-flight boolean state (`likeInFlight`) declared at the top of the hook to prevent rapid double-clicks submitting two likes.

## api-server likes dedup
`api-server/src/routes/db.ts > INSERT handler` must check for existing `(liker_id, liked_id, heart_type)` before inserting a like row. Without this, rapid clicks bypass the client-side guard.

## Message optimistic dedup window
`useChat.ts` optimistic update matching (replacing `__opt_` messages with real ones) must include a time window check (5s) to avoid matching a later identical message from the same sender.

## sendMessage error feedback
`useChat.ts > sendMessage` previously failed silently. Now shows an `alert()` on error and removes the optimistic message from the list.

## Chat subscription gap (non-issue)
The `chatChannel` subscription for new chats INSERT already exists in App.tsx (realtime:chats-user). When user B receives a new chat via SSE, `setChatList` is called which triggers the `useEffect([chatList])` in useChat.ts to subscribe to messages for that chat.
