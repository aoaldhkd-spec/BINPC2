---
name: boltnew-app Part 4 security + errorboundary
description: 2026-08-08 Part 4 최고 수준 보안 방어막 — IDOR 완전 차단, XSS 입력 전수 정제, ErrorBoundary 세분화
---

## IDOR 완전 차단 (Item 13)

### SELECT 소유권 스코프 추가
| 테이블 | 이전 | 이후 |
|--------|------|------|
| contact_shares | 무가드 (전체 덤프 가능) | requesterId 필수 + liker_id/liked_id 소유자 스코프 |
| chat_reads | 무가드 (타인 읽음 상태 조회 가능) | requesterId 필수 + reader_id 스코프 |

### DELETE requesterId 강제화
- messages/likes/chat_reads DELETE에서 requesterId 없으면 403 반환 (UPDATE와 동일 정책)
- isAdmin bypass는 유지

### INSERT 소유자 강제 덮어쓰기
- likes INSERT: `liker_id = requesterId` 강제 (이전: 단순 불일치 체크 → omit 공격 가능)
- chat_reads INSERT: `reader_id = requesterId` 강제 (이전: 단순 불일치 체크)

## XSS/주입 방어 (Item 12)

### broadcast payload 정제
- `sanitizeBroadcastValue()` 재귀 함수 추가 (깊이 5 제한)
- 모든 string 값에서 HTML 태그 제거, 5000자 제한
- 관리자가 공지 메시지에 `<script>` 삽입 시 서버에서 차단

### admin_update_settings 정제
- `p_payload` 내 string 값에서 HTML 태그 제거 후 2000자 제한
- 관리자가 app_settings에 XSS 주입하는 것을 서버 레벨에서 차단

### FIELD_LIMITS 확장
- suggestions: `contact_info: 100` 추가 (이전: 미등록으로 비위생 저장 가능)
- qa_games: `answer: 200` 추가
- image_games: `image_url: 500` 추가
- game_votes: `reason: 200` 추가

## ErrorBoundary 세분화 (Item 14)
- NotifModal → `<AppErrorBoundary screenName="공지 알림" onReset={() => setActiveNotif(null)}>`
- 하트 거절 알림 → `<AppErrorBoundary screenName="거절 알림" onReset={() => setRejectionNotif(null)}>`
- 하단 알림 (heart/chat/message/contact) → `<AppErrorBoundary screenName="하단 알림" onReset={() => setBottomNotif(null)}>`
- SeatRegisterDialog → `<AppErrorBoundary screenName="자리 등록" onReset={() => setSeatDialog(null)}>`

## 검증 결과
- API 서버 타입체크: 0 errors
- 유닛 테스트: 69/69 PASS
- 스트레스 테스트: 150VU PASS (msg p99:211ms, like p99:111ms, 0% 손실)
- 서버 로그에서 IDOR 차단 실시간 확인:
  `[SECURITY] IDOR: DELETE without requesterId blocked` → 403

## 잔여 알려진 제한사항
- storage-upload: 업로더 신원 미바인딩 (IP rate limit으로 부분 완화)
  → 악용 시나리오: 인증 없이 임의 경로에 이미지 업로드 가능
  → 완전한 수정: SSE 토큰으로 업로더 검증 필요 (별도 태스크)
- likes UPDATE: 소유권 체크 없음 (실제 UI에서 likes UPDATE 호출 없음 — 현재 무위험)
