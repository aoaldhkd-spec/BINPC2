import { getPositionBg, getPositionLabel } from '../lib/profile';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

const SIZE_MAP = {
  xs:  { outer: 'w-8 h-8',   label: 'text-[7px]',  mbti: 'text-[6px]'  },
  sm:  { outer: 'w-10 h-10', label: 'text-[8px]',  mbti: 'text-[7px]'  },
  md:  { outer: 'w-14 h-14', label: 'text-[9px]',  mbti: 'text-[8px]'  },
  lg:  { outer: 'w-20 h-20', label: 'text-[11px]', mbti: 'text-[9px]'  },
  xl:  { outer: 'w-28 h-28', label: 'text-sm',     mbti: 'text-xs'     },
  '2xl':{ outer: 'w-36 h-36', label: 'text-base',   mbti: 'text-sm'     },
};

interface Props {
  profile: Pick<Profile, 'personality_score' | 'mbti' | 'nickname'>;
  size?: keyof typeof SIZE_MAP;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

export default function ProfileAvatar({ profile, size = 'md', rounded = 'xl', className = '' }: Props) {
  const score = profile.personality_score ?? 50;
  const bg    = getPositionBg(score);
  const label = getPositionLabel(score);
  const s     = SIZE_MAP[size];

  return (
    <div
      className={`${s.outer} rounded-${rounded} overflow-hidden flex-shrink-0 relative ${className}`}
      style={{ backgroundColor: bg }}
    >
      {/* 사람 실루엣만 — 텍스트 일절 없음 */}
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <circle cx="50" cy="38" r="22" fill="rgba(255,255,255,0.28)" />
        <ellipse cx="50" cy="94" rx="34" ry="24" fill="rgba(255,255,255,0.28)" />
      </svg>
    </div>
  );
}
