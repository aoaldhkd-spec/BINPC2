// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEventHub, rememberRecoveryCode } from './event-hub-client';
import { HubButton, HubFeedback } from '../event-hub/HubUi';
const events = vi.hoisted(() => ({ invalidate: undefined as (() => void) | undefined }));
vi.mock('./supabase', () => ({
  supabase: { channel: () => ({ on(_type: unknown, _filter: unknown, fn: () => void) { events.invalidate = fn; return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
  onSseReconnect: () => () => {}, isSseHealthy: () => true,
}));
const state = { enabled: true, hasSession: true, events: [], applications: [{ id: 'kept', payment: 'approved' }], threads: [], stocks: [] };
const fullApplication = { id: 'kept', eventId: 'event-one', revision: 2, stage: 3, payment: 'reported', basic: { nickname: '합성', birthYear: 1995, location: '합성' }, profile: { lastStep: 1 }, cards: [], history: [] };
// Public participant events intentionally omit the administrator's revision.
const fullState = { ...state, events: [{ id: 'event-one', title: '합성 행사', date: '2026-10-30', start: '22:30', end: '01:00' }], applications: [fullApplication], serverNow: '2026-10-30T14:00:00Z' };
const response = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); rememberRecoveryCode(''); events.invalidate = undefined; });

it('reuses the authenticated bootstrap response instead of reading the private ledger twice', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(state));
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0].payment).toBe('approved'));
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/event-hub/state']);
});

it('reads again after session creation, never rendering the pre-login state as the recovered application', async () => {
  let session = false;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) { session = true; return response({ ok: true }); }
    return response({ ...state, hasSession: session, applications: session ? state.applications : [] });
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0]?.payment).toBe('approved'));
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/event-hub/state', '/api/event-hub/session', '/api/event-hub/state']);
});

it('uses the persisted session response without a third request while preserving the cookie probe', async () => {
  const authenticated = { ...fullState, applications: [{ ...fullApplication, payment: 'approved' }] };
  let sent: Record<string, unknown> | undefined;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/session')) { sent = JSON.parse(String(init?.body)); return response({ ok: true, state: authenticated }); }
    return response({ ...state, hasSession: false, applications: [] });
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0]?.payment).toBe('approved'));
  expect(sent).toMatchObject({ includeState: true, create: true });
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/event-hub/state', '/api/event-hub/session']);
});

