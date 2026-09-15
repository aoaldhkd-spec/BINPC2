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
    tags: ['운동', '헬스', '크로스핏', '골프', '러닝', '등산', '수영', '클라이밍', '축구/풋살', '배드민턴', '스키/보드'],
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
    tags: ['카페', '맛집탐방', '술자리', '요리'],
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
    tags: ['여행', '쇼핑', '반려동물', '사진찍기', '드라이브', '자기계발'],
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
    tags: ['음악감상', 'OTT', '유튜브', '게임', '웹툰', '공연/전시'],
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
    tags: ['보드게임', '노래방', '방탈출', '클럽/바', '야구직관'],
    color: {
      label: 'text-orange-500',
      normal: 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-500 hover:border-orange-500 hover:text-white',
      selected: 'bg-orange-500 border-orange-500 text-white shadow-sm',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
    },
  },
] as const;

/** 관심사 선택 UI의 두 묶음 — 위 3개는 활동·라이프, 아래 3개는 엔터·사교·기타. */
export const BIO_CATEGORY_GROUPS = [
  { label: '활동·라이프', categories: ['스포츠/활동', '음식/음주', '취미/라이프'] },
  { label: '엔터·사교·기타', categories: ['뜨밤 & 기타', '엔터/미디어', '여가/사교'] },
] as const;

/** 선택 UI에 쓰이는 전체 관심사 태그 (중복 없음) */
export const ALL_BIO_TAGS: readonly string[] = BIO_CATEGORIES.flatMap((c) => [...c.tags]);

/**
 * 프로필에서 관심사 태그 추출 — bio·interests 불일치/형식 혼재 대응
 * (가입: interests=문자열, 편집: 배열 저장 등)
 */
export function parseProfileInterests(profile: {
  interests?: string | string[] | null;
  bio?: string | null;
}): string[] {
  const candidates: string[] = [];

  const pushParts = (raw: unknown) => {
    if (raw == null) return;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const s = String(item ?? '').trim();
        if (s) candidates.push(s);
      }
      return;
    }
    if (typeof raw !== 'string') return;
    const s = raw.trim();
    if (!s) return;
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          pushParts(parsed);
          return;
        }
      } catch {
        // comma split fallback
      }
    }
    for (const part of s.split(/[,，、]+/)) {
      const t = part.trim();
      if (t) candidates.push(t);
    }
  };

  pushParts(profile.interests);
  if (candidates.length === 0) pushParts(profile.bio);

  const canonical = new Set(ALL_BIO_TAGS);
  const out: string[] = [];
  for (const tag of candidates) {
    const clean = tag.replace(/^#+/, '').trim();
    if (!clean) continue;
    const resolved = canonical.has(clean)
      ? clean
      : ALL_BIO_TAGS.find((t) => t === clean || t.replace(/\s/g, '') === clean.replace(/\s/g, ''));
    const finalTag = resolved ?? clean;
    if (!out.includes(finalTag)) out.push(finalTag);
  }
  return out;
}

/** 카드·프로필용 관심사 태그 색 (카테고리별 파스텔) */
export function getInterestTagStyle(tag: string): { bg: string; text: string; border: string } {
  const fallback = { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' };
  const byLabel: Record<string, { bg: string; text: string; border: string }> = {
    '뜨밤 & 기타': { bg: '#fdf2f8', text: '#db2777', border: '#fbcfe8' },
    '스포츠/활동': { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    '음식/음주': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    '취미/라이프': { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    '엔터/미디어': { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' },
    '여가/사교': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  };
  for (const cat of BIO_CATEGORIES) {
    if ((cat.tags as readonly string[]).includes(tag)) {
      return byLabel[cat.label] ?? fallback;
    }
  }
  return fallback;
}
