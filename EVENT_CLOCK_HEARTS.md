# BINPC2 행사 시계 타임라인·하트 지급

## 동작

`app_settings.event_schedule`에 Asia/Seoul 기준 슬롯을 JSON으로 저장한다. 각 슬롯은 다음 형태다.

```json
{"timezone":"Asia/Seoul","slots":[
  {"id":"slot-1","at":"23:00","notice":"행사 시작","functions_locked":true,"heart_grants":{"red":0,"blue":0,"pink":0,"green":0}},
  {"id":"slot-2","at":"23:05","notice":"하트 오픈","functions_locked":false,"rainbow_pool":4}
]}
```

- 기존 `timer_end_at`/상대 5·10분 타이머는 제거하지 않는다.
- 관리자는 슬롯을 직접 추가하고 행사 시각을 직접 수정할 수 있다.
- 서버가 현재 Asia/Seoul 시각으로 활성 슬롯과 누적 지급량을 계산한다. 클라이언트 표시는 보조 UX이고 `/op` insert가 최종 권한이다.
- 무지개하트는 해금 전 회색·사용 불가이며, quota는 처음 0개이며, 현재 시각까지 열린 슬롯의 `rainbow_pool` 합계가 하나의 누적 pool이 된다. 사용자는 pool에서 매번 빨강·파랑·분홍·초록 중 원하는 색을 자유롭게 고를 수 있고, 같은 색을 반복해도 된다.
- `heart_grants`는 선택적인 고급 색상별 quota로 유지되며, 무지개 pool이 열려 있으면 서버는 색상과 무관하게 pool의 총 사용량으로 한도를 검증한다.
- 현재 슬롯의 공지와 `rainbow_pool` 지급은 참여자에게 `무지개하트N개 적용`으로 표시된다. PII는 포함하지 않는다.

## 실시간·보존

관리자 저장은 기존 `admin_update_settings`를 사용하며 `app_settings` SSE/`/ready` 경로로 전체 사용자에게 전달된다. 슬롯 잠금은 서버 SSE payload와 서버 insert guard 모두에서 적용된다. `app_settings`는 행사 종료 데이터 wipe 대상이 아니므로 schedule은 admin event reset 뒤에도 설정으로 남는다. 다음 행사 전에 관리자가 슬롯을 비우거나 새 시간표로 저장해야 한다.

운영 전에는 서버·클라이언트 시각/시간대, 무지개 pool remaining, 색상 자유 선택과 반복 사용, 잠금→해제 전환, 재연결 후 `/ready` 반영을 확인한다.