it('rejects a partial session state and restores from one authenticated fallback read', async () => {
  let reads = 0;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) return response({ ok: true, state: { hasSession: true, enabled: true, applications: [] } });
    return response(++reads === 1 ? { ...state, hasSession: false, applications: [] } : state);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0]?.payment).toBe('approved'));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('does not accept a session envelope containing null application rows', async () => {
  let reads = 0;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) return response({ ok: true, state: { ...fullState, applications: [null] } });
    return response(++reads === 1 ? { ...state, hasSession: false, applications: [] } : state);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0]?.payment).toBe('approved'));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('rejects a delayed session response after another identity has recovered', async () => {
  let reads = 0, release!: (value: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) return new Promise<Response>(resolve => { release = resolve; });
    return response(++reads === 1 ? { ...state, hasSession: false, applications: [] } : { ...state, applications: [{ id: 'current-owner', payment: 'approved' }] });
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  rememberRecoveryCode('new-owner-during-session-bootstrap');
  await act(async () => { release(response({ ok: true, state: { ...state, serverNow: '2026-10-30T14:00:00Z' } })); });
  await waitFor(() => expect(result.current.state?.applications[0]?.id).toBe('current-owner'));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('does not overwrite a newer explicit state read with the session response', async () => {
  let reads = 0, release!: (value: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) return new Promise<Response>(resolve => { release = resolve; });
    return response(++reads === 1 ? { ...state, hasSession: false, applications: [] } : state);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => { await result.current.load(); });
  await act(async () => { release(response({ ok: true, state: fullState })); });
  expect(result.current.state?.applications[0].payment).toBe('approved');
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('can use a committed cookie session when browser storage throws, without fabricating identity', async () => {
  const authenticated = { ...fullState, applications: [{ ...fullApplication, payment: 'approved' }] };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Storage unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage unavailable'); });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => String(path).endsWith('/session') ? response({ ok: true, state: authenticated }) : response({ ...state, hasSession: false, applications: [] }));
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0]?.payment).toBe('approved'));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('discards an old bootstrap response when a newer explicit read has restored approval', async () => {
  let release!: (value: Response) => void;
  let reads = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ++reads === 1 ? new Promise<Response>(resolve => { release = resolve; }) : response(state));
  const { result } = renderHook(() => useEventHub());
  await act(async () => { await result.current.load(); });
  await act(async () => { release(response({ ...state, applications: [{ id: 'kept', payment: 'reported' }] })); });
  expect(result.current.state?.applications[0].payment).toBe('approved');
  expect(reads).toBe(2);
});

it('shows saving immediately, rejects a double click, and waits for persisted-state confirmation before success', async () => {
  let releaseWrite!: (value: Response) => void, releaseRead!: (value: Response) => void;
  let reads = 0, writes = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/mutate')) { writes++; return new Promise<Response>(resolve => { releaseWrite = resolve; }); }
    if (++reads > 1) return new Promise<Response>(resolve => { releaseRead = resolve; });
    return response(state);
  });
  const { result } = renderHook(() => useEventHub(true));
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let saved!: Promise<unknown>;
  act(() => { saved = result.current.mutate({ action: 'application.report', target: 'kept', revision: 2 }); });
  expect(result.current.status).toBe('saving');
  expect(await result.current.mutate({ action: 'application.report', target: 'kept', revision: 2 })).toBeNull();
  expect(writes).toBe(1);
  await act(async () => { releaseWrite(response({ saved: true })); });
  expect(result.current.status).toBe('saving');
  await act(async () => { releaseRead(response(state)); await saved; });
  expect(result.current.status).toBe('saved');
});

it('does not repeat a full read for an invalidation already covered by the post-save response', async () => {
  let reads = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/mutate')) { events.invalidate!(); return response({ saved: true }); }
    reads++; return response(state);
  });
  const { result } = renderHook(() => useEventHub(true));
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'application.report', target: 'kept', revision: 2 }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  expect(reads).toBe(2);
  expect(result.current.status).toBe('saved');
});

