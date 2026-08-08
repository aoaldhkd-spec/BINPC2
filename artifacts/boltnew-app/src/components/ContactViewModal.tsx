import React, { useState, useEffect, useRef } from 'react';
import { Copy, CheckCircle, Phone } from 'lucide-react';
import type { ContactShare, Profile } from '../types/app';
import ProfileAvatar from './ProfileAvatar';

export function ContactViewModal({
  share, likedProfile, onClose,
}: {
  share: ContactShare; likedProfile: Profile; onClose: () => void;
}) {
  const hasAny = share.kakao || share.instagram || share.phone;
  const [copied, setCopied] = useState<string | null>(null);
  // 언마운트 후 setState 호출 방지용 타이머 ref
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      (window as unknown as Record<string, unknown>).__clipboardActive = true;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(label);
      copyTimerRef.current = setTimeout(() => { setCopied(null); (window as unknown as Record<string, unknown>).__clipboardActive = false; }, 1800);
    } catch {
      setCopied('복사 실패');
      copyTimerRef.current = setTimeout(() => { setCopied(null); (window as unknown as Record<string, unknown>).__clipboardActive = false; }, 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3">
            <ProfileAvatar profile={likedProfile} size="md" rounded="xl" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{likedProfile.nickname}</h3>
          <p className="text-xs text-teal-600 font-semibold mt-1">연락처를 공유했습니다!</p>
          <p className="text-[11px] text-gray-400 mt-1">항목을 확인하고 복사 버튼을 눌러 저장하세요</p>
        </div>
        {hasAny ? (
          <div className="space-y-2.5 mb-5">
            {share.kakao && (
              <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 rounded-xl border border-yellow-200">
                <span className="text-yellow-600 font-black text-base w-6 text-center">K</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-yellow-600 font-medium">카카오톡</p>
                  <p className="text-sm font-bold text-gray-800 break-all">{share.kakao}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.kakao!, '카카오톡 ID')}
                  className="flex-shrink-0 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
            {share.instagram && (
              <div className="flex items-center gap-3 px-4 py-3 bg-pink-50 rounded-xl border border-pink-200">
                <span className="text-pink-500 font-black text-base w-6 text-center">@</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-pink-600 font-medium">인스타그램</p>
                  <p className="text-sm font-bold text-gray-800 break-all">{share.instagram}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.instagram!, '인스타그램 아이디')}
                  className="flex-shrink-0 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
            {share.phone && (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 rounded-xl border border-green-200">
                <Phone className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-600 font-medium">전화번호</p>
                  <p className="text-sm font-bold text-gray-800 break-all">{share.phone}</p>
                </div>
                <button type="button" onClick={() => copyToClipboard(share.phone!, '전화번호')}
                  className="flex-shrink-0 px-3 py-1.5 bg-green-500 hover:bg-green-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" />복사
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-400 text-sm mb-5">공유된 연락처가 없습니다.</p>
        )}
        <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-xl hover:from-cyan-600 hover:to-teal-600 transition-all">
          확인
        </button>
      </div>
      {copied && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-slate-900/95 text-white text-sm font-semibold rounded-full shadow-2xl flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
          <CheckCircle className="w-4 h-4 text-teal-400" />
          {copied === '복사 실패' ? copied : `${copied} 복사됨`}
        </div>
      )}
    </div>
  );
}
