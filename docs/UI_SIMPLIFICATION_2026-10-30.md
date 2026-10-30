# UI 간결화 · Codex 재개 (2026-10-30 KST)

**기존 개발 브랜치에서 UI만 수정했습니다. 운영 배포는 하지 않았습니다.** 보스 잠금 ON·시험실 ON·일반 신청 차단을 유지합니다. 이번 작업은 과거 Cursor 인계 중단을 해제하고 Codex에서 UI 작성을 재개하라는 최신 요청에 따른 것입니다. main 병합·운영 DB·키·설정 변경은 허용되지 않습니다.

## 시작 상태와 변경 범위

- 로컬·GitHub 모두 `c0909c3b7117e351a938324c15307ac2e490fe05`, 작업 트리 깨끗함, 진행 중 검사 없음. 확인 가능한 저장소/작업폴더에 Cursor가 남긴 수정·Push가 없습니다. 별도 PC의 미동기화 파일까지 검사했다는 의미는 아닙니다.
- 같은 `feat/event-hub-v6-20261027`을 사용합니다. 새 프로젝트·브랜치·사이트·HTML 체험판은 만들지 않았습니다.
- 제목은 화면의 목적, 버튼은 실행할 행동을 나타내도록 정리했습니다. 예: `할로윈 신청·이어하기`, `프로필 작성`, `나중에 작성`.
- 메인 신청·대기방 2열, 입장 주 버튼 유지. 상세 `신청하기`는 넓은 주 버튼, 도움말은 보조 버튼입니다.
- 자동 신청 도움말은 버튼으로 열도록 변경. 전국투어 지도·로고·지역 선택은 `전국투어 일정`에서 펼칩니다.
- 동반신청의 친구 정보 수정·제외는 2열. 선택적 행사 알림은 접습니다. 관리자 메뉴는 2~3열, 테스트 설정은 접고 상태는 바로 보여줍니다.
- 반복 클릭 설명·당연한 입력 설명·내부 구현 문구를 제거했습니다. 필수 동의·회비·참가조건·종료시간·저장 상태/오류·접수 차단·재입금 금지·초기화 확인은 유지합니다.

## 실제 전후 화면

React·Express·기존 격리 PostgreSQL의 합성 데이터입니다. 운영 계정이나 운영 자료로 촬영하지 않았습니다. 화면 로딩·이미지 확인 후 캡처했으며 고정 문의 버튼은 화면 하단을 유지합니다. 합성 회귀검사에서 참가자 배지 숫자는 늘 수 있지만 비교 목록은 동일한 6개 행사입니다.

| 화면 | 모바일 수정 전 | 모바일 수정 후 | 태블릿 수정 전 / 후 | PC 수정 전 / 후 |
|---|---|---|---|---|
| 메인 | [전](ui-simplification-20261030/before-home-390.png) | [후](ui-simplification-20261030/after-home-390.png) | [전](ui-simplification-20261030/before-home-768.png) / [후](ui-simplification-20261030/after-home-768.png) | [전](ui-simplification-20261030/before-home-1440.png) / [후](ui-simplification-20261030/after-home-1440.png) |
| 신청 목록 | [전](ui-simplification-20261030/before-events-390.png) | [후](ui-simplification-20261030/after-events-390.png) | [전](ui-simplification-20261030/before-events-768.png) / [후](ui-simplification-20261030/after-events-768.png) | [전](ui-simplification-20261030/before-events-1440.png) / [후](ui-simplification-20261030/after-events-1440.png) |
| 행사 상세 | [전](ui-simplification-20261030/before-detail-390.png) | [후](ui-simplification-20261030/after-detail-390.png) | [전](ui-simplification-20261030/before-detail-768.png) / [후](ui-simplification-20261030/after-detail-768.png) | [전](ui-simplification-20261030/before-detail-1440.png) / [후](ui-simplification-20261030/after-detail-1440.png) |
| 관리자 | [전](ui-simplification-20261030/before-admin-390.png) | [후](ui-simplification-20261030/after-admin-390.png) | [전](ui-simplification-20261030/before-admin-768.png) / [후](ui-simplification-20261030/after-admin-768.png) | [전](ui-simplification-20261030/before-admin-1440.png) / [후](ui-simplification-20261030/after-admin-1440.png) |

추가: [320×568 메인](ui-simplification-20261030/after-home-320x568.png), [실제 단계형 신청](ui-simplification-20261030/after-compact-application-step.png), [초대코드 없는 동반신청 카드](ui-simplification-20261030/after-companion-390.png).

모바일390px 전체 높이: 메인844→844px, 신청 목록2961→1959px, 관리자3285→2692px. 상세 화면은 필수 안내를 보존하고 주 버튼을 확장했습니다. 자세한 폭/높이/본문 글자 수는 [이전 측정](ui-simplification-20261030/before-measurements.json)·[수정 후 측정](ui-simplification-20261030/after-measurements.json)에 있습니다. 목록 길이 감소가 서버 속도 개선을 뜻하지는 않습니다. 긴 공지·프로필·확대 글자에는 자연 스크롤을 허용합니다.

동반신청은 본인/친구 카드와 저장·수정·재열기를 재사용합니다. 사용자가 요청하지 않은 초대코드 만들기·복사·입력 UI는 제거했습니다. 기존 연결 기록과 서버 권한은 유지합니다. 현재 친구 카드는 초안 저장이며 **친구의 실제 신청 확정·회비/순번 확정까지 완성됐다고 표시하지 않습니다.** 초대코드 없이 친구 신청을 최종 확정하는 서버 흐름은 이번 UI 범위로 새로 구현하지 않았으며 별도 잔여 작업입니다.

## 검사와 실패 기록

