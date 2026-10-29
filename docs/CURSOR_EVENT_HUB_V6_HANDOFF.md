> 최신 V12 재개: [V12 결과](V12_RESULT_2026-10-29.md) · [재개 지점](RESUME_V12_2026-10-29.md) · [기능별131개 판정](v12-validation-20261029/REQUIREMENTS.md). 아래 기존 기록은 역사로 보존합니다.

> 최신 검증 소스: `173f61f06c46f682b77dcd7633a304608d68d153` · [CI40683694827 전체27단계 성공](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40683694827). 일반 신청 차단/관리자 테스트 모드·초기화 포함. 이후 문서 커밋과 구분하며 운영 배포·실기기 성공을 뜻하지 않는다. [소스 ZIP·검토자료](handoff-20261028/README.md).

> **최신 우선: 2026-10-29.** [실행 보고서](DEPLOYMENT_RESULT_2026-10-29.md)와 [기존 서비스 배포·백업 준비서](DEPLOYMENT_BACKUP_AND_RELEASE_2026-10-29.md)를 먼저 읽는다. 시작 HEAD는 `ac6d6628`이며 과거 V4/V6 중간 커밋으로 되돌리지 않는다. 운영 배포는 이미 승인되었지만 실제 모집은 미승인이다. 테스트 OFF만으로 접수를 열지 않고 별도의 명시적 오픈 확인이 필요하다. 운영 접속·백업·복원·배포 ID는 실제 증거 없이 완료 처리하지 않는다.

## 최신 추가: 일반 신청 닫힘 · 관리자 테스트 모드

[최신 테스트 모드·배포 상태](LATEST_TEST_MODE_AND_DEPLOYMENT_2026-10-28.md)를 먼저 읽는다. 기본 테스트 ON, 일반 신청/신규 입장 서버 차단, 관리자 암호화 합성 저장소 초기화와 세대 검증을 추가했다. OFF는 모집 승인과 다르다. 기존 운영 배포 승인은 유효하며, 현재 연결·인증 적용과 운영 백업/복원 확인이 막혀 있다. [전체 112장 사진·PDF](reviews/halloween-all-pages-20261028/README.md)는 테마 촬영 체크포인트이고 `latest/`, `test-mode/`의 후속 화면을 함께 확인한다. 같은 브랜치 최신 HEAD에서 이어가며 기존 코드를 재제작하지 않는다.

## 2026-10-28 최신 시각 테마 체크포인트

사용자의 최신 요청은 기존 앱 전체에 탈부착 가능한 할로윈 꾸미기다. 기능 재개발 없이 `seasonal_landing` 기존 스위치를 **전체 할로윈 테마**로 재사용했다. 소스 `e97730298f07fa6f0900874b3284b373efc0ab43`. [실제 화면·영상·검증](reviews/halloween-skin-20261028/README.md)을 먼저 확인한다. 기존 행사별 입장·뽑기 만료, 프로필 복구, 하트·채팅, 운영 모집 보호는 변경하지 않았다. 운영 미배포, 실기기 UNKNOWN. 아래 과거 화면 범위 설명보다 최신 사용자 전체 테마 요청이 우선한다.

> **메인 할로윈 최종 코드/검사:** `b991dd297e2930500b082894070a8dfbdaffd3f5`, [CI40665207174](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40665207174) 27단계 성공. 검증 이력에 실제 결과를 추가했다. 아래 과거 SHA 대신 Git 최신 HEAD에서 이어간다.

> **2026-10-28 최신 이어가기:** 기존 사이트 운영 배포는 사용자가 승인했다. 재승인 대기로 돌리지 않는다. 현재 실행 장애는 Codex 네트워크 403 및 관리 인증 부재다. [배포 상태·환경 설정](OPERATING_DEPLOYMENT_STATUS_2026-10-28.md)을 우선한다. 메인 계절 테마 ON/OFF·11/1 17시 자동 해제와 실제 앱 화면을 추가했다([확인 결과](reviews/home-halloween-20261028/README.md)). 책임 주체 범일NPC / 기존 관리자 1:1 문의는 확정. [목적별 보관기간 승인안](PRIVACY_POLICY_APPROVAL_DRAFT_2026-10-28.md)은 미확정이므로 신규 모집·사진·외부발송·자동 파기 보호를 유지한다. 과거 배포 미승인 문구는 당시 이력이다. 기존 코드/실패 증거를 보존하고 실제 Git HEAD에서 이어간다.

