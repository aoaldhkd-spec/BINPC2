import { QUICK_MSGS } from '../lib/chat-picker-data';

/** 채팅 입력창 위에 열리는 빠른 메시지 패널 (표시 전용). */
function ChatQuickMsgsPanel({ onSelectMessage }: {
  onSelectMessage: (msg: string) => void;
}) {
  return (
    <div className="bg-white border-t border-gray-200 max-w-3xl w-full mx-auto">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-xs font-black text-violet-500">⚡ 빠른 메시지</span>
        <span className="text-[10px] text-gray-400 flex-1">탭하면 바로 전송</span>
      </div>
      <div className="max-h-52 overflow-y-auto p-2 space-y-1">
        {QUICK_MSGS.map((qm) => (
          <button key={qm} type="button"
            onClick={() => onSelectMessage(qm)}
            className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-violet-50 active:bg-violet-100 transition-colors text-gray-700 font-medium leading-relaxed border border-transparent hover:border-violet-100">
            {qm}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ChatQuickMsgsPanel;
