import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GalleryHorizontalEnd, LayoutGrid, Users } from 'lucide-react';
import type { Profile, UserSignal } from '../types/app';
import type { HeartType } from '../lib/constants';
import { ProfileCard } from './ProfileCard';
import { profileGridClassName, type ProfileCardGridMode } from '../lib/profile-card-grid';
import { CAROUSEL_LOAD_CHUNK, carouselDotIndices, clampCarouselIndex, nextCarouselVisibleCount } from '../lib/profile-carousel';
import { hasProfileFortuneCompatData } from '../lib/profile';

/** Keeps large events fast by rendering profiles in batches. */
const DECK_RENDER_CHUNK = CAROUSEL_LOAD_CHUNK;

/**
 * Default remains the existing BINPC2 grid. Carousel is an optional
 * presentation-only view: no changes to heart/chat/account rules.
 */
export const ProfileDeckGrid = memo(function ProfileDeckGrid({
  deckProfiles, profileCardGrid, profileGridColSpanClass, profileSearch, darkMode,
  likedIds, sentHeartTypes, sentHeartsPerPerson, currentUserId, functionsLocked,
  heartsLocked, heartsEnabled = true, directChatEnabled = true, signalByUserId,
  onLike, onSelect, onViewProfile, onOpenChat, onBlock,
  onContactShareOpen, onViewFortune,
}: {
  deckProfiles: Profile[];
  profileCardGrid: ProfileCardGridMode;
  profileGridColSpanClass: string;
  profileSearch: string;
  darkMode: boolean;
  likedIds: Set<string>;
  sentHeartTypes: Map<string, HeartType>;
  sentHeartsPerPerson: Map<string, Set<HeartType>>;
  currentUserId: string | null;
  functionsLocked: boolean;
  heartsLocked?: boolean;
  heartsEnabled?: boolean;
  directChatEnabled?: boolean;
  signalByUserId: Map<string, UserSignal>;
  onLike: (id: string, hint?: Profile) => void;
  onSelect: (p: Profile) => void;
  onViewProfile?: (p: Profile) => void;
  onOpenChat: (p: Profile) => void;
  onBlock?: (targetId: string, type: 'block' | 'hide') => void;
  onContactShareOpen: (profile: Profile) => void;
  onViewFortune?: (p: Profile) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(DECK_RENDER_CHUNK);
  const [carouselMode, setCarouselMode] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const deckKey = profileSearch + '\0' + deckProfiles.length + '\0' + (deckProfiles[0]?.id ?? '');

  useEffect(() => {
    setVisibleCount(DECK_RENDER_CHUNK);
    setCarouselIndex(0);
    if (carouselRef.current) carouselRef.current.scrollLeft = 0;
  }, [deckKey]);

  useEffect(() => {
    if (carouselMode) return;
    const el = sentinelRef.current;
    if (!el || visibleCount >= deckProfiles.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + DECK_RENDER_CHUNK, deckProfiles.length));
        }
      },
      { rootMargin: '480px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [carouselMode, deckProfiles.length, visibleCount]);

  useEffect(() => {
    if (!carouselMode || pendingScrollIndexRef.current === null) return;
    const el = carouselRef.current;
    const cards = el?.querySelectorAll<HTMLElement>('[data-profile-carousel-card]');
    const target = cards?.[Math.min(pendingScrollIndexRef.current, cards.length - 1)];
    const first = cards?.[0];
    if (!el || !target || !first) return;
    const left = Math.max(0, target.offsetLeft - first.offsetLeft);
    pendingScrollIndexRef.current = null;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ left, behavior: 'smooth' });
    } else {
      el.scrollLeft = left;
    }
  }, [carouselMode, carouselIndex, visibleCount]);

  const visibleProfiles = deckProfiles.slice(0, visibleCount);
  const hasMore = visibleCount < deckProfiles.length;
  const total = deckProfiles.length;
  function goTo(index: number) {
    const target = clampCarouselIndex(index, total);
    pendingScrollIndexRef.current = target;
    setVisibleCount((current) => nextCarouselVisibleCount(target, current, total));
    setCarouselIndex(target);
  }
  function onScroll() {
    const track = carouselRef.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-profile-carousel-card]'));
    if (!cards.length) return;
    const first = cards[0].offsetLeft;
    let next = 0;
    let distance = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const current = Math.abs(cards[i].offsetLeft - first - track.scrollLeft);
      if (current < distance) { distance = current; next = i; }
    }
    setCarouselIndex((prior) => prior === next ? prior : next);
    if (hasMore && track.scrollLeft + track.clientWidth >= track.scrollWidth - track.clientWidth) {
      setVisibleCount((prior) => nextCarouselVisibleCount(prior - 1, prior, total));
    }
  }

  return (
    <div className="-mx-3 min-[360px]:-mx-4 px-3 min-[360px]:px-4 overflow-visible">
      {total > 1 && (
        <div className="flex justify-end items-center mb-2">
          <button
            type="button"
            data-testid="participant-carousel-switch"
            aria-pressed={carouselMode}
            aria-label={carouselMode ? '기존 그리드 보기로 돌아가기' : '참가자 카드를 옆으로 넘겨서 보기'}
            onClick={() => {
              pendingScrollIndexRef.current = null;
              if (carouselRef.current) carouselRef.current.scrollLeft = 0;
              setCarouselMode((current) => !current); setCarouselIndex(0);
            }}
            className={'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-teal-500 ' +
              (darkMode ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-teal-50')}
          >
            {carouselMode ? <LayoutGrid className="w-4 h-4" aria-hidden /> :
              <GalleryHorizontalEnd className="w-4 h-4" aria-hidden />}
            {carouselMode ? '기본 카드 목록' : '카드 슬라이드'}
          </button>
        </div>
      )}
      <div
        ref={carouselRef}
        data-testid={carouselMode ? 'participant-carousel-track' : 'participant-grid'}
        aria-label={carouselMode ? '참가자 프로필 가로 슬라이드' : undefined}
        aria-roledescription={carouselMode ? 'carousel' : undefined}
        tabIndex={carouselMode ? 0 : undefined}
        onKeyDown={carouselMode ? (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(carouselIndex - 1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); goTo(carouselIndex + 1); }
        } : undefined}
        onScroll={carouselMode ? onScroll : undefined}
        className={carouselMode
          ? 'relative flex items-start gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-3 scrollbar-hide motion-safe:scroll-smooth motion-reduce:scroll-auto'
          : profileGridClassName(profileCardGrid)}
      >
        {visibleProfiles.map((profile) => {
          const signal = signalByUserId.get(profile.id);
          const card = (
            <ProfileCard
              profile={profile}
              compact={carouselMode ? false : profileCardGrid === 'compact'}
              darkMode={darkMode}
              isLiked={likedIds.has(profile.id)}
              sentHeartType={sentHeartTypes.get(profile.id)}
              heartCount={sentHeartsPerPerson.get(profile.id)?.size ?? 0}
              canLike={!!(currentUserId && profile.id !== currentUserId)}
              locked={functionsLocked}
              heartsLocked={heartsLocked ?? functionsLocked}
              heartsEnabled={heartsEnabled}
              directChatEnabled={directChatEnabled}
              onLike={onLike}
              onSelect={onSelect}
              onView={onViewProfile}
              onOpenChat={onOpenChat}
              onBlock={onBlock}
              onContactShare={onContactShareOpen}
              onViewFortune={onViewFortune && hasProfileFortuneCompatData(profile)
                ? onViewFortune
                : undefined}
              idealMsg={signal?.ideal_msg}
              statusMsg={signal?.status_msg}
            />
          );
          return carouselMode ? (
            <div key={profile.id} data-profile-carousel-card
              className="relative min-w-0 shrink-0 snap-start w-[80%] min-[460px]:w-[62%] sm:w-[45%] lg:w-[31%]">
              {card}
            </div>
          ) : <Fragment key={profile.id}>{card}</Fragment>;
        })}
        {total === 0 && (
          <div className={profileGridColSpanClass + ' text-center py-20'}>
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{profileSearch ? '검색 결과가 없습니다.' : '아직 다른 참가자가 없습니다.'}</p>
          </div>
        )}
      </div>
      {carouselMode && total > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <button type="button" data-testid="participant-carousel-prev"
            aria-label="이전 참가자 카드" disabled={carouselIndex <= 0}
            onClick={() => goTo(carouselIndex - 1)}
            className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-30 ' +
              (darkMode ? 'bg-slate-800 border-slate-600 text-slate-100'
                : 'bg-white border-gray-200 text-teal-700')}>
            <ChevronLeft className="w-5 h-5" aria-hidden />
          </button>
          <div className="flex items-center justify-center gap-1" role="group" aria-label="참가자 카드 페이지 선택">
            {carouselDotIndices(carouselIndex, total).map((index) => (
              <button key={index} type="button"
                aria-label={String(index + 1) + '번째 참가자 카드'}
                aria-current={carouselIndex === index ? 'true' : undefined}
                onClick={() => goTo(index)}
                className="flex h-10 w-9 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-teal-600">
                <span className={'h-2 w-2 rounded-full transition-colors ' +
                  (carouselIndex === index ? 'bg-teal-500' : 'bg-gray-300')} />
              </button>
            ))}
          </div>
          <button type="button" data-testid="participant-carousel-next"
            aria-label="다음 참가자 카드" disabled={carouselIndex >= total - 1}
            onClick={() => goTo(carouselIndex + 1)}
            className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-30 ' +
              (darkMode ? 'bg-slate-800 border-slate-600 text-slate-100'
                : 'bg-white border-gray-200 text-teal-700')}>
            <ChevronRight className="w-5 h-5" aria-hidden />
          </button>
          <span className={'w-full text-center text-[11px] tabular-nums ' +
            (darkMode ? 'text-slate-300' : 'text-gray-500')}
            aria-live="polite" data-testid="participant-carousel-counter">
            {carouselIndex + 1} / {total} · 모바일에서는 좌우로 밀어 넘기세요
          </span>
        </div>
      )}
      {!carouselMode && hasMore && (
        <div ref={sentinelRef} className="py-6 text-center text-[11px] text-gray-400" aria-hidden>
          더 불러오는 중… ({visibleCount}/{total})
        </div>
      )}
    </div>
  );
});
