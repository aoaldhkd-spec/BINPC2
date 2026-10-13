# BINPC2 프로젝트 3 재개 검증 — 2026-10-13

상태: CURRENT 검증기록 / TESTED / SYNTHETIC_BROWSER_VERIFIED / 운영 미배포.
범위: 프로젝트 3의 화면·터치·동의·알림 추가 요구를 기존 PR #7에서 이어받아 검증하고 백업한다. main 병합, 실제 배포, 운영 DB 쓰기·삭제, Secret 변경은 이번 실행 범위가 아니다.

## 1. 실제 확인한 코드와 증거

- 저장소: aoaldhkd-spec/BINPC2
- 검증된 프로그램 커밋: `ba8d3af28e1146be82ec37d874996074b517697a`
- PR: https://github.com/aoaldhkd-spec/BINPC2/pull/7 — 열림, 초안, 미병합.
- 확인한 main 기준: `747507a7d180c8cd767d7b5d9d785d2567033ae1`
- 성공한 통합 검사: https://github.com/aoaldhkd-spec/BINPC2/actions/runs/38307511565
- 이 실행의 입력 커밋은 `934b44ac4daf8494aa0501ff69a3565a97f45d5b`이며, 모든 검사를 통과한 뒤 실제 프로그램 커밋 ba8d3af를 만들었다. 보고서 `tested-commit.txt`, `commit.txt`, `source.zip`의 ZIP comment가 모두 ba8d3af 전체 SHA로 일치한다.
- GitHub artifact ID: `11773178656`, 이름 `binpc2-ui-validated`, 크기 11,298,317 bytes.
- 다운로드한 원본 artifact SHA256: `89ac26bf2bb62548cfd808844a8dd2a12fd9ff53e0d8228979d5fb5cafb1d461` — 제공된 digest와 실제 파일 해시 일치.
- artifact 보관 만료: 2026-10-19 20:59:22 UTC. GitHub의 임시 보관만으로 영구 백업 완료를 주장하지 않는다.

## 2. 통과 결과

`reports/results.tsv`의 아래 11개 명령 종료값이 모두 0이다.

1. 문서 현재성 검사 `pnpm run verify:records`
2. 재발 방지 규칙 `pnpm run verify:guards`: 598/598
3. 정적 코드 조사 `pnpm run audit:code`: error 0, warn 53, info 538. 경고가 없다는 뜻은 아니다.
4. 서버 단위 테스트: 67개 파일 / 487개 테스트 통과
5. 화면 단위 테스트: 101개 파일 / 743개 테스트 통과
6. 화면 TypeScript 자료형 검사
7. 화면 lint 코드규칙 검사
8. 화면 build 실행파일 생성
9. 서버 TypeScript 자료형 검사
10. 서버 lint 코드규칙 검사
11. 서버 build 실행파일 생성

브라우저 보고서는 `SYNTHETIC_API_REAL_CHROMIUM`이다. 실제 Chromium에 가짜 API 응답을 연결했으며 실제 운영 DB·휴대폰 푸시를 검사한 것이 아니다.
- 관리자 / 프로필 등록 2개 장면 × 9개 화면 크기 = 18개 시나리오 모두 PASS.
- 크기: 320×640, 360×740, 390×844, 430×932, 600×800, 768×1024, 1024×768, 1440×900, 844×390.
- 일반 크기와 사용자 확대 110%에서 페이지 가로 넘침 없음, 예외 없음.
- 수동 오픈 제거, 관리자 헤더 우선순위, DB헬스 이동, 필수 동의 둘 다 필요·해제 시 차단, 선택 알림 거절 허용, 동의 팝업 화면 안 배치, 확대값 로컬 저장을 확인했다.
- 원본 화면 캡처 26장 포함. 이 숫자는 모든 앱 화면을 전수 방문했다는 뜻이 아니다.

## 3. 기존 실패 → 변경 → 현재

