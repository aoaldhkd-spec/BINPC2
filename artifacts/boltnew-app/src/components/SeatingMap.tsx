import { useState } from 'react';
import { MessageCircle, X, ArrowRight, Move, ArrowLeftRight, Pencil } from 'lucide-react';
import type { Database } from '../types/database';
import { getPositionLabel, getPositionBg, getDomSubLabel, getDomSubBg } from '../lib/profile';
import { TABLE_POSITIONS } from '../lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];

interface SeatingMapProps {
  seats: Seat[];
  profileMap: Map<string, Profile>;
  currentUserId: string | null;
  isAdmin: boolean;
  seatingLocked?: boolean;
  tableLabels?: Record<string, string> | null;
  darkMode?: boolean;
  onSeatClick?: (seat: Seat) => void;
  onProfileClick?: (profile: Profile) => void;
  onChatClick?: (profile: Profile) => void;
  onClearSeat?: (seat: Seat) => void;
  onShowQr?: (seat: Seat) => void;
  onForceSeat?: (profileId: string, seatId: string) => void;
  onSetTableLabel?: (tableNum: number, label: string) => Promise<void>;
}

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
        <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: bg }}>
          {getLabel(score)}
        </span>
      </div>
      <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bg }} />
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
          <img src={profile.photo_url} alt={profile.nickname} className="w-full h-52 object-cover" />
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

