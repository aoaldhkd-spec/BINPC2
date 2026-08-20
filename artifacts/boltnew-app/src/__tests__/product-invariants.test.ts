import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUTUAL_HEART_TOAST } from '../lib/heart-toast';
import { SIGNAL_CARD_SIGNAL_CTA, SIGNAL_CARD_PROFILE_CTA, SIGNAL_SWIPE_LEFT_EXPLAIN, SIGNAL_SWIPE_RIGHT_EXPLAIN } from '../lib/signal-match';
import { MAX_GROUPS_PER_USER } from '../lib/group-rooms';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const HEART_BALANCE_BANNED = [
  'heart_balances',
  'myHeartCount',
  'heart_initial_count',
  'admin_reset_heart',
] as const;

describe('heart_balances recurrence guard (client)', () => {
  it('global heart pool symbols stay out of participant app sources', () => {
    const files = [
      'App.tsx',
      'components/MainScreen.tsx',
      'lib/db-auth-tables.ts',
      'hooks/useHearts.ts',
    ];
    for (const rel of files) {
      const src = read(rel);
      for (const token of HEART_BALANCE_BANNED) {
        expect(src, `${rel} must not contain ${token}`).not.toContain(token);
      }
    }
  });
});

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

  it('profile photo upload uses sessionToken via localdb (Netlify cookie gap)', () => {
    const main = read('components/MainScreen.tsx');
    const db = read('lib/localdb.ts');
    const routes = read('../../api-server/src/routes/db.ts');
    expect(main).toContain('uploadStorageDataUrl');
    expect(db).toContain('uploadStorageDataUrl');
    expect(db).toMatch(/storage-upload[\s\S]*sessionToken/);
    expect(routes).toMatch(/resolveAuthUserId\(req, body\)/);
  });

  it('chat image display uses withChatImageAuth (Netlify cookie gap for <img>)', () => {
    const db = read('lib/localdb.ts');
    const row = read('components/ChatMessageRow.tsx');
    const routes = read('../../api-server/src/routes/db.ts');
    expect(db).toContain('withChatImageAuth');
    expect(row).toContain('withChatImageAuth');
    expect(routes).toMatch(/req\.query\.sessionToken/);
    expect(routes).toMatch(/verifySessionToken\(qUserId,\s*qSessionToken\)/);
  });

  it('BottomNotification sits above ChatScreen', () => {
    const toast = read('components/BottomNotification.tsx');
    const chat = read('components/ChatScreen.tsx');
    expect(toast).toContain('z-[10050]');
    expect(chat).toContain('z-[9999]');
    // participant-tabbar already includes tab height + safe inset — no double 4.5rem stack
    expect(toast).toContain('var(--participant-tabbar');
    expect(toast).not.toMatch(/4\.5rem\+var\(--participant-tabbar/);
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

  it('user header gates: logo=reset, npc=admin, sulbun=no staff gate', () => {
    const reset = read('components/ResetButton.tsx');
    expect(reset).toContain('data-gate="logo-reset"');
    expect(reset).toContain('data-gate="npc-admin"');
    expect(reset).toContain('data-gate="sulbun-none"');
    expect(reset).toContain('openResetGate');
    expect(reset).toContain('openAdminGate');
    expect(reset).toContain('handleSulbunClick');
    expect(reset).toContain("FIXED_TITLE = '범일NPC는 30살!'");
    expect(reset).not.toMatch(/navigateToAppPath\('test'\)/);
  });



  it('entry logo goes to tester; main logo stays reset', () => {
    const entry = read('components/EntryGateScreen.tsx');
    const reset = read('components/ResetButton.tsx');
    expect(entry).toContain('data-gate="entry-logo-tester"');
    expect(entry).toContain("navigateToAppPath('test')");
    expect(reset).toContain('data-gate="logo-reset"');
    expect(reset).toContain('openResetGate');
    expect(reset).not.toMatch(/navigateToAppPath\('test'\)/);
  });

  it('숨은기능: 칭찬하트 없고 방문자·NPC나이', () => {
    const modal = read('components/TutorialModal.tsx');
    const hint = read('lib/host-age-easter-egg.ts');
    expect(modal).toContain("title: '방문자'");
    expect(modal).toContain("title: 'NPC 나이'");
    expect(modal).toContain('HOST_AGE_EASTER_EGG_HINT');
    expect(modal).not.toMatch(/title: '칭찬 하트'/);
    expect(hint).toContain('NPC 나이');
    expect(hint).toContain('술번개');
  });

  it('theme switcher only after profile-ready (not on entry)', () => {
    const theme = read('components/ThemeSwitcher.tsx');
    const app = read('App.tsx');
    expect(theme).toContain("dataset.appReady === '1'");
    expect(theme).toContain('if (!appReady) return null');
    expect(app).toContain("dataset.appReady = '1'");
  });

  it('채팅 탭 진입만으로 미읽음 숫자를 지우지 않는다', () => {
    const main = read('components/MainScreen.tsx');
    const chats = read('components/MainChatsTab.tsx');
    expect(main).not.toMatch(/if \(mainTab === 'chats'\) onClearMsgCount/);
    expect(main).not.toMatch(/if \(t === 'chats'\) \{ onClearMsgCount/);
    expect(main).toContain('sumUnreadCounts(unreadChatCounts)');
    expect(main).toContain('sumUnreadCounts(unreadGroupCounts)');
    expect(chats).toContain('unreadForChat');
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
    expect(read('components/MainChatsTab.tsx')).toContain('GroupRoomIcon');
    expect(read('lib/group-rooms.ts')).not.toContain('🪩');
    expect(read('components/GroupRoomIcon.tsx')).toContain('ClubNeonIcon');
  });

  it('단톡 catalog is year + decade + opt-in 2차, cap 4', () => {
    expect(MAX_GROUPS_PER_USER).toBe(4);
    const chats = read('components/MainChatsTab.tsx');
    expect(chats).not.toContain('관심사·나이 / 같은 해 방은 자동');
    expect(chats).toContain('년생·나이대 방은 자동');
  });

  it('functions_locked covers signal/group/chat re-entry, kick, and live settings', () => {
    const lock = read('lib/functions-lock.ts');
    const main = read('components/MainScreen.tsx');
    const app = read('App.tsx');
    const chatHook = read('hooks/useChat.ts');
    const dash = read('admin/DashboardTab.tsx');
    const signal = read('components/SignalTab.tsx');
    const detail = read('components/ProfileDetail.tsx');
    const db = readFileSync(join(root, '../../api-server/src/routes/db.ts'), 'utf8');
    expect(lock).toContain('FUNCTIONS_UNLOCK_TOAST');
    expect(lock).toContain('isFunctionsLockedOpError');
    expect(lock).toContain("'signal'");
    expect(lock).toContain("'chats'");
    expect(lock).toContain("'fortune'");
    expect(lock).not.toContain("'stats'");
    expect(lock).not.toContain("'ranking'");
    expect(main).toContain('SOCIAL_LOCKED_TABS');
    expect(main).toContain('guardLockedAction');
    expect(app).toContain('FUNCTIONS_UNLOCK_TOAST');
    expect(app).toContain('functionsLockedPrevRef');
    expect(app).toContain("useChat({ currentUserId, profilesRef, setSelectedProfile, setView, setBottomNotif, functionsLocked");
    expect(chatHook).toMatch(/functionsLocked[\s\S]*flushPendingQueue/);
    expect(chatHook).toContain('isFunctionsLockedOpError');
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

  it('ProfileCard keeps compact heart/chat buttons (no min-h-11 bloat)', () => {
    const card = read('components/ProfileCard.tsx');
    expect(card).not.toMatch(/min-h-11/);
    expect(card).not.toMatch(/\bw-8 h-8\b/);
    expect(card).toMatch(/w-5 h-5/);
    expect(card).toMatch(/py-0\.5/);
  });

  it('ProfileCard pauses offscreen ticker and MainScreen uses signal Map lookup', () => {
    const card = read('components/ProfileCard.tsx');
    expect(card).toContain('IntersectionObserver');
    expect(card).toContain('tickerAnimActive');
    expect(card).toContain('contentVisibility');
    const main = read('components/MainScreen.tsx');
    expect(main).toContain('signalByUserId');
    expect(main).toContain('deckProfiles');
    expect(main).not.toMatch(/userSignals\.find\(s => s\.user_id === profile\.id\)/);
  });

  it('dark theme profile cards use non-white surfaces via isProfileCardDark', () => {
    const theme = read('lib/theme.tsx');
    const card = read('components/ProfileCard.tsx');
    const surfaces = read('lib/profile-card-theme.ts');
    const main = read('components/MainScreen.tsx');
    expect(theme).toContain('export function isDarkTheme');
    expect(theme).toMatch(/theme === 'default' \|\| theme === 'dark-neon'/);
    expect(surfaces).toContain('export function isProfileCardDark');
    expect(surfaces).toContain('isDarkTheme(theme) || darkMode');
    expect(surfaces).not.toContain("theme === 'default') return false");
    expect(card).toContain('isProfileCardDark(theme, darkMode)');
    expect(card).toContain('profileCardSurfaces(theme, darkMode)');
    expect(card).toContain('darkMode = false');
    expect(main).toContain('darkMode={darkMode}');
    expect(card).not.toMatch(/className="group relative flex flex-col min-w-0 max-w-full bg-white/);
    expect(surfaces).toContain('bg-slate-900');
    expect(surfaces).toMatch(/rgba\(15,\s*23,\s*42/);
  });

  it('App must not re-add SignalNudgeBanner heart nudge overlay', () => {
    const app = read('App.tsx');
    expect(app).not.toContain('SignalNudgeBanner');
  });

  it('signal_sends push notification uses 📡 not 💕 (distinct from hearts)', () => {
    const db = readFileSync(join(root, '../../api-server/src/routes/db.ts'), 'utf8');
    const idx = db.indexOf("table === 'signal_sends'");
    expect(idx).toBeGreaterThan(0);
    const block = db.slice(idx, idx + 400);
    expect(block).toContain('📡');
    expect(block).not.toContain('💕');
    const bottom = read('components/BottomNotification.tsx');
    expect(bottom).toContain('SIGNAL_EMOJI');
  });

  it('realtime E2E script uses Render for SSE not Netlify proxy', () => {
    const script = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/test-realtime-two-user.mjs'),
      'utf8',
    );
    expect(script).toMatch(/SSE_ORIGIN|SSE_API/);
    expect(script).toMatch(/`\$\{SSE_API\}\/events/);
    expect(script).not.toMatch(/\$\{API\}\/events/);
    expect(script).toContain('binpc2.onrender.com');
  });

  it('endurance soak guards SSE idle drop and mid-run FUNCTIONS_LOCKED SKIP', () => {
    const endurance = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/endurance-5h.mjs'),
      'utf8',
    );
    const lock = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/lib/functions-lock.mjs'),
      'utf8',
    );
    expect(endurance).toMatch(/ensureConnected/);
    expect(endurance).toMatch(/isOpFunctionsLocked|FUNCTIONS_LOCKED mid-run/);
    expect(endurance).toMatch(/result\.locked|locked: true/);
    expect(endurance).toMatch(/recoverContext|isRecoverableOpFailure/);
    expect(endurance).toMatch(/admin_event_end_reset/);
    expect(endurance).toMatch(/acquireEnduranceLock/);
    expect(endurance).toMatch(/ENDURANCE_DEADLINE_AT|deadlineAt/);
    expect(endurance).toMatch(/429|Rate limit/i);
    expect(lock).toContain('isOpFunctionsLocked');
    const watchdog = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/endurance-watchdog.mjs'),
      'utf8',
    );
    expect(watchdog).toMatch(/spawnEndurance|ENDURANCE_DEADLINE_AT/);
  });

  it('status signal/contact pills open center popup modal not bottom sheet', () => {
    const main = read('components/MainScreen.tsx');
    expect(main).toContain('status-quick-modal-title');
    expect(main).toMatch(/safe-overlay fixed inset-0[\s\S]*items-center justify-center/);
    expect(main).not.toMatch(/statusQuickSheet[\s\S]{0,400}items-end/);
  });

  it('Supabase public tables RLS enabled on API startup', () => {
    const db = readFileSync(join(root, '../../api-server/src/routes/db.ts'), 'utf8');
    expect(db).toContain('ensurePublicTableRls');
    expect(db).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(db).toMatch(/REVOKE ALL ON public/);
  });

  it('mobile safe-area: Galaxy tabbar + iOS 16px input + viewport-fit=cover', () => {
    const html = readFileSync(join(root, '../index.html'), 'utf8');
    const css = read('index.css');
    const main = read('components/MainScreen.tsx');
    expect(html).toContain('viewport-fit=cover');
    expect(css).toMatch(/font-size:\s*max\(16px/);
    expect(css).toContain('--tabbar-safe-bottom');
    expect(css).toContain('.participant-tabbar');
    expect(main).toContain('--participant-tabbar');
    expect(main).toContain('--tabbar-safe-bottom');
  });

  it('HEIC upload rejected with user-facing message', () => {
    const photo = read('lib/profile-photo.ts');
    expect(photo).toMatch(/HEIC|heic/);
    expect(photo).toContain('JPG, PNG, WebP');
  });

  it('profile-card-grid density modes stay wired and tested', () => {
    const grid = read('lib/profile-card-grid.ts');
    const gridTest = read('lib/profile-card-grid.test.ts');
    const main = read('components/MainScreen.tsx');
    expect(grid).toContain("'compact'");
    expect(grid).toContain("'2'");
    expect(grid).toContain("'3'");
    expect(gridTest).toContain('grid-cols-2');
    expect(gridTest).toContain('grid-cols-3');
    expect(main).toContain('readProfileCardGridMode');
    expect(main).toContain('profileGridClassName');
  });

  it('verify scripts treat admin password mismatch and FUNCTIONS_LOCKED as SKIP', () => {
    const verify = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/verify-all-features.mjs'),
      'utf8',
    );
    expect(verify).toContain('SKIP (local password mismatch');
    expect(verify).toContain('SKIP (FUNCTIONS_LOCKED)');
  });

  it('localdb uses optional VITE_SSE_ORIGIN for Render-direct SSE', () => {
    const db = read('lib/localdb.ts');
    expect(db).toContain('VITE_SSE_ORIGIN');
    expect(db).toMatch(/SSE_ORIGIN[\s\S]*events/);
  });

  it('participant system Back uses History API and does not wrap AdminApp', () => {
    const app = read('App.tsx');
    const mainEntry = read('main.tsx');
    const nav = read('lib/participant-nav-history.ts');
    expect(app).toContain('createParticipantNav');
    expect(app).toContain('goParticipantBack');
    expect(app).toContain('screen:profile');
    expect(app).toContain('ParticipantNavProvider');
    expect(nav).toContain('trapped-root');
    expect(nav).toContain('handlePopState');
    expect(mainEntry).not.toContain('createParticipantNav');
    expect(mainEntry).toContain('AdminApp');
  });

  it('프로필·채팅 화면 넘김은 메인 언마운트 없이 CSS transform 이다', () => {
    const app = read('App.tsx');
    const css = read('index.css');
    const main = read('components/MainScreen.tsx');
    expect(css).toContain('binpc-screen-in');
    expect(css).toContain('translate3d(100%, 0, 0)');
    expect(app).toContain('binpc-screen-in');
    expect(app).toContain('inert={isSubScreen');
    expect(app).toContain("className={isSubScreen ? 'pointer-events-none' : undefined}");
    expect(main).toContain('KeepTab');
    expect(main).toContain("visitedTabsRef.current.has('signal')");
    expect(main).toContain("visitedTabsRef.current.has('chats')");
  });
});

describe('Korean age recurrence guard', () => {
  it('나이 계산은 korean-age 모듈 한 곳(+1)을 쓰고 만 나이(연도 차만) 중복이 없다', () => {
    const ageLib = read('lib/korean-age.ts');
    const profile = read('lib/profile.ts');
    const groupRooms = read('lib/group-rooms.ts');
    const stats = read('lib/stats-ranking.ts');
    const db = readFileSync(join(root, '../../api-server/src/routes/db.ts'), 'utf8');
    const serverAge = readFileSync(join(root, '../../api-server/src/lib/korean-age.ts'), 'utf8');

    expect(ageLib).toMatch(/\+\s*1/);
    expect(ageLib).toContain('koreanAgeFromBirthYear');
    expect(profile).toContain("from './korean-age'");
    expect(groupRooms).toContain("from './korean-age'");
    expect(stats).toContain("from './korean-age'");
    expect(db).toContain('groupAgeDecadeBand');
    expect(serverAge).toMatch(/\+\s*1/);

    for (const [rel, src] of [
      ['lib/profile.ts', profile],
      ['lib/group-rooms.ts', groupRooms],
      ['lib/stats-ranking.ts', stats],
      ['api-server db.ts', db],
    ] as const) {
      expect(src, `${rel} must not inline intl age (year diff without +1)`).not.toMatch(
        /getFullYear\(\)\s*-\s*\w+\s*;(?![\s\S]{0,40}\+\s*1)/,
      );
    }
  });
});

describe('participant profile list order invariants', () => {
  it('deck filter uses stable sort; App merges profiles instead of blind prepend/replace', () => {
    const deck = read('lib/profile-deck-filter.ts');
    const order = read('lib/profile-list-order.ts');
    const app = read('App.tsx');
    expect(deck).toContain('sortProfilesStable');
    expect(order).toContain('mergeProfilesPreserveOrder');
    expect(order).toContain('patchProfileInPlace');
    expect(order).toContain('created_at');
    expect(app).toContain('mergeProfilesPreserveOrder');
    expect(app).toContain('patchProfileInPlace');
    expect(app).not.toMatch(/return \[incoming, \.\.\.prev\]/);
    expect(app).toContain('mergeProfilesPreserveOrder(prev, visible)');
  });
});
