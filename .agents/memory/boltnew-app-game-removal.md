---
name: boltnew-app game removal 2026-08-08
description: 게임 기능 전면 삭제(15개 컴포넌트 파일 + useGames.ts) 및 Bug #1/#5/#6 수정 내용
---

## 삭제한 파일
- `src/components/games/` 폴더 전체 (15개 파일)
- `src/hooks/useGames.ts`

## 변경한 파일 (게임 코드 제거)
- **App.tsx**: 게임 imports 6개, 상태 5개, useGames 구독, qa_games/image_games/balance_games 채널, 게임 JSX 5블록, MainScreen 게임 props 제거
- **MainScreen.tsx**: UserGameTab import·JSX·게임탭, balanceGames 등 props 5개, seenGameCount/gameKey 상태 제거
- **AdminApp.tsx**: balance_games/qa_games/image_games backup·restore·delete, gsBackup, NOTIF_TYPES 'game' 항목, GAME_QUICK/WHO_TARGETS 제거
- **types/app.ts**: BalanceGame, BalanceVote, TableMiniGameSession, GameState 타입 제거
- **api-server/db.ts**: FIELD_LIMITS 게임 4항목, SYNC_TABLES 게임 5테이블, clear-all-data 게임 테이블 제거

## Bug #1 (useChat.ts 이중 구독)
- perChatChannels effect에 chatId 의존성 추가
- 활성 chatId에 대한 msgs: 채널을 자동 제거해 이중 구독 차단
- `}, [chatId, chatIdsKey, currentUserId]);`

## Bug #5 (db.ts _sseConnPerIp 좀비 누수)
- `_sseCleanup.set(res, () => { clearInterval(keepalive); _undoSseConnCount(); })`
- cleanupConn에서 중복 감소 코드 제거

## Bug #6 (rate map 무한 증가 재발방지)
- `RATE_MAP_MAX_SIZE = 50_000` 상수 추가
- _loginRateMap / _uploadRateMap 새 버킷 생성 전 상한 체크 추가

**Why:** 게임 UI가 AdminApp에서 완전히 삭제된 상태에서 dead code가 앱 번들에 10KB 이상 포함되어 있었음.

**How to apply:** 게임 관련 테이블(balance_games 등)은 DB에 남아있으나 앱이 접근하지 않음; 나중에 DB 스키마 정리 필요.
