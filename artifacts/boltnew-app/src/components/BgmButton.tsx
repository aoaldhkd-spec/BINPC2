import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useTheme } from '../lib/theme';
import * as bgm from '../lib/bgm';
import { BGM_TRACKS, type BgmTrackId } from '../lib/bgm';

// 메인 앱 마운트 시 배경음악 시작 (WaitingOverlay 언마운트 이후)
let _bgmStarted = false;

export function BgmButton() {
  const { theme } = useTheme();
  const isY2k = theme === 'y2k';
  const isMinimal = theme === 'minimal';
  const isNeon = theme === 'dark-neon';

  const [open, setOpen] = useState(false);
  const [trackId, setTrackId] = useState<BgmTrackId>(() => bgm.getTrackId());
  const [vol, setVol] = useState(() => bgm.getVolume());
  const [muted, setMuted] = useState(() => bgm.getMuted());
  const wrapRef = useRef<HTMLDivElement>(null);

  // 메인 앱 진입 시 배경음악 시작 (한 번만)
  useEffect(() => {
    if (!_bgmStarted) {
      _bgmStarted = true;
      bgm.play();
    }
    return () => { bgm.pause(); _bgmStarted = false; };
  }, []);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const handleTrack = (id: BgmTrackId) => {
    bgm.setTrack(id);
    setTrackId(id);
  };

  const handleVol = (v: number) => {
    bgm.setVolume(v);
    setVol(v);
    setMuted(v === 0);
  };

  const current = BGM_TRACKS.find(t => t.id === trackId) ?? BGM_TRACKS[0];

  // ── 테마별 스타일 (ThemeSwitcher와 동일한 팔레트) ──────────────────────────
  const fabStyle: React.CSSProperties = isY2k ? {
    background: '#a5f3fc', color: '#18181b', border: '2px solid #18181b',
    borderRadius: '0', padding: '7px 14px 7px 10px',
    boxShadow: '2px 2px 0px 0px #18181b',
    fontSize: '12px', fontWeight: 800,
  } : isMinimal ? {
    background: '#09090b', color: '#F9F8F6', border: '2px solid #09090b',
    borderRadius: '0', padding: '7px 14px 7px 10px',
    fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
  } : isNeon ? {
    background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff',
    border: '1.5px solid #f472b6', borderRadius: '9999px', padding: '7px 14px 7px 10px',
    boxShadow: '0 0 16px rgba(236,72,153,0.55), 0 2px 8px rgba(0,0,0,0.3)',
    fontSize: '12px', fontWeight: 800,
  } : {
    background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#5eead4',
    border: '1.5px solid #14b8a6', borderRadius: '9999px', padding: '7px 14px 7px 10px',
    boxShadow: '0 0 16px rgba(20,184,166,0.45), 0 2px 8px rgba(0,0,0,0.3)',
    fontSize: '12px', fontWeight: 800,
  };

  const panelBg    = isY2k || isMinimal ? '#fff'    : isNeon ? '#09090b' : '#0f172a';
  const panelBdr   = isY2k || isMinimal ? '#18181b' : isNeon ? 'rgba(236,72,153,0.35)' : 'rgba(20,184,166,0.3)';
  const headerBg   = isY2k || isMinimal ? '#f4f4f5' : isNeon ? 'rgba(236,72,153,0.08)' : 'rgba(20,184,166,0.08)';
  const headerText = isY2k || isMinimal ? '#18181b' : isNeon ? '#f472b6' : '#5eead4';
  const textColor  = isY2k || isMinimal ? '#18181b' : '#e2e8f0';
  const subColor   = isY2k || isMinimal ? '#71717a' : '#64748b';
  const activeAccent = isNeon ? '#f472b6' : isY2k ? '#059669' : '#14b8a6';
  const sliderAccent = isNeon ? '#f472b6' : isY2k ? '#059669' : '#14b8a6';

  return (
    <div ref={wrapRef}>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-[9996]" onClick={() => setOpen(false)} />}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-[7.5rem] left-3 z-[9997] w-64 overflow-hidden"
          style={{
            background: panelBg,
            border: `${isY2k || isMinimal ? '2px' : '1px'} solid ${panelBdr}`,
            borderRadius: isMinimal ? '0' : '1rem',
            boxShadow: isY2k ? '4px 4px 0px 0px #18181b' : isMinimal ? 'none' : `0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px ${panelBdr}`,
          }}
        >
          {/* Header */}
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: headerBg, borderBottom: `1px solid ${panelBdr}40` }}>
            <span style={{ fontSize: '13px' }}>{current.emoji}</span>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: headerText }}>배경음악</p>
          </div>

          {/* Track list */}
          <div className="p-1.5 space-y-0.5">
            {BGM_TRACKS.map(t => {
              const active = trackId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTrack(t.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-100"
                  style={{
                    background: active ? `${activeAccent}22` : 'transparent',
                    borderRadius: isMinimal ? '0' : '0.625rem',
                    border: active && isY2k ? '1px solid #18181b' : '1px solid transparent',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{t.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: active ? activeAccent : textColor }}>{t.label}</p>
                    <p className="text-[10px] leading-tight mt-0.5" style={{ color: subColor }}>{t.desc}</p>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: activeAccent }} />}
                </button>
              );
            })}
          </div>

          {/* Volume slider */}
          <div className="px-4 py-3" style={{ borderTop: `1px solid ${panelBdr}40` }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: headerText }}>볼륨</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={muted ? 0 : vol}
                onChange={e => handleVol(parseFloat(e.target.value))}
                className="flex-1 cursor-pointer"
                style={{ accentColor: sliderAccent }}
              />
              <span className="text-[10px] font-black w-8 text-right" style={{ color: subColor }}>
                {muted ? '🔇' : `${Math.round(vol * 100)}%`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FAB — 테마 버튼 바로 위에 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="fixed bottom-[3.75rem] left-3 z-[9997] flex items-center gap-1.5 transition-all duration-150 active:scale-90"
        style={fabStyle}
        aria-label="배경음악 선택"
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{current.emoji}</span>
        <span>음악</span>
      </button>
    </div>
  );
}
