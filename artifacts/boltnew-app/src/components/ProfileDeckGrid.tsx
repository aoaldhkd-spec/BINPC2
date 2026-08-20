import { memo } from 'react';
import { Users } from 'lucide-react';
import type { Profile, UserSignal } from '../types/app';
import type { HeartType } from '../lib/constants';
import { ProfileCard } from './ProfileCard';
import { profileGridClassName, type ProfileCardGridMode } from '../lib/profile-card-grid';

/** 참여자 카드 그리드 — MainScreen 상태(검색·MY·채팅 뱃지) 변경과 분리해 불필요한 카드 재렌더 감소 */
export const ProfileDeckGrid = memo(function ProfileDeckGrid({
  deckProfiles,
  profileCardGrid,
  profileGridColSpanClass,
  profileSearch,
  darkMode,
  likedIds,
  sentHeartTypes,
  sentHeartsPerPerson,
  currentUserId,
  functionsLocked,
  signalByUserId,
  onLike,
  onSelect,
  onViewProfile,
  onOpenChat,
  onBlock,
  onContactShareOpen,
  onViewFortune,
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
  signalByUserId: Map<string, UserSignal>;
  onLike: (id: string) => void;
  onSelect: (p: Profile) => void;
  onViewProfile?: (p: Profile) => void;
  onOpenChat: (p: Profile) => void;
  onBlock?: (targetId: string, type: 'block' | 'hide') => void;
  onContactShareOpen: (profile: Profile) => void;
  onViewFortune?: (p: Profile) => void;
}) {
  return (
    <div className="-mx-3 min-[360px]:-mx-4 px-3 min-[360px]:px-4">
      <div className={profileGridClassName(profileCardGrid)}>
        {deckProfiles.map((profile) => {
          const signal = signalByUserId.get(profile.id);
          return (
            <ProfileCard
              key={profile.id}
              profile={profile}
              compact={profileCardGrid === 'compact'}
              darkMode={darkMode}
              isLiked={likedIds.has(profile.id)}
              sentHeartType={sentHeartTypes.get(profile.id)}
              heartCount={sentHeartsPerPerson.get(profile.id)?.size ?? 0}
              canLike={!!(currentUserId && profile.id !== currentUserId)}
              locked={functionsLocked}
              onLike={onLike}
              onSelect={onSelect}
              onView={onViewProfile}
              onOpenChat={onOpenChat}
              onBlock={onBlock}
              onContactShare={onContactShareOpen}
              onViewFortune={onViewFortune}
              idealMsg={signal?.ideal_msg}
              statusMsg={signal?.status_msg}
            />
          );
        })}
        {deckProfiles.length === 0 && (
          <div className={`${profileGridColSpanClass} text-center py-20`}>
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{profileSearch ? '검색 결과가 없습니다.' : '아직 다른 참가자가 없습니다.'}</p>
          </div>
        )}
      </div>
    </div>
  );
});
