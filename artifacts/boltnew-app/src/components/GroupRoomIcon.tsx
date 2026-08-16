import { useId } from 'react';
import { groupRoomVisual } from '../lib/group-rooms';
import type { GroupChat } from '../types/app';

type GroupLike = Pick<GroupChat, 'id' | 'name' | 'interest_tag'> & {
  room_kind?: string | null;
};

/** Windows 10 cannot render 🪩 — neon disco-ball SVG so 2차 클럽 looks like a club. */
function ClubNeonIcon({ size, uid }: { size: number; uid: string }) {
  const bg = `${uid}-bg`;
  const ball = `${uid}-ball`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <defs>
        <linearGradient id={bg} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6d28d9" />
          <stop offset="0.55" stopColor="#db2777" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={ball} x1="10" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${bg})`} />
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <line x1="16" y1="4.5" x2="16" y2="7.5" stroke="#fde68a" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="13.2" r="6.4" fill={`url(#${ball})`} stroke="#e0e7ff" strokeWidth="0.6" />
      <path d="M16 6.8v12.8M10.4 13.2h11.2M12.2 9.2l7.6 8M19.8 9.2l-7.6 8" stroke="#5b21b6" strokeOpacity="0.45" strokeWidth="0.7" />
      <path d="M11.2 13.2a4.8 4.8 0 0 0 9.6 0" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" />
      <circle cx="6.5" cy="22.5" r="1.1" fill="#fde047" />
      <circle cx="25.5" cy="8.5" r="1" fill="#67e8f9" />
      <circle cx="24.8" cy="23.2" r="0.9" fill="#f9a8d4" />
      <rect x="8" y="24.2" width="2.2" height="4" rx="0.4" fill="#fde047" opacity="0.95" />
      <rect x="11.4" y="22.6" width="2.2" height="5.6" rx="0.4" fill="#22d3ee" opacity="0.95" />
      <rect x="14.8" y="23.4" width="2.2" height="4.8" rx="0.4" fill="#f472b6" opacity="0.95" />
      <rect x="18.2" y="21.8" width="2.2" height="6.4" rx="0.4" fill="#a78bfa" opacity="0.95" />
      <rect x="21.6" y="24" width="2.2" height="4.2" rx="0.4" fill="#67e8f9" opacity="0.95" />
    </svg>
  );
}

export function GroupRoomIcon({
  group,
  size = 24,
}: {
  group: GroupLike;
  size?: number;
}) {
  const visual = groupRoomVisual(group);
  const uid = useId().replace(/:/g, '');
  if (visual.glyph === 'club') {
    return <ClubNeonIcon size={size} uid={uid} />;
  }
  return (
    <span
      className="leading-none select-none"
      style={{ fontSize: Math.round(size * 0.72) }}
      aria-hidden="true"
    >
      {visual.emoji}
    </span>
  );
}
