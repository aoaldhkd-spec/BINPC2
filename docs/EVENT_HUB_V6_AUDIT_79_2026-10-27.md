# V6 감사 79건 분류와 위험 보완 — 2026-10-27

기준 HEAD `ad364b75`. 기존 단위1296/DB56/브라우저5 증거와 원래 ZIP을 보존했다. 감사의 79개 warn은 중요도와 같지 않다. 실제 인증값 노출이 확인된 P0/P1 항목은 이 79건에서 발견하지 못했다. 이를 전체 앱 보안 보장으로 해석하지 않는다. 비밀값 원문은 이 보고서/JSON에 복사하지 않았다.

| 분류 | 건수 | 판정 |
|---|---:|---|
| 생성 번들/라이브러리 | 1 | 검토 후 P3, 검사 유지 |
| 합성 테스트/테스트 설정 | 73 | 검토 후 P3, 검사 유지 |
| 독립 브라우저 fixture | 1 | 검토 후 P3, 검사 유지 |
| 감사 규칙 자기 탐지 | 1 | 검토 후 P3, 검사 유지 |
| 마스킹 문자열 | 1 | 검토 후 P3, 검사 유지 |
| 주석의 토큰 예시 | 2 | 검토 후 P3, 검사 유지 |

입금·권한·개인정보 관련 합성 비밀번호는 부정 접근 거절/해시/복구 검사의 입력이며 실제 운영 비밀번호로 바꾸거나 지우지 않았다. 생성 번들의 빈 catch나 감사 정규식을 경고 숫자를 낮추려고 삭제하지 않았다. 기계 출력 `--json <경로>`는 전체 경고 위치를 제공하며 소스의 인증 문자열은 제외한다.

## 별도로 발견한 중요 위험

- **P1 운영 작업 오실행:** `scripts/bootstrap-production.mjs`, `scripts/rotate-exposed-secrets.mjs`는 기본 실행 시 운영 설정/DB 비밀번호/배포를 바꿀 수 있었다. 현재는 credential 파일 접근/네트워크/파일 변경보다 먼저 명시적 target·대상별 확인을 요구한다. `--dry-run`은 credential 접근도 하지 않고 종료한다. 실제 운영 실행은 하지 않았다.
- **P1 민감 오류 노출:** 위 스크립트가 provider 오류 본문을 그대로 오류 메시지에 넣는 경로를 제거했다. 최종 콘솔 오류는 공통 마스킹을 거친다.
- **P2 기기 저장소 차단:** 허브의 테마 읽기/미전송 문의 draft 저장 실패가 화면을 깨뜨리지 않도록 했다. 실제 입장 전 두 브라우저 저장소를 확인하여 연결 저장이 불가능한 기기에 새 입장 변경을 보내지 않는다. 저장 중 차단이 발생해도 서버 승인 기록은 보존하고 재신청·재입금 대신 복구 안내를 표시한다. 독립 시험실은 가상 흐름을 유지한다.

검증 결과와 다운로드·원격 저장 상태는 `EVENT_HUB_V6_RISK_FOLLOWUP_2026-10-27.md`를 참조한다.

## 79건 개별 기록

