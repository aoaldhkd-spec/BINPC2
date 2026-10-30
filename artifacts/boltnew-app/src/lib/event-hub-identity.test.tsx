// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { hubFetch, recoverHub, rememberRecoveryCode, savedRecoveryCode, useEventHub } from './event-hub-client';
import EventHubPage from '../event-hub/EventHubPage';
import { EventLaboratoryStore } from '../event-hub/event-laboratory-store';
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
  onSseReconnect: () => () => {}, isSseHealthy: () => true,
}));
vi.mock('./webPush', () => ({ currentPushStatus: () => ({ code: 'unsupported' }), requestPushPermissionFromClick: vi.fn() }));
const aCode = 'a'.repeat(43), bCode = 'b'.repeat(43);
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const application = (id: string, revision = 2) => ({ id, eventId: 'same-event', revision, stage: 3, payment: 'reported', basic: { nickname: id, birthYear: 1995, location: '합성' }, profile: { lastStep: 1 }, cards: [], history: [] });
const state = (owner: string) => ({ enabled: true, hasSession: true, serverNow: '2026-10-30T14:00:00Z', events: [{ id: 'same-event', title: '합성 행사', date: '2026-10-30', start: '22:30', end: '01:00' }], applications: [application(owner)], threads: [], stocks: [], member: null });
beforeEach(() => { rememberRecoveryCode(aCode); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); rememberRecoveryCode(''); });

it('keeps the current private state and numeric UI scope after ordinary network failure or rejected login', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(state('owner-a')));
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-a'));
  const scope = result.current.identityRevision;
  fetch.mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => { await expect(result.current.load()).rejects.toThrow('offline'); });
  fetch.mockResolvedValueOnce(response({ error: 'wrong password', code: 'MEMBER_AUTH' }, 401));
  await act(async () => { await expect(hubFetch('/member-login', { nickname: '합성', password: 'wrong' })).rejects.toMatchObject({ status: 401 }); });
  expect(result.current.identityRevision).toBe(scope);
  expect(result.current.state?.applications[0].id).toBe('owner-a');
  expect(savedRecoveryCode()).toBe(aCode);
});

it('does not accept an unknown credential response or clear the existing onsite identity', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(state('owner-a')));
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  const scope = result.current.identityRevision;
  localStorage.setItem('matching_app_user_id', 'existing-onsite');
  fetch.mockResolvedValueOnce(response({ state: state('owner-b') }));
  await act(async () => { await expect(recoverHub(bCode)).rejects.toMatchObject({ code: 'SESSION_UNCONFIRMED' }); });
  expect(result.current.identityRevision).toBe(scope);
  expect(result.current.state?.applications[0].id).toBe('owner-a');
  expect(localStorage.getItem('matching_app_user_id')).toBe('existing-onsite');
  fetch.mockResolvedValueOnce(response({ ok: true }));
  await act(async () => { await expect(hubFetch('/member-login', { nickname: '합성', password: 'synthetic' })).rejects.toMatchObject({ code: 'SESSION_UNCONFIRMED' }); });
  expect(result.current.identityRevision).toBe(scope);
  expect(savedRecoveryCode()).toBe(aCode);
});

