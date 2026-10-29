> 최신 V12 재개: [V12 결과](V12_RESULT_2026-10-29.md) · [재개 지점](RESUME_V12_2026-10-29.md) · [기능별131개 판정](v12-validation-20261029/REQUIREMENTS.md). 아래 기존 기록은 역사로 보존합니다.

> 최신 후속 결과(2026-10-29): [V12 문의·전국투어·권한·백업 검증](V12_FOLLOWUP_2026-10-29.md). Supabase/Netlify/Render 인증 연결은 성공했고, 앱DB·업로드·기존키의 보호 보존/내부 격리 복원도 확인했다. 외부 백업 사본은 아직 없다. 아래는 당시 이력이며 옛403·토큰 미등록 설명을 현재 상태로 사용하지 않는다.

# 다음 Codex 작업에 붙여넣을 인수인계문

기존 BINPC2 V6 작업을 GitHub 개발 브랜치의 실제 최신 상태부터 이어가.

- 저장소: `aoaldhkd-spec/BINPC2`
- 브랜치: `feat/event-hub-v6-20261027`
- 최신 검사 코드: `c53bc3337f68387a87b8cb15984fa91dbbf2fd08`; 기능 구현 코드: `1c85fc6b2d9fb50456a593b665bf76afe582dbad`. 이후 차이는 UI 검사 대기1줄이며 제품 코드는 같다. 뒤에 문서·검사 증거 보존 커밋이 있으므로 실제 원격 HEAD부터 확인해.
- 최신 원격 CI: `40764092274` **27단계 최종 성공**을 확인했다. 소스 `c53bc333`과 현재 체크포인트의 코드 지문이 일치한다. 실제 PostgreSQL·브라우저/100세션·150명 HTTP/DB 혼합 단계도 성공했다. 이전 `40763157788` 실패와 수정 증거는 그대로 보존했다. 기능 구현의 로컬 단위1456·DB99·브라우저17·보호598·Node32 통과도 보존했다.
- 먼저 원격 HEAD·로컬 HEAD·미커밋·다른 작업자 변경을 확인해. 이 문서나 과거 인계문의 SHA로 reset하지 마.
- `docs/DEPLOYMENT_RESULT_2026-10-29.md`, `docs/DEPLOYMENT_BACKUP_AND_RELEASE_2026-10-29.md`, `docs/deployment-20261029/source-preservation.json`, `docs/deployment-20261029/validation.json`부터 읽어. 기존 `docs/LATEST_TEST_MODE_AND_DEPLOYMENT_2026-10-28.md`와 `docs/handoff-20261028/README.md`의 과거 증거도 보존해.

전체 할로윈 테마·복장 최저가·기존 신청/입금/대기방/프로필 복구·로고8종·관리자 시험실·테스트 초기화·검토자료를 재개발하거나 덮어쓰지 마. `173f61f0`의 CI40683694827 27단계 성공은 과거 증거이며, 이후 코드의 검사 결과는 최신 validation과 GitHub 실행에서 확인해.

이번에 별도 `publicAdmissionOpen` 차단을 추가했다. **테스트 OFF만으로 일반 신청은 열리지 않는다.** 관리자 명시적 오픈 확인, 현재 초기화 세대, 인증·revision·production 개인정보 조건이 모두 필요하다. 테스트 ON/초기화는 오픈 확인을 무효화한다. 구 프로필 신규 저장도 정책이 다시 초안이거나 지문이 바뀌면 차단하지만 기존 프로필/PIN/기기 로그인/하트/채팅 복구는 보존한다. 웹·오픈채팅 신청/선입금 안내와 외부 신청 링크도 미오픈 중 차단한다. 외부 오픈채팅방 자체를 앱이 닫은 것은 아니다.

**기존 Netlify·Render 운영 배포 승인은 이미 받았고 유지된다.** 접속·인증 문제를 승인 부족으로 보고하거나 다시 배포 승인을 요구하지 마. 새 사이트·Render 웹/DB·유료 서비스·공개 터널을 만들지 마. main 병합·Push나 키 교체로 막힌 연결을 우회하지 마.

