import { describe, expect, it } from 'vitest';
import { createParticipantNav, isParticipantAppPath } from './participant-nav-history';

function memoryHistory() {
  const stack: unknown[] = [{}];
  let i = 0;
  const h = {
    get state() { return stack[i]; },
    pushState(data: unknown) {
      stack.splice(i + 1);
      stack.push(data);
      i = stack.length - 1;
    },
    replaceState(data: unknown) { stack[i] = data; },
    back() { if (i > 0) i -= 1; },
    go(delta: number) { i = Math.max(0, Math.min(stack.length - 1, i + delta)); },
    get index() { return i; },
    get length() { return stack.length; },
  };
  return h;
}

describe('isParticipantAppPath', () => {
  it('treats home as participant and admin/test as not', () => {
    expect(isParticipantAppPath('/')).toBe(true);
    expect(isParticipantAppPath('/admin')).toBe(false);
    expect(isParticipantAppPath('/admin/settings')).toBe(false);
    expect(isParticipantAppPath('/test')).toBe(false);
    expect(isParticipantAppPath('/binpc2/', '/binpc2')).toBe(true);
    expect(isParticipantAppPath('/binpc2/admin', '/binpc2')).toBe(false);
  });
});

describe('createParticipantNav', () => {
  it('traps Back at root so the first press does not leave', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/' });
    nav.install();
    const afterInstall = history.length;
    expect(nav.handlePopState()).toBe('trapped-root');
    expect(history.length).toBe(afterInstall + 1);
    expect(nav.depth()).toBe(0);
  });

  it('does not trap on admin paths', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/admin' });
    nav.install();
    const len = history.length;
    expect(nav.handlePopState()).toBe('ignored');
    expect(history.length).toBe(len);
  });

  it('closes nested profile then chat in order', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/' });
    nav.install();
    const closed: string[] = [];
    nav.push('screen:profile', () => closed.push('profile'));
    nav.push('screen:chat', () => closed.push('chat'));
    expect(nav.layers()).toEqual(['screen:profile', 'screen:chat']);

    history.back();
    expect(nav.handlePopState()).toBe('closed-layer');
    expect(closed).toEqual(['chat']);
    expect(nav.topId()).toBe('screen:profile');

    history.back();
    expect(nav.handlePopState()).toBe('closed-layer');
    expect(closed).toEqual(['chat', 'profile']);
    expect(nav.depth()).toBe(0);
  });

  it('push of an existing id updates close and does not add a history entry', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/' });
    nav.install();
    const len = history.length;
    let n = 0;
    nav.push('tutorial', () => { n = 1; });
    nav.push('tutorial', () => { n = 2; });
    expect(history.length).toBe(len + 1);
    history.back();
    nav.handlePopState();
    expect(n).toBe(2);
  });

  it('replaceTop swaps the open overlay without a new history entry', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/' });
    nav.install();
    const closed: string[] = [];
    nav.push('my-menu', () => closed.push('menu'));
    const len = history.length;
    nav.replaceTop('tab:away', () => closed.push('tab'));
    expect(history.length).toBe(len);
    expect(nav.topId()).toBe('tab:away');
    history.back();
    nav.handlePopState();
    expect(closed).toEqual(['tab']);
  });

  it('notifyClosed on the top layer does not run close()', () => {
    const history = memoryHistory();
    const nav = createParticipantNav({ history, getPathname: () => '/' });
    nav.install();
    let closed = false;
    nav.push('qr', () => { closed = true; });
    nav.notifyClosed('qr');
    expect(closed).toBe(false);
    expect(nav.depth()).toBe(0);
  });
});
