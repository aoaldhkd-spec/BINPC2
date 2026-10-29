# 사진20장 대조와 실제 앱 화면

첨부 원본20장은 연락처/식별자가 보일 수 있어 비공개로 보존합니다. 아래 새 화면은 실제 React·Express·격리 PostgreSQL의 **합성 데이터**입니다. `신청 가능`, `테스트 OFF`, `모집 오픈 확인됨`이 보이는 캡처는 정상 신청 흐름을 검사하려고 내부 fixture만 연 상태입니다. 운영 모집을 열었다는 뜻이 아닙니다. 합성 시험 연락처/이름/금액을 실제 운영 설정으로 복사하지 않습니다.

사진18~20은 홍보 스타일 참고자료이며 앱 작동 증거가 아닙니다. 실제 휴대폰·네이티브 키보드 검사도 이 캡처로 대신하지 않습니다.

| 사진 | 요청/이번 반영 | 새 증거·남은 범위 |
|---|---|---|
| 01 | 기존 중앙 버튼·색상 위계 유지, 보라 포커스 정리 | [시작 전](screenshots/v4-home-before-start.png) / [시작 후](screenshots/v4-home-after-start.png) |
| 02 | 고유번호로 프로필 복구 제목·간격, 기존4자리 보호 유지 | `ProfileRecoveryScreen.tsx`, AppEntryGates 단위. 전체 PIN 키보드 실기기 UNKNOWN |
| 03 | 안내/복구/단계 분리, 문의 dock와 프로필 완료 버튼 겹침 수정 | [프로필 작성](screenshots/02-actual-profile-wizard.png), 실제 완료/복귀 브라우저 검사 |
| 04 | 기본 닉네임/비밀번호 로그인, 개인코드는 추가 복구로 | [다른 브라우저 동일 신청](screenshots/v12-password-restored-same-application.png) |
| 05 | 공지를 읽기 쉬운 단계와 전체 다시보기로 | [대구320](screenshots/v12-daegu-320.png) / [1440](screenshots/v12-daegu-1440.png) |
| 06 | 신청하기→개인정보 고지→단계별 서버 저장 | [기본정보 전 동의](screenshots/00-actual-basic-privacy.png), 실패/응답유실 브라우저 검사 |
| 07 | `ⓘ 신청 안내` 버튼, 본인 신청 목록으로 | 대구 실제 상세와 `CampaignParticipant.tsx` |
| 08 | 기존 전체 테마를 유지, 입력/콘텐츠 면의 대비 정리 | [테마ON](screenshots/theme-halloween-layout-390-light.png) / [OFF](screenshots/theme-original-layout-390-light.png) |
| 09 | 관리자 문의 말풍선·초안·읽음·한번 동의 | [참가자 문의](screenshots/actual-inquiry-drawer.png) / [관리자](screenshots/actual-admin-inquiry.png), 재열기와 무새로고침 갱신 |
| 10 | 9종 로고 보존, 대구 BLACK 연결, 작은 목록 표지 간결화 | [새 투어 목록](screenshots/v12-tour-list-compact.png), 원본 해시/비율/무손실 파생 검증 |
| 11 | 문의 dock의 하단 공간, 프로필 창 높이·visualViewport 반영 | 프로필 실제 저장 통과. 실물 OS키보드 UNKNOWN |
| 12 | 필수 묶음과 선택OFF, 사용자가 누르는 필수 모두 확인 | 개인정보/공지 동의 UI와 단위·DB·브라우저 검사. 자동 동의 없음 |
| 13 | 기존 날짜/신청자 선택과 선착순 추가관리 재사용 | [관리자 운영](screenshots/v4-admin-overview.png) / [가상3등](screenshots/admin-rank-3-sandbox.png) |
| 14 | 입금승인/승인취소, 무료 승인 별도 | [실제 합성 입금승인](screenshots/01-actual-admin-payment-approved.png), 취소/재승인 PG. 현장 세션 즉시철회 미완료 |
| 15 | 개인 회비는 공지 동의 후, 공지/지도 사진 권한 분리 | [사진 미리보기](screenshots/v4-notice-preview.png) / [저장·재열기](screenshots/v4-photos-reopened.png) |
| 16 | 대기방 카드 제거, 입장 후 MY 행사 카드 | [3장 결과](screenshots/04-actual-three-cards-restored.png), 입장 전 API 거부·미완성 프로필 차단 |
| 17 | 하리보1종·당첨품 지급완료 한 번, 기존A/B 이력 유지 | [지급 화면](screenshots/04-actual-admin-rewards.png) / [금토 재고](screenshots/v4-both-day-products.png) |
| 18 | 할로윈 한 장 홍보물, 세부 조건은 모집글로 | [Halloween.png](../campaign-20261029-v12/posters/Halloween.png), 게시하지 않음 |
| 19 | 투어 한 장 홍보물, 대구12/3~6·BLACK·11~12월 | [Tour.png](../campaign-20261029-v12/posters/Tour.png), 게시하지 않음 |
| 20 | 통합 한 장 홍보물, 현재 접수 닫힘 유지 | [Combined.png](../campaign-20261029-v12/posters/Combined.png), 게시하지 않음 |

