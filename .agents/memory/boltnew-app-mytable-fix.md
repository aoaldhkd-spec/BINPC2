---
name: boltnew-app 내 테이블 탭 테이블 선택 UI
description: 내 테이블 탭에서 테이블 선택 칩 UI와 MyTableView 크기 수정
---

# 내 테이블 탭 테이블 선택 UI

## Rule
`MainScreen.tsx`의 내 테이블 탭에는 `selectedMyTableNum` state와 `myTableList` useMemo, `resolvedMyTable` 세 가지가 반드시 있어야 한다.

**Why:** 과거에 "selectedMyTableNum / myTableList / resolvedMyTable 제거" 리팩토링이 있었는데 사용자가 테이블 선택 기능이 필요하다고 명확히 요구함. 제거하면 안 됨.

## How to apply
- `selectedMyTableNum`: useState (null 초기값) — 사용자가 칩으로 선택한 테이블 번호
- useEffect: tableNumber가 처음 세팅될 때 selectedMyTableNum을 초기화 (단, 이미 선택된 경우 재초기화하지 않음)
- `myTableList`: `activeTables ?? [...new Set(seats.map(s=>s.table_number))]`를 정렬한 배열
- `resolvedMyTable`: `selectedMyTableNum ?? tableNumber ?? myTableList[0] ?? null`
- JSX: `myTableList.length > 0`이면 가로 스크롤 칩 행 표시, 내 자리 테이블에는 🪑 배지 추가
- `MyTableView`에 `tableNumber` 대신 `resolvedMyTable` 전달
- 자리 클릭 후에도 `selectedMyTableNum` 리셋하지 않으므로 테이블 뷰 유지됨

## MyTableView 크기
- 외부 wrapper를 `max-w-sm mx-auto` → `w-full`로 변경
- `max-w-sm`이 모바일에서 작은 정사각형처럼 보이는 문제 해결
