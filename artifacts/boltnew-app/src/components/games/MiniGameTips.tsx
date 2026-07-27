import React, { useState } from 'react';

const MINI_GAMES = [
  { name: '369 게임', emoji: '3️⃣', desc: '순서대로 1부터 숫자를 말하되 3, 6, 9가 포함된 숫자에서는 박수를 칩니다.', tip: '33은 박수 두 번! 숫자를 빠르게 이어가면 실수가 나옵니다.', penalty: '틀린 사람이 벌칙(술 한 잔, 벌금 등)' },
  { name: '베스킨라빈스 31', emoji: '🍦', desc: '1~3개 숫자를 차례로 말하며 31을 말하는 사람이 집니다.', tip: '31의 배수 주변 숫자가 핵심! 22, 25, 28 구간이 승부처입니다.', penalty: '31 말한 사람이 벌칙' },
  { name: '눈치게임', emoji: '👀', desc: '아무 순서 없이 1부터 인원 수까지 각자 하나씩 외칩니다. 동시에 외치면 OUT!', tip: '서로 눈치를 보다 마지막 번호를 외치는 사람이 지는 경우도 있습니다.', penalty: '동시에 외쳤거나 마지막 번호가 벌칙' },
  { name: '폭탄 돌리기', emoji: '💣', desc: '음악이 멈추면 폭탄(물건)을 들고 있는 사람이 집니다.', tip: '음악 속도나 길이를 랜덤하게 하면 더 재밌습니다.', penalty: '폭탄 든 사람이 벌칙' },
];

export function MiniGameTips() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-black text-gray-800 mb-1">게임 설명 & 팁</h3>
      <p className="text-xs text-gray-400 mb-3">클릭하면 자세한 방법을 확인할 수 있어요</p>
      <div className="grid grid-cols-2 gap-2">
        {MINI_GAMES.map((g, i) => (
          <div key={i}>
            <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${openIdx === i ? 'border-violet-400 bg-violet-50' : 'border-gray-100 bg-gray-50 hover:border-violet-200 hover:bg-violet-50/50'}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{g.emoji}</span>
                <span className="text-xs font-bold text-gray-800">{g.name}</span>
              </div>
            </button>
            {openIdx === i && (
              <div className="mt-1 p-3 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
                <p className="text-xs text-gray-700 leading-relaxed"><span className="font-bold text-violet-700">방법:</span> {g.desc}</p>
                <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-amber-600">팁:</span> {g.tip}</p>
                <p className="text-xs text-gray-500 leading-relaxed"><span className="font-bold text-red-500">벌칙:</span> {g.penalty}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
