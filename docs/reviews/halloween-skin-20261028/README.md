# BINPC2 전체 할로윈 테마 — 실제 앱 화면

2026-10-28. 코드 버전 `e97730298f07fa6f0900874b3284b373efc0ab43`.
기존 React 앱·Express·격리 PostgreSQL에서 촬영했다. 합성 참가자만 사용했으며 운영 사이트를 촬영하거나 배포한 결과가 아니다.

이번 사용자 지시에 따라 **전체 앱에 떼었다 붙이는 시각 테마**를 적용했다. 이전의 행사 영역 한정 꾸미기보다 이번 전체 화면 요청이 우선한다. 행사별 가격·입장·카드·권한·종료 규칙은 그대로 유지했다.

- 메인: 호박·유령·디스코볼, 큰 BINPC2 글자, 주황·보라 버튼.
- 신청·대기방·문의·프로필·하트·채팅·관리자: 같은 배경·카드·버튼·입력 색상.
- 움직임: 버튼 누름, 카드 등장, 유한 시간 장식 움직임. 기존 프로필 카드 뒤집기 유지. 기기의 동작 줄이기 설정 존중.
- 기존 관리자 설정의 `seasonal_landing`을 재사용. 화면 이름은 **전체 할로윈 테마**. OFF하면 원래 디자인과 기존 다크모드 취향으로 복원한다. 기존 입력·프로필·세션을 다시 만들지 않는다.
- 전체 장식은 2026-11-01 17:00 KST 자동 종료. 행사별 신규 입장 마감과 뽑기 만료는 기존 서버 규칙 그대로다.
- 새로운 장식 WebP 299,012바이트(약292KiB) 추가. 기존 8종 로고·사진·원본·백업은 삭제하거나 바꾸지 않았다. 속도가 빨라졌다고 주장하지 않는다.

## 실제 화면

| 파일 | 화면 |
|---|---|
| 01-home.png / 01-home-small.png | 메인 390px / 320px |
| 02-apply-list.png | 술번개 신청 목록 |
| 03-event-detail.png / 04-inquiry.png | 행사 상세 / 오른쪽 문의 |
| 05-waiting-list.png / 06-waiting-profile.png | 신청 목록 / 대기방 |
| 07-admin.png | 통합 관리자 |
| 08-products.png | 금·토 상품 관리 |
| 09-photo-upload.png / 09-photo-upload-controls.png | 공지·장소 관리 / 사진 추가 |
| 10-profiles.png / 10-profile-flip.png | 참가자 프로필 / 기존 카드 뒤집기 |
| 11-hearts.png / 12-chat-list.png | MY 하트 / 채팅 목록 |
| 13-chat.png / 13-chat-draft.png | 채팅 / 작성 중 입력 |
| 14-chat-theme-off.png / 15-chat-theme-restored.png | 테마 OFF / 다시 ON — 같은 입력 유지 |
| 16-participants-theme-on.png / 17-participants-theme-off.png | 같은 참가자 화면의 테마 ON / OFF |
| 18-home-before-start.png / 19-home-theme-off.png | 회식 미시작 입장 잠금 / 테마 OFF 메인 |
| actual-app-home-motion.mp4 | 실제 메인·신청 화면 움직임 |
| actual-app-theme-toggle.mp4 | 실제 프로필 카드·하트·채팅·테마 전환 |

참고 영상 원본은 이번 사용 가능한 첨부에서 확인하지 못했다. 위 MP4는 현재 앱을 직접 실행해 녹화한 결과이며 참고 영상의 완전 재현 주장이 아니다. 촬영 시 테스트 목록에 내부 합성 행사명이 포함될 수 있다.

## 검증과 한계

- 테마·기존 메인·스위치 관련 단위 8개, 보호검사 598개, UI 타입·lint·빌드 통과.
- 로컬 전체 브라우저 16개 중 15개 통과, 1개는 기존 고정 흰색 배경 기대값 때문에 실패했다. 기존 색상 검사를 OFF 상태에 유지하고 ON 색상·320/360/390/768/1024px·라이트/다크를 추가해 해당 1개를 재실행, 통과했다. 최초 실패 로그도 보존했다.
- 실제 서버에서 관리자 권한으로 OFF→ON. 같은 참가자 식별자·미전송 채팅 입력 유지 확인. 자동 만료 시 미완성 입력과 컴포넌트 유지 단위검사 통과.
- 실제 회식 미시작 상태에서 신규 입장 버튼 비활성 확인. 운영 세션에는 요청하지 않았다.
- 전체 원격 재검사: [GitHub Actions 40672489994](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40672489994). 최종 판정은 동봉한 `ci-result.json` 참조.
- 실제 Galaxy/iPhone은 **UNKNOWN**. Chromium 화면 크기 검사를 실기기 검사로 바꾸지 않는다.
- 운영 배포·모집·운영 DB·외부 발송·main 변경 없음. 개발 브랜치 push는 사용자 확인 Netlify Stopped builds / Render main 자동배포 경계를 유지했다. 서비스 관리 설정을 독립 조회한 것으로 주장하지 않는다.

사진·영상은 [BINPC2-Halloween-theme-screens.zip](BINPC2-Halloween-theme-screens.zip)에 묶었고 SHA256SUMS.txt로 확인할 수 있다. 코드 백업을 DB·업로드·암호화키 복구 완료로 표현하지 않는다.
