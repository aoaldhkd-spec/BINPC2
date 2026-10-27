# 기존 BINPC2 이어받기

기존 저장소/feat/event-hub-v6-20261027에서 계속한다. 새 프로젝트·main 병합 금지.
고정된 검증 소스:688d9925b59052cf13afeac7fc8ecd9552920417.

- source.bundle은5428ad62859185113b6fbad69583859b2ef74dba를 전제로 하는 증분 Git bundle이다. 기존 저장소에서 Git bundle verify로 검증한 뒤 이력으로 읽는다. 사용자에게 프로그램/수동 명령을 요구하지 말고 Cursor가 처리한다.
- 최신 V3 보고서와 validation.json을 먼저 읽는다. 전체 완료·실기기 통과·외부 주소 발급으로 추정하지 않는다.
- source.bundle은 운영 DB/키/계정을 포함하지 않는다. 전체 과거 이력 bundle은 Codex 로컬 복구용으로 별도 보존한다.
- local_browser 실패:100동시세션503. 물리 Galaxy/iPhone, 실제 배포/150명PG/장시간은 남아 있다.
- 별도 Render 시험 환경의 비용·외부 접근 승인과 관리 연결이 있어야 배포. 운영 설정을 바꾸거나 기존 키를 복사하지 않는다.
- main/운영 DB/외부 발송/모집 공개/자동 송금·정산 금지. 개인정보 정책 미확정 신규 production 접수 차단 유지.

검증 앱 고정620fda2d1cd84dca8326bab6b83d255fed5065a5, bundle에는 이후 CI 전용 변경도 포함한다. 원격 HEAD가 더 최신이면 과거 bundle로 되돌리지 말고 인계 자료/복구용으로만 사용한다.
