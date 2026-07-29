import { X, Phone, MessageCircle, Instagram } from 'lucide-react';
import type { Profile } from '../types/app';

interface Props {
  profile: Profile;
  onClose: () => void;
  onOpenChat?: () => void;
  darkMode?: boolean;
}

export function ContactRevealModal({ profile, onClose, onOpenChat, darkMode }: Props) {
  const kakao = (profile as { kakao_id?: string | null }).kakao_id;
  const instagram = (profile as { instagram_id?: string | null }).instagram_id;
  const phone = (profile as { phone_number?: string | null }).phone_number;
  const contactPrivate = (profile as { contact_private?: boolean | null }).contact_private;

  const hasContact = !contactPrivate && (kakao || instagram || phone);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
        {/* 헤더 */}
        <div className={`px-6 pt-6 pb-4 text-center relative ${darkMode ? '' : ''}`}>
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-full transition-all ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
          {/* 아바타 */}
          {profile.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.nickname}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-4 border-teal-400 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-teal-500 flex items-center justify-center text-3xl font-black text-white shadow-lg">
              {profile.nickname?.[0] ?? '?'}
            </div>
          )}
          <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {profile.nickname}
          </h2>
          {profile.mbti && (
            <span className="mt-1 inline-block px-2.5 py-0.5 bg-teal-500/20 border border-teal-500/40 text-teal-400 text-xs font-bold rounded-lg">
              {profile.mbti}
            </span>
          )}
          <p className={`mt-2 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            📷 연락처 QR 스캔 완료
          </p>
        </div>

        {/* 연락처 영역 */}
        <div className="px-6 pb-6 space-y-3">
          {contactPrivate ? (
            <div className={`rounded-2xl p-4 text-center ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gray-50 border border-gray-200'}`}>
              <p className="text-2xl mb-1">🔒</p>
              <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>연락처를 비공개로 설정했어요</p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>채팅으로 연락처를 요청해 보세요</p>
            </div>
          ) : !hasContact ? (
            <div className={`rounded-2xl p-4 text-center ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gray-50 border border-gray-200'}`}>
              <p className="text-2xl mb-1">📭</p>
              <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>아직 연락처를 등록하지 않았어요</p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>채팅으로 직접 연락해 보세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {kakao && (
                <button
                  onClick={() => copyText(kakao)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${darkMode ? 'bg-yellow-400/10 border-yellow-400/30 hover:bg-yellow-400/20' : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-yellow-400 flex items-center justify-center font-black text-black text-sm flex-shrink-0">K</div>
                  <div className="flex-1 text-left">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-yellow-500' : 'text-yellow-600'}`}>카카오톡</p>
                    <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{kakao}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>탭하여 복사</span>
                </button>
              )}
              {instagram && (
                <button
                  onClick={() => copyText(instagram)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${darkMode ? 'bg-pink-500/10 border-pink-500/30 hover:bg-pink-500/20' : 'bg-pink-50 border-pink-200 hover:bg-pink-100'}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-pink-400' : 'text-pink-600'}`}>인스타그램</p>
                    <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>@{instagram}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>탭하여 복사</span>
                </button>
              )}
              {phone && (
                <button
                  onClick={() => copyText(phone)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${darkMode ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' : 'bg-green-50 border-green-200 hover:bg-green-100'}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-green-400' : 'text-green-600'}`}>전화번호</p>
                    <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{phone}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>탭하여 복사</span>
                </button>
              )}
            </div>
          )}

          {/* 채팅 버튼 */}
          {onOpenChat && (
            <button
              onClick={onOpenChat}
              className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-2xl text-sm active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              채팅방 열기
            </button>
          )}
          <button
            onClick={onClose}
            className={`w-full py-2.5 font-semibold rounded-2xl text-sm transition-all ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
