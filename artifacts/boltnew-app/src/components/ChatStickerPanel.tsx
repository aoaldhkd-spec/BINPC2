import { StickerSVG, STICKER_LABELS, STICKER_BG, STICKER_PACKS } from '../stickers';

/** 채팅 입력창 위에 열리는 이모티콘(스티커) 선택 패널 (표시 전용). */
function ChatStickerPanel({ stickerCat, onSelectCategory, onSelectSticker }: {
  stickerCat: number;
  onSelectCategory: (idx: number) => void;
  onSelectSticker: (idx: number) => void;
}) {
  const pack = STICKER_PACKS[stickerCat] ?? STICKER_PACKS[0];
  return (
    <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
      {/* 헤더 */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-xs font-black text-rose-500">🎨 이모티콘</span>
        <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
        <span className="text-[10px] text-gray-300">{pack.count}개</span>
      </div>
      {/* 분류 탭 */}
      <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto scrollbar-none border-b border-gray-100">
        {STICKER_PACKS.map((p, idx) => {
          const active = stickerCat === idx;
          // 라벨에서 이모지만 추출 (첫 번째 '공백' 이전 부분)
          const emoji = p.label.split(' ')[0];
          const shortName = p.label.split(' ').slice(1).join('');
          return (
            <button key={p.label} type="button"
              onClick={() => onSelectCategory(idx)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all ${active ? 'bg-rose-50' : 'hover:bg-gray-50'}`}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className={`text-[9px] font-bold leading-none whitespace-nowrap ${active ? 'text-rose-500' : 'text-gray-400'}`}>{shortName}</span>
              {active && <div className="w-4 h-0.5 bg-rose-400 rounded-full mt-0.5" />}
            </button>
          );
        })}
      </div>
      {/* 스티커 그리드 — 선택된 팩만 표시 */}
      <div className="grid grid-cols-4 gap-1.5 p-2.5 max-h-52 overflow-y-auto">
        {Array.from({ length: pack.count }, (_, i) => {
          const idx = pack.start + i;
          return (
            <button key={idx} type="button"
              onClick={() => onSelectSticker(idx)}
              style={{ backgroundColor: STICKER_BG[idx] }}
              className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-2xl active:scale-90 transition-transform hover:opacity-90">
              <StickerSVG idx={idx} size={72} />
              <span className="text-[9px] font-bold text-gray-500 text-center leading-tight truncate w-full px-0.5">{STICKER_LABELS[idx]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ChatStickerPanel;
