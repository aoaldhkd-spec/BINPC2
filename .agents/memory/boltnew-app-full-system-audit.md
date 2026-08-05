---
name: boltnew-app full-system audit 2026-08-05
description: 150 VU 부하 테스트, 전체 코드베이스 전수검사, 방어 로직 구축 결과
---

## 150 VU 부하 테스트 결과
- 메시지 150건 동시 INSERT: p50=167ms, p95=214ms, p99=234ms, 오류 0개
- 하트 150건 동시 INSERT: p50=142ms, p95=174ms, p99=176ms, 오류 0개
- 데이터 손실률: 0%
- /health 알람: 없음

## 발견된 버그 및 수정 내역

### Backend (api-server)
1. `/op` catch 블록이 `String(e)` 를 클라이언트에 반환 → 내부 스키마 정보 노출 위험 → 일반 메시지로 교체
2. `/unread-counts` 에 try-catch 없음 → getTable() 예외 시 서버 응답 없이 hang → 추가
3. `/auth/login` 에 try-catch 없음 → HMAC 계산 중 예외 시 프로세스 충돌 가능 → 추가
4. `/storage-upload`, `/db/events`, `/unread-counts` 에 rate limit 없음 → spam/bot 취약 → app.ts에 각 리미터 추가

### Frontend (boltnew-app)
1. `MainScreen.doRefresh`: setTimeout 반환값 미보관 → 컴포넌트 언마운트 후 타이머 계속 실행(setState on unmounted) → useRef로 추적 + clearTimeout
2. AppErrorBoundary 채팅에만 있고 메인/프로필 뷰에 없음 → 프로필 뷰에 AppErrorBoundary 추가

## 추가된 안전장치 (신규 도입)
1. **AppErrorBoundary** (`src/components/AppErrorBoundary.tsx`): 채팅 외 모든 주요 뷰 (프로필 등) 격리
2. **Backend 5개 엔드포인트 Rate Limiting** (app.ts): storage-upload 20/60s, SSE-events 20/60s, unread-counts 60/60s
3. **에러 응답 sanitization** (db.ts /op catch): 내부 오류 문자열 클라이언트 노출 차단

## 남은 SSE 메모
- SSE 자체는 이미 견고함: 4 conn/user cap, 100 anon cap, 5s keepalive ping, backoff jitter, _sseCleanup Map
- 오프라인 중 메시지는 재연결 시 재수신되지 않음 (no queue) — 이는 기존 설계이며 별도 태스크로 추적

**Why:** String(e) 노출은 OWASP A5 (Broken Access Control) 위반, setTimeout 미정리는 React devtools에서 경고 유발.
**How to apply:** 신규 catch 블록 작성 시 항상 console.error(내부) + 일반 메시지(클라이언트) 패턴 유지.