it('pending buttons display feedback and cannot issue another request', () => {
  const click = vi.fn();
  const view = render(<HubButton pending onClick={click}>저장</HubButton>);
  const button = screen.getByRole('button', { name: '저장 중…' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(button); expect(click).not.toHaveBeenCalled();
  view.rerender(<HubButton onClick={click}>저장</HubButton>);
  fireEvent.click(screen.getByRole('button', { name: '저장' })); expect(click).toHaveBeenCalledOnce();
});

it('slow feedback reports a pending response, never a fabricated completion', () => {
  vi.useFakeTimers();
  const view = render(<HubFeedback status="saving" error=""/>);
  expect(screen.getByRole('status').textContent).toContain('저장 중');
  act(() => { vi.advanceTimersByTime(1800); });
  expect(screen.getByRole('status').textContent).toContain('저장 응답을 기다리는 중');
  expect(screen.queryByText('저장되었습니다 ✓')).toBeNull();
  view.rerender(<HubFeedback status="checking" error=""/>);
  expect(screen.getByRole('status').textContent).toBe('저장 결과 확인 중…');
  view.rerender(<HubFeedback status="saved" error=""/>);
  expect(screen.getByRole('status').textContent).toBe('저장되었습니다 ✓');
});

it('advances a draft from its committed response without waiting for a redundant full read, and rejects older in-flight state', async () => {
  rememberRecoveryCode('performance-stable-owner-code');
  const initial = { ...state, events: [{ id: 'event-one' }], basicDrafts: {} };
  const draft = { basic: { collection: true, version: '2026-10-27-event-v6' }, nextStep: 1, revision: 1, updatedAt: '2026-10-30T14:00:00Z' };
  let reads = 0, releaseOld!: (value: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, draft });
    reads++;
    if (reads === 2) return new Promise<Response>(resolve => { releaseOld = resolve; });
    return response(reads >= 3 ? { ...initial, basicDrafts: { 'event-one': draft } } : initial);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let oldRead!: Promise<unknown>;
  act(() => { oldRead = result.current.load(); });
  await act(async () => { await result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one', basic: draft.basic, nextStep: 1 } }); });
  expect(result.current.status).toBe('saved');
  expect(result.current.state?.basicDrafts?.['event-one']).toEqual(draft);
  expect(result.current.state?.applications[0].payment).toBe('approved');
  expect(reads).toBe(2);
  await act(async () => { releaseOld(response(initial)); await oldRead; });
  expect(result.current.state?.basicDrafts?.['event-one']).toEqual(draft);
  await waitFor(() => expect(reads).toBe(3));
});

it('never merges a completed draft into a different login session', async () => {
  rememberRecoveryCode('performance-owner-before');
  let release!: (value: Response) => void;
  const initial = { ...state, events: [{ id: 'event-one' }], basicDrafts: {} };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => String(path).endsWith('/mutate') ? new Promise<Response>(resolve => { release = resolve; }) : response(initial));
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one' } }); });
  rememberRecoveryCode('performance-owner-after');
  let answer: unknown;
  await act(async () => {
    release(response({ saved: true, draft: { basic: { collection: true, version: '2026-10-27-event-v6' }, nextStep: 1, revision: 1, updatedAt: '2026-10-30T14:00:00Z' } }));
    answer = await write;
  });
  expect(answer).toBeNull();
  expect(result.current.status).toBe('failed');
  expect(result.current.error).toContain('로그인 상태가 바뀌었습니다');
  expect(result.current.state?.basicDrafts).toEqual({});
});

it('falls back to a durable fresh read for an incomplete draft acknowledgement', async () => {
  rememberRecoveryCode('performance-fallback-owner');
  let reads = 0, release!: (value: Response) => void;
  const initial = { ...state, events: [{ id: 'event-one' }] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, draft: { revision: 1 } });
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(initial);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one' } }); });
  await waitFor(() => expect(reads).toBe(2));
  expect(result.current.status).toBe('saving');
  await act(async () => { release(response(initial)); await write; });
  expect(result.current.status).toBe('saved');
});

it('does not merge a new identity draft into the previously rendered identity state', async () => {
  rememberRecoveryCode('performance-previous-owner');
  let reads = 0, release!: (value: Response) => void;
  const initial = { ...state, events: [{ id: 'event-one' }], basicDrafts: {} };
  const draft = { basic: { collection: true, version: '2026-10-27-event-v6' }, nextStep: 1, revision: 1, updatedAt: '2026-10-30T14:00:00Z' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, draft });
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(initial);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  rememberRecoveryCode('performance-current-owner');
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one' } }); });
  await waitFor(() => expect(reads).toBe(2));
  expect(result.current.status).toBe('saving');
  expect(result.current.state?.basicDrafts).toEqual({});
  await act(async () => { release(response({ ...initial, applications: [], basicDrafts: { 'event-one': draft } })); await write; });
  expect(result.current.state?.applications).toEqual([]);
  expect(result.current.status).toBe('saved');
});

