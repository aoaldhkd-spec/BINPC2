# 최종 보완 검토자료·Cursor 인계 다운로드

별도 시험사이트/독립 HTML이 아니다. 실제 React·Express·격리 PostgreSQL 검사자료와 소스 복구자료를 보존한 묶음이다. 운영에 가짜 신청을 넣거나 서비스를 생성하지 않았다.

- [최종 기능·검사 보고서](../../EVENT_HUB_V6_COMPLETION_2026-10-27.md)
- [기존 주소 반영/DB·키 보존/중지·복구/휴대폰 순서](../../EVENT_HUB_V6_EXISTING_SITE_ROLLOUT_2026-10-27.md)
- [V6/V3 기능별 대조표](../../EVENT_HUB_V6_INTEGRATED_CHECKLIST_2026-10-27.md)
- [Cursor 최신 인계](../../CURSOR_EVENT_HUB_V6_HANDOFF.md)
- [실제150명·503·속도·자원 측정 JSON](verification/measured-summary.json)
- [최종 소스CI SUCCESS·공식 공개화면 교차확인](verification/ci-40558425155-metadata.json)
- [정적 감사92건 분류](verification/audit-92-classified.json)

**Chrome 다운로드:** [BINPC2-V6-completion-review.zip](https://raw.githubusercontent.com/aoaldhkd-spec/BINPC2/refs/heads/feat/event-hub-v6-20261027/docs/reviews/v6-completion-20261027/BINPC2-V6-completion-review.zip) · [SHA256SUMS.txt](SHA256SUMS.txt). 이 ZIP은 문서·합성 캡처·검증 JSON·소스 증분 bundle이며 실행형 체험판은 아니다. 새 앱 주소가 있는 것처럼 안내하지 않는다.

## 들어 있는 것과 버전 읽기

기존 완료 기능/실패/보고서를 보존한다. 새 기능 소스는7b5558ae, 실제 API/DB15분 고정본은79eba69c다. 두 소스의 API tree는 동일하고 최종 차이는 관리자 정책 안내 문구뿐이다. 검증 이력은 이 둘을 서로 다른 전체 코드 지문으로 표시한다. 보고서/ZIP만 추가하는 커밋은 소스 지문이 같을 때만 같은 코드로 설명한다. 최종 원격 HEAD는 브랜치에서 확인하고, ZIP 복구 기준 소스는 `verification/storage-public.json`을 확인한다.

ZIP에는 최신 보고서·대조표·반영 준비서·Cursor 인계·이전 주요 보고서, 검증 JSON과 아래 합성 캡처,530279a4를 전제로 복구하는 `BINPC2-V6-completion-incremental.bundle`이 들어 있다. 기존 checkout을 덮어쓰지 않고 Cursor가 Git 상태부터 확인한다. 전체 Git bundle과 기존 복구본은 로컬에 별도 보존한다. Git bundle은 DB/비공개 키 백업이 아니며 시험 DB나 `.local`/env/회복코드/cookie/DBdump는 이 ZIP에 없다.

## 실제 앱 캡처

| 화면 | 자료와 범위 |
|---|---|
| 저장 중/저장 실패 입력 보존 | [저장 중](screenshots/00-actual-saving.png), [실패 후](screenshots/01-save-failure-input-retained.png) |
| 관리자 승인/필수 프로필 차단 | [승인](screenshots/01-actual-admin-payment-approved.png), [미완료 입장 거절](screenshots/02-actual-incomplete-entry-blocked.png) |
| 작은 화면 대기방/3장 복구 | [대기방](screenshots/03-approved-mobile-waiting-room.png), [카드](screenshots/04-actual-three-cards-restored.png) |
| 프로필 API 일시 실패 복귀 | [기존 앱 유지](screenshots/mobile-profile-resume-api-unavailable.png). 실제 하트/채팅/PIN 보존은 assertion으로 검사, 화면 한 장만으로 입증하지 않음. |
| 관리자 실제 검사 이력/로고 복원 | [검사 이력](screenshots/admin-verification-real-history.png), [로고 원본/복원](screenshots/admin-logo-original-restore.png) |

관리자 두 캡처는 최종 컴파일된 React·같은 Express/격리PG의5.4초 재검사 결과다([실행 범위](verification/final-built-app-admin.json)). 참가자 캡처는 내부 Chromium의 실제 앱+DB다. 원래 통과한 단계/실패 기록은 삭제하지 않는다. 물리 Galaxy/iPhone 통과 자료는 아니다. 원본8종/경로/추적표/체크섬은 [기존 자산 정본](../../assets/tour-logos-v3/ACTUAL_ASSET_PATHS.json)에 보존하며 새 임의 로고를 만들지 않았다.

## 사용자가 결정할 것

새 사이트 비용 승인은 필요 없다. 목적별 개인정보 기간/예외·책임자/문의처·백업 절차와 기존 사이트 반영 범위를 한 번에 검토한다. 준비서의 숫자는 미적용 초안이다. main 병합/운영 배포·서비스 설정·DB 변경·실제 모집·외부 발송·운영 데이터 파기는 별도 승인 전 실행하지 않는다.
