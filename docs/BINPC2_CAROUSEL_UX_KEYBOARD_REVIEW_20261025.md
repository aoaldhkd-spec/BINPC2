# BINPC2 — 카드 슬라이드 UX 추가 개선 기록 (2026-10-25)

상태: 별도 개발 브랜치 / 자동검증 TESTED / 실제 운영 미배포 / 실제 휴대폰 UNKNOWN

## 범위와 멈출선
- 이번에 구현: 기존 참가자 그리드와 기존 디자인을 보존한 채, 선택형 카드 슬라이드의 키보드 Home/End, 화면낭독 의미 부여, 사용자의 움직임 줄이기 설정 반영.
- 이번에 하지 않음: 하트·1:1/단체채팅·푸시·DB·행사시간·관리자·디자인 전면 개편·운영 서비스 배포·main 병합.
- 담당 브랜치: feat/binpc2-carousel-ux-navigation-20261025, 시작 커밋 38e10a7d7e75df56333b4c067e1897bcb8182859.
- 작업 폴더: C:\Users\aoald\BINPC2_UI_INTERACTION_REVIEW_20261025.

## 이전 → 이유 → 현재
- 이전: 기본 프로필 목록은 원래 카드 그리드. 본인이 선택해야만 좌우 버튼·가로 밀기·페이지 점이 나타남. 버튼 최소 높이 44px은 별도 앞선 브랜치에서 개선해 검증함.
- 이유: 긴 카드 목록에서 키보드만으로 첫·끝 카드로 빠르게 이동하기 어렵고, OS 움직임 감소 설정을 선택해도 스크롤 애니메이션을 강제할 수 있음.
- 현재: 기존 ProfileDeckGrid.tsx의 키보드 핸들러에 Home/End만 추가, 스크롤 요청 시 matchMedia의 prefers-reduced-motion 설정이 켜져 있으면 animation 없는 auto 사용, 가로 슬라이드에 role=region 부여. 기존 클릭/터치/하트 API는 그대로 재사용.
- 직접 영향 범위: ProfileDeckGrid.tsx, ProfileDeckGrid.carousel.test.tsx의 작은 변경 두 파일. 서버/DB/CSS/기타 기능 파일 무수정.

## 안전 검증 근거
- 독립 Worktree를 통해 기존 완료본/원격 백업/다른 작업 폴더를 보호. 공용 설치 폴더 Junction은 pnpm 안전정책에 따라 해당 검토 폴더의 링크만 해제했고 기존 설치파일은 보존. npm 의존성은 기존 캐시에서 pnpm offline frozen-lockfile로 독립 설치.
- 캐러셀 집중 9/9 PASS: 기존 버튼/하트/그리드, 키보드 좌우·처음/끝, 사용자의 움직임 줄이기 on/off, 150명 카드 분할 로딩.
- 웹 전체 단위 회귀검사 768/768 PASS, 실제 종료코드 0. 이전 766 대비 신규 UX 2개 검사 추가.
- TypeScript 타입 검사 PASS, Vite 웹 빌드 PASS.
- 실제 운영 DB/실사용자 쓰기 또는 휴대폰 실기기 UI 테스트는 시행하지 않음.
- 새 main b06a900280404f79c92e17cdbc6af907a0414c30은 2026-10-25 중 별도 UI 개선으로 업데이트됨. 63bb4858.. → b06a9002.. 사이 변경된 6개 파일이 이번 ProfileDeckGrid 수정과 겹치지 않음을 GitHub compare로 확인. 최신 main을 **운영에 병합한 것이 아니라 UX 개발 브랜치에만 병합**했고, 통합 HEAD `80f7425020b39be4f54e4834b7afa7efd609885c`에서 전체 768/768 테스트, TypeScript 타입 검사와 Vite 빌드를 모두 재실행해 통과. 테스트 로그는 동일 작업 폴더 docs/BINPC2_UX_MERGED_*_20261025.log. 그 어떤 운영 배포도 수행하지 않음.

## 복구 및 배포 경계
- 수정 전 GitHub 안전 백업: backup/binpc2-ui-before-carousel-20261025 / 63bb4858e9d21f486236c7e2b880c9beefb34452.
- 이전 선택형 캐러셀 검증 브랜치: feat/binpc2-card-carousel-ui-review-20261025 / 38e10a7d7e75df56333b4c067e1897bcb8182859.
- 병합/Netlify/Render 운영 배포는 별도 사용자 승인 전 금지. 승인 전에는 Draft 개발 브랜치에서만 보관.
- iOS Safari/Android 실기기, UI 시각 승인, 운영 기능 정상 여부는 아직 UNKNOWN. 합성 TESTED를 PRODUCTION VERIFIED로 표현하지 않음.

## 2026-10-25 추가 — 실제 Chromium 합성 UI 검증 및 Windows 시험환경 수정
- 원인: 기존 `check-responsive-preview.mjs`는 브라우저 정적 파일 접근 검사에서 Linux 구분자 '/'를 고정 사용하여 Windows의 역슬래시 파일 경로를 403으로 차단. 따라서 화면에는 본문 바로가기만 표시됨. 운영 UI의 실제 기능 실패가 아닌 테스트 웹서버의 Windows 전용 오류로 확인.
- 수정: 기존 보안 경로검사를 약화하지 않고 `node:path`의 `sep`(실행 환경별 경로 구분자)를 사용하도록 **시험 스크립트 2줄만 수정**. 사용자용 UI 디자인·서버·기능 무변경. 과거 실패 스크린샷과 로그는 별도 QA 폴더에 보존.
- 검증: 별도 테스트 복사본에 로컬 설치 Chrome 실행경로만 지정. 320/390/430/600/768/1024px × 밝음/어두움 = **12/12 시나리오 및 92/92 UI 체크 PASS, 브라우저 JS 예외 0**.
- 점검: 참가자·하트·채팅·설정·통계·랭킹 화면의 넘침, 모바일 실제 터치 스크롤, 글자 확대 110%, 설정 저장 후 다시 열기, 필수 모달 닫기. 외부 요청은 합성 서버에서 차단.
- 증거: `docs/evidence/BINPC2_UX_RESPONSIVE_BROWSER_20261025.json`, 집 PC 독립 작업본 `qa-checkpoints/BINPC2_UX_MERGED_RESPONSIVE_RETRY_20261025/`의 결과·화면 이미지.
- 상태: TESTED (합성 브라우저), 실제 Android/iOS와 운영 데이터·현장 네트워크는 UNKNOWN. 운영 `main` 병합·운영 배포는 계속 금지.
