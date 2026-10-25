# BINPC2 프로젝트 6 — 비실전 작업 기록

- 기준 날짜: 2026-10-21 (Asia/Seoul)
- 상태: DRAFT / 개발 브랜치 전용 / GitHub Verify+UI review SUCCESS(아래 정확한 SHA) / 실기기 검증 UNKNOWN / 운영 미반영
- 기준 main: 63bb4858e9d21f486236c7e2b880c9beefb34452
- 목적: 실제 휴대폰·운영 검증은 이번 범위에서 제외하고, 재사용 가능한 코드 수정 및 남은 과제를 명시한다.

## A. 알림 소리
- 사용자 확인: Android 푸시 표시 성공. 알림 소리 미청취는 사용자가 보고함. 원인 기기별 확인은 하지 않음.
- 기존 Service Worker는 silent:false, vibrate를 지정했지만 OS/브라우저 알림 채널의 실제 소리를 강제할 수 없음.
- 준비한 개선: 앱을 열고 있을 때만 받은 하트와 직접 채팅 메시지에 2음 차임을 선택적으로 재생. 설정 기본 OFF, 사용자 실제 탭으로 활성화, 사용자별 기기 저장소에 선호도 보관. 앱 재실행 시 사용자 제스처로 오디오 잠금 해제. 단체채팅/시스템 오류/발신자 상호하트 토스트는 소리 제외.
- 백그라운드 화면 잠금/푸시 소리는 그대로 휴대폰 설정이 결정. 커스텀 MP3 웹 푸시 강제 불가.
- 서버 푸시 대상, Service Worker, 클릭 경로 및 권한 처리는 일절 수정하지 않음.
- 이번에 소리 재생/휴대폰/브라우저 테스트하지 않았음. 실제 성공 판정 금지.

## B. Google Drive 소스 자동백업
- https://github.com/aoaldhkd-spec/BINPC2/pull/6 : Draft, main 미병합.
- 기존 코드에 소스 ZIP, 전체 Git 번들, 무결성 기록, 750MiB 단건 상한, Drive 최소 2GiB 여유·immutable 업로드 준비됨.
- OAuth/rclone 및 GitHub Secret 미연결이므로 무인 Google Drive 업로드는 아직 BLOCKED.
- 소스 자동백업은 운영 DB, 원본 사진, 기기 인증정보, Secret을 포함하지 않음.
- 과거 Git bundle 크기 약 491MB: main 변경 때마다 새로운 전체 번들을 올리면 수십 번의 업로드로 Drive 용량 소모가 큼. 단건 상한/2GiB 여유는 장기 보관 상한을 대신하지 않음. 삭제 없는 보유정책, 중복 방지, 번들 생성주기 재설계가 후속 선행 요건.
- 신규 사용 승인 없는 Secret 등록·권한 변경·main 병합 및 Render 자동배포 금지. OneDrive 사용 금지.

## C. 개인정보 및 사진
- https://github.com/aoaldhkd-spec/BINPC2/pull/14 : Draft 기록과 읽기 전용 SQL은 역사자료로 보존.
- 2026-10-13 확인값 (최신 수치 아님): 프로필 2, 미연결 기기 인증 2639, 미연결 프로필 조회 4079, DB 46.6MB, 사진 테이블 약 30.4MB.
- 미연결은 삭제가능 증거가 아님. 기기/푸시/하트/채팅/백업/복원 의존성 및 법적 보유기간 결정 필요.
- 실제 DB 조회·수정·삭제·사진 반출/백업은 이번에 수행하지 않음. 평문 개인 데이터 GitHub/Drive 업로드 금지.
- 추후 법적 보유기간·파기 예외·복구점 암호화·권한·이미지 잔존 정책 확인 전 데이터 삭제 금지.

## D. 속도 최적화
- https://github.com/aoaldhkd-spec/BINPC2/pull/15 : Draft/미병합.
- 변경 5파일: 서버 DB 병합의 첫 슬롯 위치 Map 색인, 웹 /ready 동시 폴링 방지 및 finally 복구, 대응 회귀 테스트 코드.
- main에 병합된 PR #16 CI health 변경과 직접적인 파일 이름 겹침은 보이지 않음. 실제 3-way merge/새 CI 테스트 결과는 미검증.
- 과거 합성 스냅샷 5000건 JS 병합 471ms→3ms는 실제 한국 현장·150명·DB 왕복 시간이 아님.
- 운영 main 병합·배포는 별도 승인까지 보류.

## E. 정지선 / 다음 작업
- 새 자동테스트, 실기기 알림·소리·딥링크, 실운영 DB/사진/푸시, 현장속도, OAuth/Secret, 배포/PR 병합은 하지 않음.
- 새 소리 코드: IMPLEMENTED_IN_BRANCH / TESTED=NO / LIVE=NO.
- 이후: 이번 브랜치의 단위·회귀·UI/기기 검증, PR #15 새 main 기반 검증, PR #6 보관 비용상한과 인증, 개인정보 정책/암호화 복구 결정.
- 기존 하트·채팅·SSE·관리자·행사 운영·QR 모듈과 데이터는 보호. 다른 프로젝트 혼합 금지.

## F. 2026-10-21 새 CI 결과 — 정확한 커밋 한정
- PR #17: https://github.com/aoaldhkd-spec/BINPC2/pull/17
- 테스트 소스가 포함된 커밋: 73fa15edde0ab5fbf7f3e5b051742f46ad891ee0
- GitHub Verify workflow: SUCCESS — https://github.com/aoaldhkd-spec/BINPC2/actions/runs/39506948881
- UI review artifacts workflow: SUCCESS — https://github.com/aoaldhkd-spec/BINPC2/actions/runs/39506948679
- 신규 `notification-sound.test.ts`: 선택 기본 OFF/계정 분리/오디오 미지원 거절/표시 화면에서만 2음 재생/중복 제한/리스너 정리 회귀검사 포함.
- 실제 Android 푸시는 사용자 확인, 실제 기기의 소리·iPhone·현장성능은 아직 UNKNOWN. CI의 synthetic Chromium은 실제 휴대폰과 구분한다.
- 별도 확인: 2026-10-21 조회 당시 Render main 서비스 live SHA는 63bb4858e9d21f486236c7e2b880c9beefb34452. PR #17 소리 코드는 운영에 미반영.
- 임시 소스+웹 빌드 artifact는 GitHub Actions에 생성되었고 source.zip의 SHA256 무결성 확인을 완료했다. Drive 자동 백업이 활성화된 증거는 아님.
