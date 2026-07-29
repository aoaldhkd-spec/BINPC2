import { Phone, MessageCircle, Instagram } from 'lucide-react';

interface ContactProfile {
  nickname?: string | null;
  kakao_id?: string | null;
  instagram_id?: string | null;
  phone_number?: string | null;
  contact_private?: boolean | null;
}

export function ContactDisplayModal({ profile, onClose }: { profile: ContactProfile; onClose: () => void }) {
  const hasContact = profile.kakao_id || profile.instagram_id || profile.phone_number;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-5 pt-5 pb-6 text-center">
          <div className="text-5xl mb-2 select-none">📱</div>
          <h2 className="text-white font-black text-xl tracking-tight">{profile.nickname ?? '내 연락처'}</h2>
          <p className="text-violet-200 text-xs mt-1 font-semibold">연락처를 주고 싶은 사람에게<br />이 화면을 보여주세요 💜</p>
        </div>

        {/* 내용 */}
        <div className="p-5">
          {profile.contact_private ? (
            <div className="text-center py-5">
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-sm font-bold text-gray-600">연락처 비공개 설정 중</p>
              <p className="text-xs text-gray-400 mt-1">내 상태 탭 → 연락처 설정에서<br />공개로 바꿀 수 있어요</p>
            </div>
          ) : !hasContact ? (
            <div className="text-center py-5">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm font-bold text-gray-600">등록된 연락처가 없어요</p>
              <p className="text-xs text-gray-400 mt-1">내 상태 탭 → 연락처 설정에서<br />카카오·인스타·전화번호를 추가하세요</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {profile.phone_number && (
                <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-2xl border border-violet-200">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">전화번호</p>
                    <p className="text-sm font-black text-gray-800">{profile.phone_number}</p>
                  </div>
                </div>
              )}
              {profile.kakao_id && (
                <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-2xl border border-yellow-200">
                  <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">카카오톡</p>
                    <p className="text-sm font-black text-gray-800">{profile.kakao_id}</p>
                  </div>
                </div>
              )}
              {profile.instagram_id && (
                <div className="flex items-center gap-3 p-3 bg-pink-50 rounded-2xl border border-pink-200">
                  <div className="w-8 h-8 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
                    <Instagram className="w-4 h-4 text-pink-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest">인스타그램</p>
                    <p className="text-sm font-black text-gray-800">@{profile.instagram_id}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full mt-4 py-3 text-white font-black rounded-2xl text-sm"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
