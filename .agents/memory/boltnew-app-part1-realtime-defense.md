---
name: boltnew-app Part 1 realtime defense
description: SSE Ring Buffer + Last-Event-ID 재전송, 재연결 복구, 동시성 방어 현황
---

# Part 1: 실시간 통신 및 네트워크 방어

## 신규 구현 (2026-08-06)

### 서버 SSE Ring Buffer + Last-Event-ID replay (db.ts)
- `_sseRingBuffer`: 최대 500개 이벤트, TTL 10분 보관
- `_ringAdd(json, targets)`: broadcastAll → targets='all', broadcastToUsers → targets=[...userIds]
- `_ringGetSince(lastSeq, userId, isAdmin)`: 인가 필터링 후 미수신 이벤트 반환
- `broadcastAll` / `broadcastToUsers`: 이제 `id: ${seq}\ndata: ${json}\n\n` 형식으로 SSE 전송
- SSE `/events` 엔드포인트: `Last-Event-ID` 헤더 확인 → ring buffer replay 후 keepalive 시작
- keepalive ping은 ring buffer에 추가하지 않음 (재전송 불필요)

**Why:** 브라우저 EventSource는 RFC 8898에 따라 재연결 시 Last-Event-ID 헤더 자동 전송.
서버가 ring buffer 이벤트를 재전송하면 최대 10분 단절 구간을 자동 복구 가능.
TTL 초과 단절은 onSseReconnect → loadMessages 전체 리로드로 폴백.

## 이미 구현됐던 방어 (건드리지 않음)
- 클라이언트 오프라인 메시지 큐 (pendingQueueRef + flushPendingQueue) in useChat.ts
- SSE 재연결 지수 백오프 + 지터 (calcSseBackoffMs) in localdb.ts
- 15초 ping timeout 좀비 감지 (PING_TIMEOUT_MS) in localdb.ts
- sendMessage 3회 재시도 + 낙관적 메시지 유지 in useChat.ts
- likes 3중 키 rate limiter (liker:liked:heart_type) in db.ts
- messages client_id 멱등 dedup in db.ts
- MAX_CONCURRENT_OPS(80) + 503 반환으로 DB 과부하 방어 in db.ts
- pool max:50 + connectionTimeoutMillis:5000 in db.ts
- broadcastAll 50개씩 청킹으로 이벤트 루프 독점 방지 in db.ts

## How to apply
- ring buffer 관련 코드는 db.ts 상단 (ALLOWED_OP_TABLES 직후)에 위치
- SSE replay는 클라이언트를 sseUserMap에 추가한 후 keepalive 이전에 실행
- 클라이언트 dedup은 applySseInsert/applyLoadMessages가 담당 (chat-reducers.ts)