| 번호 | 위치 | 종류 | 중요도 | 관련 영역 |
|---:|---|---|---|---|
| 1 | .local/preview/build/assets/index-OasZ53Xf.js:3 | 생성 번들/라이브러리 | P3 | 보안 |
| 2 | artifacts/api-server/src/__tests__/admin-event-end-reset.test.ts:9 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 3 | artifacts/api-server/src/__tests__/broadcast-targets.test.ts:7 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 4 | artifacts/api-server/src/__tests__/db-security.test.ts:30 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 5 | artifacts/api-server/src/__tests__/db-security.test.ts:299 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 6 | artifacts/api-server/src/__tests__/db-security.test.ts:1013 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 7 | artifacts/api-server/src/__tests__/db-security.test.ts:1076 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 8 | artifacts/api-server/src/__tests__/db-security.test.ts:1077 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 9 | artifacts/api-server/src/__tests__/db-security.test.ts:1078 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 10 | artifacts/api-server/src/__tests__/db-security.test.ts:1102 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 11 | artifacts/api-server/src/__tests__/db-security.test.ts:1107 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 12 | artifacts/api-server/src/__tests__/db-security.test.ts:1112 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 13 | artifacts/api-server/src/__tests__/db-security.test.ts:1174 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 14 | artifacts/api-server/src/__tests__/db-security.test.ts:1175 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 15 | artifacts/api-server/src/__tests__/db-security.test.ts:1179 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 16 | artifacts/api-server/src/__tests__/db-security.test.ts:1185 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 17 | artifacts/api-server/src/__tests__/db-security.test.ts:1243 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 18 | artifacts/api-server/src/__tests__/db-security.test.ts:1251 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 19 | artifacts/api-server/src/__tests__/db-security.test.ts:1268 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 20 | artifacts/api-server/src/__tests__/db-security.test.ts:1273 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 21 | artifacts/api-server/src/__tests__/db-security.test.ts:1290 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 22 | artifacts/api-server/src/__tests__/db-security.test.ts:1295 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 23 | artifacts/api-server/src/__tests__/db-security.test.ts:1302 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 24 | artifacts/api-server/src/__tests__/db-security.test.ts:1332 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 25 | artifacts/api-server/src/__tests__/db-security.test.ts:1343 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 26 | artifacts/api-server/src/__tests__/hearts-chat-group-invariants.test.ts:10 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 27 | artifacts/api-server/src/__tests__/load-venue-150.test.ts:9 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 28 | artifacts/api-server/src/__tests__/push-self-test.test.ts:6 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 29 | artifacts/api-server/src/__tests__/sulbun-event-reset.test.ts:9 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 30 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:14 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 31 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:22 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 32 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:23 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 33 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:25 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 34 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:42 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 35 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:48 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 36 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:55 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 37 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:62 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 38 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:63 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 39 | artifacts/api-server/src/lib/db-app-settings-boot.test.ts:64 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 40 | artifacts/api-server/src/lib/db-app-settings-view.test.ts:40 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 41 | artifacts/api-server/src/lib/db-app-settings-view.test.ts:41 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 42 | artifacts/api-server/src/lib/db-app-settings-view.test.ts:42 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 43 | artifacts/api-server/src/lib/db-app-settings-view.test.ts:43 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 44 | artifacts/api-server/src/lib/db-app-settings-view.test.ts:115 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 45 | artifacts/api-server/src/lib/db-session-tokens.test.ts:21 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 46 | artifacts/api-server/src/lib/event-hub.pg.test.ts:459 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 47 | artifacts/api-server/src/lib/event-hub.pg.test.ts:476 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 48 | artifacts/api-server/src/lib/event-hub.pg.test.ts:486 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 49 | artifacts/api-server/src/lib/event-hub.pg.test.ts:495 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 50 | artifacts/api-server/src/lib/event-hub.pg.test.ts:534 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 51 | artifacts/api-server/src/lib/event-hub.pg.test.ts:547 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 52 | artifacts/api-server/src/lib/event-hub.pg.test.ts:570 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 53 | artifacts/api-server/src/lib/event-hub.pg.test.ts:746 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 54 | artifacts/api-server/src/lib/event-hub.pg.test.ts:762 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 55 | artifacts/api-server/src/lib/event-hub.pg.test.ts:773 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 56 | artifacts/api-server/src/lib/event-hub.pg.test.ts:782 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 57 | artifacts/api-server/src/lib/event-hub.pg.test.ts:824 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 58 | artifacts/api-server/src/lib/event-hub.pg.test.ts:843 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 59 | artifacts/api-server/src/lib/event-hub.pg.test.ts:882 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 권한/인증 |
| 60 | artifacts/api-server/src/lib/event-hub.pg.test.ts:978 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 61 | artifacts/api-server/src/lib/event-hub.pg.test.ts:1081 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 62 | artifacts/api-server/src/lib/event-hub.pg.test.ts:1118 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 63 | artifacts/api-server/src/lib/event-hub.pg.test.ts:1229 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 64 | artifacts/api-server/src/lib/event-hub.pg.test.ts:1353 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보 |
| 65 | artifacts/api-server/src/lib/event-hub.pg.test.ts:1638 | 합성 테스트/테스트 설정 | P3 | 보안, 개인정보, 입금/회비 |
| 66 | artifacts/api-server/vitest.config.ts:14 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 67 | artifacts/boltnew-app/scripts/check-responsive-preview.mjs:55 | 독립 브라우저 fixture | P3 | 보안 |
| 68 | artifacts/boltnew-app/src/admin/LoginScreen.test.tsx:60 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 69 | artifacts/boltnew-app/src/event-hub/event-laboratory-store.test.ts:173 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 70 | artifacts/boltnew-app/src/lib/signal-match.test.ts:152 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 71 | artifacts/boltnew-app/src/lib/signal-match.test.ts:247 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 72 | artifacts/boltnew-app/tests/event-hub-v6.spec.ts:188 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 73 | artifacts/boltnew-app/tests/event-hub-v6.spec.ts:293 | 합성 테스트/테스트 설정 | P3 | 보안 |
| 74 | scripts/full-code-audit.mjs:55 | 감사 규칙 자기 탐지 | P3 | 보안 |
| 75 | scripts/lib/ops-client.mjs:103 | 마스킹 문자열 | P3 | 보안, 권한/인증 |
| 76 | scripts/rotate-exposed-secrets.mjs:9 | 주석의 토큰 예시 | P3 | 보안 |
| 77 | scripts/rotate-exposed-secrets.mjs:10 | 주석의 토큰 예시 | P3 | 보안 |
| 78 | scripts/test/ops-client.test.mjs:127 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
| 79 | scripts/test/ops-client.test.mjs:128 | 합성 테스트/테스트 설정 | P3 | 보안, 권한/인증 |
