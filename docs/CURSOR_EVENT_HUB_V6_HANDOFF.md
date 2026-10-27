# Cursor 인계 — 기존 BINPC2 V6 이어서 개발

## 기준과 금지사항

- 저장소: https://github.com/aoaldhkd-spec/BINPC2
- 정확한 브랜치: `feat/event-hub-v6-20261027`
- 원래 핵심 커밋: `27dc24c88743039b49d00a6c726eb34ff57f122d`
- 이번 작업 시작: `4bcb2d9e00c6a5751ecdb44ac9f48412fdde8505`
- **최종 SHA는 다운로드 묶음의 HANDOFF_STATE.json → head 값**. 복구 후 `git rev-parse HEAD`와 반드시 일치해야 한다. 이 인계문 자체도 최종 커밋에 포함된다.
- 상태: PARTIAL, 운영 미배포, 원격 push BLOCKED. 기존 코드를 다시 만들지 않는다.
- main push/병합·강제 push·운영 서비스 설정 변경·실제 모집/외부 발송·운영 개인정보 변경/삭제·현금 경품 활성화 금지.
- 사용자가 확정한 개인정보 정책은 없다. 검토 초안으로 진행하며 운영 파기는 비활성이다.

`EVENT_HUB_V6_FINAL_2026-10-27.md`의 기능 표와 테스트 결과를 먼저 읽는다. 초기/후속 보고서도 보존한다.

## GitHub에 아직 없는 커밋 복구

원격 개발 브랜치 링크를 만들어졌다고 가정하지 않는다. 동봉한 `BINPC2-V6-dev.bundle`이 개발 커밋 백업이다. 기존 작업 폴더가 있으면 먼저 `git status --short`와 브랜치를 확인하며 덮어쓰지 않는다. 새로 clone하는 경우:

```bash
git clone https://github.com/aoaldhkd-spec/BINPC2.git
cd BINPC2
git bundle verify /다운로드경로/BINPC2-V6-dev.bundle
git fetch /다운로드경로/BINPC2-V6-dev.bundle refs/heads/feat/event-hub-v6-20261027:refs/heads/feat/event-hub-v6-20261027
git switch feat/event-hub-v6-20261027
git rev-parse HEAD
```

이 bundle은 공통 main 기반 `b06a900280404f79c92e17cdbc6af907a0414c30`을 선행 커밋으로 요구한다. 원격 clone이 그 기반을 포함한다. 개발 브랜치가 이미 있거나 다른 작업이 있으면 강제 덮어쓰지 말고 기존 커밋과 비교한다. bundle의 원격 fetch는 GitHub push가 아니다.

## 재현 환경

Node 24와 Corepack pnpm 11.21, PostgreSQL 16이 검증 환경이다. 이 Codex 환경에는 의존성과 로컬 Postgres가 이미 있다. Cursor의 다른 PC에서는 Node/Corepack/Docker 또는 로컬 Postgres가 필요하다. PC방 체험은 설치 없는 동봉 HTML로 가능하지만, 실제 DB 개발에는 개발 환경이 필요하다.

로컬 Postgres가 없을 때만 새 테스트 컨테이너를 준비한다. 5432 포트가 운영 DB 터널인지 확인하지 못하면 진행하지 않는다. 기존 컨테이너/DB를 삭제하지 않는다.

```bash
docker run -d --name binpc2-v6-dev-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5432:5432 --mount type=volume,src=binpc2-v6-dev-pg-data,dst=/var/lib/postgresql/data postgres:16-alpine
corepack pnpm install
node scripts/event-hub-local.mjs configure
node scripts/event-hub-local.mjs check
corepack pnpm run build
```

configure는 localhost의 고정 `binpc2_hub_handoff_dev`와 명시된 테스트 DB만 준비한다. 기존 기록을 truncate하지 않는다. `.local/event-hub/handoff-api.env`에 새 로컬 키/비밀번호를 mode 600으로 생성하고 재사용한다. 암호화 자료가 있는데 이 파일이 사라졌으면 키를 새로 만들지 않는다. 운영 자격증명·DB URL은 입력하지 않는다.

각각 별도 터미널에서:

```bash
node scripts/event-hub-local.mjs api
node scripts/event-hub-local.mjs web
```

두 서버가 준비된 다음:

```bash
node scripts/event-hub-local.mjs activate
```

- 실제 DB 참가자 로컬 화면: `http://127.0.0.1:3002/events`
- 실제 DB 관리자 로컬 화면: `http://127.0.0.1:3002/admin` (명시적 격리 개발 비밀번호 bridge로 로컬 로그인; 운영 자동 로그인 없음)
- API는 8082, Vite는 loopback 3002. API_URL은 비우고 API_PROXY_TARGET/API_PUBLIC_URL/VITE_SSE_ORIGIN을 localhost API로 고정한다. 운영 env를 상속하지 않는다.
- activate는 로컬 회식 상태와 모듈만 활성화하고 테스트 토큰을 `.local/event-hub/browser-resume.env`에 저장한다. 값은 보고서/커밋에 넣지 않는다.
- 개발 모드에서도 실제 개인정보를 입력하지 않는다. 실제 기기 테스트가 아니라 가상 참가자용 환경이다.

현재 Codex에서는 위 configure/API/web/activate와 실제 브라우저 검사까지 새 DB에서 실행했다. 이전 resume_dev DB는 보존했다.

## 검사 명령

