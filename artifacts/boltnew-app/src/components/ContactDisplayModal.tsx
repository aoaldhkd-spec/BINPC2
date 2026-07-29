import { useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Instagram, Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';

interface ContactProfile {
  id: string;
  nickname?: string | null;
  kakao_id?: string | null;
  instagram_id?: string | null;
  phone_number?: string | null;
  contact_private?: boolean | null;
}

export function ContactDisplayModal({ profile, onClose }: { profile: ContactProfile; onClose: () => void }) {
  const hasContact = profile.kakao_id || profile.instagram_id || profile.phone_number;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const largeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `PROFID:${profile.id}`, {
      width: 160, margin: 2, color: { dark: '#5b21b6', light: '#ffffff' },
    });
  }, [profile.id]);

  useEffect(() => {
    if (!expanded || !largeCanvasRef.current) return;
    QRCode.toCanvas(largeCanvasRef.current, `PROFID:${profile.id}`, {
      width: Math.min(window.innerWidth - 80, 280), margin: 2, color: { dark: '#5b21b6', light: '#ffffff' },
    });
  }, [expanded, profile.id]);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* 헤더 */}
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-5 pt-4 pb-4 text-center">
            <h2 className="text-white font-black text-lg tracking-tight">{profile.nickname ?? '내 연락처'}</h2>
            <p className="text-violet-200 text-xs mt-0.5 font-semibold">연락처를 주고 싶은 사람에게 이 화면을 보여주세요 💜</p>
          </div>

          <div className="p-4">
            {/* QR 코드 */}
            <button
              className="w-full relative flex justify-center mb-3 p-3 bg-violet-50 rounded-2xl border-2 border-dashed border-violet-300 hover:border-violet-500 active:scale-95 transition-all group"
              onClick={() => setExpanded(true)}
            >
              <canvas ref={canvasRef} className="rounded-lg" />
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 group-hover:bg-black/10 transition-all">
                <div className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-2 py-1 shadow text-[10px] font-bold text-gray-700 flex items-center gap-1 transition-all">
                  <Maximize2 className="w-3 h-3" /> 확대
                </div>
              </div>
            </button>
            <p className="text-[10px] text-center text-gray-400 mb-3">QR 탭하면 확대됩니다</p>

            {/* 연락처 정보 */}
            {profile.contact_private ? (
              <div className="text-center py-3">
                <p className="text-sm font-bold text-gray-500">🔒 연락처 비공개 설정 중</p>
                <p className="text-xs text-gray-400 mt-1">내 상태 탭 → 연락처 설정에서 공개로 변경 가능</p>
              </div>
            ) : !hasContact ? (
              <div className="text-center py-3">
                <p className="text-sm font-bold text-gray-500">📭 등록된 연락처가 없어요</p>
                <p className="text-xs text-gray-400 mt-1">내 상태 탭 → 연락처 설정에서 추가하세요</p>
              </div>
            ) : (
              <div className="space-y-2">
                {profile.phone_number && (
                  <div className="flex items-center gap-2.5 p-2.5 bg-violet-50 rounded-xl border border-violet-200">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-3.5 h-3.5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">전화번호</p>
                      <p className="text-sm font-black text-gray-800">{profile.phone_number}</p>
                    </div>
                  </div>
                )}
                {profile.kakao_id && (
                  <div className="flex items-center gap-2.5 p-2.5 bg-yellow-50 rounded-xl border border-yellow-200">
                    <div className="w-7 h-7 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-3.5 h-3.5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">카카오톡</p>
                      <p className="text-sm font-black text-gray-800">{profile.kakao_id}</p>
                    </div>
                  </div>
                )}
                {profile.instagram_id && (
                  <div className="flex items-center gap-2.5 p-2.5 bg-pink-50 rounded-xl border border-pink-200">
                    <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <Instagram className="w-3.5 h-3.5 text-pink-500" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-pink-400 uppercase tracking-widest">인스타그램</p>
                      <p className="text-sm font-black text-gray-800">@{profile.instagram_id}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full mt-3 py-2.5 text-white font-black rounded-xl text-sm"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}
            >확인</button>
          </div>
        </div>
      </div>

      {/* 확대 QR */}
      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setExpanded(false)}>
          <p className="text-white text-sm font-bold mb-4 opacity-70">탭하면 닫힙니다</p>
          <div className="rounded-3xl p-4 shadow-2xl bg-white" onClick={e => e.stopPropagation()}>
            <canvas ref={largeCanvasRef} className="rounded-xl block" />
          </div>
          <button onClick={() => setExpanded(false)} className="mt-4 px-6 py-2.5 bg-white/20 rounded-full text-white font-bold text-sm">닫기</button>
        </div>
      )}
    </>
  );
}
