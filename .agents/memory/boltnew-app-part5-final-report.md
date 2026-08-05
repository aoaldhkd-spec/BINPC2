---
name: boltnew-app Part 5 — 최종 검증 및 채팅 전수조사
description: Zero-Bug Architecture 사인오프 결과 (2026-08-05 Part 5)
---

## 최종 검증 결과

| 검증 항목 | 결과 |
|----------|------|
| 유닛 테스트 | ✅ 60/60 PASS |
| 타입체크 (api-server) | ✅ 0 errors |
| 타입체크 (boltnew-app) | ✅ 0 errors |
| 스트레스 테스트 150 VU | ✅ PASS — msg p99:161ms, like p99:82ms, 0% 손실 |

## 채팅 전수조사 발견 및 수정

### CRITICAL 수정 사항

1. **messages INSERT IDOR** — requesterId 없으면 차단; sender_id 불일치 차단; 채팅방 비참여자 삽입 차단.
2. **chats INSERT IDOR** — requesterId 없으면 차단; 본인이 user1_id/user2_id여야만 허용.
3. **chat_reads INSERT IDOR** — requesterId와 reader_id 불일치 시 차단.
4. **채팅방 중복 생성 레이스 컨디션** — 서버 측 user1_id/user2_id 정규화(sort) 추가; 역순 요청으로 인한 중복 채팅방 생성 원천 차단.
5. **SSE callback chatId guard** — 채팅방 전환 중 stale 콜백이 다른 채팅방 메시지를 삽입하는 버그 수정.
6. **메시지 배열 500개 상한** — loadMessages에만 있었던 상한을 SSE append 및 optimistic send 경로에도 추가.

### WARNING 수정 사항

7. **오프라인 큐 무한 증가** — pendingQueueRef 최대 50개 상한 추가; 초과 시 가장 오래된 항목 제거.
8. **스트레스 테스트 스크립트** — 새 IDOR guard에 맞게 requesterId 전달 추가.

## stress-test 스크립트 업데이트 규칙
- messages INSERT: `requesterId: senderId` 필수
- chats INSERT: `requesterId: canonU1` (user1_id 쪽) 필수
- messages SELECT (verification): `requesterId: user1Id` 필수
- **Why:** /op INSERT에 IDOR guard 추가 후 requesterId 없는 요청은 403 반환.