it('ignores an old in-flight state read after confirmed recovery and performs no new owner creation', async () => {
  let reads = 0, release!: (value: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/session')) { expect(JSON.parse(String(init?.body))).toEqual({ recoveryCode: bCode, create: false }); return response({ ok: true }); }
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return response(state(reads === 1 ? 'owner-a' : 'owner-b'));
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  const scope = result.current.identityRevision;
  let oldRead!: Promise<unknown>;
  act(() => { oldRead = result.current.load(); });
  await act(async () => { await recoverHub(bCode); });
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-b'));
  expect(result.current.identityRevision).toBeGreaterThan(scope);
  await act(async () => { release(response(state('owner-a'))); await oldRead; });
  expect(result.current.state?.applications[0].id).toBe('owner-b');
  expect(fetch.mock.calls.filter(([path]) => String(path).endsWith('/session'))).toHaveLength(1);
});

it('cannot complete an old save or clear the newer owner save lock after switching credentials', async () => {
  let owner = 'owner-a';
  const pending: { body: Record<string, unknown>; release: (value: Response) => void }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
    if (String(path).endsWith('/session')) { owner = 'owner-b'; return response({ ok: true }); }
    if (String(path).endsWith('/mutate')) return new Promise<Response>(release => pending.push({ body: JSON.parse(String(init?.body)), release }));
    return response(state(owner));
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let oldWrite!: Promise<unknown>, newWrite!: Promise<unknown>;
  act(() => { oldWrite = result.current.mutate({ action: 'application.report', target: 'owner-a', revision: 2 }); });
  await act(async () => { await recoverHub(bCode); });
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-b'));
  act(() => { newWrite = result.current.mutate({ action: 'application.report', target: 'owner-b', revision: 2 }); });
  await act(async () => { pending[0].release(response({ saved: true, requestId: pending[0].body.requestId, stateScope: 'participant', state: state('owner-a') })); expect(await oldWrite).toBeNull(); });
  expect(result.current.status).toBe('saving');
  expect(result.current.error).toBe('');
  expect(result.current.state?.applications[0].id).toBe('owner-b');
  expect(await result.current.mutate({ action: 'application.report', target: 'owner-b', revision: 2 })).toBeNull();
  expect(pending).toHaveLength(2);
  await act(async () => { pending[1].release(response({ saved: true, requestId: pending[1].body.requestId, stateScope: 'participant', state: { ...state('owner-b'), applications: [application('owner-b', 3)] } })); await newWrite; });
  expect(result.current.status).toBe('saved');
});

it('cannot turn a late previous-owner receipt into a successful save for the new owner', async () => {
  let owner = 'owner-a', release!: (value: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) { owner = 'owner-b'; return response({ ok: true }); }
    if (String(path).endsWith('/mutate')) throw new TypeError('lost response');
    if (String(path).includes('/receipt/')) return new Promise<Response>(resolve => { release = resolve; });
    return response(state(owner));
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state).toBeTruthy());
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutate({ action: 'application.report', target: 'owner-a', revision: 2 }); });
  await waitFor(() => expect(release).toBeTypeOf('function'));
  await act(async () => { await recoverHub(bCode); });
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-b'));
  await act(async () => { release(response({ saved: true, id: 'owner-a' })); expect(await write).toBeNull(); });
  expect(result.current.status).toBe('');
  expect(result.current.state?.applications[0].id).toBe('owner-b');
});

it('rejects a delayed credential acknowledgement after a newer credential change completed', async () => {
  let release!: (value: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => String(path).endsWith('/member-login')
    ? new Promise<Response>(resolve => { release = resolve; }) : response({ ok: true }));
  const oldLogin = hubFetch('/member-login', { nickname: '합성', password: 'synthetic' });
  await recoverHub(bCode);
  release(response({ ok: true, recoveryCode: aCode }));
  await expect(oldLogin).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  expect(savedRecoveryCode()).toBe(bCode);
});

it('remounts the actual same-event form after confirmed owner change even when React batches the new state', async () => {
  const initial = new EventLaboratoryStore().state();
  const event = initial.events[0];
  event.recruitment = true;
  initial.hasSession = true; initial.bossParticipationAllowed = true; initial.applications = []; initial.member = null;
  initial.basicDrafts = { [event.id]: { revision: 1, nextStep: 1, updatedAt: '2026-10-30T14:00:00Z', basic: { nickname: '이전저장', collection: true, version: '2026-10-27-event-v6' } } };
  const next = structuredClone(initial);
  next.basicDrafts![event.id].basic.nickname = '새로운본인';
  let current = initial;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) { current = next; return response({ ok: true }); }
    return response(current);
  });
  render(<EventHubPage path={`/events/e/${event.id}`} />);
  fireEvent.click(await screen.findByRole('button', { name: '신청하기' }));
  if (screen.queryByRole('dialog', { name: '누구와 신청하시나요?' })) fireEvent.click(screen.getByRole('button', { name: '혼자 신청' }));
  const nickname = await screen.findByLabelText('닉네임');
  fireEvent.change(nickname, { target: { value: '이전미저장' } });
  await act(async () => { await recoverHub(bCode); });
  await waitFor(() => expect(screen.queryByDisplayValue('이전미저장')).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: '신청하기' }));
  if (screen.queryByRole('dialog', { name: '누구와 신청하시나요?' })) fireEvent.click(screen.getByRole('button', { name: '혼자 신청' }));
  expect((await screen.findByLabelText('닉네임') as HTMLInputElement).value).toBe('새로운본인');
  expect(document.body.textContent).not.toContain(aCode);
  expect(document.body.textContent).not.toContain(bCode);
});

it('changes the opaque scope after valid recovery even when browser identity storage throws', async () => {
  let owner = 'owner-a';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (String(path).endsWith('/session')) { owner = 'owner-b'; return response({ ok: true }); }
    return response(state(owner));
  });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-a'));
  const scope = result.current.identityRevision;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  await act(async () => { await recoverHub(bCode); });
  await waitFor(() => expect(result.current.state?.applications[0].id).toBe('owner-b'));
  expect(result.current.identityRevision).toBeGreaterThan(scope);
  expect(savedRecoveryCode()).toBe(bCode);
});
