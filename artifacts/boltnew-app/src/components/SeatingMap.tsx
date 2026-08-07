// @refresh reset
import { useState, useRef, type SyntheticEvent } from 'react';
import { MessageCircle, X, ArrowRight, Move, ArrowLeftRight, Pencil } from 'lucide-react';
import type { Database } from '../types/database';
import { getPositionLabel, getPositionBg, getDomSubLabel, getDomSubBg, genAvatar } from '../lib/profile';
import { TABLE_POSITIONS } from '../lib/constants';

// DiceBear 투명 SVG → genAvatar 강제 치환 + null/undefined fallback
function seatingAvatarSrc(url: string | null | undefined, nick: string): string {
  if (!url) return genAvatar(nick);
  if (url.includes('dicebear') && !url.includes('backgroundColor')) return genAvatar(nick);
  return url;
}
const onAvatarErr = (nick: string) => (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.src = genAvatar(nick);
};

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];


// ─── Score helpers ─────────────────────────────────────────────────────────────

function seatTheme(dark: boolean) {
  return dark ? {
    text: 'text-slate-300', muted: 'text-slate-400', dim: 'text-slate-500', faint: 'text-slate-600',
    emptyBorder: 'border-slate-700', divider: 'bg-slate-600/30', colDivider: 'border-slate-700/50',
    filterIdle: 'text-slate-400 hover:text-slate-200 border border-transparent',
    unknownBg: 'bg-slate-600/60 border-slate-500/50', unknownText: 'text-slate-400',
    label: 'text-slate-300', labelMe: 'text-blue-400',
  } : {
    text: 'text-gray-700', muted: 'text-gray-500', dim: 'text-gray-400', faint: 'text-gray-300',
    emptyBorder: 'border-gray-300', divider: 'bg-gray-200', colDivider: 'border-gray-200',
    filterIdle: 'text-gray-500 hover:text-gray-700 border border-transparent',
    unknownBg: 'bg-gray-100 border-gray-200', unknownText: 'text-gray-400',
    label: 'text-gray-700', labelMe: 'text-blue-600',
  };
}

function MiniScoreBar({ label, score, getLabel, getBg, leftText, rightText }: {
  label: string; score: number | null;
  getLabel: (v: number | null) => string; getBg: (v: number | null) => string;
  leftText: string; rightText: string;
}) {
  const pct = score === null ? 50 : Math.max(0, Math.min(100, score));
  const bg = getBg(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-400">{label}</span>
        {/* score-badge: rounded-full이지만 y2k/minimal 뱃지 오버라이드에서 제외 */}
        <span className="score-badge text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: bg, color: '#fff' }}>
          {getLabel(score)}
        </span>
      </div>
      {/* progress-track: rounded-full y2k/minimal 오버라이드에서 제외 */}
      <div className="progress-track relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--t-border, rgba(100,116,139,0.4))' }}>
        <div className="progress-fill absolute left-0 top-0 h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bg }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-slate-500">{leftText}</span>
        <span className="text-[9px] text-slate-500">{rightText}</span>
      </div>
    </div>
  );
}

// ─── Table Label Editor ───────────────────────────────────────────────────────

