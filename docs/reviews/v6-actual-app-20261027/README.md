# 실제 BINPC2 V6 앱 화면·영상

이 자료는 **실제 React 앱 + Express API + 격리 PostgreSQL**을 Chromium으로 조작한 결과입니다. 화면의 이름·연락처·입금자명·장소·계좌는 가상 시험값입니다. 운영 DB나 실제 참가자를 사용하지 않았습니다. 독립 HTML 시뮬레이터가 아닙니다.

가장 쉬운 확인: 아래 영상을 누르거나 ZIP을 다운로드해 압축을 풀고 MP4와 PNG를 Chrome에서 여세요. 프로그램 설치·로그인이 필요하지 않습니다. **자료는 녹화·캡처이며 직접 클릭 가능한 실제 앱 프리뷰는 아닙니다.** 이 환경에는 보안 외부 프리뷰 발급 기능이 없습니다. PC방의 다운로드/영상 정책에 따른 재생 가능 여부는 UNKNOWN입니다.

- [실제 앱 검토자료 ZIP 다운로드](https://github.com/aoaldhkd-spec/BINPC2/raw/refs/heads/feat/event-hub-v6-20261027/docs/reviews/v6-actual-app-20261027/BINPC2-V6-actual-app-review.zip)
- [전체 기능별 보고서](../../EVENT_HUB_V6_ACTUAL_APP_FINAL_2026-10-27.md)
- [Cursor 인계](../../CURSOR_EVENT_HUB_V6_HANDOFF.md)

## 짧은 실제 시연 영상

- [참가자 신청·저장·입금·대기방·프로필·카드](videos/participant-application-waiting-cards.mp4)
- [관리자 수동 입금 승인](videos/administrator-approval-video.mp4)
- [관리자 하리보·경품 지급](videos/administrator-reward-video.mp4)
- [참가자 문의 왕복](videos/participant-inquiry.mp4)
- [토요일 자동방 설정 저장·재접속](videos/administrator-saturday.mp4)
- [승인자 전용 영상 재생·개인정보 검토](videos/protected-video-and-privacy.mp4)
- [화면 크기·밝은/어두운 모드](videos/responsive-light-dark.mp4)

## 참가자 실제 화면

| 단계 | 화면 |
|---|---|
| 기본정보·수집 동의 | [열기](screenshots/00-actual-basic-privacy.png) |
| 공지 동의 전·회비 비공개 | [열기](screenshots/00-actual-notice-before-fee.png) |
| 실제 저장 중 | [열기](screenshots/00-actual-saving.png) |
| 저장 실패·입력 유지 | [열기](screenshots/01-save-failure-input-retained.png) |
| 저장 완료·공지 동의 후 회비 | [열기](screenshots/01-actual-saved-fee.png) |
| 프로필 미완료 입장 제한 | [열기](screenshots/02-actual-incomplete-entry-blocked.png) |
| 기존 프로필 설정 UI 재사용 | [열기](screenshots/02-actual-profile-wizard.png) |
| 승인·프로필 완료 대기방 | [열기](screenshots/03-approved-mobile-waiting-room.png) |
| 카드 3장 결과 재접속 복구 | [열기](screenshots/04-actual-three-cards-restored.png) |
| 관리자 문의 | [열기](screenshots/actual-inquiry-drawer.png) |
| 다크모드 모바일 문의 | [열기](screenshots/inquiry-390-dark.png) |
| 승인자 전용 실제 영상 | [열기](screenshots/actual-protected-video-playback.png) |

## 관리자 실제 화면

| 기능 | 화면 |
|---|---|
| 은행 대조 확인 후 수동 승인 | [열기](screenshots/01-actual-admin-payment-approved.png) |
| 상품명·하리보 한 개·지급 완료 | [열기](screenshots/04-actual-admin-rewards.png) |
| 문의 확인·답장 | [열기](screenshots/actual-admin-inquiry.png) |
| 가상 3등: 실제 컴포넌트 시험실 | [열기](screenshots/admin-rank-3-sandbox.png) |
| 가상 4등: 할인 경계 | [열기](screenshots/admin-rank-4-sandbox.png) |
| 토요일 자동방 설정 | [열기](screenshots/actual-admin-saturday-toggle.png) |
| 개인정보 요청 검토 | [열기](screenshots/privacy-reviewed-admin.png) |

시험실 캡처는 **실제 앱 안에 있는 가상 시험 모드**입니다. 다른 신청·입금·프로필·문의·카드 캡처는 실제 격리 API와 DB의 흐름입니다. 시험실에서 실제 입금·재고가 변경된 것으로 해석하면 안 됩니다.

## 디자인 검토 범위

기존 slate/teal 글꼴·색·둥근 버튼·카드·프로필 마법사를 유지했습니다. 실제 대기방과 기존 프로필 마법사, 문의 밝은/어두운 화면을 직접 비교했습니다. `layout-320/360/390/768/1024-light/dark.png`와 `inquiry-390-light/dark.png`가 있습니다. 가로 넘침·문의창 경계·색 적용을 자동 검사했습니다. 픽셀 기준의 전체 기존 화면 동일성 검사는 아닙니다. 전체 페이지 캡처에서 고정 하단 메뉴는 캡처 당시 viewport 위치에 보이므로 영상과 함께 확인하세요.

소스 검증 기준 커밋은 `e4714cd4b60783832220058336f73124990fa74c`입니다. 이후 문서·자료 보존 커밋이 추가될 수 있습니다. Cursor는 항상 같은 개발 브랜치 최신 HEAD를 사용하세요. ZIP에는 테스트용 키/비밀번호, 앱 세션, storageState, DB 덤프, 원시 API 로그를 넣지 않습니다.