> 2026-10-28 KST UI 최신 인계: 사용자 4번째 참고 이미지 기준 실제 앱 화면 정리. 코드 `db93e1263e185fa41ddf42be510209fef044c21a`. 기존 V6를 재제작하지 않는다. [실제 전후 화면](reviews/v4-reference-20261028/README.md), [이번 보고서](EVENT_HUB_V4_VISUAL_REFINEMENT_2026-10-28.md)를 먼저 본다. 메인 중앙 3개 버튼, 행사 사진 카드/상태 필터, 공지·위치 탭, 대기방 단계 표시, 관리자 참가자 검색/단일 상세/작성 메모 보존을 적용했다. 실제 실기기와 운영 배포는 미실행. 개인정보 미확정 production 신규 접수 차단 유지. 이전 보고서·실패 증거·원본·키·백업을 삭제하지 않는다.

> **최신 코드 검증:** `abfa0069bc79ecbd252291665f15ac7d38a0cc23`의 [원격CI40646701349](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40646701349) 27단계 모두 성공. 브라우저·실제150명 HTTP/PG도 성공이며, 이전 실패40645488550은 이력으로 보존했다. 이후 보고서/검토ZIP 저장 커밋은 제품 코드와 구분한다.

> **V4 현재 재개점:** UI `f644652d`, 고정 로그인/연락처 정리 `7403f3c1`, 자정 안내 검사 동기화 `abfa0069`. Git 최신 HEAD를 먼저 확인한다. 로컬 단위1,386/PG80/브라우저16 및 복구 추가2회. 원격 실패40645488550을 지우지 말고 후속CI 결과와 구분한다. 현재 운영 UI/DB/Secret은 수정하지 않았다. 전체 Git bundle은 과거 공개값이 남을 수 있어 비공개 보관하며, 배포 시 기존 SESSION_SECRET을 임의 교체하지 않는다.

> **2026-10-28 V4 후속 정정:** 기존 기능검사 이후 실제 UI 누락을 발견해 보완했다. 최신 [V4 화면·운영 보고서](EVENT_HUB_V4_UI_OPERATIONS_2026-10-28.md)와 [실제 전후/녹화](reviews/v4-ui-20261028/README.md)를 먼저 읽는다. 아래는 당시 검사 이력이며 전체 UI/운영 완료 판정이 아니다. 문의는 V4에 따라 신청 영역 내부로 제한했다. 새 사이트 없이 기존 주소 반영 준비만 진행하며 운영 배포/Secret 변경은 미실행이다.

# 최신 인계 — 별도 사이트 없이 기존 BINPC2 반영 준비


> **최신 사용자 지시 우선:** 별도 시험사이트/Render 웹·DB/공개 터널/독립 HTML을 새로 만들지 않는다. 외부 주소나 비용 승인을 기다리지 않고 내부 실제 React·Express·PostgreSQL 개발/검사를 마무리한다. 최신 A/B/150명 결과·기능별 잔여는 [최종 보완 보고서](EVENT_HUB_V6_COMPLETION_2026-10-27.md), 기존 주소 반영/복구/휴대폰 순서는 [반영 준비서](EVENT_HUB_V6_EXISTING_SITE_ROLLOUT_2026-10-27.md)를 따른다. 아래 외부 비공개 프리뷰 비용·승인 대기 설명은 **이전 요청 당시의 역사 기록**이며 현재 필요 승인이 아니다. 준비 코드는 삭제하지 않는다.

- 시작 원격530279a4에서 같은 개발 브랜치를 이어갔다. 최신 원격 HEAD/미커밋을 먼저 확인하고 과거 SHA로 되돌리지 않는다. 이번 소스/검사 SHA는 최종 보고서와 저장된 CI metadata가 정본이다.
- A 실제 검사 이력·코드 지문 연결, B immutable 로고 업로드/연결/복원, C 실제 누적PG150명 혼합/재시작/지속 검사를 추가했다. 기존 신청/입금/프로필/하트/채팅/정책 모듈 재사용.
- 새 API/UI/lookup CLI·migration의 실행범위는 반영 준비서를 따른다. production CLI/ENV 설정·DB 변경은 실행하지 않았다. 기존 키/DB/로고/실패증거/Git 이력 보존.
- 모바일 부분/역순/503/offline/저장소/과거reset 보호와 진짜17시 만료 유지. 기존PIN·하트·채팅 데이터까지 재검사했다. 실물 Galaxy/iPhone, 운영 배포SHA·OS복귀·푸시는 UNKNOWN.
- 남은 범위는 성능 목표 보완, 물리 기기, 개인정보 기간/책임자/백업 결정, 별도 운영 반영 승인이다. main/운영서비스/실제모집/외부발송/운영 개인정보 삭제 금지.
- 내부 실행/부하 도구는 엄격한 loopback fixture 전용이다. 공개 GitHub/ZIP에는 비공개 .local/env/회복코드/cookie/DBdump가 없다. Git bundle은 소스만 복구하며 비공개 키/DB의 백업 대용이 아니다.