```bash
corepack pnpm run test:unit
corepack pnpm run build
corepack pnpm run verify:guards
corepack pnpm run verify:records
HUB_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/binpc2_hub_test_resume TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/binpc2_reset_test_resume corepack pnpm --filter @workspace/api-server exec vitest run src/lib/event-hub.pg.test.ts src/lib/db-event-reset-transaction.pg.test.ts
set -a
source .local/event-hub/browser-resume.env
set +a
corepack pnpm --filter @workspace/boltnew-app exec playwright test --config playwright.event-hub.config.ts --output test-results/event-hub-cursor
```

브라우저 설정은 `/usr/bin/chromium`을 쓴다. 해당 파일이 없는 다른 OS에서는 Playwright의 설치된 테스트 Chromium에 맞게 **실행 경로만** 조정하고, DB/로컬 origin/권한 검사를 제거하지 않는다. 테스트 DB 명령은 위 두 fixture를 초기화하므로 실제 데이터 연결로 바꾸지 않는다. 56개 DB 검사는 일반 단위 명령에서는 skip되므로 별도 명령을 반드시 실행한다.

변경 파일 lint 명령과 검증 원본 로그는 동봉 `validation.json`/`logs/`를 참조한다. 이전 숫자를 그대로 새 결과로 복사하지 않는다. 이번 최종 결과: 단위 API522+UI774=1296, DB40+16=56, 실제 브라우저5, 독립 HTML 10개 확인.

## HTML 체험판

`BINPC2-V6-demo.html`을 Chrome에서 연다. 로그인 없이 기본 가상 3등, 참가자/관리자 전환. 초기화하면 기본정보부터 시작한다. 실제 서버 저장/기기 간 복구/예약 타이머는 이 HTML에서 지원하지 않는다. 서버 DB 검증과 혼동하지 않는다. 모바일 파일 실행과 PC방 관리 정책은 UNKNOWN이며, 외부 프리뷰 URL 발급 도구는 없다.

갱신:

```bash
corepack pnpm --filter @workspace/boltnew-app exec vite build --config vite.standalone.config.ts
python3 -m http.server 3003 --bind 127.0.0.1 --directory .local/preview
corepack pnpm --filter @workspace/boltnew-app exec node standalone-preview/verify.mjs
```

마지막 검증 스크립트는 현재 Codex의 절대 작업 경로/Chromium 경로를 사용한다. 다른 PC에서는 산출물/스크린샷 경로와 브라우저 경로만 조정한다. CSP 외부 연결 차단은 유지한다.

## 다음 수정 지점

1. `lib/api-zod/src/event-hub-privacy.ts`, `artifacts/api-server/src/lib/event-hub-privacy.ts`, `event-hub-service.ts`: 확정 정책이 들어오면 목적별 기한·예외·백업 절차와 승인 절차를 반영한다. 현재 draft-only schema와 production 신규 접수 gate를 무작정 해제하지 않는다. `executePrivacyPlanForIsolatedTest`는 테스트 전용이며 HTTP/타이머에 연결하지 않는다.
2. `artifacts/boltnew-app/src/event-hub/NotificationReadiness.tsx`, `src/lib/webPush.ts`: 실제 Android Chrome/iOS 홈화면 PWA/Windows 브라우저에서 관리자 알림·권한·종료 후 전달을 검사한다. 승인 없는 실제 발송은 하지 않는다.
3. `artifacts/api-server/src/lib/event-hub-media.ts`, `routes/event-hub.ts`, `EventHubAdmin.tsx`, `EventMedia.tsx`: 실제 기기 영상 코덱/대용량 수요·운영 보관/스토리지 정책을 검토한다. 현재 크기·MIME·바이트 서명·승인자·Range 보호를 유지한다. 업로드 내용의 개인정보 수동 검수는 별도다.
4. `EventHubPage.tsx`, `HubUi.tsx`, `EventHubAdmin.tsx`: 요청한 전용 스켈레톤/드로어/전환·모든 상황별 공지 문구는 사용자의 화면 피드백에 따라 보완한다. 기존 디자인 전면 교체 금지.
5. `event-laboratory-store.ts`, `EventLaboratory.tsx`: 한 가상 행사 흐름을 유지하며 필요하면 다중 행사/전체 설정 체험을 확장한다. 실제 API 주입 금지. 시험실만 제거해도 서버/공유 규칙/자동 검사는 남아야 한다.
6. `scripts/event-hub-local.mjs`, `vite-dev-admin-session.ts`: 로컬 실행에만 사용한다. 개발 bridge는 loopback 및 명시 설정 필수이며 운영 credential 파일을 다시 읽게 만들지 않는다.

## 원격 push 조건

GitHub 저장소 메타데이터는 읽었지만 hooks는 403, Netlify/Render 설정 인증은 없다. 배포 목록이 비었다고 자동 공개가 없다고 판단하지 않는다. 사용자가 Render main 추적이라고 알려준 것은 참고이며 실제 설정 재확인은 미완료다.

Netlify Site configuration → Build & deploy → Continuous deployment에서 branch deploy/Deploy Preview 대상과 연결 repository를, Render에서 해당 서비스 branch/auto-deploy/preview 설정을 읽어서 확인한다. **설정을 변경하지 않는다.** 이 개발 브랜치 push가 운영 배포/외부 프리뷰 공개를 유발하지 않는다는 증거가 생긴 후에만:

```bash
git status --short
git push -u origin HEAD:refs/heads/feat/event-hub-v6-20261027
git ls-remote --heads origin refs/heads/feat/event-hub-v6-20261027
```

원격 SHA가 HANDOFF_STATE.json과 같은지 비교한다. main은 push/merge하지 않는다. 안전성을 확인하지 못하면 동봉 bundle을 보존하고 BLOCKED를 유지한다. 현재 Cursor로 이전 실행이나 운영 배포는 하지 않았고, 인계만 준비했다.
