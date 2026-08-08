---
name: boltnew-app dead code audit
description: 코드에는 있지만 웹 UI에서 쓰이지 않는 dead code 목록 및 제거 결과
---

## 활성 기능으로 오인 가능한 것

### loadSeats / seats — 활성 기능 (절대 제거 금지)
- MainScreen 좌석/테이블 배치도, SeatRegisterDialog, 게임 참가자 선택 모두 여기서 데이터를 받음
- useSeating hook → App.tsx → MainScreen → games 전 경로로 흐름

## 제거 완료된 dead code

### activeTables / tableLabels (App.tsx)
- SSE 설정값 UPDATE 수신 시 setActiveTables/setTableLabels 호출됐지만 JSX/로직에서 **한 번도 읽히지 않음**
- 제거: useState 선언 2개 + setter 호출 6곳

### penalty 완전 제거
- types/app.ts: `penalty?: string` 제거
- App.tsx 2곳: `penalty: row.penalty ?? ''`, `penalty: ''` 제거
- AdminApp.tsx: `{game.penalty && <p>벌칙: {game.penalty}</p>}` 제거
- types/database.ts: DB 스키마 타입은 유지 (Supabase 연동 타입이므로 제거 시 다른 쿼리가 깨질 수 있음)

**Why:** penalty 입력 UI는 이전 세션에서 이미 제거됐으나 데이터 파이프라인과 display 코드가 남아있었음. 이번에 완전 제거.

## 타입 에러 패턴
- types/app.ts에서 필드를 제거할 때 App.tsx 전체를 grep해서 해당 필드를 직접 참조하는 객체 리터럴을 모두 확인해야 함
- `penalty?: string` 제거 후 `penalty: ''` 할당도 TS2353 에러를 냄
