import { EMOJI_CATEGORIES } from '../lib/chat-picker-data';

/** 채팅 입력창 위에 열리는 이모지 선택 패널 (표시 전용). */
function ChatEmojiPanel({ emojiCat, onSelectCategory, onEmojiClick }: {
  emojiCat: string;
  onSelectCategory: (id: string) => void;
  onEmojiClick: (emoji: string) => void;
}) {
  return (
    <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
      {/* 카테고리 탭 */}
      <div className="flex border-b border-gray-100 px-1 bg-gray-50">
        {EMOJI_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={`flex-1 flex flex-col items-center pt-1.5 pb-1 gap-0 transition-all relative ${
              emojiCat === cat.id
                ? 'opacity-100'
                : 'opacity-40 hover:opacity-70'
            }`}
          >
            <span className="text-lg leading-tight">{cat.label}</span>
            <span className="text-[8px] font-bold text-gray-500 leading-tight">{cat.name}</span>
            {emojiCat === cat.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-cyan-500" />
            )}
          </button>
        ))}
      </div>
      {/* 이모지 그리드 */}
      <div className="grid grid-cols-10 gap-0 p-1.5 max-h-44 overflow-y-auto">
        {(EMOJI_CATEGORIES.find(c => c.id === emojiCat)?.emojis ?? []).map(emoji => (
          <button key={emoji} type="button" onClick={() => onEmojiClick(emoji)}
            className="h-9 flex items-center justify-center text-xl hover:bg-gray-100 active:scale-90 rounded-lg transition-all">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ChatEmojiPanel;