- UI 타입 검사·최종 프로덕션 빌드 PASS. UI 단위 **916/916**, 보호 검사 **598/598**, 문서 검사 PASS.
- 실제 React/Express/PostgreSQL 브라우저 첫 실행 **18통과/4실패**. 도움말 자동 열림을 기대하던 3개 검사를 명시적 클릭으로 수정해 **3/3 재통과**했습니다. 회비·무료 승인·비공개 사진·권한 검사는 삭제하지 않았습니다.
- 문의 실패는 누적 격리 DB의 이전 문의(17:02Z)보다 재시작한 시험 시계(14:28Z)가 과거였기 때문입니다. 정렬 코드를 바꾸거나 기록을 삭제하지 않고 시험 시간을 앞으로 맞췄습니다. 첫 집중 재검사에서는 공통 준비 단계가 종료 후 접수를 열려다403으로 거절됐고, 문의에 불필요한 행사 생성만 기존 집중검사 옵션으로 생략한 재검사 **1/1 PASS**입니다. 실제 새 문의 관리자 반영1361ms, 관리자 답장 참가자 반영537ms였습니다.
- 최종 보스 브라우저 **4/4 PASS(54.3초)**: 로그인/로그아웃·일반인 API 차단·동반정보 저장/재열기·승인·프로필·입장·새로고침 복구·작은 화면·명시적 도움말 열기.
- 초기 실패 로그·화면은 `.local/ui-simplification-20261030/` 및 기존 Playwright 결과 경로에 보존했습니다. 공개 요약은 [검사 기록](ui-simplification-20261030/validation.json)에 있습니다. GitHub CI 결과는 아래 후속 기록 또는 해당 소스 커밋의 Actions를 확인합니다.

기존 보호 검사나 실패 증거를 삭제하지 않았습니다. 실물 갤럭시·아이폰, 화면 밖 백그라운드 푸시는 UNKNOWN입니다.

## 수정 파일

경로 기준 `artifacts/boltnew-app/`:

| 파일 | 수정 목적 |
|---|---|
| `src/components/WaitingOverlay.css` | 메인 짧은 버튼 2열 |
| `src/event-hub/EventHubPage.tsx`, `participant-compact.css` | 명확한 행동명, 중복 설명 축소, 선택 설정 접기, 신청 주 버튼 |
| `src/event-hub/CampaignParticipant.tsx` | 도움말 명시적 열기, 중복·개발 문구 제거 |
| `src/event-hub/CompanionCards.tsx`, `ResidenceInput.tsx` | 동반신청 카드·지역 선택 버튼 배치, 요청하지 않은 초대코드 UI 제거 |
| `src/event-hub/AdminInquiry.tsx` | 중복 채팅 인사·설명 축소, 동의·오류 유지 |
| `src/event-hub/TourOverview.tsx`, `tour-overview-compact.css` | 지도/9종 로고를 보존한 일정 펼치기 |
| `src/event-hub/EventHubAdmin.tsx`, `TestModePanel.tsx`, `admin-compact.css` | 관리자 메뉴·설정 정리, 중요 상태/확인 유지 |
| `src/event-hub/event-hub.test.tsx`, `managed-test-mode.test.tsx` | 명시적 도움말/설정 열기와 무단 변경 없음 검사 |
| `tests/boss-access.spec.ts`, `event-hub-v6.spec.ts`, `event-hub-v12.spec.ts` | 변경된 실제 UI 조작 후 기존 기능·권한·지도 검사 |

서버·DB 마이그레이션·인증·저장/복구·결제·입장·재고 처리 코드는 수정하지 않았습니다. 원본 이미지/로고·테마 만료·사용자 기록·Git 이력·복구 자료도 보존했습니다. 상세 문구를 줄여도 필수 조건을 숨기거나 가입·동의·승인을 자동 실행하지 않습니다.

## 저장과 운영 경계

GitHub 저장과 운영 배포는 다릅니다. Netlify는 main만 빌드 허용, Render는 main 자동배포임을 읽기로 확인했습니다. 설정은 바꾸지 않았고 PR도 만들지 않습니다. main은 `b06a900280404f79c92e17cdbc6af907a0414c30`입니다.

운영 프런트는 기존 `517c3efe…` / Netlify `6ae343a9605026ceb4c1cd07`, 서버는 `1844f8d7…` / Render `dep-dbhiaq0ae00c73drokmg` 그대로입니다. 기존 주소에서는 이번 UI 수정이 아직 보이지 않습니다. 재배포는 별도 지시가 있어야 합니다. 이전 성능2초 목표·운영 정책·실기기·백업 후속 항목을 이번 UI 작업으로 완료 처리하지 않습니다.


## 최종 GitHub 저장·검사

- 기능 코드: `30186001ba44d445fc30bbf8cf208f5d7f76905c` — 기존 개발 브랜치 원격 저장 확인.
- [GitHub Actions40984808600](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40984808600): **27/27 단계 SUCCESS**, 위 기능 코드와 정확히 일치. 빌드·API/UI 단위·보호·DB·실제 브라우저·100명 HTTP·누적 DB150명 혼합 검사 포함. [실제 CI 결과](ui-simplification-20261030/final-ci.json).
- 이 결과를 보존하는 후속 문서 커밋은 기능 코드를 변경하지 않습니다. 최신 GitHub HEAD는 해당 문서 커밋까지 포함합니다.
- Push 이후 읽기 확인에서도 main·Netlify 배포ID·Render 배포ID/서버 버전이 그대로입니다. [후속 확인](ui-simplification-20261030/post-push-deployment-readonly.json).
- 검사 완료 후 유휴 격리 서버만 정상 종료했습니다. 시험 DB·로그·실패 화면·기존 키는 삭제하지 않았습니다.
