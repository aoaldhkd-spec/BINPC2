/** Nickname grapheme limits (2~6 complete characters). */
export const NICKNAME_MIN_GRAPHEMES = 2;
export const NICKNAME_MAX_GRAPHEMES = 6;

export function graphemeSegments(s: string): string[] {
  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].map(
        (x) => x.segment,
      );
    }
  } catch {
    /* fall through */
  }
  return [...s];
}

export function countGraphemes(s: string): number {
  return graphemeSegments(s).length;
}

export function sliceGraphemes(s: string, max: number): string {
  return graphemeSegments(s).slice(0, max).join('');
}

/** Hangul jamo pieces used while a syllable is still being composed. */
export function isHangulJamoGrapheme(g: string): boolean {
  if (!g) return false;
  for (const ch of g) {
    const cp = ch.codePointAt(0);
    if (cp == null) return false;
    const jamo =
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x3130 && cp <= 0x318f) ||
      (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xd7b0 && cp <= 0xd7ff);
    if (!jamo) return false;
  }
  return true;
}

/** Precomposed Hangul: LV (no 종성) vs LVT (has 종성). */
export function hangulSyllableKind(g: string): 'lv' | 'lvt' | 'other' {
  const cp = g.codePointAt(0);
  if (cp == null || cp < 0xac00 || cp > 0xd7a3) return 'other';
  return (cp - 0xac00) % 28 === 0 ? 'lv' : 'lvt';
}

export function isNicknameLengthValid(s: string): boolean {
  const n = countGraphemes(s.trim());
  return n >= NICKNAME_MIN_GRAPHEMES && n <= NICKNAME_MAX_GRAPHEMES;
}

/** True if a new IME session may still finish the current (6th) syllable. */
export function nicknameCompositionAllowed(
  current: string,
  max = NICKNAME_MAX_GRAPHEMES,
): boolean {
  const segs = graphemeSegments(current);
  if (segs.length < max) return true;
  const last = segs[segs.length - 1];
  return !!(last && isHangulJamoGrapheme(last));
}

function splitCompleteAndJamo(segs: string[]): { complete: string[]; jamo: string[] } {
  let i = segs.length;
  while (i > 0 && isHangulJamoGrapheme(segs[i - 1])) i--;
  return { complete: segs.slice(0, i), jamo: segs.slice(i) };
}

/** Keep 6th 중성/종성 jamo; drop a 7th complete character. */
function clampFinishingSixth(value: string, max: number): string {
  const segs = graphemeSegments(value);
  if (segs.length <= max) return value;
  const { complete, jamo } = splitCompleteAndJamo(segs);
  if (complete.length < max) return complete.join('') + jamo.join('');
  if (
    complete.length === max &&
    hangulSyllableKind(complete[max - 1] ?? '') === 'lv' &&
    jamo.length > 0
  ) {
    return complete.join('') + jamo.slice(0, 3).join('');
  }
  return complete.slice(0, max).join('');
}

/**
 * Clamp nickname text without cutting the current Hangul syllable mid-IME.
 *
 * `allowFinishSyllable` should stay true for the whole composition that started
 * before 6 complete graphemes existed, so 6th 중성/종성 are not sliced off
 * even after the leading 초성 already occupies the 6th slot.
 */
export function clampNicknameInput(
  value: string,
  options: {
    isComposing?: boolean;
    previous?: string;
    max?: number;
    allowFinishSyllable?: boolean;
  } = {},
): string {
  const max = options.max ?? NICKNAME_MAX_GRAPHEMES;
  const segs = graphemeSegments(value);
  if (segs.length <= max) return value;

  const previous = options.previous ?? '';
  const prevSegs = graphemeSegments(previous);
  const prevLast = prevSegs[prevSegs.length - 1];
  const canFinish =
    options.allowFinishSyllable === true ||
    (options.allowFinishSyllable !== false &&
      options.isComposing === true &&
      (prevSegs.length < max || isHangulJamoGrapheme(prevLast ?? '')));

  if (options.isComposing && canFinish) return clampFinishingSixth(value, max);
  if (options.isComposing) return sliceGraphemes(previous, max);

  const head = segs.slice(0, max);
  const overflow = segs.slice(max);
  const lastHead = head[head.length - 1];
  if (lastHead && isHangulJamoGrapheme(lastHead) && overflow.every(isHangulJamoGrapheme)) {
    return head.join('') + overflow.slice(0, 3).join('');
  }
  return head.join('');
}

/** Block a new insert only after 6 complete characters (6th syllable finished). */
export function shouldBlockNicknameBeforeInput(
  current: string,
  max = NICKNAME_MAX_GRAPHEMES,
  allowFinishSyllable = false,
): boolean {
  const segs = graphemeSegments(current);
  if (segs.length < max) return false;
  const last = segs[segs.length - 1];
  if (last && isHangulJamoGrapheme(last)) return false;
  if (allowFinishSyllable && hangulSyllableKind(last ?? '') === 'lv') return false;
  return true;
}

export function isNicknameImeComposing(
  composingFlag: boolean,
  nativeEvent: { isComposing?: boolean } | Event,
): boolean {
  return composingFlag || (nativeEvent as InputEvent).isComposing === true;
}
