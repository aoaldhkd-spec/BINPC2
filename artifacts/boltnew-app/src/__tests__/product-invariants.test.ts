import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUTUAL_HEART_TOAST } from '../lib/heart-toast';
import { SIGNAL_CARD_SIGNAL_CTA, SIGNAL_CARD_PROFILE_CTA, SIGNAL_SWIPE_LEFT_EXPLAIN, SIGNAL_SWIPE_RIGHT_EXPLAIN } from '../lib/signal-match';
import { MAX_GROUPS_PER_USER } from '../lib/group-rooms';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('product copy + notification invariants', () => {
  it('시그널 deck CTA is 시그널 보내기; swipe left/right is explained', () => {
    const signalTab = read('components/SignalTab.tsx');
    const heartToast = read('lib/heart-toast.ts');
    expect(signalTab).toContain('SIGNAL_CARD_SIGNAL_CTA');
    expect(signalTab).toContain('onSendSignal');
    expect(signalTab).not.toContain('onLike');
    expect(SIGNAL_CARD_SIGNAL_CTA).toBe('시그널 보내기');
    expect(SIGNAL_CARD_PROFILE_CTA).toBe('프로필 보기');
    expect(SIGNAL_SWIPE_LEFT_EXPLAIN).toContain('패스');
    expect(SIGNAL_SWIPE_RIGHT_EXPLAIN).toContain('시그널');
    expect(MUTUAL_HEART_TOAST).toContain('서로 하트');
    expect(MUTUAL_HEART_TOAST).not.toContain('서로 시그널');
    expect(heartToast).not.toContain('서로 시그널');
  });

  it('튜토리얼과 시그널 설명서에 왼쪽 패스 / 오른쪽 시그널이 있다', () => {
    const modal = read('components/TutorialModal.tsx');
    const video = read('components/TutorialVideo.tsx');
    const guide = read('lib/signal-match.ts');
    expect(modal).toContain('왼쪽 = 패스');
    expect(modal).toContain('오른쪽 = 시그널');
    expect(video).toContain('왼쪽 = 패스(별로)');
    expect(video).toContain('오른쪽 = 시그널 보내기');
    expect(guide).toContain('왼쪽 = 패스(별로)');
    expect(guide).toContain('오른쪽 = 시그널 보내기');
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

  it('닉네임 설정 1단계 이전하기는 대기 랜딩으로 돌아가고 회식 중 설정 갱신에 덮이지 않는다', () => {
    const nick = read('components/NicknameSetupScreen.tsx');
    const app = read('App.tsx');
    const gate = read('lib/entry-gate.ts');
    expect(nick).toContain("step === 1 ? '이전하기' : '이전'");
    expect(nick).toContain('else onReset()');
    expect(app).toContain('onReset={reset}');
    expect(app).toContain('shouldAutoSkipWaiting');
    expect(app).toContain('shownWaiting,');
    expect(gate).toContain('opts.shownWaiting === false');
    expect(gate).toContain('wasSessionActive === false');
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

  it('단톡 입장 즉시 열고 나가기·키보드·읽음 숫자가 연결된다', () => {
    const app = read('App.tsx');
    const group = read('components/GroupChatScreen.tsx');
    const hook = read('hooks/useGroupChat.ts');
    expect(app).toContain('leaveGroupChatGuarded');
    expect(app).toContain('onLeaveGroupChat');
    expect(app).toContain("setView('group-chat')");
    expect(app).toMatch(/void openGroupChat\(groupId\);\s*setView\('group-chat'\)/);
    expect(group).toContain('visualViewport');
    expect(group).toContain('unreadMemberCount');
    expect(group).toContain('functionsLocked');
    expect(group).toContain('disabled={composerLocked}');
    expect(hook).toContain('markGroupRead');
    expect(hook).toContain('last_read_at');
    expect(hook).toContain('siblingGroupIds');
    expect(hook).toContain('joined: false');
    expect(hook).toContain('recentlyLeftRef');
    expect(app).toMatch(/closeGroupChat\(\);\s*setView\('main'\)/);
    expect(group).toContain('GroupRoomIcon');
    expect(read('components/MainScreen.tsx')).toContain('GroupRoomIcon');
    expect(read('lib/group-rooms.ts')).not.toContain('🪩');
    expect(read('components/GroupRoomIcon.tsx')).toContain('ClubNeonIcon');
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
    expect(lock).not.toContain("'stats'");
    expect(lock).not.toContain("'ranking'");
    expect(main).toContain('SOCIAL_LOCKED_TABS');
    expect(main).toContain('guardLockedAction');
    expect(app).toContain('openChatGuarded');
    expect(app).toContain('sendMessageGuarded');
    expect(app).toContain('sendImageGuarded');
    expect(app).toContain('sendGroupMessageGuarded');
    expect(app).toContain('joinGroupChatGuarded');
    expect(app).toContain('leaveGroupChatGuarded');
    expect(app).toContain('onLeaveGroupChat');
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
    expect(dash).toContain('통계·랭킹은 그대로');
    expect(signal).toContain('행사 중에는 시그널을 사용할 수 없어요');
    expect(detail).toContain('onViewFortune');
    expect(db).toContain('FUNCTIONS_LOCKED_INSERT_TABLES');
    expect(db).toContain("code: 'FUNCTIONS_LOCKED'");
    expect(db).toContain('broadcastAll({ type: \'change\', table: \'app_settings\'');
  });
});
