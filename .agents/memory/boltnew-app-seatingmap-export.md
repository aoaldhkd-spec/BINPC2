---
name: boltnew-app SeatingMap hook pitfall
description: Vite Fast Refresh가 비exported 내부 컴포넌트의 useState와 충돌하는 패턴 및 수정법
---

## 현상
`SeatingMap.tsx` 내부에 `BigSeatButton`(non-exported function component)이 있을 때 Vite HMR 이후 "Invalid hook call" 에러 발생.
컴포넌트에 useState가 없어도 Vite Fast Refresh가 비공개 컴포넌트를 제대로 추적하지 못해 발생.

## 원인
Vite의 `@vitejs/plugin-react` Fast Refresh 런타임은 **exported component에 대해서만** `$RefreshReg$` 래핑을 주입.
비exported 내부 컴포넌트가 HMR 업데이트될 때 기존 React fiber의 hook 슬롯과 불일치 → Invalid hook call.

**Why:** HMR stale fiber 문제는 hard page reload 후에는 사라짐. 하지만 개발 중 반복 발생하므로 근본적으로 해결해야 함.
`// @refresh reset`을 파일에 추가해도 비exported 컴포넌트에는 효과 없음.

## 수정 (최종)
- `BigSeatButton`에 `export` 추가 → `export function BigSeatButton(...)`.
  이렇게 하면 Vite가 $RefreshReg$ 래핑을 주입하고 HMR 시 올바르게 추적.
- HMR 로그에 "Could not Fast Refresh (new export)" 메시지 출력 후 전체 모듈 갱신 — 정상 동작.
- confirm dialog state는 `TableExpandModal`과 `MyTableView`에서 각각 관리 (BigSeatButton에는 useState 없음).

## MyTableView의 seatLg 동작
- `seatLg: true` → MyTableView 전용 확대 모드
- sofa 타입: `w-16 self-stretch` (컬럼 높이에 맞춰 세로 늘어남)
- row1 타입: `w-28 self-stretch` (동일하게 세로 늘어남) + 배치도 기본값은 `w-20 h-20` 고정
- BigSeatButton `large=true`: `w-16 h-16` (배치도 `w-14 h-14`)

## How to apply
SeatingMap 같은 단일 파일에 다수의 내부 컴포넌트가 있고 HMR 중 hook 오류가 발생하면:
1. 문제 컴포넌트에 `export` 추가 (가장 간단)
2. 또는 별도 파일로 분리
`// @refresh reset`만으로는 비exported 컴포넌트의 HMR hook 오류를 해결하지 못함.
