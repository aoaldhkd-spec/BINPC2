# BINPC2 운영 서버 세션 SQL 번들 오류 — 안전 수정 기록
작성일: 2026-10-27 KST
상태: **IMPLEMENTED + TESTED (별도 개발본), 운영 배포·실이용자 복구 여부 UNKNOWN**

## 이번 범위 및 멈출 지점
- 이번에 한다: 운영에서 반복 확인된 `Failed to prune sessions: ENOENT ... dist/table.sql`의 빌드 경로 오류를 최소 수정하고 관련 테스트·기존 API 회귀시험을 진행한다.
- 이번에 멈춘다: GitHub `main` 병합·Render/Netlify 실제 배포·운영 DB 쓰기/초기화/스키마 생성·Secret/권한 변경 및 실참가자 로그인·하트·채팅 조작은 하지 않는다.
- 별도 작업 위치: `C:\Users\aoald\BINPC2_SESSION_BUG_QA_20261027`
- 개발 브랜치: `fix/binpc2-session-sql-asset-20261027` (시작 `b06a900280404f79c92e17cdbc6af907a0414c30`)

## 과거 → 원인 → 현재
- **과거:** `artifacts/api-server/build.mjs`의 esbuild가 `connect-pg-simple`을 단일 `dist/index.mjs`에 묶었다. 그러나 패키지는 내부에서 `__dirname/table.sql`을 읽고, 그 파일은 패키지 디렉터리 안에만 포함되어 있다.
- **실제 운영 증거:** 2026-10-26~27 Render BINPC2 앱에서 `Failed to prune sessions: ENOENT ... /artifacts/api-server/dist/table.sql` 반복. 2026-10-27 UTC 00:05~05:29 에러 로그 25건 확인. 이 메시지가 이용자 튕김의 유일한 원인인지는 UNKNOWN.
- **빌드 증거:** 수정 전 로컬 산출물 `dist/index.mjs`에서 `pathModule.resolve(__dirname,'./table.sql')`이 포함됨을 확인. 반면 설치된 `connect-pg-simple@10.0.0`의 자체 `table.sql`(316바이트)은 존재.
- **수정:** esbuild 외부 모듈 목록에 `connect-pg-simple` 한 줄 추가. 런타임에 정상 패키지에서 직접 가져오므로 SQL 파일의 원래 상대경로 유지. 기존 Express 세션 구현, 쿠키·기간·DB·API·인증 정책은 그대로 둔다.

## 검증 및 재발방지
- 수정 전 `session-bundle-asset.test.mjs`: 1 PASS / 1 FAIL(컴파일된 서버에 외부 import 부재 확인).
- 수정 후 `corepack pnpm --filter @workspace/api-server build`: PASS.
- 재발방지 검사 1: `session-bundle-asset.test.mjs` — 외부 import와 패키지 SQL 파일 확인 PASS.
- 재발방지 검사 2: `session-store-sql-local-smoke.test.mjs` — PostgreSQL 연결 대신 가짜 Pool을 사용해 실제 패키지가 `table.sql`을 읽고 기존 `app_sessions` 테이블 생성 SQL 및 만료세션 정리 SQL을 요청함을 확인 PASS.
- 위 집중 검증 합계 **3/3 PASS**.
- API TypeScript 타입 검사 PASS.
- API 전체 Vitest 첫 실행: **520 PASS, 1 TIMEOUT, 16 SKIP**. 실패는 기존 합성 150명 동시 요청 테스트이고, 이후 동일 기준을 단독 재실행해 PASS.
- API 전체 Vitest 재실행(`--maxWorkers=2`, 시험 개수·합격 기준 동일): **521/521 PASS, 16 SKIP**. 원격 PC 병렬 부하를 제한했으며 실패 테스트를 수정·삭제·완화하지 않았다.
- QA 로그: 집 PC `%TEMP%\binpc2_session_api_regression_20261027.log`, 실제 운영 보안정보는 저장하지 않음.

## 추가 운영 위험 및 미확인
- 현재 `createTableIfMissing: true` 설정은 수정하지 않았다. 운영 DB에 `app_sessions` 테이블이 없다면 배포 뒤 해당 라이브러리가 테이블 생성을 시도할 수 있으므로 **운영 DB 현황·백업·배포 승인 확인 전 실제 서비스 적용 금지**.
- 런타임 세션 실패가 모바일 이용자 튕김과 직접 연결되는지, 특정 브라우저·네트워크/SSE와의 상관관계는 아직 UNKNOWN.
- Render 25일 배포본은 기존 `main`이며, 새 세션 수정은 운영에 배포되지 않았다. 운영 `main`·기존 배포본·DB가 유지되는 것이 완료 경계.
- UI/UX의 기존 선택형 슬라이드 개발본·판매판 MATCH 코드는 본 수정과 별개이며 이번 작업에서 수정하지 않았다.
