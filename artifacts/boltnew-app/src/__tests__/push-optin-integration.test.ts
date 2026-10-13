import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('BINPC2 PWA opt-in and recipient-only push guards', () => {
  it('only opt-in grants OS permission on a direct user gesture', () => {
    const setup = read('components/NicknameSetupScreen.tsx');
    const pref = read('lib/webPush.ts');
    const ui = read('components/PushNotificationSettings.tsx');
    expect(setup).toContain('[선택]');
    expect(setup).toContain('requestPushPermissionFromClick');
    expect(ui).toContain('enablePushFromClick(userId)');
    expect(pref).toContain('Notification.requestPermission()');
    expect(pref).toContain('if (!getPushOptIn(userId))');
  });

  it('push subscription success waits for server 200 and error is visible', () => {
    const push = read('lib/webPush.ts');
    const panel = read('components/PushNotificationSettings.tsx');
    expect(push).toContain("fetch('/api/db/push/subscribe'");
    expect(push).toContain('if (!response.ok)');
    expect(panel).toContain('status.message');
    expect(push).toContain("fetch('/api/db/push/unsubscribe'");
    expect(push).toContain("fetch('/api/db/push/self-test'");
    expect(panel).toContain('sendSelfPushTest(userId)');
    const routes = read('../../api-server/src/routes/db.ts');
    const selfTest = routes.split("router.post('/push/self-test',")[1]?.split("// ─── Push notify endpoint")[0] ?? '';
    expect(selfTest).toContain('verifySseToken(userId, token)');
    expect(selfTest).toContain('s.user_id === userId && s.endpoint === endpoint');
    expect(selfTest).not.toContain("dbPersistRow('likes'");
    expect(selfTest).not.toContain("dbPersistRow('messages'");
  });

  it('in-app direct chat toast carries peer id and opens the exact conversation', () => {
    expect(read('hooks/useChat.ts')).toContain('profileId: newMsg.sender_id');
    const overlay = read('components/AppOverlays.tsx');
    expect(overlay).toContain('openChatGuarded(sender)');
    expect(overlay).toContain(".eq('id', senderId).maybeSingle()");
    expect(read('App.tsx')).toContain("params.get('peer')");
    expect(read('../public/sw.js').includes('notificationclick')).toBe(true);
  });
});