---

# 아래는 보존한 이전 인계 이력

> 최신 기능별 미완료 포함 대조표: [V6/V3 통합 체크리스트](EVENT_HUB_V6_INTEGRATED_CHECKLIST_2026-10-27.md). 실기기·외부HTTPS·개인정보 정책은 완료 추정 금지.

# 현재 이어갈 지점 — 실제 앱 최종 보완 (2026-10-27 한국 시간)

## 2026-10-27 V6 최신 정정 V3 — 개발판, 운영 미반영

[최신 모바일 복구·V3·비공개 시험 준비 보고서](EVENT_HUB_V6_V3_PRIVATE_PREVIEW_2026-10-27.md)를 우선 읽는다. 할로윈 금·토01시 신규 입장 마감 / 해당 회차 익일17시 테마·기존 참가자 카드 만료가 정본이다. 로고8종 실제 수령·연결·원본/체크섬 보존. 실제 휴대폰은 UNKNOWN, 외부 HTTPS 시험 주소 미발급, 개인정보 정책 미확정으로 운영 모집 차단 유지. 기존 V6를 재제작하거나 main/V7을 병합하지 않는다. 이전 체크포인트와 실패 이력은 아래에 보존한다.

## 최신 우선 인계: 할로윈·전국투어·소프트 분리 모듈

- 소스 체크포인트 `eb54f8799c5a2aa1e01ddfbb6c99231f4dad0a72`, 같은 `feat/event-hub-v6-20261027` 브랜치. 최종 문서 커밋이 이 뒤에 추가된다. **기존 V6를 다시 만들거나 V7을 병합하지 않는다.**
- [최신 기능별 보고서](EVENT_HUB_V6_CAMPAIGNS_MODULES_2026-10-27.md), [실제 화면·녹화·인계 ZIP](reviews/v6-campaigns-modules-20261027/README.md)을 먼저 읽는다. 아래 이전 체크포인트는 역사 자료다.
- 기존 신청·입금·대기방·문의·복구 엔진 재사용. 공용 `event-policy-normal/halloween/tour.ts`, 서버 `event-policy-halloween-server/tour-server.ts`, 공통 `event-benefit-succession.ts`, 종료·스위치 `event-hub-modules.ts`로 분리했다.
- 전체 event_hub·토요일 자동방·행사 모집·혜택·카드·테마는 기존 스위치 재사용. 할로윈/투어 추첨 전역 스위치만 추가. OFF는 기존 신청/승인/당첨/문의 삭제가 아니며 관리자 후속 처리 유지.
- 정확한 수량 금23/토49, 할로윈3장, 투어 금토1차 유효10명2장=1당첨+1꽝. 투어는 선입금만 기록하며 할로윈 무료 승인/최종 회비 재계산 경로를 서버에서 거절한다.
- 할로윈은 행사 영역에만 적용, 10/31 01:00·11/1 00:30 KST 자동 복원. 일반17시 초기화와 분리. 신청 안내는 기존 TutorialModal의 3쪽 구성으로 문구 잘림 없이 표시한다.
- 개인정보 정책·보관기간·백업 삭제 미확정. **production 신규 접수·사진 업로드·자동 파기 gate를 해제하지 않는다.** 실기기/실발송/운영 배포는 미검증·미실행.
- 사용자 확인 Netlify Stopped builds, Render main 자동배포를 유지했다. provider 관리 API로 독립 조회할 자격증명은 없었다. main/운영DB/실제 모집/알림은 건드리지 않는다.
- 현재 개발용 실행기는 `scripts/event-hub-local.mjs`. 기존 비공개 키/DB 볼륨을 보존하며 새 키로 덮어쓰지 않는다. `.local/event-hub/handoff-api.env`는 공개 ZIP에 없고 공개하면 안 된다. Git bundle은 소스만 복구하며 실제 데이터/비공개 키를 이관하지 않는다.
- 이번 단위1350·격리DB67·보호598 통과. 브라우저와 원격 CI의 최종 상태는 validation.json과 최신 보고서에 기록한다. 실기기 PASS로 바꾸지 않는다.


