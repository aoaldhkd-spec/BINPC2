---
name: boltnew-app seating removal
description: 자리 배치(seats) 기능 전면 삭제 시 수정한 파일 목록과 주의사항
---

## 삭제된 기능
- 자리 배치(seats): useSeating.ts, SeatRegisterDialog.tsx 삭제
- DB 테이블: qa_games, qa_answers, image_games, image_votes, balance_games, balance_votes, game_votes, seats — DROP CASCADE 완료 (2026-08-08)

## 수정된 파일
- `App.tsx` — Seat import, useSeating, seatingLocked state, seatsChannel, loadSeats 제거
- `MainScreen.tsx` — seats/seatingLocked props 제거; heart 버튼 seatingLocked 잠금 제거
- `StatsTabs.tsx` — Seat type, seats prop, occupied stat 제거
- `AdminApp.tsx` — Seat type, seats state, seats subscription, forceSeat UI, handleForceSeat 제거; admin_clear_seat/admin_reset_all_seats/admin_force_seat RPC 호출 제거; balance_votes/qa_answers/image_votes backup/restore 제거
- `api-server/db.ts` — seats ALLOWED_TABLES/hotTables/SYNC_TABLES 제거; seats seed/RPC 핸들러 제거; RATE_MAP_MAX_SIZE 중복선언 제거(line 159); 여분 `}` 제거(line 502)

## 주의사항
- api-server/db.ts에 RATE_MAP_MAX_SIZE가 두 곳(147, 159)에 선언됨 → 159행 제거 필요했음
- seats seed 제거 후 남은 `}` 하나로 파서 오류 발생 → 제거 필요
- AdminApp.tsx forceSeat 다이얼로그는 세 번 나눠 제거해야 완전히 사라짐 (첫 번째 시도에서 orphan code 잔류)
- StatsTabs.tsx `occupied` 변수는 useMemo 반환 객체에서 제거해야 함

**Why:** seats 기능은 게임과 함께 삭제 결정됨 (2026-08-08).
