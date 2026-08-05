---
name: boltnew-app SeatingMap hook pitfall
description: Vite Fast Refresh가 비exported 내부 컴포넌트의 useState와 충돌하는 패턴 및 수정법
---

## 현상
`SeatingMap.tsx` 내부에 `BigSeatButton`(non-exported function component)이 `useState`를 사용할 때 Vite HMR 이후 "Invalid hook call" 에러 발생. 심지어 `BigSeatButton`이 exported 되지 않아도 발생함.

## 원인
Vite의 `@vitejs/plugin-react` Fast Refresh 런타임은 exported component에 대해서만 `$RefreshReg$` 래핑을 주입. 비exported 내부 컴포넌트가 hooks count를 변경하는 HMR이 발생하면 기존 React fiber의 hook 슬롯과 불일치 → Invalid hook call.

**Why:** HMR stale fiber 문제는 hard page reload 후에는 사라짐. 하지만 개발 중 반복 발생하므로 근본적으로 해결해야 함.

## 수정
- `BigSeatButton`에서 `useState` 완전 제거.
- confirm dialog state를 상위 `TableExpandModal`로 인상 (`useState<Seat | null>(null)`).
- `TableExpandModal`이 `onClearSeat={(s) => setConfirmSeat(s)}`로 intercept → 확인 후 원본 `onClearSeat` 호출.
- `BigSeatButton`의 × 버튼은 `onClearSeat?.(seat)` 직접 호출.

## How to apply
SeatingMap 같은 단일 파일에 다수의 내부 컴포넌트가 있고, 그 중 하나에 hooks이 필요하면: hooks이 있는 컴포넌트를 별도 파일로 분리하거나, hooks state를 closest exported/parent component로 인상할 것.

## 추가 수정 (같은 세션)
- `admin_create_session` RPC에 `p_password` 대신 `p_admin_password` 인자 전달 (AdminApp.tsx:92)
- ChatScreen/ProfileDetail에서 `onReset: _onReset` dead prop 제거 + App.tsx에서 전달 중단
- SSE 재연결 시 `loadSeats()` + `loadProfiles()` 추가 (기존엔 채팅+좋아요만 리로드)
- ChatScreen/MainScreen 생년월일 저장 시 `maxDayForMonth` cross-validation 추가 (2월 30일 방지)
