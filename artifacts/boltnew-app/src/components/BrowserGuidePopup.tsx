import { Wifi, X } from 'lucide-react';

// ─── BrowserGuidePopup ────────────────────────────────────────────────────────
// 원활한 접속을 위한 안내 팝업 (시크릿 모드, 절전 모드 경고 등)

function BrowserGuidePopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-white text-base">원활한 접속을 위해</h3>
            <p className="text-white/80 text-xs mt-0.5">아래 사항을 확인해 주세요</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { icon: '🌐', title: '일반 모드로 접속하기', desc: '시크릿/인터넷 개인 정보 보호 모드에서는 저장 기능이 제한됩니다. 일반 모드로 접속해 주세요.' },
            { icon: '🔋', title: '절전 모드 해제', desc: 'iOS/안드로이드 절전 모드나 저전력 모드를 끄면 접속이 훨씬 안정적입니다.' },
            { icon: '📶', title: 'Wi-Fi 연결 권장', desc: '모바일 데이터보다 Wi-Fi를 사용하면 끊김 없이 이용할 수 있습니다.' },
            { icon: '🔄', title: '앱 전환 자제', desc: '앱을 백그라운드로 내리면 연결이 끊길 수 있습니다. 화면을 켜둬 주세요.' },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-black text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black rounded-2xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-200">
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}

export default BrowserGuidePopup;
