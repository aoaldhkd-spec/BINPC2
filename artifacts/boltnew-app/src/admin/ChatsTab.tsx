import { useState } from 'react';
import { Trash2, ChevronDown, MessageCircle, RefreshCw } from 'lucide-react';
import { withAdminImageToken, type Profile, type Chat, type Message } from './shared';
import { ConfirmDialog } from './ConfirmDialog';

// ─── Chats Tab ────────────────────────────────────────────────────────────────

export function ChatsTab({ chats, messages, profileMap, onDeleteChat, onClearAll, onRefresh }: {
  chats: Chat[]; messages: Message[]; profileMap: Map<string, Profile>;
  onDeleteChat: (chatId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [_deleting, setDeleting] = useState(false);

  const messagesByChat = new Map<string, Message[]>();
  for (const msg of messages) {
    if (!messagesByChat.has(msg.chat_id)) messagesByChat.set(msg.chat_id, []);
    messagesByChat.get(msg.chat_id)!.push(msg);
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2000);
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

  if (chats.length === 0) {
    return (
      <div className="p-8 text-center">
        <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400 mb-4">아직 채팅 기록이 없습니다.</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className={`flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-bold text-gray-700">총 {chats.length}개의 채팅방 · {messages.length}개 메시지</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 ${refreshDone ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600'}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshDone ? '완료!' : refreshing ? '로딩...' : '새로고침'}
          </button>
          <button onClick={() => setConfirmClearAll(true)} disabled={clearingAll || chats.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="w-3 h-3" />{clearingAll ? '삭제 중...' : '전체 이력 삭제'}
          </button>
        </div>
      </div>
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
                  <p className="text-sm font-bold text-gray-900">
                    {u1?.nickname ?? '?'} ↔ {u2?.nickname ?? '?'}
                  </p>
                  {lastMsg && (
                    <p className="text-xs text-gray-400 truncate">
                      {lastMsg.image_url ? '[이미지]' : lastMsg.content} · {chatMessages.length}개 메시지
                    </p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(chat.id); }}
                className="flex-shrink-0 p-1.5 mr-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
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
