import { useMemo, useState } from 'react';
import {
  Trash2, ChevronDown, MessageCircle, RefreshCw, UsersRound, Radio,
} from 'lucide-react';
import {
  withAdminImageToken,
  type Profile, type Chat, type Message, type GroupChat, type GroupMessage,
  type GroupParticipant, type SignalSend,
} from './shared';
import { ConfirmDialog } from './ConfirmDialog';
import {
  adminGroupRoomsByBucket,
  formatAdminGroupRoomCounts,
} from '../lib/group-rooms';

// ─── Chats Tab ────────────────────────────────────────────────────────────────

type HistoryView = 'direct' | 'groups' | 'signals';
const HISTORY_PAGE_SIZE = 100;

function HistoryRefreshButton({ refreshing, refreshDone, onClick }: {
  refreshing: boolean;
  refreshDone: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={refreshing}
      className={`flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      {refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
    </button>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function ChatsTab({
  chats, messages, groupChats, groupMessages, groupParticipants, signalSends,
  profileMap, historyLoading, historyError, onDeleteChat, onClearAll, onRefresh,
}: {
  chats: Chat[]; messages: Message[]; profileMap: Map<string, Profile>;
  groupChats: GroupChat[]; groupMessages: GroupMessage[];
  groupParticipants: GroupParticipant[]; signalSends: SignalSend[];
  historyLoading: boolean; historyError: string | null;
  onDeleteChat: (chatId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [historyView, setHistoryView] = useState<HistoryView>('direct');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [_deleting, setDeleting] = useState(false);
  const [groupVisibleCount, setGroupVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [signalVisibleCount, setSignalVisibleCount] = useState(HISTORY_PAGE_SIZE);

  const messagesByChat = new Map<string, Message[]>();
  for (const msg of messages) {
    if (!messagesByChat.has(msg.chat_id)) messagesByChat.set(msg.chat_id, []);
    messagesByChat.get(msg.chat_id)!.push(msg);
  }

  const groupRoomCountLabel = useMemo(
    () => formatAdminGroupRoomCounts(groupChats),
    [groupChats],
  );
  const groupRoomsByBucket = useMemo(
    () => adminGroupRoomsByBucket(groupChats),
    [groupChats],
  );
  const groupMap = useMemo(
    () => new Map(groupChats.map(room => [room.id, room])),
    [groupChats],
  );
  const participantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const participant of groupParticipants) {
      counts.set(participant.group_id, (counts.get(participant.group_id) ?? 0) + 1);
    }
    return counts;
  }, [groupParticipants]);
  const sortedGroupMessages = useMemo(
    () => [...groupMessages].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [groupMessages],
  );
  const sortedSignalSends = useMemo(
    () => [...signalSends].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [signalSends],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      setRefreshDone(true);
      setTimeout(() => setRefreshDone(false), 2000);
    } finally {
      setRefreshing(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await onDeleteChat(confirmDelete);
    setDeleting(false);
    setConfirmDelete(null);
    setExpandedId(null);
  };

  const doClearAll = async () => {
    setClearingAll(true);
    await onClearAll();
    setClearingAll(false);
    setConfirmClearAll(false);
    setExpandedId(null);
  };

  return (
    <div>
      <nav aria-label="채팅 구분" className="grid grid-cols-3 border-b border-gray-200 bg-white px-2 min-[360px]:px-4">
        {([
          { id: 'direct' as HistoryView, label: '1:1 채팅', count: messages.length },
          { id: 'groups' as HistoryView, label: '단체채팅', count: groupMessages.length },
          { id: 'signals' as HistoryView, label: '시그널', count: signalSends.length },
        ]).map(item => (
          <button key={item.id} onClick={() => setHistoryView(item.id)}
            className={`touch-target min-w-0 px-0.5 py-2.5 text-[10px] min-[360px]:text-[11px] min-[390px]:text-xs font-semibold border-b-2 transition-all text-center leading-tight break-words ${
              historyView === item.id ? 'border-cyan-500 text-cyan-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <span>{item.label}</span>
            <span className="ml-1 text-[10px] text-gray-400">{item.count}</span>
          </button>
        ))}
      </nav>

      {historyError && historyView !== 'direct' && (
        <div role="alert" className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          일부 관리자 이력을 불러오지 못했습니다: {historyError}
        </div>
      )}

      {historyView === 'direct' && (
        <div className="p-3 min-[360px]:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-2">
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircle className="w-4 h-4 text-cyan-500" />
              <span className="text-sm font-bold text-gray-700">총 {chats.length}개의 채팅방 · {messages.length}개 메시지</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HistoryRefreshButton refreshing={refreshing} refreshDone={refreshDone} onClick={() => { void handleRefresh(); }} />
              <button onClick={() => setConfirmClearAll(true)} disabled={clearingAll || chats.length === 0}
                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Trash2 className="w-3 h-3" />{clearingAll ? '삭제 중...' : '전체 이력 삭제'}
              </button>
            </div>
          </div>
          {chats.length === 0 && (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">아직 1:1 채팅 기록이 없습니다.</p>
            </div>
          )}
          {chats.map((chat) => {
            const u1 = profileMap.get(chat.user1_id);
            const u2 = profileMap.get(chat.user2_id);
            const chatMessages = messagesByChat.get(chat.id) ?? [];
            const lastMsg = chatMessages[chatMessages.length - 1];
            const isOpen = expandedId === chat.id;
            return (
              <div key={chat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* ⚠️ 버튼 중첩 방지: 외부 클릭 영역(div)과 삭제 버튼을 분리 */}
                <div className="flex items-center">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer min-w-0"
                    onClick={() => setExpandedId(isOpen ? null : chat.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(isOpen ? null : chat.id); }}
                  >
                    <div className="flex -space-x-2 flex-shrink-0">
                      {u1 && <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white"><img src={u1.photo_url} alt={u1.nickname} className="w-full h-full object-cover" /></div>}
                      {u2 && <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white"><img src={u2.photo_url} alt={u2.nickname} className="w-full h-full object-cover" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 break-words">
                        {u1?.nickname ?? '?'} ↔ {u2?.nickname ?? '?'}
                      </p>
                      {lastMsg && (
                        <p className="text-xs text-gray-400 break-words line-clamp-2">
                          {lastMsg.image_url ? '[이미지]' : lastMsg.content} · {chatMessages.length}개 메시지
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <button aria-label="채팅방 삭제" onClick={(e) => { e.stopPropagation(); setConfirmDelete(chat.id); }}
                    className="touch-target flex-shrink-0 p-1.5 mr-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
                    {chatMessages.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-4">메시지가 없습니다.</p>
                    ) : (
                      <div className="p-3 space-y-2">
                        {chatMessages.map((msg) => {
                          const sender = profileMap.get(msg.sender_id);
                          return (
                            <div key={msg.id} className="flex items-start gap-2">
                              {sender && (
                                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                                  <img src={sender.photo_url} alt={sender.nickname} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-gray-600">{sender?.nickname ?? '?'}</span>
                                <span className="text-xs text-gray-400 ml-1.5">
                                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {msg.image_url ? (
                                  <img src={withAdminImageToken(msg.image_url)} alt="이미지" className="mt-1 max-w-[120px] rounded-lg border border-gray-200" />
                                ) : (
                                  <p className="text-sm text-gray-800 break-words">{msg.content}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {historyView === 'groups' && (
        <div className="p-3 min-[360px]:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <UsersRound className="w-4 h-4 shrink-0 text-violet-500" />
                <span className="text-sm font-bold text-gray-700">{groupRoomCountLabel} · 최근 {groupMessages.length}개 메시지</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">목록은 20대·30대·2차 4개, 년생은 출생연도마다 생김</p>
            </div>
            <HistoryRefreshButton refreshing={refreshing} refreshDone={refreshDone} onClick={() => { void handleRefresh(); }} />
          </div>
          {(groupRoomsByBucket.catalog.length > 0 || groupRoomsByBucket.birthYear.length > 0 || groupRoomsByBucket.other.length > 0) && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 space-y-1">
              {groupRoomsByBucket.catalog.length > 0 && (
                <p className="min-w-0 text-[11px] text-gray-700">
                  <span className="font-bold text-violet-700">목록</span>
                  {' '}{groupRoomsByBucket.catalog.map(room => room.name).join(' · ')}
                </p>
              )}
              {groupRoomsByBucket.birthYear.length > 0 && (
                <p className="min-w-0 text-[11px] text-gray-700">
                  <span className="font-bold text-violet-700">년생</span>
                  {' '}{groupRoomsByBucket.birthYear.map(room => room.name).join(' · ')}
                </p>
              )}
              {groupRoomsByBucket.other.length > 0 && (
                <p className="min-w-0 text-[11px] text-gray-700">
                  <span className="font-bold text-violet-700">기타</span>
                  {' '}{groupRoomsByBucket.other.map(room => room.name).join(' · ')}
                </p>
              )}
            </div>
          )}
          {historyLoading && groupMessages.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">단체채팅 이력을 불러오는 중...</p>
          ) : sortedGroupMessages.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">아직 단체채팅 메시지가 없습니다.</p>
          ) : (
            sortedGroupMessages.slice(0, groupVisibleCount).map(message => {
              const room = groupMap.get(message.group_id);
              const sender = profileMap.get(message.sender_id);
              const memberCount = room?.memberCount ?? participantCounts.get(message.group_id);
              return (
                <article key={message.id} className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-sm text-gray-900">{room?.name ?? '알 수 없는 단체방'}</span>
                    {memberCount != null && <span className="text-[10px] text-gray-400">{memberCount}명</span>}
                    <time className="ml-auto text-[10px] text-gray-400">{formatHistoryTime(message.created_at)}</time>
                  </div>
                  <p className="mt-0.5 break-all text-[10px] text-gray-400">방 ID: {message.group_id}</p>
                  <div className="mt-2 flex min-w-0 items-start gap-2">
                    <span className="shrink-0 text-xs font-bold text-violet-700">{sender?.nickname ?? '탈퇴한 사용자'}</span>
                    <p className="min-w-0 break-words text-sm text-gray-700">
                      {message.image_url ? '[이미지]' : message.content || '[내용 없음]'}
                    </p>
                  </div>
                </article>
              );
            })
          )}
          {groupVisibleCount < sortedGroupMessages.length && (
            <button onClick={() => setGroupVisibleCount(count => count + HISTORY_PAGE_SIZE)}
              className="touch-target w-full rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
              다음 {Math.min(HISTORY_PAGE_SIZE, sortedGroupMessages.length - groupVisibleCount)}개 보기
            </button>
          )}
        </div>
      )}

      {historyView === 'signals' && (
        <div className="p-3 min-[360px]:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Radio className="w-4 h-4 text-rose-500" />
              <span className="text-sm font-bold text-gray-700">최근 시그널 활동 {signalSends.length}건</span>
            </div>
            <HistoryRefreshButton refreshing={refreshing} refreshDone={refreshDone} onClick={() => { void handleRefresh(); }} />
          </div>
          <p className="text-[11px] text-gray-400">상태·이상형 원문은 표시하지 않고 발신/수신과 행동만 표시합니다.</p>
          {historyLoading && signalSends.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">시그널 이력을 불러오는 중...</p>
          ) : sortedSignalSends.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">아직 시그널 활동이 없습니다.</p>
          ) : (
            sortedSignalSends.slice(0, signalVisibleCount).map(signal => (
              <article key={signal.id} className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words text-sm font-bold text-gray-900">
                    {profileMap.get(signal.sender_id)?.nickname ?? '탈퇴한 사용자'}
                  </span>
                  <span className="text-gray-300">→</span>
                  <span className="min-w-0 break-words text-sm font-bold text-gray-900">
                    {profileMap.get(signal.receiver_id)?.nickname ?? '탈퇴한 사용자'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    signal.action === 'send' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {signal.action === 'send' ? '시그널 전송' : '패스'}
                  </span>
                  <time className="ml-auto text-[10px] text-gray-400">{formatHistoryTime(signal.created_at)}</time>
                </div>
              </article>
            ))
          )}
          {signalVisibleCount < sortedSignalSends.length && (
            <button onClick={() => setSignalVisibleCount(count => count + HISTORY_PAGE_SIZE)}
              className="touch-target w-full rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
              다음 {Math.min(HISTORY_PAGE_SIZE, sortedSignalSends.length - signalVisibleCount)}개 보기
            </button>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog title="채팅방 삭제"
          message="이 채팅방과 모든 메시지가 삭제됩니다. 되돌릴 수 없습니다."
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmClearAll && (
        <ConfirmDialog title="채팅 전체 이력 삭제"
          message="모든 채팅방과 메시지를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          danger
          onConfirm={doClearAll}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}
    </div>
  );
}

// ─── Game Tab ─────────────────────────────────────────────────────────────────
