# V12 요구131개 — 실행 범위별 판정

PASS는 아래 증거의 격리/단위 실행 범위에 한정됩니다. PARTIAL은 요구의 일부만 구현/실행, UNKNOWN은 해당 환경 미검증, BLOCKED는 운영 백업/인증 등 선행조건 미충족입니다. 완성률을 계산하지 않습니다.

코드 SHA·지문은 [validation.json](validation.json)과 [git-preservation.json](git-preservation.json)에 기록합니다. 공개 테스트 목록의 경로는 저장소 기준이며 원본 로그는 비공개로 보존합니다.

| ID | 요구 | 상태 | 실제 확인·잔여 | 증거 |
|---|---|---|---|---|
| QA-001 | 실제 원격/로컬 HEAD·미커밋·동시 작성자 확인 | PASS | 시작 HEAD3942e785 및 원격 동일 확인. 이전 CI와 이번 변경의 검사 증거를 구분·보존. | git-preservation.json; ../deployment-20261029/ci-40764092274-success.json |
| QA-002 | 전체 라우트·탭·버튼·모달·작업 지도 작성 | PARTIAL | 323개 제품 소스의 AST 연결 지도 생성. 정적 발견은 모든 동적 메뉴/역할 조합의 클릭 통과가 아님. | SOURCE_INVENTORY.md |
| QA-003 | 기존 기능 BEFORE/AFTER와 의도된 변경 비교 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-004 | 과거 CI와 최종 수정 코드 검사 범위 구분 | PASS | 시작 HEAD3942e785 및 원격 동일 확인. 이전 CI와 이번 변경의 검사 증거를 구분·보존. | git-preservation.json; ../deployment-20261029/ci-40764092274-success.json |
| QA-005 | 모든 화면 상단·본문·하단 할로윈 일관성 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-006 | OFF시 원래 테마·다크/라이트 복원 | PASS | OFF시 remount 없이 입력·기존 다크 선택 보존. 늦은 설정 응답과 조회 실패가 수동OFF를 덮지 않음. | src/themes/SeasonalSkin.test.tsx; browser theme matrix |
| QA-007 | 테마 토글 중 입력·채팅·세션 보존 | PASS | OFF시 remount 없이 입력·기존 다크 선택 보존. 늦은 설정 응답과 조회 실패가 수동OFF를 덮지 않음. | src/themes/SeasonalSkin.test.tsx; browser theme matrix |
| QA-008 | 자동 만료 경계와 현재행사 로직 분리 | PASS | 01시 신규 입장/기존 복귀와 회차별17시 만료·현장 초기화·행사 기록 보존을 분리 검사. | event-hub.pg.test.ts; browser module expiry; reset tests |
| QA-009 | 할로윈 자산 누락 시 기본테마 복구 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-010 | OFF시 할로윈 불필요 다운로드 차단 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-011 | 장식 포인터·키보드·스크롤 가로채기 차단 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-012 | 320/360/390/430/768/1280/1440 화면 | PARTIAL | 대구 상세320/360/390/430/768/1280/1440과 기존 목록 테마/다크 조합 검사. 모든 페이지의 모든 폭 조합은 아님. | event-hub-v12.spec.ts; browser theme matrix; screenshots/ |
| QA-013 | 글자 확대·긴 문자열·가로세로 회전 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-014 | 소프트키보드·문의·저장버튼·안전영역 겹침 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-015 | 동작 줄이기·키보드 포커스·스크린리더 라벨 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-016 | 테마 제거 문서와 기본테마 독립 실행 | PARTIAL | 기존 전체/행사 테마 연결 지점과 안전한 OFF·분리 방법 기록. 이번에 원본 테마 파일 삭제 안 함. | ../THEME_DETACH.md |
| QA-017 | 4자리 PIN 입력·붙여넣기·자동이동·삭제 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-018 | PIN 실패·제한·이전 세션 복구 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-019 | 닉네임/비밀번호 기존 신청 복원 | PASS | 본인 세션에 한정된 최초 비밀번호 설정, scrypt/인증 제한, 다른 브라우저 본인 신청 복구. 평문 저장·브라우저 임시 저장 거부 검사. | event-hub.pg.test.ts; event-hub-v12.spec.ts; event-test-mode.pg.test.ts |
| QA-020 | 미설정 비밀번호 안전한 최초설정 | PASS | 본인 세션에 한정된 최초 비밀번호 설정, scrypt/인증 제한, 다른 브라우저 본인 신청 복구. 평문 저장·브라우저 임시 저장 거부 검사. | event-hub.pg.test.ts; event-hub-v12.spec.ts; event-test-mode.pg.test.ts |
| QA-021 | 타인 신청·계정열거·비밀번호 추측 차단 | PASS | 본인 세션에 한정된 최초 비밀번호 설정, scrypt/인증 제한, 다른 브라우저 본인 신청 복구. 평문 저장·브라우저 임시 저장 거부 검사. | event-hub.pg.test.ts; event-hub-v12.spec.ts; event-test-mode.pg.test.ts |
| QA-022 | 비밀번호 평문 로그/임시저장 없음 | PASS | 본인 세션에 한정된 최초 비밀번호 설정, scrypt/인증 제한, 다른 브라우저 본인 신청 복구. 평문 저장·브라우저 임시 저장 거부 검사. | event-hub.pg.test.ts; event-hub-v12.spec.ts; event-test-mode.pg.test.ts |
| QA-023 | 프로필 안내·복구·단계명 겹침 없음 | PASS | 문의 dock를 고려한 프로필 작성 영역 높이/여백으로 실제 버튼 겹침 수정, Chromium390에서 완료/재열기 검사. 네이티브 키보드는 QA014 별도. | screenshots/02-actual-profile-wizard.png; actual browser profile flow |
| QA-024 | 기존 닉네임·이미지·필수항목·변경권 보존 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-025 | 30개 할로윈 이미지 ID·형식·중복 검사 | PASS | 30개 새ID/200x200 WebP/해시30개 고유/합191506바이트. 기존 이미지·원본5장 보존. | ../avatars-v12/manifest.json; asset-preservation.json |
| QA-026 | 새 이미지 선택·저장·재열기·다른기기 | PARTIAL | av361 선택→서버 저장→재열기→테마OFF 표시 검사.30개 각각의 별도 실물 기기/만료 후 조합은 미실행. | event-hub-v6.spec.ts actual browser; ../avatars-v12/README.md |
| QA-027 | 테마 OFF/만료 후 선택 이미지 정상표시 | PARTIAL | av361 선택→서버 저장→재열기→테마OFF 표시 검사.30개 각각의 별도 실물 기기/만료 후 조합은 미실행. | event-hub-v6.spec.ts actual browser; ../avatars-v12/README.md |
| QA-028 | 프로필 미완성 입장차단·완성후 단일 연결 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-029 | 17시 현장 초기화와 회원/신청 보존 | PASS | 01시 신규 입장/기존 복귀와 회차별17시 만료·현장 초기화·행사 기록 보존을 분리 검사. | event-hub.pg.test.ts; browser module expiry; reset tests |
| QA-030 | 신청하기 뒤 단계형 기본정보 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-031 | 기존 사용자 재입력 최소화·중복신청 차단 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-032 | 개인정보 전송 전 고지·동의 경계 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-033 | 필수/선택 구분·미리 동의 체크 없음 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-034 | 유효 동의 복원·정책변경·거절·철회 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-035 | 프로필 지금/나중 작성 후 이어가기 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-036 | 공지 소제목·이모티콘·단계·다시보기 | PARTIAL | 단계 공지와 전체 다시보기, 실제 공지/지도 파일 선택→미리보기→서버 저장→재열기 검사. 모든 순서 변경·확대 조합 미실행. | event-hub-v4-ui.spec.ts; NoticePages.tsx |
| QA-037 | 공지 사진 미리보기·순서·저장·재열기 | PARTIAL | 단계 공지와 전체 다시보기, 실제 공지/지도 파일 선택→미리보기→서버 저장→재열기 검사. 모든 순서 변경·확대 조합 미실행. | event-hub-v4-ui.spec.ts; NoticePages.tsx |
| QA-038 | 공개공지와 승인자 지도·원본URL 권한 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-039 | 개인회비 노출·최종확인 순서 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-040 | 각 다음 서버저장 성공 후 이동 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-041 | 응답유실·부분응답·타임아웃 상태 확인 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-042 | 뒤로가기·앱전환·새로고침·재접속 입력보존 | PARTIAL | Chromium 새로고침/별도 문맥/visibility/503/부분응답/저장소 단위 검사와 API 재시작 복구. 실제 은행·카카오톡 왕복은 UNKNOWN. | actual browser profile flow; soak-150-15min.json |
| QA-043 | 신청·입금신고 후 재송금 유도 없음 | PASS | 개인정보 안내·동의→기본정보 단계 저장→공지/회비→입금→프로필→입장 검사. 실패/응답유실/중복/승인 뒤 과거 저장 거부·같은 신청 복원. | event-hub-v12.spec.ts; event-hub-v6.spec.ts actual browser; event-hub.pg.test.ts |
| QA-044 | 여러행사·기기·탭의 최신 서버상태 동기화 | PARTIAL | Chromium 새로고침/별도 문맥/visibility/503/부분응답/저장소 단위 검사와 API 재시작 복구. 실제 은행·카카오톡 왕복은 UNKNOWN. | actual browser profile flow; soak-150-15min.json |
| QA-045 | 금A 선착순 전 구간과 일반회비 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-046 | 토B 선착순 전 구간과 일반회비 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-047 | 21시 직전/정각·KST 시각검사 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-048 | 무료0원·복장인정/불인정·최저가 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-049 | 입금확정액 소급변경 없음·수동정정 이력 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-050 | 은행대조 전 신고/실제승인 구분 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-051 | 승인/취소 두 주버튼·무료 예외 | PARTIAL | 승인/취소 UI 및 무료 분리 구현, 실제 입금승인 화면과 서버 저장 확인. 모든 취소 버튼/상대 화면 타이밍 조합 미측정. | EventHubAdmin.tsx; event-hub.pg.test.ts; screenshots/01-actual-admin-payment-approved.png |
| QA-052 | 승인즉시 대기명단·개인상태 반영 | PARTIAL | 승인/취소 UI 및 무료 분리 구현, 실제 입금승인 화면과 서버 저장 확인. 모든 취소 버튼/상대 화면 타이밍 조합 미측정. | EventHubAdmin.tsx; event-hub.pg.test.ts; screenshots/01-actual-admin-payment-approved.png |
| QA-053 | 참가확정·현장확인 숨은 필수조건 제거 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-054 | 미승인/다른행사/시작전/프로필미완료 입장차단 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-055 | 정상 입장 시각 자동기록 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-056 | 승인취소 후 권한회수·이력·재승인 | PARTIAL | 취소 후 신규/재입장·추첨·승인자 장소 차단과 이력/재승인 보존. 기존 현장 하트·채팅 세션의 즉시 철회 범위는 미완료. | event-hub.pg.test.ts: approval revocation |
| QA-057 | 정상송금자 지연보호·선착순승계 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-058 | 동시승인·오래된탭·중복요청 | PASS | 실제PG/기존 정책단위로 공지/지도 ACL·금토 가격·21시·무료/최저가·지연입금자 보호·revision·서버입장 조건과 이력 확인. | event-hub.pg.test.ts; event-campaign.test.ts; event-hub-v6.spec.ts |
| QA-059 | 01시 신규입장/기존복귀/17시 구분 | PASS | 01시 신규 입장/기존 복귀와 회차별17시 만료·현장 초기화·행사 기록 보존을 분리 검사. | event-hub.pg.test.ts; browser module expiry; reset tests |
| QA-060 | 관리자문의 말풍선·읽음·미확인수 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-061 | 한글조합 Enter·줄바꿈·모바일전송 | PARTIAL | IME조합 Enter 오발송 차단·한번 동의·초안복구·무새로고침 답장 반영561ms. 실물폰 전송/푸시/키보드와 모든 스크롤 조합은 미확인. | event-hub-v12.spec.ts; inquiry-visible-timing.json |
| QA-062 | 초안·닫기·재열기·재접속 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-063 | 전송 순서·중복·실패재시도 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-064 | 관리자 선연락·맞는 대화로 이동 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-065 | 관리자·참가자 상호 권한 격리 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-066 | 자기알림·중복알림·단체발송 차단 | PASS | 문의 저장/읽음/초안/재열기·선연락·중복·본인/타인 권한과 수신자 제한 검사. 외부 발송 없음. | event-hub-v12.spec.ts; inquiry browser scenario; API authorization/notification unit tests |
| QA-067 | 앱내 수신과 실제 기기푸시 결과 분리 | PARTIAL | IME조합 Enter 오발송 차단·한번 동의·초안복구·무새로고침 답장 반영561ms. 실물폰 전송/푸시/키보드와 모든 스크롤 조합은 미확인. | event-hub-v12.spec.ts; inquiry-visible-timing.json |
| QA-068 | 구독/권한 거부·만료·서비스워커 업데이트 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-069 | 잠금화면 개인정보 최소화 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-070 | 23시 일반하트·24시 무지개·각 하트수량 | PASS | 23시/24시·각 하트량·1:1/단체·문의 채널과 본인 기록 보존 회귀. 실기기 푸시 결과와 구분. | API/UI heart-chat unit regression; actual browser profile social persistence |
| QA-071 | 기존1:1·단체채팅·신규 문의 채널 분리 | PASS | 23시/24시·각 하트량·1:1/단체·문의 채널과 본인 기록 보존 회귀. 실기기 푸시 결과와 구분. | API/UI heart-chat unit regression; actual browser profile social persistence |
| QA-072 | 실시간 재연결·백그라운드복귀·읽던위치 유지 | PARTIAL | IME조합 Enter 오발송 차단·한번 동의·초안복구·무새로고침 답장 반영561ms. 실물폰 전송/푸시/키보드와 모든 스크롤 조합은 미확인. | event-hub-v12.spec.ts; inquiry-visible-timing.json |
| QA-073 | 대기방 카드 제거·입장후 메뉴연결 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-074 | 직접URL/API/다른행사토큰 입장전추첨차단 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-075 | 할로윈3장·4번째거부·결과복원 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-076 | 금10/토15 특별자격·금23/토49재고 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-077 | 투어 날짜별금토1차10명·할인1+꽝1 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-078 | 5천1/4천2/3천3/2천4 구성·합계 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-079 | 두기기/연타/재시도·품절·경합 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-080 | 하리보단일·과거A/B지급자 보존 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-081 | 꽝·지급완료 버튼 없음 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-082 | 미지급당첨품 한번처리·중복차감차단 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-083 | 실물전달 전 자동지급표시 없음 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-084 | 승인취소·재승인시 재뽑기·재지급 차단 | PASS | 입장후 MY 행사카드,입장전API거부,할로윈3장/투어2장·재고/특별순위·중복지급·한종류하리보·기존A/B 이력·취소후재승인 한도 유지 확인. | event-hub.pg.test.ts; event-campaign.test.ts; actual browser card/fulfillment flow |
| QA-085 | 전체/금/토/투어 필터·검색·선택유지 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-086 | 사유·메모·승계·회비조정·처리이력 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-087 | 토요일 자동방·금요일 수동·중복생성차단 | PASS | 자동토요일/수동금요일·접수/실제시작/종료·독립모듈 OFF와 기록 보존 검사. 운영 세션 변경 없음. | event-hub.pg.test.ts; reset PG tests; browser main/toggle/expiry |
| QA-088 | 초안/모집/회식시작 상태 분리 | PASS | 자동토요일/수동금요일·접수/실제시작/종료·독립모듈 OFF와 기록 보존 검사. 운영 세션 변경 없음. | event-hub.pg.test.ts; reset PG tests; browser main/toggle/expiry |
| QA-089 | 관리자 회식시작/종료 기존동작 | PASS | 자동토요일/수동금요일·접수/실제시작/종료·독립모듈 OFF와 기록 보존 검사. 운영 세션 변경 없음. | event-hub.pg.test.ts; reset PG tests; browser main/toggle/expiry |
| QA-090 | 기능 붙이기/떼기와 테마OFF 분리 | PASS | 자동토요일/수동금요일·접수/실제시작/종료·독립모듈 OFF와 기록 보존 검사. 운영 세션 변경 없음. | event-hub.pg.test.ts; reset PG tests; browser main/toggle/expiry |
| QA-091 | 사주·타로 기존결과·뒤집기 | PARTIAL | 기존 사주/타로/랭킹/통계/닉네임 보호 단위 회귀 통과. 모든 화면의 실제 버튼 조합 전수 클릭은 미실행. | test-cases.json |
| QA-092 | 랭킹·통계·명단·탐색 | PARTIAL | 기존 사주/타로/랭킹/통계/닉네임 보호 단위 회귀 통과. 모든 화면의 실제 버튼 조합 전수 클릭은 미실행. | test-cases.json |
| QA-093 | QR·튜토리얼·모든 설정·관리자 기존탭 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-094 | 공지/미디어 관리·실패·권한 | PARTIAL | 관련 기존 구현/회귀는 보존. 이 문장의 모든 역할·상태·실기기 조합을 실행했다고 판정하지 않음. | test-cases.json; source-inventory.json |
| QA-095 | 닉네임변경·기존 제약·접근제한 이력 | PARTIAL | 기존 사주/타로/랭킹/통계/닉네임 보호 단위 회귀 통과. 모든 화면의 실제 버튼 조합 전수 클릭은 미실행. | test-cases.json |
| QA-096 | 실제 코드에서 추가 발견한 메뉴와 버튼 모두 검사 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-097 | 테스트ON·publicAdmissionOpen false | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-098 | 테스트OFF만으로 모집 안열림 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-099 | 초기화세대·관리자오픈·개인정보정책 검사 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-100 | 오래된탭·직접API·예약자동방 우회차단 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-101 | 외부 오픈채팅 링크 비활성·기존URL 보존 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-102 | 기존참가자 조회/하트/채팅/복구 유지 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-103 | 가상1/2/3/4/10/11/15등 직접체험 | PARTIAL | 가상3/4/10/11 및 금토/투어 실제 앱 검사. 제시된 모든 순위·모든 상태 조합 수동 클릭은 미실행. | browser sandbox; test mode laboratory tests |
| QA-104 | 시험실만 초기화·운영원장불변 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-105 | 초기화중추첨/메시지·구시험토큰 차단 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-106 | 사용자 명시 오픈 전 신규모집 불가 | PASS | 테스트ON·OFF만으로모집닫힘·별도오픈/세대/정책/과거탭/예약 우회차단·시험실만초기화·실원장보존을 격리환경에서 검사. 실제 운영 상태는 QA119 별도. | event-test-mode.pg.test.ts; public-test-mode.test.tsx; browser persistent laboratory |
| QA-107 | API P50/P95/P99·2초목표·오류율 | PARTIAL | 실제HTTP100/150명 P50/P95/P99·오류율 측정.150명 일부구간2초목표 미달. | soak-150-15min.json |
| QA-108 | 요청완료→다른기기화면 반영시간 | PARTIAL | 관리자 답장 클릭→별도 참가자 화면 미확인 배지561ms. 하트·채팅·승인 전체 기기별 지연은 미측정. | inquiry-visible-timing.json |
| QA-109 | 100/150명 혼합은 격리환경에서 | PASS | 100명 동시신청·150명 혼합 실제HTTP/누적PG,실제재시작·응답유실·중복거부.운영요청 없음. | soak-150-15min.json; browser 100-session HTTP |
| QA-110 | 반복요청·재연결·느린망·냉간·장시간 | PARTIAL | 공유pool잠금대기 병목수정 후15분/11031요청에서503재발없음.수시간/실운영누수없음 보장불가. BLACK무손실93.56%축소,선택아바타지연로딩. | soak-503-before.json; soak-150-15min.json; asset-preservation.json |
| QA-111 | 중복polling/SSE·리스너·메모리누수 | PARTIAL | 공유pool잠금대기 병목수정 후15분/11031요청에서503재발없음.수시간/실운영누수없음 보장불가. BLACK무손실93.56%축소,선택아바타지연로딩. | soak-503-before.json; soak-150-15min.json; asset-preservation.json |
| QA-112 | DB잠금/N+1·이미지·번들·불필요렌더 | PARTIAL | 공유pool잠금대기 병목수정 후15분/11031요청에서503재발없음.수시간/실운영누수없음 보장불가. BLACK무손실93.56%축소,선택아바타지연로딩. | soak-503-before.json; soak-150-15min.json; asset-preservation.json |
| QA-113 | 401/403/429/500·빈/부분응답·응답유실 | PASS | 인증·권한·요청제한·503/부분응답·저장후응답유실 회귀와 기존598보호검사. 보호조건 삭제 없음. | test-cases.json; actual browser; publication-scan.json |
| QA-114 | 사용자/행사권한·로그마스킹·기존보호검사 | PASS | 인증·권한·요청제한·503/부분응답·저장후응답유실 회귀와 기존598보호검사. 보호조건 삭제 없음. | test-cases.json; actual browser; publication-scan.json |
| QA-115 | 코드/자산 원본보존·해시 | PASS | 제공로고9원본해시/20참고사진 비공개원본/새아바타/이전문서·실패기록 보존. | asset-preservation.json; ../avatars-v12/manifest.json; git-preservation.json |
| QA-116 | 운영DB/업로드/일치키 보호백업 | BLOCKED | Netlify/Render 관리연결HTTP200·이전배포ID 확인. 운영DB/업로드 완전한 보호백업·격리복원 전이며 V12 배포·운영차단확인 미실행. Supabase현재관리인증 미연결. | ../DEPLOYMENT_RESULT_2026-10-29.md; feature-push-risk.json |
| QA-117 | 격리복원·복원후암호화/로그인/입금/미디어 | BLOCKED | Netlify/Render 관리연결HTTP200·이전배포ID 확인. 운영DB/업로드 완전한 보호백업·격리복원 전이며 V12 배포·운영차단확인 미실행. Supabase현재관리인증 미연결. | ../DEPLOYMENT_RESULT_2026-10-29.md; feature-push-risk.json |
| QA-118 | 양서비스 실제배포ID/SHA·호환롤백 | BLOCKED | Netlify/Render 관리연결HTTP200·이전배포ID 확인. 운영DB/업로드 완전한 보호백업·격리복원 전이며 V12 배포·운영차단확인 미실행. Supabase현재관리인증 미연결. | ../DEPLOYMENT_RESULT_2026-10-29.md; feature-push-risk.json |
| QA-119 | 기존사이트 실운영 신규신청 차단 확인 | BLOCKED | Netlify/Render 관리연결HTTP200·이전배포ID 확인. 운영DB/업로드 완전한 보호백업·격리복원 전이며 V12 배포·운영차단확인 미실행. Supabase현재관리인증 미연결. | ../DEPLOYMENT_RESULT_2026-10-29.md; feature-push-risk.json |
| QA-120 | 실제 갤럭시/아이폰·실물 푸시 UNKNOWN 구분 | UNKNOWN | 해당 문장의 실기기·전체 접근성/모든 메뉴·환경 조합은 미실행. 관련 단위 검사만으로 전체 통과 처리하지 않음. | REQUIREMENTS.md; SOURCE_INVENTORY.md |
| QA-121 | 미해결필수오류/누락은 출시차단 | PASS | 남은 성능·권한·전수/실기기·운영백업/복원을 숨기지 않고 전체완료/운영가능 미판정. | ../V12_RESULT_2026-10-29.md |
| QA-122 | 대구 2026-12-03/04/05/06과 목/금/토/일 및 확정 상태 일치 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-123 | 대구 목·일과 금·토 회차별 시간 및 자정 이후 다음날 계산 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-124 | 기존 11월4지역·16일 보존 + 대구4일 = 투어20일; 중복 레코드 없음 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-125 | BLACK 원본·문자·색·비율 보존과 모바일 가독성; 기존로고8종 유지 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-126 | 웹 공지·투어/통합 모집글·행사상세·홍보자료 대구 일정/로고 일치 | PARTIAL | 대구 해당 회차 공지/상세/행사목록/관리자·투어/통합 모집글·포스터 반영. 앱 공지는 해당회차 중심이며 모든 도시 공지에 전체5지역 일정을 반복하지 않음. 실제게시 없음. | ../campaign-20261029-v12/; screenshots/v12-daegu-320.png |
| QA-127 | 행사목록·관리자 날짜필터·신청/대기방이 같은 대구 행사ID에 연결 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-128 | 대구 개최확정 후에도 테스트ON·일반신청닫힘·직접API우회차단 유지 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-129 | 2·3차 장소/정확한 주소/선입금액/3차종료 미확정값 임의생성 없음 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-130 | 기존 참가조건·회비·혜택·신청차수 및 도시별 원장/통계/채팅 격리 보존 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
| QA-131 | 현재 안내의 대구후보/미확정·4지역/11월만 표현 정정; 원본이력 보존 | PASS | 대구4일 KST/자정이월/BLACK9종/기존16+4=20/후보재사용·ID/기존규칙/접수게이트 확인. 장소·주소·정산/3차종료 임의확정 없음. 과거자료보존. | event-hub-v12.spec.ts; event-hub.pg.test.ts; event-campaign.test.ts; asset-preservation.json |