2026-10-29 06:26 KST 후속 작업은 원격/로컬 `d3feec9487e12693446e8200033ee1ae3ac52dc0`와 깨끗한 작업 트리에서 시작했다. **Netlify·Render 실제 관리 인증 HTTP200으로 연결 문제가 해결됐다.** 환경 게시 버전과 런타임 인증 존재 변화가 확인된 뒤 접속했으며, 이전403을 같은 상태로 반복하지 않았다. 개인용 인증 메타데이터 `has_saved_binding:false`만으로 인증 미등록이라고 단정하지 마. 기존 두 토큰은 다시 받을 필요가 없다.

현재 기존 서비스는 Netlify 배포 `6addce4910baf80784543dfd`, Render LIVE `dep-dbessi95efls73bbg7qg`, 둘 다 공급자 보고 코드 `b06a900280404f79c92e17cdbc6af907a0414c30`다. Render main 자동배포, Netlify 허용 브랜치 main/stop_builds false를 확인했다. 이 값은 이번 배포 결과가 아니라 배포 전 기준이다. main·서비스 설정·배포는 변경하지 않았다.

운영 설정과 기존 앱 키는 비공개 작업공간에서 AES-256-GCM으로 보존하고 별도 보관한 아카이브 키로 읽어 원본과 일치함을 확인했다. 앱 키는 그대로다. **운영 DB/업로드 백업과 격리 복원은 아직 미완료다.** DB는 Supabase이며 직접 PostgreSQL은 ECONNREFUSED, 프록시 CONNECT200 뒤 PostgreSQL 통신은 닫혔다. 인증서 검증을 꺼서 우회하지 않았다. 같은 통신 시도를 반복하지 마.

다음 연결 항목은 `SUPABASE_ACCESS_TOKEN` → `api.supabase.com`이다. 환경 초안에 요구 항목은 저장됐지만 현재 프로세스 값은 없다. Supabase 공식 HTTPS 관리 API 명세의 백업 목록 GET과 읽기 전용 SQL POST를 확인했다. 보안 입력이 실제 적용되면 먼저 백업 메타데이터·스키마 조회를 수행하고, 완전한 보호 백업과 격리 복원 경로를 검증해. API 명세가 존재하거나 백업 목록을 읽었다는 이유로 덤프 다운로드/복원 완료를 주장하지 마. 비공개 준비 스크립트 `.local/production-readiness-20261029/supabase-readiness.py`는 이 조회만 수행하며 배포·복원·DB 변경을 하지 않는다.

현재 근거는 `docs/deployment-20261029/management-connection-success.json`, `database-backup-readiness.json`과 갱신한 배포 보고서에 있다. 비공개 `.local/production-readiness-20261029`의 원본 공급자 응답·운영 설정·암호화 보존본, `/workspace/.binpc2-private-backup-keys`의 키는 Git/공개 ZIP/로그에 절대 포함하지 마. 작업공간 보존은 외부 재난 복구 보장이 아니다. `backup-checkpoint`/`rotate-*`/`bootstrap-production`을 무작정 실행하지 마.

백업·복원과 필요한 기존 스키마 호환을 확인한 뒤 검증된 동일 소스를 기존 API·화면에 반영해. 최종 상태는 **테스트 모드 ON + publicAdmissionOpen false + 일반 신청 차단**이어야 한다. 실제 참가자·입금·재고를 보호하고 관리자 시험실의 `laboratory-workspace` 기록만 초기화 가능하게 유지해. 내가 테스트를 끝내고 실제 오픈을 별도로 확인하기 전에는 테스트 OFF나 모집 오픈을 대신 실행하지 마. 실제 모집·외부 발송·운영 데이터 삭제·자동 정산/송금은 하지 마.

배포 후 Netlify/Render의 실제 deploy ID·실행 SHA·API/React 코드 지문을 대조하고, 기존 주소에서 **관리자 → 술번개 → 행사 설정·기록·관리 도구 → 선착순 시험실**로 들어가 금토/투어·가상3등·입금승인·프로필·뽑기·다시열기·시험 기록 초기화를 확인하는 순서를 알려줘. 물리 Galaxy/iPhone 미검증은 UNKNOWN으로 유지해.

막히면 어느 환경에서 어느 단계가 실패했는지, 완료한 부분과 꼭 필요한 연결 조치만 보고해. 기존 개발을 다시 시작하거나 동일한 403을 반복하지 마.
