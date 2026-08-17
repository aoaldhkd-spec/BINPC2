import { getOhaeng, getZodiac } from '../lib/fortune';
import type { TodayFortune } from '../lib/fortune';

export type ChatBirth = { y: number; m: number; d: number };

/** 채팅 헤더의 "📅 사주" 버튼으로 열리는 오늘의 사주 모달 (표시 전용). */
function ChatSajuModal({ myNickname, otherNickname, myBirth, theirBirth, myFortune, theirFortune, onClose, onGoRegisterBirth }: {
  myNickname?: string | null;
  otherNickname: string;
  myBirth: ChatBirth | null;
  theirBirth: ChatBirth | null;
  myFortune: TodayFortune | null;
  theirFortune: TodayFortune | null;
  onClose: () => void;
  onGoRegisterBirth: () => void;
}) {
  return (
    <div className="safe-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mobile-flow-card bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-center text-white flex-shrink-0">
          <p className="text-2xl mb-1">📅</p>
          <h3 className="font-black text-lg">오늘의 사주</h3>
          <p className="text-xs text-amber-100 mt-0.5">생년월일 기반 · 오늘 하루 운세</p>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {!myBirth && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
              <p className="text-2xl mb-1">⚠️</p>
              <p className="text-sm font-black text-amber-800 mb-0.5">내 생월·생일이 없어요</p>
              <p className="text-xs text-amber-600 mb-3 leading-relaxed">운세·사주 탭에서 생월·생일을 등록하면<br/>내 사주를 확인할 수 있어요.</p>
              <button
                onClick={onGoRegisterBirth}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm active:scale-95 transition-all">
                🔮 운세 탭에서 등록하러 가기
              </button>
            </div>
          )}
          {[
            { label: myNickname ?? '나', birth: myBirth, fortune: myFortune, color: 'cyan' },
            { label: otherNickname, birth: theirBirth, fortune: theirFortune, color: 'pink' },
          ].map(({ label, birth, fortune }) => (
            <div key={label} className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-4 py-2 flex items-center gap-2">
                <span className="font-black text-sm text-gray-800">{label}</span>
                {birth ? (
                  <span className="text-xs text-gray-400">{birth.y}년생 · {getZodiac(birth.y).emoji}{getZodiac(birth.y).name}띠 · {getOhaeng(birth.y)}</span>
                ) : (
                  <span className="text-xs text-red-400 font-semibold">생년월일 미등록</span>
                )}
              </div>
              {!birth || !fortune ? (
                <div className="px-4 py-3 text-xs text-gray-400 italic">
                  {birth ? '사주 계산 중...' : '생년월일 등록 후 확인 가능해요'}
                </div>
              ) : (
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">에너지 지수</span>
                    <span className="text-sm font-black text-purple-600">{fortune.energyLevel}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-400 to-violet-500 rounded-full transition-all" style={{ width: `${fortune.energyLevel}%` }} />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{fortune.message}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-bold">🎨 {fortune.luckyColor}</span>
                    <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-bold">🔢 {fortune.luckyNumber}</span>
                    <span className="text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 rounded-full font-bold">✨ {fortune.luckyItem}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-all">닫기</button>
        </div>
      </div>
    </div>
  );
}

export default ChatSajuModal;
