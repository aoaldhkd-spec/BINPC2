import { memo } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import type { Chat, GroupChat, Profile } from '../types/app';
import { groupRoomVisual, MAX_GROUPS_PER_USER, sumUnreadCounts, unreadForGroup } from '../lib/group-rooms';
import { GroupRoomIcon } from './GroupRoomIcon';
import { unreadForChat } from '../lib/chat-unread';
import { genAvatar, getAvatarSrc, isSwipeGestureVerifyProfile } from '../lib/profile';
import { profileMatchesSearch } from '../lib/profile-search-match';
import { FUNCTIONS_LOCK_TOAST } from '../lib/functions-lock';
import { RefreshBtn } from './RefreshBtn';

/**
 * 메인 화면 "채팅" 탭 본문 (1:1 / 단체 서브탭).
 * 상태·실시간 구독은 전부 MainScreen에 남아 있고 이 컴포넌트는 표시 전용이다.
 */
export const MainChatsTab = memo(function MainChatsTab({
  darkMode,
  isActive = true,
  chatSubTab, onChangeSubTab,
  unreadChatCounts, unreadGroupCounts,
  groupChats, joiningGroupId,
  leavingGroupId, onSetLeavingGroupId,
  leaveGroupTarget, onSetLeaveGroupTarget,
  onOpenGroupChat, onJoinGroupChat, onLeaveGroupChat,
  guardLockedAction, functionsLocked, showChatSearchLockToast, chatSearchLockToast,
  chatSearch, onChangeChatSearch,
  profiles, currentUserId, profileMap, chatList,
  onOpenChat, onDeleteChat, onDeleteAllChats,
  onRefreshChats, chatsRefreshed,
}: {
  darkMode: boolean;
  /** false when tab hidden — skip chat list DOM while keeping mount for KeepTab */
  isActive?: boolean;
  chatSubTab: 'direct' | 'group';
  onChangeSubTab: (t: 'direct' | 'group') => void;
  unreadChatCounts: Record<string, number>;
  unreadGroupCounts: Record<string, number>;
  groupChats: GroupChat[];
  joiningGroupId: string | null;
  leavingGroupId: string | null;
  onSetLeavingGroupId: (id: string | null) => void;
  leaveGroupTarget: GroupChat | null;
  onSetLeaveGroupTarget: (g: GroupChat | null) => void;
  onOpenGroupChat?: (groupId: string) => void;
  onJoinGroupChat?: (groupId: string) => void;
  onLeaveGroupChat?: (groupId: string) => void | Promise<void>;
  guardLockedAction: () => boolean;
  functionsLocked: boolean;
  showChatSearchLockToast: () => void;
  chatSearchLockToast: boolean;
  chatSearch: string;
  onChangeChatSearch: (v: string) => void;
  profiles: Profile[];
  currentUserId: string | null;
  profileMap: Map<string, Profile>;
  chatList: Chat[];
  onOpenChat: (profile: Profile) => void;
  onDeleteChat: (chat: Chat) => void;
  onDeleteAllChats: () => void;
  onRefreshChats: () => void;
  chatsRefreshed: boolean;
}) {
  if (!isActive) return null;

  return (
    <div className="w-full max-w-lg mx-auto space-y-3 shrink-0">
      {/* ── 1:1 / 단체 채팅 전환 서브탭 ── */}
      <div className={`flex rounded-xl p-0.5 ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
        <button
          onClick={() => onChangeSubTab('direct')}
          className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
            chatSubTab === 'direct'
              ? (darkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
              : (darkMode ? 'text-slate-400' : 'text-gray-500')
          }`}
        >
          💬 내 채팅 (1:1)
          {sumUnreadCounts(unreadChatCounts) > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-black bg-rose-500 text-white rounded-full">
              {sumUnreadCounts(unreadChatCounts)}
            </span>
          )}
        </button>
        <button
          onClick={() => onChangeSubTab('group')}
          className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
            chatSubTab === 'group'
              ? (darkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
              : (darkMode ? 'text-slate-400' : 'text-gray-500')
          }`}
        >
          👥 단체 채팅
          {sumUnreadCounts(unreadGroupCounts) > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-black bg-rose-500 text-white rounded-full">
              {sumUnreadCounts(unreadGroupCounts)}
            </span>
          )}
        </button>
      </div>

      {/* ── 단체 채팅 목록 ── */}
      {chatSubTab === 'group' && (
        <>
          <p className={`text-[11px] font-bold px-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            참여 {groupChats.filter(g => g.joined).length}/{MAX_GROUPS_PER_USER} · 년생·N대 자동, 2차는 들락날락
          </p>
          {groupChats.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-5xl block mb-3 opacity-30">👥</span>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                아직 열린 단톡방이 없어요
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`}>
                년생·나이대 방은 자동이에요. 2차 클럽·술은 눌러서 입장!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupChats.map(group => {
                const unread = unreadForGroup(unreadGroupCounts, group.id, groupChats);
                const visual = groupRoomVisual(group);
                const joined = !!group.joined;
                const joining = joiningGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    onClick={() => { if (joined) { if (guardLockedAction()) return; onOpenGroupChat?.(group.id); } }}
                    className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 transition-colors duration-300 ${
                      joined ? 'cursor-pointer active:scale-[0.98]' : ''
                    } ${
                      visual.afterparty
                        ? (darkMode ? 'bg-violet-950/40 border border-violet-500/40' : 'bg-violet-50 border border-violet-200')
                        : (darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white')
                    } ${joined && !visual.afterparty ? (darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50') : ''}`}
                  >
                    <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden ${
                      visual.afterparty
                        ? (darkMode ? 'bg-violet-500/20' : 'bg-violet-100')
                        : (darkMode ? 'bg-teal-500/20' : 'bg-teal-50')
                    }`}>
                      <GroupRoomIcon group={group} size={visual.glyph === 'club' ? 48 : 28} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {visual.afterparty && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            darkMode ? 'bg-violet-500/30 text-violet-200' : 'bg-violet-200 text-violet-800'
                          }`}>
                            2차
                          </span>
                        )}
                        <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {group.name}
                        </p>
                      </div>
                      <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                        {joined
                          ? (group.lastMessage || '메시지 없음')
                          : '입장하면 대화에 참여할 수 있어요'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600'
                      }`}>
                        {group.memberCount ?? 0}명
                      </span>
                      {joined ? (
                        <>
                          {unread > 0 ? (
                            <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : (
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>참여 중</span>
                          )}
                          <button
                            type="button"
                            disabled={leavingGroupId === group.id}
                            onClick={e => {
                              e.stopPropagation();
                              onSetLeaveGroupTarget(group);
                            }}
                            className={`text-[10px] font-black px-2 py-1 rounded-full active:scale-95 disabled:opacity-50 ${
                              darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {leavingGroupId === group.id ? '나가는 중…' : '나가기'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={joining}
                          onClick={e => {
                            e.stopPropagation();
                            if (guardLockedAction()) return;
                            onJoinGroupChat?.(group.id);
                          }}
                          className={`text-[11px] font-black px-3 py-1.5 rounded-full active:scale-95 disabled:opacity-50 ${
                            visual.afterparty
                              ? 'bg-violet-500 text-white'
                              : 'bg-teal-500 text-white'
                          }`}
                        >
                          {joining ? '입장 중…' : '입장'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {leaveGroupTarget && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center px-4 pb-8 pointer-events-none">
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-2xl p-4 shadow-2xl border ${
              darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>이 방에서 나갈까요?</p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              방은 그대로예요. 나만 빠지고, 나중에 다시 들어올 수 있어요.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => onSetLeaveGroupTarget(null)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-700'}`}
              >취소</button>
              <button
                type="button"
                disabled={!!leavingGroupId}
                onClick={async () => {
                  if (guardLockedAction()) { onSetLeaveGroupTarget(null); return; }
                  const id = leaveGroupTarget.id;
                  onSetLeavingGroupId(id);
                  try { await onLeaveGroupChat?.(id); } finally {
                    onSetLeavingGroupId(null);
                    onSetLeaveGroupTarget(null);
                  }
                }}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50"
              >나가기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 1:1 채팅 섹션 (기존) ── */}
      {chatSubTab === 'direct' && <>
      {/* ── 닉네임 검색으로 채팅 시작 ── */}
      <div className={`relative rounded-xl border overflow-hidden transition-colors ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          value={chatSearch}
          onChange={e => onChangeChatSearch(e.target.value)}
          placeholder="닉네임 · 나이 · 년생 · MBTI · 성향 · 초성 검색"
          className={`w-full pl-9 pr-9 py-2.5 text-sm bg-transparent focus:outline-none ${darkMode ? 'text-white placeholder-slate-500' : 'text-gray-900 placeholder-gray-400'}`}
        />
        {chatSearch && (
          <button onClick={() => onChangeChatSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
        )}
      </div>
      {/* 채팅 검색 잠금 토스트 */}
      {chatSearchLockToast && (
        <div className="text-center text-[11px] font-bold text-white bg-gray-800/90 rounded-full px-3 py-1 pointer-events-none">
          {FUNCTIONS_LOCK_TOAST}
        </div>
      )}
      {/* 검색 결과 */}
      {chatSearch.trim() && (() => {
        const results = profiles.filter(p => p.id !== currentUserId && !isSwipeGestureVerifyProfile(p) && (
          profileMatchesSearch(p, chatSearch)
        ));
        return results.length > 0 ? (
          <div className="space-y-1">
            {results.map(p => {
              const hasChat = chatList.some(c => c.user1_id === p.id || c.user2_id === p.id);
              return (
                <div key={p.id}
                  onClick={() => { if (functionsLocked) { showChatSearchLockToast(); return; } onOpenChat(p); onChangeChatSearch(''); }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-white hover:bg-gray-50 border border-gray-100'}`}>
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                    <img src={getAvatarSrc(p.photo_url, p.nickname)} alt={p.nickname} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(p.nickname); }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.nickname}</p>
                    {p.mbti && <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{p.mbti}</p>}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${hasChat ? (darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600') : (darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600')}`}>
                    {hasChat ? '채팅 있음' : '대화 시작 →'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={`text-center text-sm py-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>"{chatSearch}" 검색 결과 없음</p>
        );
      })()}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>수락한 상대방과의 채팅 내역</p>
        <div className="flex items-center gap-2">
          {chatList.length > 0 && (
            <button
              onClick={() => { if (guardLockedAction()) return; onDeleteAllChats(); }}
              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-[11px] font-bold rounded-lg border border-red-200 transition-all active:scale-95"
            >전체 삭제</button>
          )}
          <RefreshBtn onRefresh={onRefreshChats} refreshed={chatsRefreshed} />
        </div>
      </div>
      {chatList.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 채팅 내역이 없습니다.</p>
        </div>
      ) : (
        chatList.map((chat) => {
          const otherId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id;
          const otherProfile = profileMap.get(otherId);
          const chatUnread = unreadForChat(unreadChatCounts, chat.id);
          return (
            <div key={chat.id}
              onClick={() => {
                if (guardLockedAction()) return;
                if (otherProfile) onOpenChat(otherProfile);
              }}
              className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors duration-300 active:scale-[0.98] ${darkMode ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'}`}>
              <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                {otherProfile ? (
                  <img src={getAvatarSrc(otherProfile.photo_url, otherProfile.nickname)} alt={otherProfile.nickname} className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(otherProfile.nickname); }} />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-xs ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-400'}`}>?</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{otherProfile?.nickname ?? '알 수 없음'}</p>
                <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                  {(() => {
                    const lm = chat.lastMessage || '';
                    if (lm.startsWith('__contact__')) return '📱 연락처 공유';
                    if (lm.startsWith('__reply__')) return '↩️ ' + lm.replace(/^__reply__[^\n]*\n?/, '').slice(0, 30);
                    return lm;
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                {chatUnread > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
                <button
                  onClick={() => { if (guardLockedAction()) return; onDeleteChat(chat); }}
                  className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold rounded-xl border border-red-200 transition-all"
                >삭제</button>
              </div>
            </div>
          );
        })
      )}
      </>}
    </div>
  );
});

export default MainChatsTab;