## 이전 화면과 비교

기존 파일을 덮어쓰지 않았습니다. 아래 BEFORE는 과거 V4 단계의 합성 검토 화면이며 이번 V12 시작 직전과 픽셀 단위로 같은 조건에서 촬영한 자료는 아닙니다.

| 화면 | 이전 보존 화면 | 이번 실제 화면 |
|---|---|---|
| 메인 | [이전](../reviews/v4-ui-20261028/screenshots/before-home-mobile.png) | [시작 전](screenshots/v4-home-before-start.png) · [시작 후](screenshots/v4-home-after-start.png) |
| 관리자 | [이전](../reviews/v4-ui-20261028/screenshots/before-admin-desktop.png) | [통합 운영](screenshots/v4-admin-overview.png) |
| 사진 | [이전](../reviews/v4-ui-20261028/screenshots/before-photos-desktop.png) | [파일 미리보기](screenshots/v4-notice-preview.png) · [재열기](screenshots/v4-photos-reopened.png) |
| 금토 상품 | [이전](../reviews/v4-ui-20261028/screenshots/before-products-desktop.png) | [금토 함께 보기](screenshots/v4-both-day-products.png) |
| 할로윈 만료 | [17시 직전](screenshots/halloween-before-1700.png) | [17시 복원](screenshots/halloween-at-1700-restored.png) |

모든 기존 메뉴/화면의 전체 상태 조합을 캡처한 것으로 보고하지 않습니다. 파일별 SHA-256과 용량은 [screenshots.json](screenshots.json)에 보존합니다. 기능/상태별 실행 범위는 [REQUIREMENTS.md](REQUIREMENTS.md)에 따로 기록합니다.

## 인터랙션 적용과 확인 범위

| 항목 | 결과/근거 |
|---|---|
| 저장→서버 확인→짧은 완료 표시→이동 | 기존 mutation/receipt 재사용, 실패 입력 보존·유실 응답 검사 |
| 이전/다음·위치·공지 다시보기 | `NoticePages` 및 기본정보 단계, 자동 동의 없음 |
| 문의 드로어·닫기·초안·읽음 | 기존 1:1 문의 연결. IME Enter·Escape·뒤로·재열기·561ms 갱신 검사 |
| 카드 뒤집기/서버 결과 | 기존 카드 UI 재사용. 연타/중복지급/재고 검사 유지 |
| 테마 짧은 모션/동작 줄이기 | 기존 CSS 재사용. 장식이 업무 로직을 결정하지 않음 |
| 영상의 모든 세부 효과 | YouTube 원본/전체 자막을 이번 실행에서 끝까지 검증하지 못함: UNKNOWN. 확인한 기존 문서의 피드백·접힘·단계·드로어 기준만 반영 |
| 과한 자동 스크롤/영상·새 라이브러리 | 추가하지 않음. 과거 대화 읽기/입력 보존 우선 |
