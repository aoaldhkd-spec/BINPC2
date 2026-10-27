# 비공개 실앱 시험 배포 준비

상태: **배포 구성 준비 / 외부 서비스 생성·과금·HTTPS 주소 발급 미실행**.
운영 Netlify/Render 및 main은 수정하지 않는다. Codex 내부 포트 공개는 재시도하지 않는다.

## 제안할 변경과 비용

별도 Render 웹 서비스 binpc2-private-v6와 별도 관리형 PostgreSQL binpc2-private-v6-db만 새로 만든다.
기존 운영 서비스·운영 DB·운영 계정·VAPID/문자 발송 키는 복사하지 않는다.
웹과 API는 같은 HTTPS origin이며 참가자와 관리자가 같은 시험 DB를 사용한다.

Blueprint의 starter 웹 + basic-256mb DB는 과거 공개 가격 기준 약 US$13/월(7+6)의 **예상값**이다.
2026-10-27 공식 가격 페이지가 이 환경에서403을 반환해 현재 금액·세금·트래픽 추가요금을 확정하지 못했다.
사용자가 승인한 월 상한과 계정의 실제 가격을 생성 직전에 대조하고, 초과하면 생성하지 않는다.
무료 플랜 가능 여부도 계정/현행 정책 확인 전 확정하지 않는다.
현재 연결된 Render 관리 도구/자격증명이 없다. 따라서 **새 유료 자원 생성·외부 접근 승인과 Render 관리 연결**이 있어야 실제 주소를 만들 수 있다.
API 키를 공개 채팅·GitHub·ZIP에 쓰지 않는다. 접근/관리자 비밀번호는 서로 다르며 private secret으로만 제공한다.

## 준비한 구성

- 기본안은 Render native Node: 고정 SHA 검사 → 실제 React 빌드 → Express 빌드를 순서대로 실행. 개발 Vite 서버/자동 관리자 로그인 플러그인을 배포하지 않음. Dockerfile은 대안이며 로컬 컨테이너 전체 빌드는 npm DNS EAI_AGAIN으로 차단되어 검증 완료로 표시하지 않음.
- render.preview.yaml: 운영 Blueprint와 별도 파일. autoDeploy:false, instance1, DB public IP allowlist 비움.
- APP_MODE=private-preview + NODE_ENV=production. 운영 보안·Secure 쿠키·소유권·역할 검사를 유지.
- 엄격한 전용 DB 이름 binpc2_private_v6·허용 호스트·독립 secret·외부 발송 키 부재를 시작 시 검증.
- 전체 UI·정적 파일·API에 접근 로그인. 관리자 API는 기존 관리자 인증도 추가로 요구.
- 외부 push/SMS 키 거절, push 경로 차단, noindex/no-store. 헬스 체크만 인증 없이 허용.
- same-origin API/SSE. 운영 VITE_SSE_ORIGIN/API_URL을 복사하지 않음.
- .dockerignore에서 .env/.local/Git/세션/덤프성 산출물·검토영상·보고서·ZIP 제외.
- 새 DB의 부트스트랩 전화번호는 합성010-0000-0000, 관리자/시험 비밀번호는 새 독립 secret.
- source revision은 검증 완료 SHA로 고정해 최초 Deploy API의 commitId로 지정. branch auto-deploy는 계속 OFF.
- 기존 개발은 같은 브랜치에서 계속하며 시험 환경은 다음 명시적 검증·교체 전 자동 업데이트하지 않음.

## 승인 후 완료해야 할 일

1. 실제 요금과 별도 자원명·DB 연결 대조 → 검증 SHA commitId로 생성/배포.
2. Render가 발급한 RENDER_EXTERNAL_URL을 사용해 실제 HTTPS hostname을 검증. 필요할 때만 PREVIEW_PUBLIC_ORIGIN을 명시한다. 사용자에게 설치/명령 실행을 요구하지 않음.
3. 접근 로그인·관리자 로그인·합성 행사·합성 계좌 문구·가상 참가자 준비.
4. 인증 없는 /events·/admin·API 모두401, 참가자→관리자403, 운영 도메인 요청0 확인.
5. 참가자/관리자 동시 화면으로 저장·승인·문의·재접속과 기기 복귀 확인.
6. 외부 HTTPS 주소와 개별 secret 전달 방법을 확인한 뒤만 사용자에게 접속 가능하다고 보고.

예상 주소 형식은 발급 결과가 아니므로 실제 링크로 안내하지 않는다.
처음에는 합성 정보만 입력한다. 실제 송금·실제 참가자 초대·정식 모집은 하지 않는다.

## 갤럭시·아이폰 시험 순서

같은 테스트 행사에서 합성 신청→수동 승인→필수 프로필→현장 입장한다.
닉네임·고유번호를 확인하고 하트/채팅을 만든다.
화면 잠금/해제→은행 앱·카카오톡으로 이동 후 복귀→새로고침→비행기 모드와 복구를 차례로 반복한다.
동일 프로필/PIN·하트 사용·채팅/미전송 초안·입금 승인 여부를 대조한다.
API 지연/503/부분 응답은 격리 자동검사로 재현하며, 사용자에게 운영 API 조작을 요구하지 않는다.
실제17시 초기화 이후 현장 프로필을 되살리지 않고 신청·입금·당첨 기록은 별도 내역에서 확인한다.
현재 물리 Galaxy/iPhone 확인은 UNKNOWN이다. Chromium viewport를 실기기 통과로 표시하지 않는다.
