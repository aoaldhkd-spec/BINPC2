---
name: boltnew-app Part 3 backend defense
description: Part 3 try-catch·DB 최적화·페이로드 검증 결과 (2026-08-05)
---

## Item 9: 예외 처리 전수 래핑

| 위치 | 수정 |
|------|------|
| `index.ts` | `process.on('unhandledRejection')` + `process.on('uncaughtException')` 추가 |
| `app.ts` | 글로벌 Express 4-인자 에러 미들웨어 추가 (모든 라우트 throw/reject 포착) |
| `db.ts` `/storage-upload` | 핸들러 전체 try-catch 추가 |
| `db.ts` `/push/notify` | 핸들러 전체 try-catch 추가 (`Promise<void>` 리턴 타입 명시) |
| `db.ts` `dbDeleteRow` | `pool.query` try-catch + 로그 추가 |
| `db.ts` `dbDeleteTable` | `pool.query` try-catch + 로그 추가 |

**Why:** Express async 핸들러에서 throw되면 Express 4.x 기본 동작은 unhandledRejection — 전역 핸들러 없으면 Node.js 프로세스 다운. 4-인자 미들웨어 + 전역 핸들러 조합으로 완전 차단.

## Item 10: DB 쿼리 최적화·커넥션 관리

**N+1 배치 삭제 (`dbDeleteRows`):**
- 만료된 push_subscriptions을 기존에 `for..of` 루프로 건별 DELETE → `DELETE WHERE row_id = ANY($2::text[])` 단일 쿼리로 교체
- 3곳 모두 적용: `notifyAdminDbFailure`, push expiry 정리 함수, `/push/notify` 핸들러

**커넥션 풀 현황 (기존 OK):**
- `pg.Pool({ max: 50, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })`
- `pool.connect()` 수동 checkout 없음 — 모든 쿼리가 `pool.query()` (자동 반환)
- `setupListenClient()` 전용 연결: 에러 시 5초 후 자동 재연결 (기존 OK)

## Item 11: 페이로드 검증

| 엔드포인트 | 수정 |
|------------|------|
| `/op` | `table`/`op` string 타입 검증; `op` 5-항목 허용 목록 (`select`·`insert`·`update`·`upsert`·`delete`); `limit` 양수 number 검증; `orders` 요소 구조 검증 (`{col:string, asc:boolean}`); `conflictCols` 문자열 배열 검증; `filters` 요소 구조 검증 (`col`·`type` string 필수) |
| `/broadcast` | `channel`/`event` 비어있지 않은 문자열 + 최대 200자 검증 |
| `/push/notify` | 기존 유효성 검증 유지; try-catch로 전체 감쌈 |

**Why:** 악의적/버그성 요청이 `op:'unknown'` 또는 `orders:[null]` 등을 보내면 applyFilters/sort에서 TypeError 발생 → 서버 에러. 검증으로 즉시 400 반환.

## 남은 gap (허용된 미완)
- `/rpc/:name` 개별 함수 인자의 타입 검증: 현재는 TypeScript 캐스팅만. password 체크(checkPassword)가 실질적 방어층이므로 위험도 낮음.
- `/push/subscribe` 구독 객체 심층 검증: 현재 truthiness만 확인. 실질적 위험은 낮음 (SSE 토큰 인증이 선행).
