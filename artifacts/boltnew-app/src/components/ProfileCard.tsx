import { useState, useRef, useEffect, memo } from 'react';
import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react';
import { useTheme } from '../lib/theme';
import type { Profile } from '../types/app';
import { parseProfileInterests, getInterestTagStyle } from '../lib/interests';
import { HeartType, heartMeta } from '../lib/constants';
import { getPositionLabel, getPositionStyle, getKoreanAge, hasUploadedPhoto, getAvatarGradientCss } from '../lib/profile';
import { getMbtiStyle } from '../lib/utils';
import { cardMenuBox } from '../lib/card-menu-box';
import { parseIdealTags } from '../lib/signal-match';
import { isProfileCardDark, profileCardChipStyle, profileCardSurfaces } from '../lib/profile-card-theme';

/** 카드 뒷면에 바로 보여줄 이상형 태그 상한 — 나머지는 "+N" + 프로필 상세 */
const CARD_IDEAL_MAX_VISIBLE = 8;
/** 태그가 많을 때 칩 글자 축소 */
const CARD_IDEAL_COMPACT_FONT_AT = 6;

// ─── ProfileCard (memoized — 하트/채팅 상태 변경 시 해당 카드만 재렌더) ────────

export const ProfileCard = memo(function ProfileCard({
  profile, isLiked, sentHeartType, heartCount, canLike, locked, compact = false, darkMode = false, onLike, onSelect, onView, onOpenChat, onBlock, onContactShare, onViewFortune, idealMsg, statusMsg,
}: {
  profile: Profile;
  isLiked: boolean;
  sentHeartType: HeartType | undefined;
  heartCount: number;
  canLike: boolean;
  locked?: boolean;
  /** 작게 보기 — 3열 그리드·1:1 정사각 사진 */
  compact?: boolean;
  /** App dark toggle — dims cards even on y2k/minimal */
  darkMode?: boolean;
  onLike: (id: string) => void;
  onSelect: (p: Profile) => void;
  onView?: (p: Profile) => void;
  onOpenChat: (p: Profile) => void;
  onBlock?: (id: string, type: 'block' | 'hide') => void;
  onContactShare?: (p: Profile) => void;
  onViewFortune?: (p: Profile) => void;
  idealMsg?: string | null;
  statusMsg?: string | null;
}) {
  const { theme } = useTheme();
  // default → 흰 카드; dark-neon → 어두운 카드; y2k/minimal → darkMode일 때만 어두움
  const isCardDark = isProfileCardDark(theme, darkMode);
  const surfaces = profileCardSurfaces(theme, darkMode);

  const posLabel = getPositionLabel(profile.personality_score ?? 50);
  const posStyle = getPositionStyle(profile.personality_score ?? 50);
  const idealTags = parseIdealTags(idealMsg);
  const idealFree = (idealMsg ?? '').split('\n').slice(1).join('\n').trim();
  const idealTagCount = idealTags.length;
  const idealOverflow = idealTagCount > CARD_IDEAL_MAX_VISIBLE;
  const visibleIdealTags = idealOverflow ? idealTags.slice(0, CARD_IDEAL_MAX_VISIBLE) : idealTags;
  const hiddenIdealCount = idealTagCount - visibleIdealTags.length;
  const idealChipClass = idealTagCount >= CARD_IDEAL_COMPACT_FONT_AT
    ? 'text-[7px] sm:text-[8px]'
    : 'text-[8px] sm:text-[9px]';
  const age = getKoreanAge(profile.birth_year);
  const msStyle = profile.mbti ? getMbtiStyle(profile.mbti) : null;
  const interestTags = parseProfileInterests(profile).slice(0, 2);
  const heartBtnStyle = isCardDark
    ? { backgroundColor: 'rgba(251,113,133,0.13)', borderColor: 'rgba(251,113,133,0.28)' }
    : { backgroundColor: '#fff1f2', borderColor: '#fecdd3' };
  const chatBtnStyle = isCardDark
    ? { backgroundColor: 'rgba(56,189,248,0.13)', borderColor: 'rgba(56,189,248,0.28)' }
    : { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' };
  const dividerColor = isCardDark ? 'rgba(255,255,255,0.09)' : '#f3f4f6';

  // 잠금 토스트 (컴포넌트 최상단 — Rules of Hooks 준수)
  const [lockToast, setLockToast] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{top:number;left:number;width:number}|null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLockToast = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
    setLockToast(true);
    lockToastTimerRef.current = setTimeout(() => setLockToast(false), 1400);
  };

  // Full-bleed frame: pastel/preset/upload all fill the card (no gray letterboxing).
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [profile.photo_url, profile.nickname]);

  const pastelFill = !hasUploadedPhoto(profile.photo_url) || imgFailed;
  const photoBg = pastelFill
    ? getAvatarGradientCss(profile.nickname)
    : '#0f172a';

  // 상태 메시지 자동 마키 — 뷰포트에 보일 때만 애니메이션·ResizeObserver 가동
  const cardRootRef = useRef<HTMLDivElement>(null);
  const tickerBarRef = useRef<HTMLDivElement>(null);
  const tickerSpanRef = useRef<HTMLSpanElement>(null);
  const [tickerOffset, setTickerOffset] = useState(0); // 슬라이드할 px 거리
  const [tickerOnScreen, setTickerOnScreen] = useState(true);
  const [flipAnimating, setFlipAnimating] = useState(false);
  const hasTicker = Boolean(statusMsg?.trim());
  const hasMenu = Boolean(onBlock || onContactShare || onViewFortune);
  // 플립해도 전광판·닉·나이는 항상 노출 — 가운데(사진)만 뒤집힘
  const showTopBar = hasTicker;
  const showBottomBar = true;
  /** 이상형 뒷면이 상·하단 바를 덮지 않도록 인셋 (바 min-h ≈ 20px + 여유) */
  const idealInsetTop = hasTicker ? 26 : 10;
  const idealInsetBottom = 24;
  const tickerAnimActive = hasTicker && tickerOnScreen;

  useEffect(() => {
    if (!hasTicker) {
      setTickerOnScreen(false);
      return;
    }
    const root = cardRootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setTickerOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setTickerOnScreen(Boolean(entry?.isIntersecting)),
      { root: null, rootMargin: '80px 0px', threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [hasTicker]);

  useEffect(() => {
    if (!tickerAnimActive) {
      setTickerOffset(0);
      return;
    }
    const bar = tickerBarRef.current;
    const span = tickerSpanRef.current;
    if (!bar || !span) { setTickerOffset(0); return; }
    let raf = 0;
    const calc = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const overflow = span.scrollWidth - bar.clientWidth;
        const next = overflow > 4 ? overflow + 12 : 0;
        setTickerOffset((prev) => (prev === next ? prev : next));
      });
    };
    calc();
    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(raf);
    }
    const ro = new ResizeObserver(calc);
    ro.observe(bar);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [statusMsg, tickerAnimActive]);

  // flipZone always matches the photo frame (compact=1:1, default=3:4) — no letterbox inset
  const flipZoneStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    contain: 'layout paint',
  };

  // ⋯ 메뉴 — 바깥 클릭 시만 닫기 (메뉴 항목 pointerdown에서 즉시 닫히면 클릭 불가)
  useEffect(() => {
    if (!showMenu) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setShowMenu(false);
      setMenuPos(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showMenu]);

  const openCardMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (showMenu) { setShowMenu(false); setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos(cardMenuBox(rect, window.innerWidth, window.innerHeight));
    setShowMenu(true);
  };

  const menuButton = hasMenu ? (
    <button
      ref={menuBtnRef}
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={openCardMenu}
      className="w-5 h-5 rounded-full bg-black/55 ring-1 ring-white/30 flex items-center justify-center active:scale-90 transition-transform shrink-0 shadow-sm"
      aria-label="더보기"
      aria-expanded={showMenu}
    >
      <MoreHorizontal className="w-2.5 h-2.5 text-white pointer-events-none" />
    </button>
  ) : null;

  return (
    <div
      ref={cardRootRef}
      className={`group relative flex flex-col min-w-0 max-w-full rounded-lg shadow-sm border overflow-hidden ${surfaces.shellClass}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px' }}
    >

      {/* ⋯ 드롭다운 (fixed) */}
      {showMenu && menuPos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 9999 }}
          className={`max-h-[calc(100dvh-1rem)] rounded-2xl shadow-2xl border overflow-y-auto ${isCardDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onContactShare && (
            <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); if (locked) { showLockToast(e); return; } onContactShare(profile); }}
              className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 whitespace-nowrap ${isCardDark ? 'text-teal-400 hover:bg-slate-700' : 'text-teal-600 hover:bg-teal-50'}`}>💌 연락처 보내기</button>
          )}
          {onViewFortune && (
            <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); if (locked) { showLockToast(e); return; } onViewFortune(profile); }}
              className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 whitespace-nowrap border-t ${isCardDark ? 'text-violet-400 hover:bg-slate-700 border-slate-700' : 'text-violet-600 hover:bg-violet-50 border-gray-50'}`}>🔮 궁합 보기</button>
          )}
          {onBlock && (
            <>
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onBlock(profile.id, 'block'); }}
                className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 whitespace-nowrap border-t ${isCardDark ? 'text-red-400 hover:bg-slate-700 border-slate-700' : 'text-red-500 hover:bg-red-50 border-gray-50'}`}>🚫 차단하기</button>
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onBlock(profile.id, 'hide'); }}
                className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 whitespace-nowrap border-t ${isCardDark ? 'text-slate-300 hover:bg-slate-700 border-slate-700' : 'text-gray-600 hover:bg-gray-50 border-gray-50'}`}>👻 나를 못 보게 하기</button>
            </>
          )}
        </div>
      )}

      {/* ── 프로필 사진 (작게=1:1, 기본=3:4) — 플립해도 aspect 고정, 크기 불변 ── */}
      <div
        className={`relative z-0 w-full shrink-0 isolate${compact ? ' aspect-square' : ''}`}
        style={{
          ...(compact ? {} : { aspectRatio: '3/4' }),
          background: photoBg,
          overflow: 'hidden',
        }}
        data-testid="profile-card-photo-frame"
      >
          {/* ── 플립 존 — 실제 사진이 그려지는 영역만 3D 뒤집기 (컨테이너 크기 고정) ── */}
          <div style={{ perspective: isFlipped || flipAnimating ? '1000px' : undefined, overflow: 'hidden', ...flipZoneStyle }}>
            <div
              style={{
                width: '100%', height: '100%',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.55s cubic-bezier(.4,0,.2,1)',
                transform: isFlipped ? 'rotateY(180deg)' : 'none',
                willChange: flipAnimating ? 'transform' : 'auto',
              }}
              onTransitionEnd={(e) => {
                if (e.propertyName === 'transform') setFlipAnimating(false);
              }}
            >

              {/* 앞면: 사진 — 탭하면 이상형 뒷면 */}
              <div
                className="absolute inset-0 cursor-pointer"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  overflow: 'hidden',
                  pointerEvents: isFlipped ? 'none' : 'auto',
                }}
                data-testid="profile-card-photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipAnimating(true);
                  setIsFlipped(f => {
                    const next = !f;
                    if (next) onView?.(profile);
                    return next;
                  });
                }}
              >
                {pastelFill ? (
                  <div className="absolute inset-0" style={{ background: photoBg }} aria-hidden />
                ) : (
                  <img
                    src={profile.photo_url!}
                    alt={profile.nickname}
                    loading="lazy"
                    decoding="async"
                    onError={() => setImgFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                  />
                )}
              </div>

              {/* 뒷면: 이상형 — 상·하단 바 인셋 안쪽만; 헤더는 전광판 아래, 본문은 스크롤 */}
              <div
                className="absolute inset-0 flex flex-col min-h-0 max-h-full overflow-hidden cursor-pointer box-border"
                data-testid="profile-card-ideal-back"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  background: 'linear-gradient(165deg,#1a082a 0%,#3a0f52 40%,#4a1570 100%)',
                  pointerEvents: isFlipped ? 'auto' : 'none',
                  paddingTop: idealInsetTop,
                  paddingBottom: idealInsetBottom,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipAnimating(true);
                  setIsFlipped(false);
                }}
              >
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(255,100,200,0.28) 0%,transparent 60%)' }} />

                <button
                  type="button"
                  data-testid="profile-card-ideal-header"
                  onClick={(e) => { e.stopPropagation(); setFlipAnimating(true); setIsFlipped(false); }}
                  className="relative z-[1] shrink-0 flex items-center justify-center gap-1 px-2 pt-1 pb-0.5 cursor-pointer active:opacity-80"
                  aria-label="사진으로 돌아가기"
                >
                  <span className="text-xs leading-none" aria-hidden>💗</span>
                  <span className="text-[9px] sm:text-[10px] font-black tracking-[0.08em] text-pink-50 drop-shadow-sm">
                    나의 이상형{idealTagCount > 0 ? ` (${idealTagCount})` : ''}
                  </span>
                </button>

                <div
                  className="relative z-[1] flex-1 min-h-0 max-h-full overflow-y-auto overscroll-contain px-1.5 py-0.5 touch-pan-y"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {!idealTagCount && !idealFree ? (
                    <p className="text-[9px] sm:text-[10px] text-center text-pink-100/80 leading-relaxed m-0 py-1 font-medium">
                      아직 작성하지 않았어요 🌸
                    </p>
                  ) : (
                    <>
                      {idealTagCount > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {visibleIdealTags.map(t => (
                            <span
                              key={t}
                              className={`inline-block max-w-full ${idealChipClass} font-extrabold leading-tight px-1.5 py-0.5 rounded-full border break-words text-center`}
                              style={{
                                background: 'rgba(255,160,220,0.22)',
                                borderColor: 'rgba(255,200,230,0.65)',
                                color: '#fff5fb',
                                textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                              }}
                            >{t}</span>
                          ))}
                          {hiddenIdealCount > 0 && (
                            <span
                              className={`inline-block ${idealChipClass} font-extrabold leading-tight px-1.5 py-0.5 rounded-full border`}
                              style={{
                                background: 'rgba(255,120,180,0.35)',
                                borderColor: 'rgba(255,200,230,0.75)',
                                color: '#fff5fb',
                                textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                              }}
                            >+{hiddenIdealCount}</span>
                          )}
                        </div>
                      )}
                      {idealFree && (
                        <p
                          className={`${idealChipClass} text-center leading-snug mt-1 mb-0 px-0.5 break-words whitespace-pre-wrap font-semibold${idealOverflow ? ' line-clamp-2' : ''}`}
                          style={{ color: 'rgba(255,245,252,0.95)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                        >
                          {idealFree}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelect(profile); }}
                  className="relative z-[1] shrink-0 mx-1.5 mb-1 w-[calc(100%-0.75rem)] py-0.5 rounded-md text-[8px] sm:text-[9px] font-bold active:scale-95 transition-transform pointer-events-auto"
                  style={{
                    background: 'rgba(255,160,220,0.22)',
                    border: '1px solid rgba(255,160,220,0.5)',
                    color: '#ffd6f0',
                  }}
                >
                  {idealOverflow ? `프로필에서 전체 ${idealTagCount}개 보기 →` : '프로필 보기 →'}
                </button>
              </div>

            </div>
          </div>{/* /플립 존 */}

          {/* 전광판 — 사진 위에 겹침 (플립해도 유지, 카드 높이 불변) */}
          {showTopBar && (
            <div
              data-testid="profile-card-ticker-bar"
              className="absolute top-0 left-0 right-0 z-30 flex items-stretch min-h-[20px] pointer-events-auto"
              style={{
                background: 'linear-gradient(90deg,rgba(15,23,42,0.88) 0%,rgba(17,94,89,0.88) 100%)',
                borderBottom: '1px solid rgba(45,212,191,0.4)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={tickerBarRef}
                className="flex-1 min-w-0 overflow-hidden flex items-center px-1.5 py-0.5"
              >
                <span
                  ref={tickerSpanRef}
                  data-testid="profile-card-ticker-text"
                  data-ticker-active={tickerAnimActive ? '1' : '0'}
                  style={{
                    fontSize: '9px', fontWeight: 800,
                    color: '#ccfbf1', letterSpacing: '0.03em',
                    textShadow: '0 0 6px rgba(45,212,191,0.55)',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    flexShrink: 0,
                    ...(tickerAnimActive && tickerOffset > 0
                      ? {
                          ['--ticker-offset' as string]: `-${tickerOffset}px`,
                          animation: `ticker-scroll ${Math.max(4, Math.round(tickerOffset / 30) + 3)}s ease-in-out infinite`,
                        }
                      : tickerAnimActive
                        ? {
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            animation: 'ticker-flash 2.2s ease-in-out infinite',
                          }
                        : {
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            animation: 'none',
                          }
                    ),
                  }}
                >{statusMsg}</span>
              </div>
              {hasMenu && (
                <div className="shrink-0 flex items-center pr-0.5 pl-0.5">
                  {menuButton}
                </div>
              )}
            </div>
          )}

          {/* ⋯ — 전광판 없을 때만 사진 우상단 */}
          {hasMenu && !showTopBar && (
            <div className="absolute right-1 top-1 z-40" onClick={(e) => e.stopPropagation()}>
              {menuButton}
            </div>
          )}

          {/* 하단 닉·나이 바 (사진 위 겹침, 플립해도 항상 표시) — 다크 테마는 어두운 표면 */}
          {showBottomBar && (
            <div
              data-testid="profile-card-nick-bar"
              className="absolute bottom-0 left-0 right-0 z-30 flex items-center min-h-[20px] px-1.5 py-0.5 cursor-pointer pointer-events-auto"
              style={surfaces.nickBarStyle}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(profile);
              }}
            >
              <span className={`font-extrabold text-[10px] sm:text-[11px] truncate min-w-0 flex-1 leading-none ${surfaces.nickTextClass}`}>{profile.nickname}</span>
              {profile.birth_year != null && (
                <span className={`flex-shrink-0 text-[9px] sm:text-[10px] font-bold tabular-nums whitespace-nowrap ml-1 leading-none ${surfaces.ageTextClass}`}>{age}</span>
              )}
            </div>
          )}
      </div>{/* /3:4 사진 */}

      {/* ── 성향·MBTI·관심사 ── */}
      <div className={`relative z-10 shrink-0 min-w-0 px-1.5 pt-1.5 pb-0.5 cursor-pointer ${surfaces.metaClass}`}
        onClick={() => onSelect(profile)}>
        <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
          <span className="text-[8px] sm:text-[9px] font-extrabold px-1.5 py-0.5 rounded leading-none border min-w-0 max-w-[52%] truncate shadow-sm"
            style={profileCardChipStyle(posStyle, isCardDark)}>
            {posLabel}
          </span>
          {msStyle && (
            <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded leading-none border shrink-0 ml-auto max-w-[46%] truncate shadow-sm"
              style={profileCardChipStyle(msStyle, isCardDark)}>
              {profile.mbti}
            </span>
          )}
        </div>
        {interestTags.length > 0 && (
          <div className="flex items-stretch gap-1 min-w-0 mt-1">
            {interestTags.map((tag) => {
              const ist = getInterestTagStyle(tag);
              return (
                <span
                  key={tag}
                  className="flex-1 min-w-0 text-[9px] font-bold px-1 py-1 rounded-md leading-tight border truncate text-center shadow-sm"
                  style={profileCardChipStyle(ist, isCardDark)}
                  title={tag}
                >#{tag}</span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 하트 + 채팅 버튼 ── */}
      {canLike && (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {lockToast && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800/90 text-white shadow pointer-events-none">
              🔒 현재 잠금 중
            </div>
          )}
          <div className="shrink-0 px-1.5 pt-1 pb-1 flex gap-1" style={{ borderTop: `1px solid ${dividerColor}` }}>
            <button
              onClick={(e) => { if (locked) { showLockToast(e); return; } e.stopPropagation(); onLike(profile.id); }}
              disabled={!locked && isLiked && heartCount >= 4}
              className={`flex-1 min-w-0 flex items-center justify-center gap-0.5 py-0.5 rounded border active:scale-95 transition-transform ${locked ? 'opacity-50' : ''}`}
              style={heartBtnStyle}
            >
              {isLiked && sentHeartType
                ? <span className="text-[10px] leading-none relative shrink-0">
                    {heartMeta(sentHeartType).emoji}
                    {heartCount > 1 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 text-white text-[6px] font-black rounded-full flex items-center justify-center">{heartCount}</span>
                    )}
                  </span>
                : <Heart className="w-3 h-3 shrink-0" style={{ fill: isLiked ? '#e11d48' : 'transparent', stroke: '#e11d48', strokeWidth: 2 }} />
              }
              <span className="text-[9px] font-bold truncate" style={{ color: '#e11d48' }}>하트</span>
            </button>
            <button
              onClick={(e) => { if (locked) { showLockToast(e); return; } e.stopPropagation(); onOpenChat(profile); }}
              className={`flex-1 min-w-0 flex items-center justify-center gap-0.5 py-0.5 rounded border active:scale-95 transition-transform ${locked ? 'opacity-50' : ''}`}
              style={chatBtnStyle}
            >
              <MessageCircle className="w-3 h-3 shrink-0" style={{ color: '#0ea5e9' }} strokeWidth={2} />
              <span className="text-[9px] font-bold truncate" style={{ color: '#0ea5e9' }}>채팅</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
