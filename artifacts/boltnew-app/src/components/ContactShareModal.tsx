import React, { useState } from 'react';
import { Heart, Lock, CheckCircle } from 'lucide-react';
import type { Profile } from '../types/app';
import ProfileAvatar from './ProfileAvatar';

export function ContactShareModal({
  liker, alreadyShared, myProfile, onSubmit, onClose,
}: {
  liker: Profile; alreadyShared: boolean; myProfile: Profile | null;
  onSubmit: (kakao: string, instagram: string, phone: string) => void;
  onClose: () => void;
}) {
  const [kakao, setKakao] = useState(myProfile?.kakao_id ?? '');
  const [instagram, setInstagram] = useState(myProfile?.instagram_id ?? '');
  const [phone, setPhone] = useState(myProfile?.phone_number ?? '');
  const [useKakao, setUseKakao] = useState(!!(myProfile?.kakao_id));
  const [useInstagram, setUseInstagram] = useState(!!(myProfile?.instagram_id));
  const [usePhone, setUsePhone] = useState(!!(myProfile?.phone_number));

  const isPrivate = myProfile?.contact_private ?? false;
  const canSubmit = !isPrivate && ((useKakao && kakao.trim()) || (useInstagram && instagram.trim()) || (usePhone && phone.trim()));

  if (alreadyShared) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          <CheckCircle className="w-12 h-12 text-teal-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">연락처 공유 완료</h3>
          <p className="text-sm text-gray-500 mb-5">{liker.nickname}님에게 연락처를 이미 공유했습니다.</p>
          <button onClick={onClose} className="w-full py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-600 transition-all">확인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={liker} size="md" rounded="xl" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-full mb-2">
            <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
            <span className="text-sm font-bold text-rose-700">{liker.nickname}님이 하트를 보냈습니다!</span>
          </div>
          <p className="text-sm text-gray-500">연락처를 공유하시겠습니까?</p>
        </div>

        {isPrivate ? (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-center mb-5">
            <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-600">연락처 비공개 설정됨</p>
            <p className="text-xs text-gray-400 mt-1">연락처 공유를 원하시면 프로필 설정에서 변경해 주세요.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-5">
            {myProfile?.kakao_id && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-yellow-200 bg-yellow-50">
                <input type="checkbox" checked={useKakao} onChange={e => setUseKakao(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                <span className="text-xs font-black text-yellow-700">K</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.kakao_id}</span>
              </label>
            )}
            {!myProfile?.kakao_id && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={useKakao} onChange={e => setUseKakao(e.target.checked)} className="w-4 h-4 rounded accent-yellow-400" />
                  <span className="text-sm font-semibold text-gray-700">카카오톡 ID</span>
                </label>
                {useKakao && (
                  <input type="text" value={kakao} onChange={e => setKakao(e.target.value)} placeholder="카카오톡 아이디 입력"
                    className="w-full px-3 py-2.5 border border-yellow-300 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none bg-yellow-50" />
                )}
              </div>
            )}
            {myProfile?.instagram_id && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-pink-200 bg-pink-50">
                <input type="checkbox" checked={useInstagram} onChange={e => setUseInstagram(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span className="text-xs font-black text-pink-500">@</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.instagram_id}</span>
              </label>
            )}
            {!myProfile?.instagram_id && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={useInstagram} onChange={e => setUseInstagram(e.target.checked)} className="w-4 h-4 rounded accent-pink-500" />
                  <span className="text-sm font-semibold text-gray-700">인스타그램</span>
                </label>
                {useInstagram && (
                  <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@인스타그램 아이디"
                    className="w-full px-3 py-2.5 border border-pink-300 rounded-xl text-sm focus:ring-2 focus:ring-pink-400 outline-none bg-pink-50" />
                )}
              </div>
            )}
            {myProfile?.phone_number && (
              <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl border-2 border-green-200 bg-green-50">
                <input type="checkbox" checked={usePhone} onChange={e => setUsePhone(e.target.checked)} className="w-4 h-4 accent-green-500" />
                <span className="text-xs font-black text-green-600">#</span>
                <span className="text-sm text-gray-700 flex-1">{myProfile.phone_number}</span>
              </label>
            )}
            {!myProfile?.phone_number && (
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                  <input type="checkbox" checked={usePhone} onChange={e => setUsePhone(e.target.checked)} className="w-4 h-4 rounded accent-green-500" />
                  <span className="text-sm font-semibold text-gray-700">전화번호</span>
                </label>
                {usePhone && (
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000"
                    className="w-full px-3 py-2.5 border border-green-300 rounded-xl text-sm focus:ring-2 focus:ring-green-400 outline-none bg-green-50" />
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all text-sm">
            나중에
          </button>
          {!isPrivate && (
            <button onClick={() => canSubmit && onSubmit(useKakao ? kakao : '', useInstagram ? instagram : '', usePhone ? phone : '')} disabled={!canSubmit}
              className="flex-1 py-3 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
              공유하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
