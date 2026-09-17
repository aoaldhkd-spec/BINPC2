# BINPC2 하트 해금 스케줄

이 문서는 **구 quota/`rainbow_pool` 모델 설명이다. 더 이상 운영 기준이 아니다.**

현재 기준: [docs/MASTER_CONTEXT.md](docs/MASTER_CONTEXT.md)  
코드: `artifacts/boltnew-app/src/lib/heart-ops.ts`, `artifacts/api-server/src/lib/db-heart-ops.ts`, `artifacts/boltnew-app/src/admin/HeartOpsCard.tsx`

## 현재 모델 (v2 lock/unlock)

`app_settings.event_schedule`에 Asia/Seoul 기준 슬롯을 JSON으로 저장한다.

```json
{
  "timezone": "Asia/Seoul",
  "version": 2,
  "slots": [
    { "id": "slot-1", "at": "23:00", "unlock": ["red"] },
    { "id": "slot-2", "at": "23:30", "unlock": ["blue"] },
    { "id": "slot-3", "at": "24:00", "unlock": ["pink", "green"] },
    { "id": "slot-4", "at": "24:30", "unlock": ["rainbow"] }
  ],
  "instant_unlock": [],
  "direct_notice": ""
}
```

- 일반 하트(호감·친구·뜨밤·칭찬)는 해금 후 종류당 1회.
- 무지개는 해금 후 4회. `like_source=rainbow`로만 차감되며 일반 하트는 줄지 않는다.
- 24:00/24:30은 다음 날 00:00/00:30으로 계산한다.
- 관리자 저장은 `admin_update_settings` → `app_settings` SSE/`/ready`. 서버 insert가 최종 권한이다.
- v1 `heart_grants`/`rainbow_pool` JSON은 파서가 unlock 플래그로 마이그레이션한다. 신규 저장은 v2만 쓴다.

기존 `timer_end_at` 상대 타이머는 제거하지 않는다. `app_settings`는 행사 종료 wipe 대상이 아니므로 다음 행사 전에 스케줄을 확인한다.
