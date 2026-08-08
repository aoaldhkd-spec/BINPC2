---
name: boltnew-app Part 3 backend defense
description: 2026-08-08 Part 3 백엔드 방어 강화 — try-catch 전수 래핑, RPC 허용목록, payload 검증 강화
---

## 수정 내용

### health.ts
- `HealthCheckResponse.parse()` 를 try-catch로 래핑 (Zod parse는 throw 가능)

### /broadcast (db.ts)
- 동기 핸들러이지만 broadcastAll 예외 방어를 위해 외부 try-catch 추가

### /rpc/:name (db.ts)
- **ALLOWED_RPCS Set** (17개 유효 RPC 이름) 추가 — 알 수 없는 이름은 404 반환
  ```
  admin_create_session, admin_invalidate_session, admin_auth_phone,
  admin_update_settings, test_resync, test_clear_hearts, admin_force_resync_all,
  test_update_settings, admin_reset_all_seats, admin_full_reset,
  admin_event_end_reset, admin_clear_seat, admin_force_seat,
  admin_clear_profile_seat, admin_swap_seats, admin_update_profile,
  admin_delete_profile
  ```
- name 타입 검증 (string, 100자 이내)
- req.body 타입 방어 (null/primitive/배열 차단)
- catch 블록에서 logger.error 추가

### /admin/clear-db-errors (db.ts)
- 전체 핸들러를 외부 try-catch로 래핑
- adminPassword `typeof === 'string'` 명시 검증 추가

### /op (db.ts)
- table/op 문자열 길이 제한 추가 (table>100, op>50 → 400)
- boolean 필드 타입 검증: single, maybeSingle, selectAfterWrite가 null이 아닌데 boolean이 아니면 400

## 검증 결과
- API 서버 타입체크: 0 errors
- 유닛 테스트: 69/69 PASS
- 스트레스 테스트: 150VU PASS (msg p99:194ms, like p99:100ms, 0% 손실)

## TypeScript "not all code paths return" 패턴
- async 핸들러에서 `if (!res.headersSent) return res.status(500).json(...)` 는 TS가 반환값 없는 경로를 감지함
- 수정: `if (!res.headersSent) res.status(500).json(...); return;` 으로 분리

## 아직 남은 개선 가능 항목 (별도 작업)
- /op payload rows 필드별 스키마 검증 (현재는 sanitizeRow에서 HTML만 strip)
- /push/notify 수신자 allowlist (현재 서버가 자동 push하므로 클라이언트 직접 호출 없음)
