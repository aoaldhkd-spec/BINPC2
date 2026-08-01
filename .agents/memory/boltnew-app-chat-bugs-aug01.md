---
name: boltnew-app chat bugs 2026-08-01
description: 2026-08-01 채팅 먹통 원인 분석 및 수정 사항. 실사용자 90명 테스트 실패 후 발견.
---

# 채팅 먹통 원인 및 수정 (2026-08-01)

## 수정된 버그들

### 1. device_secret NEEDS_MIGRATION — 기존 계정 SSE 영구 차단 (최고 심각)
- **원인**: `/auth/login`에서 `device_secrets` 테이블에 해당 userId 없으면 401 NEEDS_MIGRATION 반환 → `fetchAndSetSseToken` 실패 → SSE 토큰 발급 불가 → 실시간 메시지 영구 차단
- **수정**: first-claim 허용 — userId가 profiles에 존재하면 최초 deviceSecret을 자동 등록하고 세션 수립 (`db.ts` /auth/login, 1573-1577)
- **Why**: device_secret 시스템 도입 이전 가입자는 모두 영향받음. 내부 앱이므로 first-claim 보안 위험 수용 가능.

### 2. chatList 의존성 → 채널 전체 재생성 (성능 심각)
- **원인**: `useEffect([chatList, currentUserId])` — `lastMessage` 업데이트마다 chatList 레퍼런스 변경 → 모든 per-chat 채널 해제·재생성
- **수정**: `chatIdsKey = chatList.map(c => c.id).join(',')` 를 dep으로 사용; 내부에서 `chatListRef.current` 참조
- **Why**: lastMessage는 채널 구성과 무관; 채널 재생성은 ID 집합 변경 시에만 필요.

### 3. loadMessages 오류 무음 처리
- **원인**: `const { data } = await ...` — error 무시, 실패 시 빈 화면
- **수정**: `const { data, error } = await ...` — error 시 console.error + return false; 반환값 boolean

### 4. 8초 폴링 무한 재시도
- **원인**: 서버 다운/DB 오류 시에도 8초마다 계속 요청
- **수정**: `pollFailCount` 카운터 — 3회 연속 실패 시 폴링 중단

## 150명 테스트 스크립트
`artifacts/api-server/scripts/chat-test-150.mjs`
- 150 프로필 생성, first-claim SSE 인증, 1:다 팬아웃(49방), 다:1 팬인(50명 동시), 중복채팅방 방지, client_id 멱등성, 150명 동시 목록조회
- **결과**: 전 항목 PASS. 팬아웃 p95=35ms, 팬인 p95=23ms, 목록 p95=172ms

## 핵심 아키텍처 메모
- `supabase` 객체는 localdb.ts에서 export되는 mock client (실제 Supabase 아님)
- `channel().subscribe()` → SSE `_sseListeners`에 핸들러 추가
- `from().select/insert()` → POST /api/db/op
- SSE 401 후 EventSource는 CLOSED → 5초 후 ensureSse() 재시도
- `setSseToken()` 호출 시 기존 _es 닫고 새 EventSource (토큰 포함) 생성
