import { getOhaeng } from '../lib/fortune';
import type { CompatResult, OhaengCompatResult, getMbtiCompat, getNumerologyCompat } from '../lib/fortune';
import type { ChatBirth } from './ChatSajuModal';

export type CompatMethod = 'saju' | 'numerology' | 'ohaeng' | 'mbti';

/** 채팅 헤더의 "🔮 궁합" 버튼으로 열리는 궁합 결과 모달 (표시 전용). */
function ChatCompatModal({
  myNickname, otherNickname, myMbti, otherMbti,
  hasBothBirthdays, myBirth, theirBirth,
  activeCompatMethod, onSelectMethod,
  compatResult, numerologyResult, ohaengCompatResult, mbtiResult,
  onClose, onGoRegisterBirth,
}: {
  myNickname?: string | null;
  otherNickname: string;
  myMbti?: string | null;
  otherMbti?: string | null;
  hasBothBirthdays: boolean;
  myBirth: ChatBirth | null;
  theirBirth: ChatBirth | null;
  activeCompatMethod: CompatMethod;
  onSelectMethod: (m: CompatMethod) => void;
  compatResult: CompatResult | null;
  numerologyResult: ReturnType<typeof getNumerologyCompat> | null;
  ohaengCompatResult: OhaengCompatResult | null;
  mbtiResult: ReturnType<typeof getMbtiCompat> | null;
  onClose: () => void;
  onGoRegisterBirth: () => void;
}) {
  return (
    <div className="safe-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mobile-flow-card bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-4 text-center text-white flex-shrink-0">
          <p className="text-2xl mb-1">🔮</p>
          <h3 className="font-black text-lg">{myNickname ?? '나'} × {otherNickname}</h3>
          <p className="text-xs text-violet-200 mt-0.5">궁합 보기</p>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {!hasBothBirthdays ? (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">😔</p>
              <p className="text-gray-700 font-semibold mb-1">생년월일 정보가 부족해요</p>
              {!myBirth && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 mb-3 text-left">
                  <p className="text-xs font-black text-purple-700 mb-0.5">내 생월·생일이 미등록</p>
                  <p className="text-[11px] text-purple-600 leading-relaxed mb-2">운세 탭에서 생월·생일을 등록해야 궁합을 볼 수 있어요.</p>
                  <button
                    onClick={onGoRegisterBirth}
                    className="w-full py-2 bg-gradient-to-r from-purple-500 to-violet-500 text-white font-bold rounded-lg text-xs active:scale-95 transition-all">
                    🔮 운세 탭에서 등록하러 가기
                  </button>
                </div>
              )}
              {myBirth && !theirBirth && (
                <p className="text-xs text-gray-400 mt-1">{otherNickname}님의 생년월일이 등록되지 않았어요</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'saju' as const, label: '🐯 전통 사주', desc: '12지신 기반' },
                  { id: 'numerology' as const, label: '🔢 수비학', desc: '생년월일 숫자' },
                  { id: 'ohaeng' as const, label: '🌊 오행 상성', desc: '5원소 기운' },
                  { id: 'mbti' as const, label: '🧠 MBTI', desc: (myMbti && otherMbti) ? '' : '둘 다 MBTI 필요', disabled: !(myMbti && otherMbti) },
                ] as Array<{ id: CompatMethod; label: string; desc: string; disabled?: boolean }>).map(m => (
                  <button key={m.id} onClick={() => !m.disabled && onSelectMethod(m.id)} disabled={!!m.disabled}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all text-left ${
                      activeCompatMethod === m.id ? 'bg-violet-100 border-violet-400 text-violet-700' : m.disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50' : 'border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600'
                    }`}>
                    <p>{m.label}</p>
                    <p className="text-[9px] opacity-70 mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>

              {activeCompatMethod === 'saju' && compatResult && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-violet-600">12지신 궁합</span>
                    <span className="text-xl font-black text-violet-700">{compatResult.emoji} {compatResult.score}점</span>
                  </div>
                  <p className="text-sm font-bold text-gray-800">{compatResult.relation}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{compatResult.summary}</p>
                  <p className="text-xs text-violet-500 leading-relaxed">{compatResult.advice}</p>
                  <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 태어난 해의 동물(띠)로 보는 전통 방식. 삼합·육합·상충 관계로 궁합을 읽어요.</p>
                </div>
              )}

              {activeCompatMethod === 'numerology' && numerologyResult && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-blue-600">수비학 궁합</span>
                    <span className="text-xl font-black text-blue-700">🔢 {numerologyResult.score}점</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-white rounded-xl p-3 text-center border border-blue-100">
                      <p className="text-[10px] text-gray-400">내 운명수</p>
                      <p className="text-2xl font-black text-purple-500 mt-0.5">{numerologyResult.num1}</p>
                    </div>
                    <div className="flex items-center text-gray-400 font-black">💕</div>
                    <div className="flex-1 bg-white rounded-xl p-3 text-center border border-blue-100">
                      <p className="text-[10px] text-gray-400">상대 운명수</p>
                      <p className="text-2xl font-black text-pink-500 mt-0.5">{numerologyResult.num2}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{numerologyResult.desc}</p>
                  <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 생년월일 숫자를 모두 더해 1자리로 줄인 '운명수'로 성격과 궁합을 봐요.</p>
                </div>
              )}

              {activeCompatMethod === 'ohaeng' && ohaengCompatResult && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-600">오행 상성</span>
                    <span className="text-xl font-black text-amber-700">{ohaengCompatResult.emoji} {ohaengCompatResult.score}점</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">{myNickname ?? '나'}: {getOhaeng(myBirth!.y)}</span>
                    <span className="text-xs text-gray-400">×</span>
                    <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">{otherNickname}: {getOhaeng(theirBirth!.y)}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-800">{ohaengCompatResult.relation}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{ohaengCompatResult.summary}</p>
                  <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 목·화·토·금·수 5가지 기운의 관계. 상생은 최고, 상극도 자극이 돼요.</p>
                </div>
              )}

              {activeCompatMethod === 'mbti' && mbtiResult && (
                <div className="bg-teal-50 rounded-xl p-4 border border-teal-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-teal-600">MBTI 궁합</span>
                    <span className="text-xl font-black text-teal-700">🧠 {mbtiResult.score}점</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-teal-200 text-teal-800 text-xs font-black rounded-lg">{myMbti}</span>
                    <span className="text-gray-400">+</span>
                    <span className="px-2.5 py-1 bg-pink-200 text-pink-800 text-xs font-black rounded-lg">{otherMbti}</span>
                    <span className="text-[10px] text-gray-400 ml-1">{mbtiResult.overlap}/4 일치</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{mbtiResult.note}</p>
                  <p className="text-[10px] text-gray-400 bg-white rounded-lg px-3 py-2 leading-relaxed">💡 4가지 성격 축이 얼마나 겹치는지. 반드시 많이 겹쳐야 좋은 건 아니에요!</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-5 pb-5 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-3 bg-violet-500 text-white font-semibold rounded-xl hover:bg-violet-600 transition-all">닫기</button>
        </div>
      </div>
    </div>
  );
}

export default ChatCompatModal;