- 이전 입력 커밋 `051358688150a4f4b9b766f9a62ea3afd960720b`, 실패 실행 `38306440970`: 단위 테스트와 브라우저 검사는 통과했지만 화면/서버 자료형 검사 두 항목이 실패했다. 전체 통과가 아니므로 코드 자동 저장 단계는 실행되지 않았다.
- 원인: ProfileCard 메뉴 버튼의 중복 onPointerDown 설정, 서버 테스트의 중복 import·좁은 fixture 자료형·콜백 인자, 소유권 판정의 union 자료형, RPC 자료형 불일치 등.
- 최신 통합본은 메뉴에서 stopPropagation과 mobile-tap 시작 기록을 모두 호출하며 자료형 오류를 고쳤다. 검사를 끄거나 실패 테스트를 삭제해서 통과시킨 것으로 기록하지 않는다.
- 재개 중 같은 브랜치에 다른 수정이 도착했다. 별도 준비했던 중복 수정은 원격에 덮어쓰지 않고 최신 통합본을 채택했다. 이전 실패 로그는 과거 이력으로 남긴다.
- ba8d3af 저장 직후 자동 생성된 별도 Verify/UI-review 실행은 `action_required` 상태였다. 이는 이미 통과한 위 통합 검사의 실패를 뜻하지 않지만, 해당 별도 실행까지 PASS라고 부르지 않는다. 이 문서 이후 커밋/검사는 GitHub에서 별도로 다시 확인한다.

## 4. 10개 요구의 연결 위치

기존 세부 설명: `docs/UI_NOTIFICATION_REVIEW_2026-10-13.md`.
1. 관리자 수동 술번개 오픈 제거 — DashboardTab/AdminApp. 고정 자동 시간과 서버 호환 경로 유지.
2. 관리자 헤더와 탭 겹침 방지 — AdminApp/index.css. 실제 확인창은 상단 유지.
3. 실제 화면 크기별 반응형 — index.css와 기존 화면 구조 재사용.
4. 스크롤 오작동 방지 — mobile-tap/ProfileCard/SignalTagPicker. 정상 탭·키보드 보존.
5. 가−/기본/가+ — DisplayScaleControls/display-scale. 브라우저 줌을 차단하지 않음.
6. 성향 아래 개인정보 필수 동의 두 줄 — RegistrationConsentRows/InfoDialog/등록 검증. 구버전 호환 경로는 현재 남아 있음.
7. 그 아래 선택 하트 + 1:1 채팅 알림 — webPush/PushNotificationSettings/기존 서버 구독 저장. 단체채팅·자기 자신 푸시 제외.
8. 운영 현황·기능 붙이기/떼기 — DB헬스의 OpsOverviewPanel. 기존 module_flags와 확인 절차 유지.
9. 사용자·행사일별 무지개 도움말 — RainbowUnlockGuide/rainbow-guide. 기존 하트 판정 유지.
10. 크기별 가독성·확대 시 배치 — 위 18개 시나리오와 26장 캡처. 모든 기종 실측으로 확대해석하지 않음.

## 5. 남은 일과 정확한 재개점

- 배포 전 최신 PR head/main을 다시 대조하고 승인 범위를 확인한다. 서로 다른 대화의 동시 변경을 덮어쓰지 않는다.
- 사용자 승인 후 main 병합 및 기존 Render·Netlify 배포 연결을 확인한다. 이 문서는 배포 승인 자체가 아니다.
- 실제 두 기기에서 하트 수신자만 알림, 발신자/단체채팅 미발송, 1:1 알림의 정확한 상대방 방 이동, 앱 닫힘/재열기/계정 변경/알림 해제를 확인해야 한다. 현재 UNKNOWN.
- 알림 구독의 실제 운영 DB 저장·서버 재시작 후 복구·운영 실수신은 별도 실증이 필요하다. 단위 테스트를 LIVE_WRITE_VERIFIED로 부르지 않는다.
- 개인정보 보관기간·운영자/문의처·민감정보 관련 정식 고지와 동의 필드 없는 구버전의 처리 방침은 운영 확정 전 검토가 필요하다. 개인정보 전체 즉시 삭제나 법적 적합성 완료를 주장하지 않는다.
- PR #6 자동백업 활성화는 별도 승인/인증 작업이며, 이번 코드·검사 증거 백업과 구분한다.

복구 시 `source.zip`을 빈 새 폴더에 풀어 비교한다. 운영 폴더 위에 바로 덮어쓰거나 실제 DB를 초기화하지 않는다. 기존 정상 SSE Router/PWA/자동시간/데이터 저장을 재제작하지 않는다.
