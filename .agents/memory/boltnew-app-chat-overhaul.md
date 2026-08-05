---
name: boltnew-app chat overhaul 2026-08-05
description: 채팅 시스템 6가지 구조적 결함 수정 내역 — 재발 방지를 위한 설계 원칙 기록
---

## 수정된 결함 6가지

### 1. seatingLocked가 채팅 버튼까지 차단 (App.tsx)
- **문제**: `onChat={() => { if (!seatingLocked) openChat(...) }}` — 자리 배치 잠금이 채팅까지 막음
- **수정**: `seatingLocked` 조건 제거. 채팅은 `functionsLocked`(관리자 전체 잠금)에만 영향 받아야 함
- **Why**: seatingLocked는 좌석 이동 차단용. 채팅은 별도 소통 채널로 항상 허용해야 함

### 2. 상대가 새 채팅방을 만들어도 내 목록 미갱신 (useChat.ts)
- **문제**: `chats` 테이블 INSERT에 대한 SSE/realtime 구독 없음 → 수동 새로고침 필요
- **수정**: `new-chats-u1-{uid}` / `new-chats-u2-{uid}` 두 Supabase 채널 추가 (user1_id, user2_id 각각)
- **수정 위치**: `loadChatList` useCallback **이후**에 배치 (TDZ 방지)
- **효과**: 새 채팅 감지 → loadChatList → chatIdsKey 변경 → perChatChannels가 새 채팅 자동 구독

### 3. perChatChannels cleanup이 모든 채널을 끊고 재구독 (useChat.ts)
- **문제**: cleanup 함수가 chatIdsKey 변경 시마다 전체 채널 제거 → 재구독 갭(~100-200ms) 발생
- **수정**: effect를 2개로 분리
  - Effect A: `[currentUserId]` dep → userId 변경/언마운트 시만 전체 정리
  - Effect B: `[chatIdsKey, currentUserId]` dep → 선택적 추가/제거만, cleanup return 없음
- **Why**: 기존 채팅방 채널은 새 채팅방 추가 시 건드리면 안 됨

### 4. selfInitiatedPairTimerRef 언마운트 시 미정리 (useChat.ts)
- **문제**: openChat에서 set한 타이머가 언마운트 후에도 state 업데이트 시도 가능
- **수정**: useEffect([], cleanup)로 언마운트 시 clearTimeout
- **수정 위치**: `selfInitiatedPairTimerRef = useRef(...)` **이후**에 배치 (TDZ 방지)

### 5. sendMessage/sendImage SSE 의존 제거 (useChat.ts)
- **문제**: optimistic 메시지를 SSE가 올 때까지 기다렸다가 교체 → race condition
- **수정**: `.insert().select().single()`로 HTTP 응답에서 바로 실제 DB 행 수신 → optimistic 즉시 교체
- **Why**: SSE는 "타인 메시지 수신"에만 사용. 내 메시지는 HTTP 응답이 더 빠르고 신뢰할 수 있음

### 6. NEEDS_MIGRATION 로그 개선 (localdb.ts)
- **상태**: 서버는 이미 first-claim 허용 (device_secrets에 없으면 새로 등록) → NEEDS_MIGRATION 발생 안함
- **수정**: 클라이언트 로그 메시지를 정확한 원인(해시 불일치)으로 업데이트

## 설계 원칙

**채팅 state 경로**:
- 내가 보낸 메시지: HTTP insert → .select().single() → optimistic 교체 (SSE 도착 시 id 중복으로 무시)
- 타인 메시지: SSE(perChatChannels) → applySseInsert
- 새 채팅 생성: Supabase realtime(new-chats 채널) → loadChatList → chatIdsKey 변경 → perChatChannels 자동 구독
- SSE 재연결: onSseReconnect → loadChatList + loadMessages + syncUnreadCounts

**Hook 위치 원칙**: useEffect 내부에서 const로 선언된 변수(useCallback 등)를 deps 배열에서 참조하면 TDZ 오류. 항상 선언 이후에 배치.
