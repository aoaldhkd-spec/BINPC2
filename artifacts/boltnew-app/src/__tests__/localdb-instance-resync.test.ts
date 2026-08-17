import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown, lastEventId = '') {
    this.onmessage?.({ data: JSON.stringify(data), lastEventId } as MessageEvent<string>);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

describe('[Realtime] server instance handshake', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps same-instance behavior and immediately resyncs on an instance switch', async () => {
    const { onSseReconnect, supabase } = await import('../lib/localdb');
    const resync = vi.fn();
    const removeReconnect = onSseReconnect(resync);
    const channel = supabase.channel('instance-test').subscribe();
    const source = FakeEventSource.instances.at(-1)!;
    expect(source).toBeTruthy();

    source.emit({ type: 'instance', instanceId: 'instance-a' });
    expect(resync).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sse_server_instance_v1')).toBe('instance-a');

    source.emit({ type: 'instance', instanceId: 'instance-a' });
    expect(resync).not.toHaveBeenCalled();

    source.emit({ type: 'instance', instanceId: 'instance-b' });
    expect(resync).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('sse_server_instance_v1')).toBe('instance-b');

    channel.unsubscribe();
    removeReconnect();
  }, 30_000);

  it('detects a different instance remembered earlier in the same session', async () => {
    sessionStorage.setItem('sse_server_instance_v1', 'instance-old');
    const { onSseReconnect, supabase } = await import('../lib/localdb');
    const resync = vi.fn();
    onSseReconnect(resync);
    const channel = supabase.channel('restored-instance-test').subscribe();

    FakeEventSource.instances.at(-1)!.emit({ type: 'instance', instanceId: 'instance-new' });
    expect(resync).toHaveBeenCalledTimes(1);

    channel.unsubscribe();
  }, 30_000);
});
