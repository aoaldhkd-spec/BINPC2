import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUTUAL_HEART_TOAST } from '../lib/heart-toast';
import { SIGNAL_CARD_HEART_CTA, SIGNAL_CARD_PROFILE_CTA } from '../lib/signal-match';
import { MAX_GROUPS_PER_USER } from '../lib/group-rooms';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('product copy + notification invariants', () => {
  it('시그널 is recommendation; 하트 is the send action', () => {
    const signalTab = read('components/SignalTab.tsx');
    const heartToast = read('lib/heart-toast.ts');
    expect(signalTab).not.toContain('시그널 보내기');
    expect(signalTab).toContain('SIGNAL_CARD_HEART_CTA');
    expect(SIGNAL_CARD_HEART_CTA).toBe('하트 보내기');
    expect(SIGNAL_CARD_PROFILE_CTA).toBe('프로필 보기');
    expect(MUTUAL_HEART_TOAST).toContain('서로 하트');
    expect(MUTUAL_HEART_TOAST).not.toContain('서로 시그널');
    expect(heartToast).not.toContain('서로 시그널');
  });

  it('BottomNotification sits above ChatScreen', () => {
    const toast = read('components/BottomNotification.tsx');
    const chat = read('components/ChatScreen.tsx');
    expect(toast).toContain('z-[10050]');
    expect(chat).toContain('z-[9999]');
  });

  it('단톡 is quiet: no group-message modal popup', () => {
    const groupHook = read('hooks/useGroupChat.ts');
    const app = read('App.tsx');
    expect(groupHook).not.toMatch(/setBottomNotif\(\{\s*type:\s*'message'/);
    expect(groupHook).not.toMatch(/setActiveNotif/);
    expect(app).toContain('NotifModal');
    expect(app).toMatch(/n\.target === 'all'/);
  });

  it('처음으로 돌아가기 is a dim popup over mounted MainScreen', () => {
    const reset = read('components/ResetButton.tsx');
    const app = read('App.tsx');
    expect(reset).toContain("backgroundColor: 'rgba(0, 0, 0, 0.4)'");
    expect(reset).toContain('data-password-overlay="dim"');
    expect(reset).not.toContain("backgroundColor: '#000000'");
    expect(reset).not.toMatch(/className="[^"]*\bbg-black(?:\s|")/);
    expect(reset).not.toContain('backdrop-blur');
    expect(app).not.toMatch(/showResetPassword \?/);
    expect(app).toContain('{showResetPassword && (');
    expect(app).toContain('<MainScreen');
  });

  it('채팅 탭 진입만으로 미읽음 숫자를 지우지 않는다', () => {
    const main = read('components/MainScreen.tsx');
    expect(main).not.toMatch(/if \(mainTab === 'chats'\) onClearMsgCount/);
    expect(main).not.toMatch(/if \(t === 'chats'\) \{ onClearMsgCount/);
    expect(main).toContain('sumUnreadCounts(unreadChatCounts)');
    expect(main).toContain('sumUnreadCounts(unreadGroupCounts)');
    expect(main).toContain('unreadForChat');
  });

  it('단톡 catalog is year + decade + opt-in 2차, cap 4', () => {
    expect(MAX_GROUPS_PER_USER).toBe(4);
    const main = read('components/MainScreen.tsx');
    expect(main).not.toContain('관심사·나이 / 같은 해 방은 자동');
    expect(main).toContain('년생·나이대 방은 자동');
  });

  it('functions_locked covers signal/group/chat re-entry, kick, and live settings', () => {
    const lock = read('lib/functions-lock.ts');
    const main = read('components/MainScreen.tsx');
    const app = read('App.tsx');
    const dash = read('admin/DashboardTab.tsx');
    const signal = read('components/SignalTab.tsx');
    const detail = read('components/ProfileDetail.tsx');
    const db = readFileSync(join(root, '../../api-server/src/routes/db.ts'), 'utf8');
    expect(lock).toContain("'signal'");
    expect(lock).toContain("'chats'");
    expect(lock).toContain("'fortune'");
    expect(main).toContain('SOCIAL_LOCKED_TABS');
    expect(main).toContain('guardLockedAction');
    expect(app).toContain('openChatGuarded');
    expect(app).toContain('sendMessageGuarded');
    expect(app).toContain('sendImageGuarded');
    expect(app).toContain('sendGroupMessageGuarded');
    expect(app).toContain('joinGroupChatGuarded');
    expect(app).toContain('handleMainTabChange');
    expect(app).toContain('FUNCTIONS_LOCK_KICK_TOAST');
    expect(app).toContain("handleMainTabChange('chats')");
    expect(app).toContain("handleMainTabChange('signal')");
    expect(app).toContain('openChatGuarded(p)');
    expect(app).toContain('setContactShareTarget(null)');
    expect(app).toContain('settingsPoll');
    expect(app).toContain("table: 'app_settings'");
    expect(app).toContain('{showResetPassword && (');
    expect(dash).toContain('하트·채팅·시그널·단톡·운세 사용 불가');
    expect(signal).toContain('행사 중에는 시그널을 사용할 수 없어요');
    expect(detail).toContain('onViewFortune');
    expect(db).toContain('FUNCTIONS_LOCKED_INSERT_TABLES');
    expect(db).toContain("code: 'FUNCTIONS_LOCKED'");
    expect(db).toContain('broadcastAll({ type: \'change\', table: \'app_settings\'');
  });
});