function TableLabelEditor({ tableNum, tableLabels, onSetTableLabel }: {
  tableNum: number; tableLabels?: Record<string, string> | null;
  onSetTableLabel: (tableNum: number, label: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const current = tableLabels?.[String(tableNum)] ?? String(tableNum);
  const isCustom = current !== String(tableNum);

  const openEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(isCustom ? current : '');
    setOpen(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    setSaving(true);
    await onSetTableLabel(tableNum, trimmed);
    setSaving(false);
    setOpen(false);
  };

  const reset = async () => {
    setSaving(true);
    await onSetTableLabel(tableNum, '');
    setSaving(false);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={openEditor}
        className="group inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-amber-700/40 transition-colors"
        title="클릭하여 번호 변경"
      >
        <span className="text-amber-300/90 group-hover:text-amber-200">{current}</span>
        <Pencil className="w-2.5 h-2.5 text-amber-400/70 group-hover:text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-sm">테이블 번호 변경</h3>
              <button onClick={() => !saving && setOpen(false)} disabled={saving} className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">원래 번호</span>
                <span className="font-bold text-gray-700">{tableNum}번</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">현재 표시</span>
                <span className="font-bold text-teal-600">{current}</span>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">새로 표시할 번호/이름</label>
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !saving) save();
                    if (e.key === 'Escape' && !saving) setOpen(false);
                  }}
                  placeholder={`예: ${tableNum} 또는 A, VIP 등`}
                  maxLength={10}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none text-base font-bold text-center"
                />
                <p className="text-[10px] text-gray-400 mt-1.5">비우면 원래 번호({tableNum})로 표시됩니다.</p>
              </div>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              {isCustom && (
                <button onClick={reset} disabled={saving} className="px-3 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-xs hover:bg-gray-200 disabled:opacity-50 transition-all">
                  원래대로
                </button>
              )}
              <button onClick={() => !saving && setOpen(false)} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm disabled:opacity-50">
                취소
              </button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600 disabled:opacity-50 transition-all">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Profile Popup ─────────────────────────────────────────────────────────────

function ProfilePopup({ profile, seat, isCurrentUser, onChat, onClose }: {
  profile: Profile; seat: Seat; isCurrentUser: boolean; onChat?: (p: Profile) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-slate-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-700/80"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative">
          <img src={seatingAvatarSrc(profile.photo_url, profile.nickname)} alt={profile.nickname} className="w-full h-52 object-cover" onError={onAvatarErr(profile.nickname)} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <p className="text-white font-black text-2xl leading-tight">{profile.nickname}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">{seat.seat_label}</span>
              {profile.mbti && (
                <span className="text-xs font-black text-teal-300 bg-teal-500/20 border border-teal-500/40 px-2 py-0.5 rounded-full">{profile.mbti}</span>
              )}
              {(profile as any).birth_year && (
                <span className="text-xs text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
                  {new Date().getFullYear() - (profile as any).birth_year + 1}살
                </span>
              )}
              {(profile as any).location && (
                <span className="text-xs text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">{(profile as any).location}</span>
              )}
              {isCurrentUser && (
                <span className="text-xs font-black text-blue-300 bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 rounded-full">내 자리</span>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          {profile.bio && (
            <div className="flex flex-wrap gap-1.5">
              {profile.bio.split(', ').map(tag => (
                <span key={tag} className="text-xs px-2.5 py-1 bg-slate-700/60 text-slate-200 rounded-full border border-slate-600/50">{tag}</span>
              ))}
            </div>
          )}
          <div className="space-y-3 bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <MiniScoreBar label="성향 (포지션)" score={profile.personality_score} getLabel={v => getPositionLabel(v ?? 50)} getBg={v => getPositionBg(v ?? 50)} leftText="바텀" rightText="탑" />
            <MiniScoreBar label="성향 (돔/섭)" score={profile.dom_sub_score} getLabel={getDomSubLabel} getBg={getDomSubBg} leftText="섭" rightText="돔" />
          </div>
          {!isCurrentUser && onChat ? (
            <button onClick={() => { onChat(profile); onClose(); }} className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-teal-500/20">
              <MessageCircle className="w-4 h-4" />채팅하기
            </button>
          ) : (
            <div className="h-1" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Big Seat Button (expanded modal) ─────────────────────────────────────────

export function BigSeatButton({ seat, profile, isCurrentUser, isAdmin, movingProfileId, darkMode = true, large = false, onSeatClick: _onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo }: {
  seat: Seat | null; profile?: Profile; isCurrentUser: boolean; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean; large?: boolean;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void;
  onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
}) {
  // ※ useState 없음 — confirm dialog는 TableExpandModal에서 관리 (Vite Fast Refresh 충돌 방지)
  const dim = large ? 'w-16 h-16' : 'w-14 h-14';
  const t = seatTheme(darkMode);
  if (!seat) return <div className={`${dim} rounded-xl bg-transparent`} />;
  const occupied = seat.status === 'occupied';
  const posLabel = seat.seat_label?.split(' ').pop() ?? '';
  const isInMoveMode = !!(movingProfileId);
  const isSelectedForMove = !!(movingProfileId && seat.profile_id === movingProfileId);
  const isTargetable = isInMoveMode && !isSelectedForMove;

  if (isAdmin) {
    return (
      <div className={`relative group ${dim} flex flex-col items-center gap-0.5`}>
        {occupied && profile ? (
          <div
            className={`w-full h-full rounded-xl overflow-hidden border-2 shadow relative cursor-pointer transition-all ${
              isSelectedForMove
                ? 'border-orange-400 ring-2 ring-orange-300/60 scale-105'
                : isTargetable
                  ? 'border-amber-400 ring-1 ring-amber-300/40 hover:border-amber-300'
                  : 'border-teal-400'
            }`}
            onClick={() => {
              if (isTargetable) {
                onMoveTo?.(seat);
              } else if (!isInMoveMode) {
                onSelectForMove?.(seat.profile_id!, profile);
              } else {
                // clicked selected seat again → deselect
                onSelectForMove?.(seat.profile_id!, profile);
              }
            }}
          >
            <img src={seatingAvatarSrc(profile.photo_url, profile.nickname)} alt={profile.nickname} className="w-full h-full object-cover" loading="lazy" onError={onAvatarErr(profile.nickname)} />
            {/* Overlays */}
            {isSelectedForMove && (
              <div className="absolute inset-0 bg-orange-500/30 flex items-center justify-center">
                <Move className="w-5 h-5 text-orange-200 drop-shadow" />
              </div>
            )}
            {isTargetable && (
              <div className="absolute inset-0 bg-amber-500/0 hover:bg-amber-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                <ArrowLeftRight className="w-5 h-5 text-amber-200 drop-shadow" />
              </div>
            )}
            {/* × button — only when not in move mode */}
            {!isInMoveMode && (
              <button
                onClick={e => { e.stopPropagation(); onClearSeat?.(seat); }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-black shadow transition-all active:scale-90"
              >×</button>
            )}
          </div>
        ) : (
          <button
            onClick={() => isTargetable ? onMoveTo?.(seat) : onShowQr?.(seat)}
            className={`w-full h-full rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-0.5 ${
              isTargetable
                ? 'border-teal-400 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
                : 'border-slate-500 hover:border-cyan-400 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400'
            }`}
          >
            {isTargetable ? (
              <ArrowRight className="w-4 h-4" />
            ) : (
              <>
                <span className="text-[9px] font-bold">QR</span>
                <span className="text-[8px] text-slate-600">{posLabel}</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  if (occupied && profile) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onProfileClick?.(profile)} className={`${dim} rounded-xl overflow-hidden border-2 transition-all active:scale-95 shadow relative ${isCurrentUser ? 'border-blue-400 ring-2 ring-blue-300/70' : 'border-white/20 hover:border-teal-300'}`} title={profile.nickname}>
          <img src={seatingAvatarSrc(profile.photo_url, profile.nickname)} alt={profile.nickname} className="w-full h-full object-cover" loading="lazy" onError={onAvatarErr(profile.nickname)} />
          {isCurrentUser && <div className="absolute inset-0 bg-blue-500/50 flex items-center justify-center"><span className="text-sm font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">나</span></div>}
        </button>
        <span className={`text-[9px] font-bold truncate max-w-[3.5rem] text-center ${isCurrentUser ? t.labelMe : t.label}`}>{isCurrentUser ? '나' : profile.nickname}</span>
      </div>
    );
  }

  if (occupied) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`${dim} rounded-xl ${t.unknownBg} flex items-center justify-center`}><span className={`text-xs ${t.unknownText}`}>?</span></div>
        <span className={`text-[9px] ${t.dim}`}>{posLabel}</span>
      </div>
    );
  }

  // 유저 자리 선택 모드: 빈 자리에 클릭 핸들러 추가
  if (_onSeatClick) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => _onSeatClick(seat)}
          className={`${dim} rounded-xl border-2 border-dashed border-teal-500/50 hover:border-teal-400 hover:bg-teal-500/10 flex items-center justify-center transition-all active:scale-95`}
          title={seat.seat_label}
        >
          <span className="text-[10px] font-bold text-teal-400/60">+</span>
        </button>
        <span className={`text-[9px] ${t.faint}`}>{posLabel}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${dim} rounded-xl border-2 border-dashed ${t.emptyBorder} flex items-center justify-center`} title={seat.seat_label} />
      <span className={`text-[9px] ${t.faint}`}>{posLabel}</span>
    </div>
  );
}

// ─── Expanded Layout (modal) ───────────────────────────────────────────────────

export type LayoutProps = {
  tableNum: number; seats: Seat[]; profileMap: Map<string, Profile>; currentUserId: string | null; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean;
  tableLabels?: Record<string, string> | null;
  /** true → 자리 버튼·테이블 중앙을 크게 렌더 (내 테이블 탭 전용) */
  seatLg?: boolean;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void; onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
};

export function ExpandedLayout({ tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels, seatLg = false, onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo }: LayoutProps) {
  const cfg = TABLE_POSITIONS[tableNum];
  if (!cfg) return null;
  const label = tableLabels?.[String(tableNum)] ?? String(tableNum);
  const get = (pos: number) => seats.find(s => s.table_number === tableNum && s.seat_position === pos) ?? null;
  const prof = (s: Seat | null) => s?.profile_id ? profileMap.get(s.profile_id) : undefined;
  const isMe = (s: Seat | null) => !!s && s.profile_id === currentUserId;
  const bsb = (pos: number) => (
    <BigSeatButton key={pos} seat={get(pos)} profile={prof(get(pos))} isCurrentUser={isMe(get(pos))}
      isAdmin={isAdmin} movingProfileId={movingProfileId} darkMode={darkMode} large={seatLg}
      onSeatClick={onSeatClick} onProfileClick={onProfileClick} onClearSeat={onClearSeat} onShowQr={onShowQr}
      onSelectForMove={onSelectForMove} onMoveTo={onMoveTo} />
  );

  // seatLg=true 일 때 자리 간격·테이블 중앙도 함께 키움
  // 중앙은 자리 버튼(w-16=64px) 대비 배치도와 동일한 시각적 비율 유지를 위해 더 크게 설정
  const gap = seatLg ? 'gap-3' : 'gap-2';
  const sofaPad = seatLg ? 'p-2.5 rounded-2xl' : 'p-2 rounded-2xl';
  // seatLg 시 sofa와 동일하게 self-stretch — 컬럼 높이에 맞춰 세로로 늘어남
  const tableCenterRow1 = seatLg ? 'w-28 self-stretch' : 'w-20 h-20';
  const tableCenterSofa = seatLg ? 'w-16' : 'w-12';
  const tableLabelSizeRow1 = seatLg ? 'text-lg' : 'text-sm';
  const tableLabelSizeSofa = seatLg ? 'text-sm' : 'text-[11px]';

  const leftColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>{cfg.sofaOnLeft ? '소파' : '맞은편'}</span>
      )}
      <div className={`flex flex-col ${gap} ${cfg.type === 'sofa' && cfg.sofaOnLeft ? `${sofaPad} bg-sky-500/10 border border-sky-500/30` : ''}`}>
        {cfg.leftCol.map(pos => bsb(pos))}
      </div>
    </div>
  );
  const rightColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${!cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>{!cfg.sofaOnLeft ? '소파' : '맞은편'}</span>
      )}
      <div className={`flex flex-col ${gap} ${cfg.type === 'sofa' && !cfg.sofaOnLeft ? `${sofaPad} bg-sky-500/10 border border-sky-500/30` : ''}`}>
        {cfg.rightCol.map(pos => bsb(pos))}
      </div>
    </div>
  );

  if (cfg.type === 'row1') {
    return (
      <div className={`flex flex-col items-center ${gap} py-2`}>
        <div className="h-4" />
        <div className={`flex items-center ${gap}`}>
          {leftColEl}
          <div className={`${tableCenterRow1} rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center gap-0.5`}>
            <span className={`${tableLabelSizeRow1} font-black text-amber-300/90 leading-none`}>{label}</span>
          </div>
          {rightColEl}
        </div>
        {cfg.bottomRow && <div className={`flex ${gap}`}>{cfg.bottomRow.map(pos => bsb(pos))}</div>}
        {cfg.topRow && <div className={`flex ${gap}`}>{cfg.topRow.map(pos => bsb(pos))}</div>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${gap} py-2`}>
      {cfg.topRow ? <div className={`flex ${gap}`}>{cfg.topRow.map(pos => bsb(pos))}</div> : <div className="h-2" />}
      <div className={`flex items-stretch ${gap}`}>
        {leftColEl}
        <div className={`${tableCenterSofa} self-stretch rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center gap-0.5`}>
          <span className={`${tableLabelSizeSofa} font-black text-amber-300/90 leading-none`}>{label}</span>
        </div>
        {rightColEl}
      </div>
      {cfg.bottomRow ? <div className={`flex ${gap}`}>{cfg.bottomRow.map(pos => bsb(pos))}</div> : <div className="h-2" />}
    </div>
  );
}

// ─── Table Expand Modal ────────────────────────────────────────────────────────

function TableExpandModal({
  tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels,
  onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo, onSetTableLabel, onClose,
}: LayoutProps & { onSetTableLabel?: (tableNum: number, label: string) => Promise<void>; onClose: () => void }) {
  // confirm dialog state는 여기서만 관리 — BigSeatButton에서 useState 제거로 Vite Fast Refresh 충돌 해소
  const [confirmSeat, setConfirmSeat] = useState<Seat | null>(null);
  const tableSeats = seats.filter(s => s.table_number === tableNum);
  const occupied = tableSeats.filter(s => s.status === 'occupied').length;
  const label = tableLabels?.[String(tableNum)] ?? String(tableNum);
  const confirmProfile = confirmSeat ? profileMap.get(String(confirmSeat.profile_id ?? '')) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      {/* 자리 비우기 확인 다이얼로그 — z-[300]으로 모달 위에 표시 */}
      {confirmSeat && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmSeat(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-72 text-center" onClick={e => e.stopPropagation()}>
            <p className="font-black text-gray-900 text-base mb-1">자리 비우기</p>
            <p className="text-sm text-gray-500 mb-4"><strong>{confirmProfile?.nickname}</strong>을(를) 이 자리에서 제거합니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSeat(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">취소</button>
              <button onClick={() => { onClearSeat?.(confirmSeat); setConfirmSeat(null); }} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all">강제 삭제</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800 border-b border-slate-700">
          <div>
            <h3 className="font-black text-white text-base">
              {isAdmin && onSetTableLabel ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-amber-300"><TableLabelEditor tableNum={tableNum} tableLabels={tableLabels} onSetTableLabel={onSetTableLabel} /></span>
                  <span className="text-white">번 테이블</span>
                </span>
              ) : (
                <>{label}번 테이블</>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{occupied}/{Math.min(tableSeats.length, 8)}명 착석</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-x-auto">
          <ExpandedLayout tableNum={tableNum} seats={seats} profileMap={profileMap} currentUserId={currentUserId} isAdmin={isAdmin}
            movingProfileId={movingProfileId} darkMode={darkMode} tableLabels={tableLabels}
            onSeatClick={(s) => { onSeatClick?.(s); onClose(); }}
            onProfileClick={(p) => { onProfileClick?.(p); onClose(); }}
            onClearSeat={(s) => setConfirmSeat(s)}
            onShowQr={onShowQr}
            onSelectForMove={onSelectForMove}
            onMoveTo={(seat) => { onMoveTo?.(seat); onClose(); }} />
        </div>
      </div>
    </div>
  );
}

// ─── Small Seat Button (main map) ──────────────────────────────────────────────

function SeatButton({
  seat, profile, isCurrentUser, isAdmin, movingProfileId, darkMode = true,
  onSeatClick: _onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo,
}: {
  seat: Seat | null; profile?: Profile; isCurrentUser: boolean; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void;
  onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
}) {
  const dim = 'w-9 h-9';
  const t = seatTheme(darkMode);
  if (!seat) return <div className={`${dim} rounded-lg bg-transparent`} />;
  const occupied = seat.status === 'occupied';
  const isInMoveMode = !!(movingProfileId);
  const isSelectedForMove = !!(movingProfileId && seat.profile_id === movingProfileId);
  const isTargetable = isInMoveMode && !isSelectedForMove;

  if (isAdmin) {
    return (
      <div className={`relative group ${dim}`}>
        {occupied && profile ? (
          <div
            className={`w-full h-full rounded-lg overflow-hidden border-2 shadow-sm relative cursor-pointer transition-all ${
              isSelectedForMove
                ? 'border-orange-400 ring-2 ring-orange-300/60 scale-110'
                : isTargetable
                  ? 'border-amber-400 hover:border-amber-300'
                  : 'border-teal-400'
            }`}
            onClick={() => {
              if (isTargetable) {
                onMoveTo?.(seat);
              } else {
                onSelectForMove?.(seat.profile_id!, profile);
              }
            }}
          >
            <img src={seatingAvatarSrc(profile.photo_url, profile.nickname)} alt={profile.nickname} className="w-full h-full object-cover" loading="lazy" onError={onAvatarErr(profile.nickname)} />
            {isSelectedForMove && (
              <div className="absolute inset-0 bg-orange-500/40 flex items-center justify-center">
                <Move className="w-3 h-3 text-white" />
              </div>
            )}
            {isTargetable && (
              <div className="absolute inset-0 bg-amber-500/0 hover:bg-amber-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                <ArrowLeftRight className="w-3 h-3 text-white" />
              </div>
            )}
            {!isInMoveMode && (
              <button
                onClick={e => { e.stopPropagation(); onClearSeat?.(seat); }}
                className="absolute top-0 right-0 w-4 h-4 -mt-1 -mr-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black shadow active:scale-90"
              >×</button>
            )}
          </div>
        ) : (
          <button
            onClick={() => isTargetable ? onMoveTo?.(seat) : onShowQr?.(seat)}
            className={`w-full h-full rounded-lg border-2 border-dashed transition-all flex items-center justify-center ${
              isTargetable
                ? 'border-teal-400 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
                : 'border-slate-500 hover:border-cyan-400 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400'
            }`}
            title={seat.seat_label}
          >
            {isTargetable
              ? <ArrowRight className="w-3.5 h-3.5" />
              : <span className="text-[10px] font-bold">QR</span>
            }
          </button>
        )}
      </div>
    );
  }

  if (occupied && profile) {
    return (
      <button onClick={() => onProfileClick?.(profile)} className={`${dim} rounded-lg overflow-hidden border-2 ${isCurrentUser ? 'border-blue-400 shadow-md ring-2 ring-blue-300/70' : 'border-white/30 hover:border-teal-300'} shadow-sm relative transition-all active:scale-95`} title={profile.nickname}>
        <img src={seatingAvatarSrc(profile.photo_url, profile.nickname)} alt={profile.nickname} className="w-full h-full object-cover" loading="lazy" onError={onAvatarErr(profile.nickname)} />
        {isCurrentUser && <div className="absolute inset-0 bg-blue-500/50 flex items-center justify-center"><span className="text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">나</span></div>}
      </button>
    );
  }

  if (occupied) {
    return <div className={`${dim} rounded-lg ${t.unknownBg} flex items-center justify-center`}><span className={`text-[9px] ${t.unknownText}`}>?</span></div>;
  }

  // 유저 자리 선택 모드: 빈 자리에 클릭 핸들러 추가
  if (_onSeatClick) {
    return (
      <button
        onClick={() => _onSeatClick(seat)}
        className={`${dim} rounded-lg border-2 border-dashed border-teal-500/50 hover:border-teal-400 hover:bg-teal-500/10 flex items-center justify-center transition-all active:scale-95`}
        title={seat.seat_label}
      >
        <span className="text-[8px] font-bold text-teal-400/70">+</span>
      </button>
    );
  }
  return (
    <div className={`${dim} rounded-lg border-2 border-dashed ${t.emptyBorder} flex items-center justify-center`} title={seat.seat_label} />
  );
}

// ─── Table wrappers (small map) ────────────────────────────────────────────────

function TableHeader({ tableNum, seats, onClick, isAdmin, label: _label, darkMode = true }: {
  tableNum: number; seats: Seat[]; onClick: () => void; isAdmin: boolean; label: string; darkMode?: boolean;
}) {
  const t = seatTheme(darkMode);
  const occupied = seats.filter(s => s.table_number === tableNum && s.status === 'occupied').length;
  const total = Math.min(seats.filter(s => s.table_number === tableNum).length, 8);
  return (
    <button onClick={onClick} className={`text-[10px] font-bold mb-0.5 transition-colors ${t.muted} ${isAdmin ? 'cursor-default' : 'hover:text-teal-400 active:text-teal-300'}`}>
      {occupied}/{total}
    </button>
  );
}

type SmallTableProps = {
  tableNum: number; seats: Seat[]; profileMap: Map<string, Profile>; currentUserId: string | null; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean;
  tableLabels?: Record<string, string> | null;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void; onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
  onTableClick: () => void;
  onSetTableLabel?: (tableNum: number, label: string) => Promise<void>;
};

function SmallTable({ tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels, onSeatClick: _onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo, onTableClick, onSetTableLabel: _onSetTableLabel }: SmallTableProps) {
  const cfg = TABLE_POSITIONS[tableNum];
  if (!cfg) return null;
  const t = seatTheme(darkMode);
  const label = tableLabels?.[String(tableNum)] ?? String(tableNum);
  const get = (pos: number) => seats.find(s => s.table_number === tableNum && s.seat_position === pos) ?? null;
  const prof = (s: Seat | null) => s?.profile_id ? profileMap.get(s.profile_id) : undefined;
  const isMe = (s: Seat | null) => !!s && s.profile_id === currentUserId;
  const sb = (pos: number) => (
    <SeatButton key={pos} seat={get(pos)} profile={prof(get(pos))} isCurrentUser={isMe(get(pos))}
      isAdmin={isAdmin} movingProfileId={movingProfileId} darkMode={darkMode}
      onSeatClick={_onSeatClick} onProfileClick={onProfileClick} onClearSeat={onClearSeat} onShowQr={onShowQr}
      onSelectForMove={onSelectForMove} onMoveTo={onMoveTo} />
  );

  const tableBtn = (
    <button onClick={onTableClick} className={`w-12 self-stretch rounded-lg bg-gradient-to-br from-amber-800/80 to-amber-900/80 border border-amber-700/50 shadow-inner flex items-center justify-center px-0.5 ${!isAdmin ? 'hover:border-teal-500/60 transition-colors' : 'cursor-pointer'}`}>
      <span className="text-xs font-black text-amber-300 text-center leading-tight break-words whitespace-pre-wrap">{label}</span>
    </button>
  );

  const leftColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'row1' && <div className={`text-[8px] font-bold ${t.muted} mb-0.5`}>왼쪽</div>}
      {cfg.type === 'sofa' && <div className={`text-[8px] font-bold mb-0.5 ${cfg.sofaOnLeft ? 'text-sky-400/80' : t.muted}`}>{cfg.sofaOnLeft ? '소파' : '맞은편'}</div>}
      <div className={`flex flex-col gap-1 ${cfg.type === 'sofa' && cfg.sofaOnLeft ? 'p-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.leftCol.map(pos => sb(pos))}
      </div>
    </div>
  );
  const rightColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'row1' && <div className={`text-[8px] font-bold ${t.muted} mb-0.5`}>오른쪽</div>}
      {cfg.type === 'sofa' && <div className={`text-[8px] font-bold mb-0.5 ${!cfg.sofaOnLeft ? 'text-sky-400/80' : t.muted}`}>{!cfg.sofaOnLeft ? '소파' : '맞은편'}</div>}
      <div className={`flex flex-col gap-1 ${cfg.type === 'sofa' && !cfg.sofaOnLeft ? 'p-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.rightCol.map(pos => sb(pos))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <TableHeader tableNum={tableNum} seats={seats} onClick={onTableClick} isAdmin={isAdmin} label={label} darkMode={darkMode} />
      {cfg.topRow && <div className="flex gap-1">{cfg.topRow.map(pos => sb(pos))}</div>}
      <div className="flex items-stretch gap-1.5">
        {leftColEl}
        {tableBtn}
        {rightColEl}
      </div>
      {cfg.bottomRow && <div className="flex gap-1">{cfg.bottomRow.map(pos => sb(pos))}</div>}
    </div>
  );
}

