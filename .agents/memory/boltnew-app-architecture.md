---
name: boltnew-app architecture
description: Korean queer social drinking app — key architecture decisions, component structure, and feature map
---

## Core Stack
- `artifacts/boltnew-app/src/App.tsx` (~7,800줄) — monolithic main file (Babel 500KB warning, functionally fine)
- `src/lib/localdb.ts` — in-memory+localStorage mock (no real Supabase)
- `src/AdminApp.tsx`, `src/TestDashboard.tsx`, `src/stickers.tsx` — supporting screens
- `src/components/FortuneTab.tsx` — 사주/타로/궁합 탭 컴포넌트 (darkMode prop 없음, 자체 dark theme)
- `src/lib/fortune.ts` — 모든 점술 계산 로직

## Tab Structure (5 Main Tabs)
1. **나·참여자** (status/profiles) — 내 상태 | 참여자 서브탭
2. **배치도** (seating)
3. **채팅·건의** (chats/suggestions) — 채팅 | 건의함 서브탭
4. **게임·운세** (game/fortune) — 🎮 게임 | 🔮 운세 서브탭
5. **통계·랭킹** (stats/ranking) — 통계 | 랭킹 서브탭

**Why:** User wanted exactly 5 tabs; fortune moved from standalone top-level tab into "게임·운세" sub-tab.

`mainTab === 'fortune'` still exists in MainTab type and is handled by fortune sub-tab button calling `onTabChange('fortune')`. Game tab in tab bar highlights when mainTab is 'game' OR 'fortune'.

## MainScreen Props Key
- `MainScreen` receives all state from parent App and passes down
- `MainScreen` is a module-level component (not defined inside App) — receives `newMsgCount` as prop
- `FortuneTab` receives: `currentUserId`, `myProfile`, `profiles`, `likedIds` (no `darkMode`)

## Fortune Feature Map
- `getZodiac(year)` — 12지신 정보
- `getOhaeng(year)` — 오행 (목화토금수)
- `drawTodayTarot(userId)` — 오늘 타로 3장 (userId+날짜 시드)
- `getTodayFortune(year,month,day)` — 오늘의 사주 운세
- `getCompatibility(...)` — 전통 사주 궁합 (12지신)
- `getNumerologyCompat(...)` — 수비학 궁합 (생년월일 숫자 합산)
- `getOhaengCompat(...)` — 오행 상성 궁합
- `getBedCompat(...)` — 침대 궁합 🔞 (오행+돔섭 스코어)
- `getMbtiCompat(...)` — MBTI 궁합

## Dummy Data (TestDashboard)
- `createManyDummies`: Korean adjective+noun nicknames (귀여운고양이 등), birth_year 1985-2004, birth_month 1-12, birth_day 1-28, random Korean location, random interests, random pin_code, dom_sub_score
- `DUMMY_ADJS/DUMMY_NOUNS/DUMMY_LOCATIONS` — nickname/location pool defined in TestDashboard.tsx

## Key Bug Fixes Applied
- Startup `useEffect` timeout: `clearTimeout` is called on both success AND cleanup via `cancelled` flag
- `handleTabChange`: fortune tab now sets seenGameCount (same as game tab)
- FortuneTab: `darkMode` prop removed — uses self-contained dark theme

## Profile Schema Fields for Fortune
- `birth_year: number | null` — 태어난 해
- `birth_month: number | null` — 태어난 월
- `birth_day: number | null` — 태어난 일
- All three required for fortune features; missing any → NoBirthday state shown