it('retains an approval invalidation arriving during the background draft read', async () => {
  rememberRecoveryCode('performance-invalidation-owner');
  let reads = 0, release!: (value: Response) => void;
  const draft = { basic: { collection: true, version: '2026-10-27-event-v6' }, nextStep: 1, revision: 1, updatedAt: '2026-10-30T14:00:00Z' };
  const initial = { ...state, events: [{ id: 'event-one' }], basicDrafts: {}, applications: [{ id: 'kept', payment: 'reported' }] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, draft });
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(reads >= 3 ? { ...initial, applications: state.applications, basicDrafts: { 'event-one': draft } } : initial);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one' } }); });
  await waitFor(() => expect(reads).toBe(2));
  act(() => { events.invalidate!(); });
  await act(async () => { release(response({ ...initial, basicDrafts: { 'event-one': draft } })); });
  await waitFor(() => expect(result.current.state?.applications[0].payment).toBe('approved'), { timeout: 2000 });
  expect(reads).toBe(3);
});

it('does not replace a newer device draft with a delayed older save acknowledgement', async () => {
  rememberRecoveryCode('performance-newer-draft-owner');
  let reads = 0, requestId = '', release!: (value: Response) => void;
  const older = { basic: { collection: true, version: '2026-10-27-event-v6' }, nextStep: 1, revision: 1, updatedAt: '2026-10-30T14:00:00Z' };
  const newer = { ...older, basic: { ...older.basic, nickname: '새작성' }, revision: 2, updatedAt: '2026-10-30T14:01:00Z' };
  const initial = { ...state, events: [{ id: 'event-one' }], basicDrafts: {} };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) {
      requestId = JSON.parse(String(init?.body)).requestId;
      return new Promise<Response>(resolve => { release = resolve; });
    }
    return response(++reads === 1 ? initial : { ...initial, basicDrafts: { 'event-one': newer } });
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.basic-draft', revision: 0, data: { eventId: 'event-one' } }); });
  await act(async () => { await result.current.load(); });
  await act(async () => { release(response({ saved: true, requestId, draft: older })); await write; });
  expect(reads).toBe(3);
  expect(result.current.state?.basicDrafts?.['event-one']).toEqual(newer);
});

it('advances a non-draft save only from the exact participant committed state response without another GET', async () => {
  const next = { ...fullState, applications: [{ ...fullApplication, revision: 3, stage: 4 }] };
  let command: Record<string, unknown> | undefined;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) { command = JSON.parse(String(init?.body)); return response({ saved: true, requestId: command!.requestId, stateScope: 'participant', state: next }); }
    return response(fullState);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'application.consent', target: 'kept', revision: 2 }); });
  expect(command?.includeState).toBe(true);
  expect(result.current.status).toBe('saved');
  expect(result.current.state?.applications[0].stage).toBe(4);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects participant state for an administrator controller and falls back to the authenticated admin read', async () => {
  localStorage.setItem('admin_token_v1', 'synthetic-admin');
  let reads = 0;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateScope: 'participant', state: { ...fullState, applications: [] } });
    expect(String(path)).toBe('/api/event-hub/admin');reads++;return response(fullState);
  });
  const { result } = renderHook(() => useEventHub(true));
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'admin.application.payment', target: 'kept', revision: 2 }); });
  expect(reads).toBe(2);expect(fetch).toHaveBeenCalledTimes(3);
  expect(result.current.state?.applications[0].id).toBe('kept');
});

it('accepts a matching administrator state only under the same administrator credential', async () => {
  localStorage.setItem('admin_token_v1', 'synthetic-admin');
  const adminState = { ...fullState, hasSession: undefined, events: fullState.events.map(event => ({ ...event, revision: 2 })) };
  const next = { ...adminState, applications: [{ ...fullApplication, revision: 3, payment: 'approved' }] };
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => String(path).endsWith('/mutate')
    ? response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateScope: 'admin', state: next }) : response(adminState));
  const { result } = renderHook(() => useEventHub(true));
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'admin.application.payment', target: 'kept', revision: 2 }); });
  expect(fetch).toHaveBeenCalledTimes(2);expect(result.current.status).toBe('saved');expect(result.current.state?.applications[0].payment).toBe('approved');
});

