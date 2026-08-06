import { Heart, MessageCircle } from 'lucide-react';

// ── 샘플 데이터 ──────────────────────────────────────────────────────
const CARDS = [
  {
    nickname: '범일NPC',
    age: '30세',
    mbti: 'ESFJ',
    mbtiColor: { bg: '#fde68a', border: '#f59e0b', text: '#92400e' },
    pos: '올탐',
    posStyle: { bg: '#ffe4e6', border: '#f9a8d4', text: '#9d174d' },
    tags: ['레트로 팝', '감성 카페'],
    photo: 'https://picsum.photos/seed/npc1/300/400',
    liked: true,
  },
  {
    nickname: '서울남',
    age: '28세',
    mbti: 'INFJ',
    mbtiColor: { bg: '#ede9fe', border: '#a78bfa', text: '#4c1d95' },
    pos: '올탐',
    posStyle: { bg: '#ffe4e6', border: '#f9a8d4', text: '#9d174d' },
    tags: ['방탈출', '봉사활동'],
    photo: 'https://picsum.photos/seed/npc2/300/400',
    liked: false,
  },
  {
    nickname: '2345',
    age: '28세',
    mbti: 'INFJ',
    mbtiColor: { bg: '#ede9fe', border: '#a78bfa', text: '#4c1d95' },
    pos: '탐게열',
    posStyle: { bg: '#fef9c3', border: '#fde047', text: '#713f12' },
    tags: ['집콕', '뜨밥'],
    photo: 'https://picsum.photos/seed/npc3/300/400',
    liked: false,
  },
];

function NewCard({ card }: { card: typeof CARDS[0] }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-gray-100" style={{ width: 140 }}>

      {/* ── 사진 영역 (그라데이션/흰배경 제거) ── */}
      <div className="relative" style={{ aspectRatio: '3/4' }}>
        <img
          src={card.photo}
          alt={card.nickname}
          className="w-full h-full object-cover"
        />

        {/* 이름(왼쪽) + 나이(오른쪽) 한 줄 — 두꺼운 검은 텍스트 그림자 */}
        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 flex items-end justify-between gap-1">
          <p
            className="font-black text-[13px] leading-tight flex-1 min-w-0"
            style={{
              color: '#fff',
              textShadow:
                '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 0 6px rgba(0,0,0,0.9)',
            }}
          >
            {card.nickname}
          </p>
          {card.age && (
            <p
              className="text-[11px] font-bold leading-tight flex-shrink-0"
              style={{
                color: 'rgba(255,255,255,0.95)',
                textShadow:
                  '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
              }}
            >
              {card.age}
            </p>
          )}
        </div>
      </div>

      {/* ── 성향(왼쪽) + MBTI(오른쪽) ── */}
      <div className="px-2.5 pt-2 flex items-center justify-between gap-1">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-lg leading-tight border"
          style={{
            backgroundColor: card.posStyle.bg,
            color: card.posStyle.text,
            borderColor: card.posStyle.border,
          }}
        >
          {card.pos}
        </span>
        {card.mbti && (
          <span
            className="text-[10px] font-black px-1.5 py-0.5 rounded-lg leading-tight border"
            style={{
              backgroundColor: card.mbtiColor.bg,
              color: card.mbtiColor.text,
              borderColor: card.mbtiColor.border,
            }}
          >
            {card.mbti}
          </span>
        )}
      </div>

      {/* ── 관심사 (최대 2개, 줄바꿈 없이 한 줄) ── */}
      <div className="px-2.5 pt-1.5 flex items-center gap-1 overflow-hidden">
        {card.tags.slice(0, 2).map(tag => (
          <span
            key={tag}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-500 border border-pink-100 whitespace-nowrap flex-shrink-0"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* ── 하트 + 채팅 버튼 행 ── */}
      <div className="px-2.5 pt-2 pb-2.5 flex items-center justify-center gap-3 border-t border-gray-100 mt-2">
        <button
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 active:scale-95 transition-transform"
          onClick={() => {}}
        >
          <Heart className="w-3.5 h-3.5" style={{ fill: '#e11d48', stroke: '#9f0a28', strokeWidth: 1.5 }} />
          <span className="text-[10px] font-bold text-rose-500">하트</span>
        </button>
        <button
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 active:scale-95 transition-transform"
          onClick={() => {}}
        >
          <MessageCircle className="w-3.5 h-3.5 text-sky-500" strokeWidth={2} />
          <span className="text-[10px] font-bold text-sky-500">채팅</span>
        </button>
      </div>
    </div>
  );
}

export default function ProfileCardNewPreview() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <p className="text-xs text-gray-400 text-center mb-3 font-semibold">새 카드 디자인 미리보기</p>
      <div className="flex gap-3 justify-center flex-wrap">
        {CARDS.map(c => <NewCard key={c.nickname} card={c} />)}
      </div>
    </div>
  );
}
