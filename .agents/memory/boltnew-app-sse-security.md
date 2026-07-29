---
name: boltnew-app SSE security fix
description: SSE broadcast was leaking all events to all clients; fixed with server-side userId routing. Also documents API filter format and push endpoint param name.
---

## SSE 보안 취약점 수정

**문제:** `broadcast()` 함수가 `sseClients: Set<Response>` 에 연결된 모든 클라이언트에게 무차별 전송.
messages, likes, chats 등 민감 이벤트가 전체 브라우저에 노출 (Network 탭으로 타인 채팅 열람 가능).

**수정:**
- `sseClients` → `sseUserMap: Map<string, Set<Response>>` + `sseAnonClients: Set<Response>`
- SSE 엔드포인트 `/events?userId=<id>` 파라미터로 연결 등록
- `broadcast()` 제거 → `broadcastAll()` / `broadcastToUsers(ids, event)` / `smartBroadcast(table, row, event)` 3종 추가
- `smartBroadcast` 라우팅 규칙:
  - `messages` → chats 조회 후 user1_id + user2_id에게만
  - `likes` → liker_id + liked_id에게만
  - `chats` → user1_id + user2_id에게만
  - `contact_shares/events` → sharer/receiver/sender/recipient에게만
  - `chat_reads` → user_id에게만
  - seats, profiles, app_settings, games → broadcastAll
- 클라이언트 `localdb.ts`: `setLocalDbUserId(userId)` 추가, EventSource URL에 userId 포함
- `App.tsx`: `useEffect(() => setLocalDbUserId(currentUserId), [currentUserId])`

**Why:** 클라이언트 측 filter matching만으로는 부족 — 데이터 자체가 네트워크로 전송되므로 서버에서 차단해야 함.

## API 필터 포맷

`/api/db/op` endpoint의 filter 형식: `{ type: 'eq', col: 'xxx', val: 'yyy' }` (not `op: 'eq'`).
localdb.ts의 QueryBuilder가 이 형식으로 변환해서 전송함.

## Push notify 엔드포인트

`POST /api/db/push/notify` → body: `{ recipientId, title, body, tag?, url? }`
(`userId` 아님 — 앱 hooks도 `recipientId` 사용 확인됨)

## 데이터 무결성

유령 프로필(nickname: null) 삭제 시 연결된 messages/likes/chats 고아 레코드도 함께 정리해야 함.