**이 절이 아래 모든 과거 기록보다 우선합니다.** 같은 개발 브랜치 최신 GitHub HEAD를 사용하며 기존 코드를 재제작하지 않습니다. 이번 코드 검증 커밋은 `e4714cd4b60783832220058336f73124990fa74c`이고 이후 자료 보존 커밋이 추가됩니다.

- 원격 CI: 소스 `d0778d3706aed70206de861b9601202beb48f3e6`의 [실행40493933832](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40493933832) 전체 PASS. 초기 두 실패·전용 DB 이름 수정 이력도 최종 보고서에 보존합니다. 테스트/보호 완화 없음.
- 최신 전체 판정: [실제 앱 최종 보고서](EVENT_HUB_V6_ACTUAL_APP_FINAL_2026-10-27.md).
- 실제 앱 캡처·7개 MP4·다운로드: [자료 목록](reviews/v6-actual-app-20261027/README.md). **앞으로 독립 HTML 체험판을 추가 제작·수정하거나 실제 앱 프리뷰로 안내하지 않습니다.** 아래 HTML 절은 과거 기록입니다.
- 실제 React+Express+격리 PostgreSQL 실행 유지. 단위1306(API522+UI784), DB57(허브41+리셋16), 실제 브라우저6, Node13·guard598·타입/빌드/lint 통과. 실제 기기·실발송 PASS는 아닙니다.
- 새 수정: 행사별 시험실 상태·설정 보존/단계 복구, 문의 상대별 답장 초안, 처리 중 버튼 잠금, 상품명 영속 표시/입장 전 카드 잠금, 암호화 키 불일치 쓰기 차단, 문의 다크모드, 이전 공지 UI, 실제 영상 재생/관리자 승인·지급 녹화, 개발 브랜치 전용 격리 CI.
- 금지 유지: main 병합/push·운영 배포·모집 공개·실제 외부 발송·운영 데이터 변경/삭제·현금 무작위 지급. Netlify Stopped builds와 Render main 설정을 바꾸지 않습니다. 서비스 관리 API 독립 확인은 없으며 사용자 확인을 근거로 합니다.
- 다음 체크포인트: 목적별 기간/법정 예외/백업 파기 원문이 확정되기 전 production 신규 접수 gate/자동 파기는 그대로 유지합니다. 물리 Android/iOS/Windows 기기에서 알림/코덱/IME/제스처를 검증하고 실제 앱 캡처에 대한 운영자 UI 피드백만 반영합니다.
- 암호화 키 주의: 원장은 SESSION_SECRET에서 유도한 키를 사용합니다. `.local/event-hub/handoff-api.env`는 따로 비공개 보관하며 배포/문서/ZIP에 넣지 않습니다. 새 키를 만들면 기존 기록을 복구할 수 없습니다. 이번 검사는 잘못된 키의 쓰기를 차단할 뿐 키 백업/이관 절차를 대신하지 않습니다.

## 실제 앱 재현 경로 (개발 담당자용)

기존 Node24/Corepack pnpm11.21/PostgreSQL16 환경에서 `node scripts/event-hub-local.mjs configure` → `check` → 별도 터미널 `api`, `web` → `activate` 순서입니다. configure는 고정 loopback fixture DB만 준비하고 기존 기록을 삭제하지 않습니다. `http://127.0.0.1:3002/events` 및 `/admin`은 **로컬 개발용**이며 외부 PC방 접속 주소가 아닙니다. 운영 env를 주입하지 않습니다.

Playwright Chromium이 없는 다른 개발 환경에서는 프로젝트 디렉터리에서 `corepack pnpm --filter @workspace/boltnew-app exec playwright install --with-deps chromium`을 사용합니다. 설정은 시스템 Chromium이 없으면 Playwright 브라우저를 선택하며 localhost 보호 검사는 유지합니다. 이 Codex의 CDN 403은 이미 설치된 `/usr/bin/ffmpeg`를 writable 캐시에 연결해 녹화했습니다. 테스트/보호 검사 우회가 아닙니다.

