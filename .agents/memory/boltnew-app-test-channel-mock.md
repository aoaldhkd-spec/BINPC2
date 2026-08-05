---
name: boltnew-app test channel mock pattern
description: useChat 훅 테스트에서 supabase.channel() mock 올바른 패턴 — 핸들러 overwrite 방지
---

## 문제

`supabase.channel()` mock이 모든 채널 이름에 같은 mock 인스턴스를 반환할 때,
각 채널이 `.on(event, filter, handler)`를 호출하면 마지막 호출이 이전 핸들러를 덮어씀.

`useChat`이 `new-chats-u1-{uid}`, `new-chats-u2-{uid}` 채널을 추가하자
기존 `chat:{chatId}` 채널의 message 핸들러가 덮어써져서 `_triggerInsert` 테스트가 실패.

## 올바른 패턴 (handlers 배열)

```ts
function makeChannelMock() {
  const handlers: ((payload: unknown) => void)[] = [];
  const ch: Record<string, unknown> = {};
  ch.on = vi.fn().mockImplementation(
    (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
      handlers.push(handler); // overwrite 대신 append
      return ch;
    },
  );
  ch.subscribe = vi.fn().mockImplementation(() => ch);
  ch.unsubscribe = vi.fn().mockReturnValue(ch);
  (ch as any)._triggerInsert = (p: unknown) => {
    handlers.forEach(h => { try { h(p); } catch {} });
  };
  return ch;
}
```

## Why

- `handlers.push` → 모든 채널 핸들러가 등록됨
- `_triggerInsert` → 등록된 모든 핸들러 실행 (unrelated 채널의 side effect는 무해)
- 새 채널 추가 시 기존 테스트를 깨지 않음

## How to apply

새 Supabase 채널을 `useChat`에 추가할 때:
- `chat-read-status.test.ts`, `unread-badge.test.ts`의 `makeChannelMock`이 위 패턴을 따르는지 확인
- `supabase.channel`이 단일 mock을 반환하는 구조면 반드시 handlers 배열 패턴 사용
