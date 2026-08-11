import React from 'react';
import type { Profile } from '../types/app';
import { MBTI_COLORS, domSubLabel } from '../lib/utils';
import { getPositionLabel, getPositionStyle, getKoreanAge } from '../lib/profile';
import { getZodiac } from '../lib/fortune';

export function ProfileInfoBadges({ profile }: { profile: Profile }) {
  const age = getKoreanAge(profile.birth_year);
  const ds = domSubLabel(profile.dom_sub_score ?? null);
  // interests(초기설정 배열) 또는 bio(이후 편집 문자열) 중 값이 있는 쪽을 사용
  const rawInterests = profile.interests || profile.bio;
  const interests = Array.isArray(rawInterests)
    ? rawInterests.filter(Boolean).slice(0, 4)
    : rawInterests ? String(rawInterests).split(/[,，、\s]+/).filter(Boolean).slice(0, 4) : [];

  const posLabel = getPositionLabel(profile.personality_score ?? 50);
  const posStyle = getPositionStyle(profile.personality_score ?? 50);

  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
      {profile.mbti && (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${MBTI_COLORS[profile.mbti] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {profile.mbti}
        </span>
      )}
      {profile.birth_year && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
          {age}
        </span>
      )}
      {profile.birth_year && profile.birth_month && profile.birth_day && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-100" title="띠">
          {getZodiac(profile.birth_year).emoji}{getZodiac(profile.birth_year).name}
        </span>
      )}
      {profile.location && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
          {profile.location}
        </span>
      )}
      {!profile.hide_personality && profile.personality_score !== null && profile.personality_score !== undefined && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold border" style={{ backgroundColor: posStyle.bg, color: posStyle.text, borderColor: posStyle.border }}>
          {posLabel}
        </span>
      )}
      {!profile.hide_personality && ds && (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${ds.color}`}>
          {ds.label}
        </span>
      )}
      {interests.map((it, i) => (
        <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100">
          {it}
        </span>
      ))}
    </div>
  );
}