function BigSeatButton({ seat, profile, isCurrentUser, isAdmin, movingProfileId, darkMode = true, onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo }: {
  seat: Seat | null; profile?: Profile; isCurrentUser: boolean; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void;
  onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
}) {
  const [confirmSeat, setConfirmSeat] = useState<Seat | null>(null);
  const dim = 'w-14 h-14';
  const t = seatTheme(darkMode);
  if (!seat) return <div className={`${dim} rounded-xl bg-transparent`} />;
  const occupied = seat.status === 'occupied';
  const posLabel = seat.seat_label.split(' ').pop() ?? '';
  const isInMoveMode = !!(movingProfileId);
  const isSelectedForMove = !!(movingProfileId && seat.profile_id === movingProfileId);
  const isTargetable = isInMoveMode && !isSelectedForMove;

  if (isAdmin) {
    return (
      <div className={`relative group ${dim} flex flex-col items-center gap-0.5`}>
        {confirmSeat && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmSeat(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-72 text-center" onClick={e => e.stopPropagation()}>
              <p className="font-black text-gray-900 text-base mb-1">자리 비우기</p>
              <p className="text-sm text-gray-500 mb-4"><strong>{profile?.nickname}</strong>을(를) 이 자리에서 제거합니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmSeat(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">취소</button>
                <button onClick={() => { onClearSeat?.(confirmSeat); setConfirmSeat(null); }} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all">강제 삭제</button>
              </div>
            </div>
          </div>
        )}
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
            <img src={profile.photo_url} alt={profile.nickname} className="w-full h-full object-cover" />
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
                onClick={e => { e.stopPropagation(); setConfirmSeat(seat); }}
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
          <img src={profile.photo_url} alt={profile.nickname} className="w-full h-full object-cover" />
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

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${dim} rounded-xl border-2 border-dashed ${t.emptyBorder} flex items-center justify-center`} title={seat.seat_label} />
      <span className={`text-[9px] ${t.faint}`}>{posLabel}</span>
    </div>
  );
}

// ─── Expanded Layout (modal) ───────────────────────────────────────────────────

type LayoutProps = {
  tableNum: number; seats: Seat[]; profileMap: Map<string, Profile>; currentUserId: string | null; isAdmin: boolean;
  movingProfileId?: string | null; darkMode?: boolean;
  tableLabels?: Record<string, string> | null;
  onSeatClick?: (s: Seat) => void; onProfileClick?: (p: Profile) => void; onClearSeat?: (s: Seat) => void; onShowQr?: (s: Seat) => void;
  onSelectForMove?: (profileId: string, profile: Profile) => void;
  onMoveTo?: (seat: Seat) => void;
};

function ExpandedLayout({ tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels, onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo }: LayoutProps) {
  const cfg = TABLE_POSITIONS[tableNum];
  if (!cfg) return null;
  const label = (tableLabels?.[String(tableNum)]) ?? String(tableNum);
  const get = (pos: number) => seats.find(s => s.table_number === tableNum && s.seat_position === pos) ?? null;
  const prof = (s: Seat | null) => s?.profile_id ? profileMap.get(s.profile_id) : undefined;
  const isMe = (s: Seat | null) => !!s && s.profile_id === currentUserId;
  const bsb = (pos: number) => (
    <BigSeatButton key={pos} seat={get(pos)} profile={prof(get(pos))} isCurrentUser={isMe(get(pos))}
      isAdmin={isAdmin} movingProfileId={movingProfileId} darkMode={darkMode}
      onSeatClick={onSeatClick} onProfileClick={onProfileClick} onClearSeat={onClearSeat} onShowQr={onShowQr}
      onSelectForMove={onSelectForMove} onMoveTo={onMoveTo} />
  );

  const leftColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>{cfg.sofaOnLeft ? '소파' : '맞은편'}</span>
      )}
      <div className={`flex flex-col gap-2 ${cfg.type === 'sofa' && cfg.sofaOnLeft ? 'p-2 rounded-2xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.leftCol.map(pos => bsb(pos))}
      </div>
    </div>
  );
  const rightColEl = (
    <div className="flex flex-col items-center gap-1">
      {cfg.type === 'sofa' && (
        <span className={`text-[9px] font-black ${!cfg.sofaOnLeft ? 'text-sky-400/80' : 'text-slate-400/80'}`}>{!cfg.sofaOnLeft ? '소파' : '맞은편'}</span>
      )}
      <div className={`flex flex-col gap-2 ${cfg.type === 'sofa' && !cfg.sofaOnLeft ? 'p-2 rounded-2xl bg-sky-500/10 border border-sky-500/30' : ''}`}>
        {cfg.rightCol.map(pos => bsb(pos))}
      </div>
    </div>
  );

  if (cfg.type === 'row1') {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="h-4" />
        <div className="flex items-center gap-2">
          {leftColEl}
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center gap-0.5">
            <span className="text-sm font-black text-amber-300/90 leading-none">{label}</span>
          </div>
          {rightColEl}
        </div>
        {cfg.bottomRow && <div className="flex gap-2">{cfg.bottomRow.map(pos => bsb(pos))}</div>}
        {cfg.topRow && <div className="flex gap-2">{cfg.topRow.map(pos => bsb(pos))}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      {cfg.topRow ? <div className="flex gap-2">{cfg.topRow.map(pos => bsb(pos))}</div> : <div className="h-2" />}
      <div className="flex items-stretch gap-2">
        {leftColEl}
        <div className="w-12 self-stretch rounded-xl bg-gradient-to-br from-amber-800/90 to-amber-900/90 border border-amber-700/60 shadow-inner flex flex-col items-center justify-center gap-0.5">
          <span className="text-[11px] font-black text-amber-300/90 leading-none">{label}</span>
        </div>
        {rightColEl}
      </div>
      {cfg.bottomRow ? <div className="flex gap-2">{cfg.bottomRow.map(pos => bsb(pos))}</div> : <div className="h-2" />}
    </div>
  );
}

// ─── Table Expand Modal ────────────────────────────────────────────────────────

function TableExpandModal({
  tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels,
  onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo, onSetTableLabel, onClose,
}: LayoutProps & { onSetTableLabel?: (tableNum: number, label: string) => Promise<void>; onClose: () => void }) {
  const tableSeats = seats.filter(s => s.table_number === tableNum);
  const occupied = tableSeats.filter(s => s.status === 'occupied').length;
  const label = tableLabels?.[String(tableNum)] ?? String(tableNum);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
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
            <p className="text-xs text-slate-400 mt-0.5">{occupied}/{tableSeats.length}명 착석</p>
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
            onClearSeat={onClearSeat} onShowQr={onShowQr}
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
  onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo,
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
            <img src={profile.photo_url} alt={profile.nickname} className="w-full h-full object-cover" />
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
        <img src={profile.photo_url} alt={profile.nickname} className="w-full h-full object-cover" />
        {isCurrentUser && <div className="absolute inset-0 bg-blue-500/50 flex items-center justify-center"><span className="text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">나</span></div>}
      </button>
    );
  }

  if (occupied) {
    return <div className={`${dim} rounded-lg ${t.unknownBg} flex items-center justify-center`}><span className={`text-[9px] ${t.unknownText}`}>?</span></div>;
  }

  return (
    <div className={`${dim} rounded-lg border-2 border-dashed ${t.emptyBorder} flex items-center justify-center`} title={seat.seat_label} />
  );
}

// ─── Table wrappers (small map) ────────────────────────────────────────────────

function TableHeader({ tableNum, seats, onClick, isAdmin, label, darkMode = true }: {
  tableNum: number; seats: Seat[]; onClick: () => void; isAdmin: boolean; label: string; darkMode?: boolean;
}) {
  const t = seatTheme(darkMode);
  const occupied = seats.filter(s => s.table_number === tableNum && s.status === 'occupied').length;
  const total = seats.filter(s => s.table_number === tableNum).length;
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

function SmallTable({ tableNum, seats, profileMap, currentUserId, isAdmin, movingProfileId, darkMode = true, tableLabels, onSeatClick, onProfileClick, onClearSeat, onShowQr, onSelectForMove, onMoveTo, onTableClick, onSetTableLabel }: SmallTableProps) {
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
      onSeatClick={onSeatClick} onProfileClick={onProfileClick} onClearSeat={onClearSeat} onShowQr={onShowQr}
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

// ─── Position number map (왼→오, 위→아래 순서) ─────────────────────────────────
// ─── Main SeatingMap ───────────────────────────────────────────────────────────

type ColFilter = 'all' | '1' | '2' | '3' | '4';
type RowFilter = 'all' | '1' | '2' | '3';

export default function SeatingMap({
  seats, profileMap, currentUserId, isAdmin, seatingLocked = false,
  tableLabels, darkMode = true, onSeatClick, onProfileClick, onChatClick, onClearSeat, onShowQr, onForceSeat, onSetTableLabel,
}: SeatingMapProps) {
  // User (non-admin) view: seat self-registration is always disabled.
  // Empty seats are display-only; only admin can assign/move seats.
  const totalOccupied = seats.filter(s => s.status === 'occupied').length;
  const totalSeats = seats.length;
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [profilePopup, setProfilePopup] = useState<{ profile: Profile; seat: Seat } | null>(null);
  const [activeCol, setActiveCol] = useState<ColFilter>('all');
  const [activeRow, setActiveRow] = useState<RowFilter>('all');
  const [movingProfileId, setMovingProfileId] = useState<string | null>(null);
  const [movingProfile, setMovingProfile] = useState<Profile | null>(null);

  const handleSelectForMove = (profileId: string, profile: Profile) => {
    if (movingProfileId === profileId) {
      setMovingProfileId(null);
      setMovingProfile(null);
    } else {
      setMovingProfileId(profileId);
      setMovingProfile(profile);
    }
  };

  const handleMoveTo = (seat: Seat) => {
    if (movingProfileId && onForceSeat) {
      onForceSeat(movingProfileId, seat.id);
    }
    setMovingProfileId(null);
    setMovingProfile(null);
  };

  const openProfile = (profile: Profile) => {
    const seat = seats.find(s => s.profile_id === profile.id) ?? null;
    if (!isAdmin && seat) setProfilePopup({ profile, seat });
    onProfileClick?.(profile);
  };

  const handleSeatClick = isAdmin ? onSeatClick : undefined;
  const t = seatTheme(darkMode);

  const sharedProps = {
    seats, profileMap, currentUserId, isAdmin,
    movingProfileId, darkMode, tableLabels,
    onSeatClick: handleSeatClick, onProfileClick: openProfile, onClearSeat, onShowQr,
    onSelectForMove: isAdmin && onForceSeat ? handleSelectForMove : undefined,
    onMoveTo: isAdmin && onForceSeat ? handleMoveTo : undefined,
    onSetTableLabel: isAdmin && onSetTableLabel ? onSetTableLabel : undefined,
  };

  return (
    <>
      {/* Move mode banner */}
      {isAdmin && movingProfile && (
        <div className="sticky top-0 z-40 mx-4 mb-3 flex items-center gap-3 px-4 py-2.5 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/30 animate-pulse-slow">
          <div className="w-8 h-8 rounded-lg overflow-hidden border-2 border-amber-300 flex-shrink-0">
            <img src={movingProfile.photo_url} alt={movingProfile.nickname} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-900 font-black text-xs leading-tight">{movingProfile.nickname}</p>
            <p className="text-amber-800 text-[10px] leading-tight">이동할 자리를 클릭하세요</p>
          </div>
          <Move className="w-4 h-4 text-amber-800 flex-shrink-0" />
          <button
            onClick={() => { setMovingProfileId(null); setMovingProfile(null); }}
            className="flex-shrink-0 w-7 h-7 rounded-xl bg-amber-600/40 hover:bg-amber-600/60 flex items-center justify-center transition-all"
          >
            <X className="w-3.5 h-3.5 text-amber-900" />
          </button>
        </div>
      )}

      {/* 배치도: 상하좌우·대각선 자유 스크롤 */}
      <div className="w-full scroll-free scrollbar-styled rounded-xl" style={{ maxHeight: '72vh' }}>
        <div className="w-max space-y-4 pb-6 px-2 pt-1">
          {/* Legend + count */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`flex items-center gap-3 text-xs ${t.muted} flex-wrap`}>
              <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded border-2 border-dashed ${t.emptyBorder} inline-block`} />빈 자리</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-500 border border-teal-400 inline-block" />착석</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-500/30 border-2 border-sky-400 inline-block" />소파석</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/50 border-2 border-blue-400 inline-block" />내 자리</span>
              {isAdmin && onForceSeat && <span className="flex items-center gap-1.5 text-amber-400"><span className="w-3 h-3 rounded bg-amber-500/30 border-2 border-amber-400 inline-block" />클릭→이동 선택 (빈자리=이동 <ArrowRight className="w-2.5 h-2.5 inline" />, 사람=교환 <ArrowLeftRight className="w-2.5 h-2.5 inline" />)</span>}
              {!isAdmin && <span className={`text-[10px] ${t.dim} italic`}>테이블 탭하면 확대 · 자리 배정은 관리자만 가능</span>}
              {isAdmin && onSetTableLabel && <span className="text-[10px] text-amber-400 italic">테이블 번호 클릭시 수정</span>}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {!isAdmin && seatingLocked && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-full">🔒 자리 이동 잠금</span>
              )}
              <div className={`text-xs font-bold ${t.text}`}>{totalOccupied} / {totalSeats}명</div>
            </div>
          </div>

          {/* Column filter tabs (줄) */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`text-[9px] font-black ${t.dim} uppercase tracking-wider mr-1`}>줄</span>
            {(['all', '1', '2', '3', '4'] as ColFilter[]).map(col => (
              <button key={col} onClick={() => setActiveCol(col)} className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeCol === col ? 'bg-teal-500/30 text-teal-300 border border-teal-500/50' : t.filterIdle}`}>
                {col === 'all' ? '전체' : `${col}번줄`}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 border border-green-500/40 rounded-xl">
              <span className="text-green-400 text-sm">🚪</span>
              <span className="text-xs font-black text-green-400">입구</span>
            </div>
          </div>

          {/* Row filter tabs (열) */}
          <div className="flex items-center gap-1">
            <span className={`text-[9px] font-black ${t.dim} uppercase tracking-wider mr-1`}>열</span>
            {(['all', '1', '2', '3'] as RowFilter[]).map(row => (
              <button key={row} onClick={() => setActiveRow(row)} className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeRow === row ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' : t.filterIdle}`}>
                {row === 'all' ? '전체' : `${row}번열`}
              </button>
            ))}
          </div>

          {/* Layout */}
          <div className="flex items-start gap-2">
            {/* Row labels */}
            <div className="flex flex-col flex-shrink-0" style={{ gap: 0 }}>
              {activeCol === 'all' && <div style={{ height: 22 }} />}
              {(activeRow === 'all' || activeRow === '1') && (
                <div className="flex items-center justify-end pr-1" style={{ height: activeRow === 'all' ? 176 : undefined }}>
                  <span className="text-[9px] font-black text-teal-400 tracking-widest whitespace-nowrap">1열</span>
                </div>
              )}
              {activeRow === 'all' && <div style={{ height: 17 }} />}
              {(activeRow === 'all' || activeRow === '2') && (
                <div className="flex items-center justify-end pr-1" style={{ height: activeRow === 'all' ? 188 : undefined }}>
                  <span className={`text-[9px] font-black ${t.muted} tracking-widest whitespace-nowrap`}>2열</span>
                </div>
              )}
              {activeRow === 'all' && <div style={{ height: 4 }} />}
              {(activeRow === 'all' || activeRow === '3') && (
                <div className="flex items-center justify-end pr-1" style={{ height: activeRow === 'all' ? 188 : undefined }}>
                  <span className={`text-[9px] font-black ${t.muted} tracking-widest whitespace-nowrap`}>3열</span>
                </div>
              )}
            </div>

            {/* Columns */}
            <div className="flex items-start gap-5">
              {/* 1번줄 */}
              {(activeCol === 'all' || activeCol === '1') && (
                <div className="flex flex-col items-center gap-1">
                  {activeCol === 'all' && <span className={`text-[9px] font-black ${t.dim} tracking-widest mb-1`}>1번줄</span>}
                  {(activeRow === 'all' || activeRow === '1') && <SmallTable tableNum={7}  {...sharedProps} onTableClick={() => setExpandedTable(7)} />}
                  {activeRow === 'all' && <div className={`w-full h-px ${t.divider} my-1`} />}
                  {(activeRow === 'all' || activeRow === '2') && <SmallTable tableNum={9}  {...sharedProps} onTableClick={() => setExpandedTable(9)} />}
                  {(activeRow === 'all' || activeRow === '3') && <SmallTable tableNum={10} {...sharedProps} onTableClick={() => setExpandedTable(10)} />}
                </div>
              )}

              {/* 2번줄 */}
              {(activeCol === 'all' || activeCol === '2') && (
                <div className="flex flex-col items-center gap-1">
                  {activeCol === 'all' && <span className={`text-[9px] font-black ${t.dim} tracking-widest mb-1`}>2번줄</span>}
                  {(activeRow === 'all' || activeRow === '1') && <SmallTable tableNum={5}  {...sharedProps} onTableClick={() => setExpandedTable(5)} />}
                  {activeRow === 'all' && <div className={`w-full h-px ${t.divider} my-1`} />}
                  {(activeRow === 'all' || activeRow === '2') && <SmallTable tableNum={4}  {...sharedProps} onTableClick={() => setExpandedTable(4)} />}
                  {(activeRow === 'all' || activeRow === '3') && <SmallTable tableNum={3}  {...sharedProps} onTableClick={() => setExpandedTable(3)} />}
                </div>
              )}

              {activeCol === 'all' && <div className={`w-4 flex-shrink-0 self-stretch border-l border-dashed ${t.colDivider}`} />}

              {/* 3번줄 */}
              {(activeCol === 'all' || activeCol === '3') && (
                <div className="flex flex-col items-center gap-1">
                  {activeCol === 'all' && <span className={`text-[9px] font-black ${t.dim} tracking-widest mb-1`}>3번줄</span>}
                  {(activeRow === 'all' || activeRow === '1') && <SmallTable tableNum={6}  {...sharedProps} onTableClick={() => setExpandedTable(6)} />}
                  {activeRow === 'all' && <div className={`w-full h-px ${t.divider} my-1`} />}
                  {(activeRow === 'all' || activeRow === '2') && <SmallTable tableNum={2}  {...sharedProps} onTableClick={() => setExpandedTable(2)} />}
                  {(activeRow === 'all' || activeRow === '3') && <SmallTable tableNum={1}  {...sharedProps} onTableClick={() => setExpandedTable(1)} />}
                </div>
              )}

              {/* 4번줄 */}
              {(activeCol === 'all' || activeCol === '4') && (
                <div className="flex flex-col items-center gap-1">
                  {activeCol === 'all' && <span className={`text-[9px] font-black ${t.dim} tracking-widest mb-1`}>4번줄</span>}
                  {(activeRow === 'all' || activeRow === '1') && <SmallTable tableNum={8}  {...sharedProps} onTableClick={() => setExpandedTable(8)} />}
                  {activeRow === 'all' && <div className={`w-full h-px ${t.divider} my-1`} />}
                  {(activeRow === 'all' || activeRow === '2') && <SmallTable tableNum={11} {...sharedProps} onTableClick={() => setExpandedTable(11)} />}
                  {(activeRow === 'all' || activeRow === '3') && <SmallTable tableNum={12} {...sharedProps} onTableClick={() => setExpandedTable(12)} />}
                </div>
              )}

              {(activeCol === 'all' || activeCol === '4') && (
                <div className="flex-shrink-0 self-center ml-1">
                  <div className="flex flex-col items-center gap-1 px-2 py-2 bg-orange-500/15 border border-orange-500/30 rounded-xl">
                    <span className="text-base">🚬</span>
                    <span className="text-[9px] font-black text-orange-400">흡연실</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(activeCol === 'all' || activeCol === '1') && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 border border-blue-500/30 rounded-xl">
                <span className="text-base">🚻</span>
                <span className="text-xs font-black text-blue-400">화장실</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {expandedTable !== null && (
        <TableExpandModal
          tableNum={expandedTable} seats={seats} profileMap={profileMap} currentUserId={currentUserId} isAdmin={isAdmin}
          movingProfileId={movingProfileId} darkMode={darkMode} tableLabels={tableLabels}
          onSeatClick={(s) => { onSeatClick?.(s); setExpandedTable(null); }}
          onProfileClick={(p) => {
            setExpandedTable(null);
            const s = seats.find(seat => seat.profile_id === p.id) ?? null;
            if (!isAdmin && s) setProfilePopup({ profile: p, seat: s });
          }}
          onClearSeat={onClearSeat} onShowQr={onShowQr}
          onSelectForMove={isAdmin && onForceSeat ? handleSelectForMove : undefined}
          onMoveTo={isAdmin && onForceSeat ? (seat) => { handleMoveTo(seat); setExpandedTable(null); } : undefined}
          onSetTableLabel={isAdmin && onSetTableLabel ? onSetTableLabel : undefined}
          onClose={() => setExpandedTable(null)}
        />
      )}

      {profilePopup && !isAdmin && (
        <ProfilePopup
          profile={profilePopup.profile} seat={profilePopup.seat}
          isCurrentUser={profilePopup.profile.id === currentUserId}
          onChat={onChatClick ?? onProfileClick}
          onClose={() => setProfilePopup(null)}
        />
      )}
    </>
  );
}