it('does not report success or advance when stateUnavailable is followed by failed fresh and receipt-state reads', async () => {
  let reads = 0, writes = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) { writes++;return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateUnavailable: true }); }
    if (String(path).includes('/receipt/')) return response({ saved: true });
    if (++reads > 1) throw Error('Fresh state temporarily unavailable');
    return response(fullState);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let saved: unknown;
  await act(async () => { saved = await result.current.mutate({ action: 'application.consent', target: 'kept', revision: 2 }); });
  expect(saved).toBeNull();expect(result.current.status).toBe('failed');
  expect(result.current.state?.applications[0].stage).toBe(3);expect(writes).toBe(1);
});

it('keeps a newer approval when an older mutation state reply arrives after an explicit refresh', async () => {
  let reads = 0, requestId = '', release!: (value: Response) => void;
  const approved = { ...fullState, applications: [{ ...fullApplication, revision: 4, payment: 'approved' }] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) { requestId = JSON.parse(String(init?.body)).requestId;return new Promise<Response>(resolve => { release = resolve; }); }
    return response(++reads === 1 ? fullState : approved);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.consent', target: 'kept', revision: 2 }); });
  await act(async () => { await result.current.load(); });
  await act(async () => { release(response({ saved: true, requestId, stateScope: 'participant', state: { ...fullState, applications: [{ ...fullApplication, revision: 3 }] } }));await write; });
  expect(reads).toBe(3);expect(result.current.state?.applications[0].payment).toBe('approved');expect(result.current.state?.applications[0].revision).toBe(4);
});

it('does not consume an approval invalidation arriving while the inline-state save is pending', async () => {
  let reads = 0;
  const approved = { ...fullState, applications: [{ ...fullApplication, revision: 4, payment: 'approved' }] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) { events.invalidate!();return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateScope: 'participant', state: { ...fullState, applications: [{ ...fullApplication, revision: 3 }] } }); }
    return response(++reads === 1 ? fullState : approved);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'application.consent', target: 'kept', revision: 2 }); });
  expect(result.current.status).toBe('saved');expect(reads).toBe(1);
  await waitFor(() => expect(result.current.state?.applications[0].payment).toBe('approved'));
  expect(reads).toBe(2);
});

it('keeps waiting for a fresh state when the inline response contains malformed application rows', async () => {
  let reads = 0, release!: (value: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateScope: 'participant', state: { ...fullState, applications: [null] } });
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(fullState);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.consent', target: 'kept', revision: 2 }); });
  await waitFor(() => expect(reads).toBe(2));expect(result.current.status).toBe('saving');
  await act(async () => { release(response(fullState));await write; });
  expect(result.current.status).toBe('saved');
});

it('confirms a disappearing known application with GET instead of clearing it from a partial chat reply', async () => {
  let reads = 0, release!: (value: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, stateScope: 'participant', state: { ...fullState, applications: [] } });
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(fullState);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'thread.send', data: { text: '합성 문의', collection: true } }); });
  await waitFor(() => expect(reads).toBe(2));
  expect(result.current.status).toBe('saving');expect(result.current.state?.applications[0].id).toBe('kept');
  await act(async () => { release(response(fullState));await write; });
  expect(result.current.status).toBe('saved');
});

it('requires a newly returned companion application in state before advancing', async () => {
  let reads = 0;
  const next = { ...fullState, applications: [...fullState.applications, { ...fullApplication, id: 'new-companion-self' }] };
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/mutate')) return response({ saved: true, requestId: JSON.parse(String(init?.body)).requestId, id: 'new-companion-self', stateScope: 'participant', state: fullState });
    return response(++reads === 1 ? fullState : next);
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(async () => { await result.current.mutate({ action: 'companion.submit', data: { eventId: 'event-one' } }); });
  expect(reads).toBe(2);expect(fetch).toHaveBeenCalledTimes(3);
  expect(result.current.state?.applications.some(app => app.id === 'new-companion-self')).toBe(true);
});