검사 명령은 아래 역사 기록의 localhost/fixture 명령을 사용합니다. 브라우저 최신 출력은 `test-results/event-hub-final-real`, 최종 보존 로그/체크섬은 실제 앱 검토자료 ZIP에 있습니다. 소스는 GitHub 최신 개발 브랜치에 있으며 bundle 복원이 기본 경로가 아닙니다.

---

# 아래는 보존한 과거 인계 기록

# Cursor 인계 — 기존 BINPC2 V6 이어서 개발

## 최신 상태 — GitHub 개발 브랜치 저장 완료

이 절은 아래의 과거 push 차단/로컬 bundle 우선 설명보다 우선합니다. 사용자가 Netlify `Build status = Stopped builds` 변경을 확인했고, Render는 main 자동 배포를 유지합니다. PR은 만들지 않았습니다.

검증 코드 커밋 `73861cf5dfdde94044b36ebde5688b6584090eba`를 GitHub `feat/event-hub-v6-20261027`에 push하고 원격 ref와 일치를 확인했습니다. 이후 문서/다운로드 보존 커밋이 추가되므로 Cursor는 **해당 브랜치의 최신 원격 HEAD**에서 시작합니다. 코드의 재구현이나 main 병합은 필요 없습니다.

- 저장소/브랜치: https://github.com/aoaldhkd-spec/BINPC2/tree/feat/event-hub-v6-20261027
- 다운로드: 같은 브랜치의 `docs/previews/BINPC2-V6-demo.html`, `BINPC2-V6-review.zip`, `SHA256SUMS.txt`
- 시작: `git clone --branch feat/event-hub-v6-20261027 https://github.com/aoaldhkd-spec/BINPC2.git`
- 현재 운영 미배포, main/운영 DB/실제 모집/외부 발송 변경 없음. Netlify 실제 관리 설정은 사용자 확인을 근거로 했으며 API 독립 조회는 미실행입니다.
- 검증 보존: 단위1300, Node13, 실제 브라우저5 통과. DB56은 기존 증거 보존. 이번 원격 저장 단계는 문서/다운로드 파일만 추가하고 기능 코드는 변경하지 않았습니다.
- 남은 작업: 개인정보 목적별 기간/예외/백업 정책 확정 전 production 신규 접수 차단 유지, 실제 Android/iOS/Windows 알림·영상·파일 열기, 일부 전용 UI/시험실 다중 행사 체험 보완. 정확한 파일은 아래 인계 및 후속 위험 보고서 참조.

## 아래 기록의 해석

로컬 커밋·bundle·검증 기록은 그대로 보존합니다. 아래 과거 `push BLOCKED`, `원격 브랜치 없음`은 그 당시 상태이며 현재 저장 상태가 아닙니다.

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

## ad364b75 이후 위험 후속 작업

최신 후속 문서는 `EVENT_HUB_V6_RISK_FOLLOWUP_2026-10-27.md`, 감사 79건 개별 분류는 `EVENT_HUB_V6_AUDIT_79_2026-10-27.md`/JSON이다. 최종 HEAD는 새 전달 묶음의 HANDOFF_STATE.json을 기준으로 한다. 기존 기능 표와 보고서는 과거 증거로 보존한다.

추가 변경: 운영 초기화/키 교체 스크립트 실행 gate와 민감 오류 마스킹, 브라우저 저장소가 차단된 경우의 문의/테마/현장 입장 보호, 허브 skeleton/카드 결과 효과. 전체 단위는 API522+UI778=1300 PASS, Node 운영 스크립트 검사 13 PASS, 실제 브라우저5 PASS. DB56은 기존 검증 로그를 보존했다. 서버/DB 기능 코드는 변경하지 않았다.

`node --test scripts/test/production-entry-guards.test.mjs scripts/test/ops-client.test.mjs`는 운영 스크립트를 확인 없는 실행 또는 dry-run으로만 호출한다. 실제 운영 실행은 사용자 승인 전 금지다.

Netlify 설정은 401/403 및 인증 부재로 확인하지 못했다. 사용자에게 요청한 한 가지 설정은 BINPC2 Netlify `Build status = Stopped builds`다. 확인된 후에만 개발 브랜치 push를 재검토하며 PR은 그 전에 만들지 않는다. Render main은 유지한다. 원격 미저장 상태에서 bundle을 우선 복구하고 커밋을 재제작하지 않는다.
