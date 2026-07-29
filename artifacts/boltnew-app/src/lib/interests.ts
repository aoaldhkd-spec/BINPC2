// ─── 관심사 카테고리 (NicknameSetupScreen + 내 상태 탭 공유) ──────────────────

export const BIO_CATEGORIES = [
  {
    label: '뜨밤 & 기타',
    tags: ['뜨밤', '집콕', '기타'],
    color: {
      label: 'text-pink-500',
      normal: 'bg-pink-50 border-pink-200 text-pink-600 hover:bg-pink-500 hover:border-pink-500 hover:text-white',
      selected: 'bg-pink-500 border-pink-500 text-white shadow-sm',
      bg: 'bg-pink-50',
      border: 'border-pink-100',
    },
  },
  {
    label: '스포츠/활동',
    tags: ['운동', '헬스', '필라테스/요가', '골프', '테니스', '자전거', '등산', '낚시', '수영', '클라이밍', '축구/풋살', '배드민턴', '볼링', '스키/보드'],
    color: {
      label: 'text-green-500',
      normal: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-500 hover:border-green-500 hover:text-white',
      selected: 'bg-green-500 border-green-500 text-white shadow-sm',
      bg: 'bg-green-50',
      border: 'border-green-100',
    },
  },
  {
    label: '음식/음주',
    tags: ['카페', '맛집탐방', '술자리', '요리', '디저트', '와인', '위스키', '브런치'],
    color: {
      label: 'text-amber-500',
      normal: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-500 hover:border-amber-500 hover:text-white',
      selected: 'bg-amber-500 border-amber-500 text-white shadow-sm',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
  },
  {
    label: '취미/라이프',
    tags: ['여행', '쇼핑', '반려동물', '사진찍기', '독서', '드라이브', '인테리어', '원예/식물', '자기계발', '명상/요가'],
    color: {
      label: 'text-sky-500',
      normal: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-500 hover:border-sky-500 hover:text-white',
      selected: 'bg-sky-500 border-sky-500 text-white shadow-sm',
      bg: 'bg-sky-50',
      border: 'border-sky-100',
    },
  },
  {
    label: '엔터/미디어',
    tags: ['영화/드라마', '음악감상', 'OTT', '유튜브', '게임', '웹툰', '공연/전시', '라이브방송', '팝/힙합', '재즈/클래식'],
    color: {
      label: 'text-rose-500',
      normal: 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-500 hover:border-rose-500 hover:text-white',
      selected: 'bg-rose-500 border-rose-500 text-white shadow-sm',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
  },
  {
    label: '여가/사교',
    tags: ['보드게임', '노래방', '방탈출', '클럽/바', '독서모임', '소모임', '봉사활동', '맥주축제', '야구직관', '페스티벌'],
    color: {
      label: 'text-orange-500',
      normal: 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-500 hover:border-orange-500 hover:text-white',
      selected: 'bg-orange-500 border-orange-500 text-white shadow-sm',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
    },
  },
] as const;

export type BioCategory = typeof BIO_CATEGORIES[number];
