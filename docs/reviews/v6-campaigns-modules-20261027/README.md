> 역사 자료: 이 폴더의 01시 테마 해제 화면은 V3 이전 결과다. 현재 기준은 다음 날17시이며 [V3 최신 자료](../v6-v3-private-preview-20261027/README.md)를 우선한다.

# BINPC2 V6 실제 앱 · 할로윈·전국투어·독립 모듈 검토 자료

**전체 PARTIAL / 운영 모집 불가.** 기존 React+Express+격리 PostgreSQL 또는 같은 React 컴포넌트의 가상 시험실에서 촬영했다. 독립 HTML/홍보 영상은 새로 만들지 않았다. 영상은 기능 검증 녹화다.

[기능별 보고서](../../EVENT_HUB_V6_CAMPAIGNS_MODULES_2026-10-27.md) · [Cursor 인계](../../CURSOR_EVENT_HUB_V6_HANDOFF.md)

PC방 Chrome에서는 아래 화면 링크를 열거나 ZIP을 다운로드·압축 해제해 PNG/MP4를 확인한다. **이 링크는 실시간으로 버튼을 눌러보는 실행 프리뷰가 아니다.** 외부 실행 서버는 만들지 않았다.

## 먼저 볼 화면

- [390px 신청 안내](screenshots/campaign-application-guide-390.png)
- [서버 저장 중](screenshots/00-actual-saving.png)
- [저장 실패 후 입력 보존](screenshots/01-save-failure-input-retained.png)
- [할로윈 개인 회비](screenshots/campaign-halloween-personal-fee.png)
- [관리자 무료 승인·수동 승계](screenshots/campaign-admin-free-priority.png)
- [대기방](screenshots/campaign-halloween-waiting.png)
- [프로필 미완료 입장 차단](screenshots/02-actual-incomplete-entry-blocked.png)
- [일반 가상3등 관리자](screenshots/admin-rank-3-sandbox.png)
- [4등](screenshots/admin-rank-4-sandbox.png)
- [투어 선입금(최종 회비 아님)](screenshots/campaign-tour-advance-not-final.png)
- [투어10등 두 장](screenshots/campaign-tour-rank10-two-cards.png)
- [11등 차단](screenshots/campaign-tour-rank11-blocked.png)
- [독립 스위치 OFF](screenshots/modules-independent-off.png)
- [할로윈01시 직전](screenshots/halloween-before-0100.png)
- [01시 기본 디자인 자동 복원](screenshots/halloween-at-0100-restored.png)
- [사진 별도 동의](screenshots/campaign-photo-private-consent.png)
- [원본 삭제 확인](screenshots/campaign-photo-source-deleted.png)

투어10/11등 카드 화면은 실제 앱 안의 독립 가상 시험실이다. 같은 정책/React 화면을 쓰며 운영 API를 호출하지 않는다. 실제 재고·동시성·1당첨1꽝은 PostgreSQL로 별도 검사했다. 테마 경계 화면은 React 시험 시계를 진행한 결과이며 운영 시각을 바꾸지 않았다.

## 영상

- [existing-v6-admin-payment](videos/existing-v6-admin-payment.mp4)
- [existing-v6-admin-reward](videos/existing-v6-admin-reward.mp4)
- [halloween-fee-free-approval](videos/halloween-fee-free-approval.mp4)
- [inquiry](videos/inquiry.mp4)
- [modules-and-theme-expiry](videos/modules-and-theme-expiry.mp4)
- [participant-existing-v6](videos/participant-existing-v6.mp4)
- [private-photo-review](videos/private-photo-review.mp4)
- [protected-media-privacy](videos/protected-media-privacy.mp4)
- [responsive-light-dark](videos/responsive-light-dark.mp4)
- [saturday-switch](videos/saturday-switch.mp4)
- [tour-advance-and-component-lab](videos/tour-advance-and-component-lab.mp4)

## 검증 해석과 보관

validation.json과 verification에 통과·실패를 함께 기록한다. 깨끗한 GitHub CI 성공과 누적 로컬100세션/개인정보 UI 실패를 구분한다. 단위1350, 격리 DB68, 보호598 통과. 최신 누적 전체는8PASS/2FAIL이며 이를 숨기지 않는다. 실기기 UNKNOWN, 개인정보 정책 미확정, 운영 신규 접수/사진 업로드/자동 파기 차단 유지.

ZIP에는 합성 PNG45개·MP4 11개, 보고서·인계·검증 요약/실패 로그·증분 Git bundle·소스 스냅샷·체크섬을 넣는다. 비공개 env/키/운영 개인정보/실제 은행정보/DB덤프/API 원본 로그/브라우저 세션 파일은 넣지 않는다. 예전1306/57/6 자료와 HTML은 기존 위치에서 보존하며 이번 프리뷰로 안내하지 않는다.

증분 bundle은 baseline5428ad62가 필요하며 기존 저장소의 같은 개발 브랜치를 이어받는 용도다. source-snapshot.zip은 해당 소스 커밋의 텍스트 코드·설정 스냅샷이며 이미지/동영상·비공개 키·DB는 없다. 전체 Git bundle(약478MiB)은 비공개 로컬 백업으로 별도 보존하며 GitHub100MB 제한 때문에 이 ZIP에는 넣지 않는다.

체크섬은 SHA256SUMS, ZIP 내부 항목은 CONTENTS.sha256을 따른다. 합성 참가자·테스트 사진만 사용했다. 역사 바이너리 전수 OCR이나 독립 보안 인증을 수행했다는 의미는 아니다.
