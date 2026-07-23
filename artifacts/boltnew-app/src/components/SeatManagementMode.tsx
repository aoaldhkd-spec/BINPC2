import { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeftRight, Move, Pencil, UserX, X, Check, Search, Eye, Lock, Camera, Hash, User, AlertTriangle, ChevronRight, QrCode, Copy, CheckCheck } from 'lucide-react';
import type { Database } from '../types/database';
import { supabase } from '../lib/supabase';
import { TABLE_POSITIONS } from '../lib/constants';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Seat = Database['public']['Tables']['seats']['Row'];

type Mode = 'swap' | 'place' | 'edit' | 'remove';

interface Props {
  seats: Seat[];
  profileMap: Map<string, Profile>;
  adminPassword: string;
  tableLabels?: Record<string, string> | null;
  onReload: () => Promise<void>;
}

const MODES: { id: Mode; label: string; icon: typeof Move; color: string; desc: string }[] = [
  { id: 'place', label: '배치', icon: Move, color: 'amber', desc: '미배치 인원 선택 후 빈 자리 탭, 또는 앉은 사람→빈 자리 이동' },
  { id: 'swap', label: '교체', icon: ArrowLeftRight, color: 'violet', desc: '두 자리를 터치하여 서로 교체' },
  { id: 'edit', label: '변경', icon: Pencil, color: 'teal', desc: '닉네임·정보 직접 수정' },
  { id: 'remove', label: '제거', icon: UserX, color: 'red', desc: '인원 퇴장/자리 비우기' },
];

function shortLabel(seat: Seat) {
  return seat.seat_label.split(' ').pop() ?? seat.seat_label;
}

export default function SeatManagementMode({ seats, profileMap, adminPassword, tableLabels, onReload }: Props) {
  const label = (tableNum: number) => tableLabels?.[String(tableNum)] ?? String(tableNum);
  const [mode, setMode] = useState<Mode>('place');
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [editSeat, setEditSeat] = useState<Seat | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Seat | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactViewSeat, setContactViewSeat] = useState<Seat | null>(null);
  const [assignTarget, setAssignTarget] = useState<Seat | null>(null);
  const [opStatus, setOpStatus] = useState<{ seat: string; msg: string } | null>(null);


  const allProfiles = Array.from(profileMap.values());
  const unseatedProfiles = useMemo(() =>
    allProfiles
      .filter(p => !seats.some(s => s.profile_id === p.id))
      .filter(p => !searchQuery || p.nickname.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [allProfiles, seats, searchQuery]
  );
  const unseatedCount = useMemo(() =>
    allProfiles.filter(p => !seats.some(s => s.profile_id === p.id)).length,
    [allProfiles, seats]
  );
  const tableNumbers = [...new Set(seats.map(s => s.table_number))].sort((a, b) => a - b);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const setOp = (seat: Seat | null, msg: string | null) => {
    if (!seat || !msg) { setOpStatus(null); return; }
    setOpStatus({ seat: shortLabel(seat), msg });
  };
  const resetSelection = () => { setSelectedSeat(null); setSelectedProfile(null); };

  const handleSeatTouch = async (seat: Seat) => {
    if (busy) return;

    if (mode === 'swap') {
      if (!seat.profile_id) { showToast('빈 자리는 교체할 수 없습니다.'); return; }
      if (!selectedSeat) { setSelectedSeat(seat); return; }
      if (selectedSeat.id === seat.id) { resetSelection(); return; }
      if (!selectedSeat.profile_id) { resetSelection(); return; }
      setOp(seat, '교체 처리 중...');
      setBusy(true);
      const { error } = await supabase.rpc('admin_swap_seats', {
        p_seat_a_id: selectedSeat.id, p_seat_b_id: seat.id, p_admin_password: adminPassword,
      });
      setBusy(false);
      setOp(null, null);
      if (error) { showToast(`교체 실패: ${error.message}`); resetSelection(); return; }
      await onReload();
      showToast(`${shortLabel(selectedSeat)} ↔ ${shortLabel(seat)} 교체 완료`);
      resetSelection();
    } else if (mode === 'place') {
      if (selectedProfile) {
        if (seat.status === 'occupied') { showToast('빈 자리를 선택하세요.'); return; }
        setOp(seat, `${selectedProfile.nickname} 배치 중...`);
        setBusy(true);
        const { error } = await supabase.rpc('admin_force_seat', {
          p_profile_id: selectedProfile.id, p_seat_id: seat.id, p_admin_password: adminPassword,
        });
        setBusy(false);
        setOp(null, null);
        if (error) { showToast(`배치 실패: ${error.message}`); resetSelection(); return; }
        await onReload();
        showToast(`${selectedProfile.nickname} → ${shortLabel(seat)} 배치 완료`);
        resetSelection();
        return;
      }
      if (selectedSeat) {
        if (selectedSeat.id === seat.id) { resetSelection(); return; }
        if (seat.status === 'occupied') { showToast('빈 자리를 선택하세요.'); return; }
        if (!selectedSeat.profile_id) { resetSelection(); return; }
        setOp(seat, `${shortLabel(selectedSeat)} 이동 중...`);
        setBusy(true);
        const { error } = await supabase.rpc('admin_force_seat', {
          p_profile_id: selectedSeat.profile_id, p_seat_id: seat.id, p_admin_password: adminPassword,
        });
        setBusy(false);
        setOp(null, null);
        if (error) { showToast(`이동 실패: ${error.message}`); resetSelection(); return; }
        await onReload();
        showToast(`${shortLabel(selectedSeat)} → ${shortLabel(seat)} 이동 완료`);
        resetSelection();
        return;
      }
      if (seat.profile_id) {
        setSelectedSeat(seat);
        return;
      }
      // Empty seat, no prior selection — open hybrid assign modal
      setAssignTarget(seat);
    } else if (mode === 'edit') {
      if (seat.profile_id) setEditSeat(seat);
      else showToast('수정할 인원이 있는 자리를 터치하세요.');
    } else if (mode === 'remove') {
      if (seat.profile_id) setConfirmRemove(seat);
      else showToast('비어 있는 자리입니다.');
    }
  };

  const handleProfileTouch = (profile: Profile) => {
    if (mode !== 'place') { setMode('place'); }
    if (selectedProfile?.id === profile.id) { resetSelection(); return; }
    setSelectedProfile(profile);
    setSelectedSeat(null);
  };

  const doRemove = async () => {
    if (!confirmRemove) return;
    setOp(confirmRemove, '제거 처리 중...');
    setBusy(true);
    const { error } = await supabase.rpc('admin_clear_profile_seat', {
      p_profile_id: confirmRemove.profile_id!, p_admin_password: adminPassword,
    });
    setBusy(false);
    if (error) { showToast(`제거 실패: ${error.message}`); setConfirmRemove(null); return; }
    await onReload();
    showToast(`${shortLabel(confirmRemove)} 자리 비움`);
    setConfirmRemove(null);
  };

  const seatColor = (seat: Seat): string => {
    const occupied = seat.status === 'occupied';
    const isSelected = selectedSeat?.id === seat.id;
    if (isSelected) return 'border-orange-500 ring-2 ring-orange-300 bg-orange-50';
    if (mode === 'place' && (selectedProfile || selectedSeat) && !occupied)
      return 'border-teal-400 bg-teal-50 animate-pulse';
    if (occupied) {
      if (mode === 'swap') return 'border-violet-300 bg-violet-50';
      if (mode === 'edit') return 'border-teal-300 bg-teal-50';
      if (mode === 'remove') return 'border-red-300 bg-red-50';
      return 'border-gray-300 bg-white';
    }
    return 'border-dashed border-gray-200 bg-gray-50';
  };

  const renderSeat = (seat: Seat | undefined) => {
    if (!seat) return <div className="w-16 h-16 rounded-xl bg-gray-50 border border-dashed border-gray-200" />;
    const profile = seat.profile_id ? profileMap.get(seat.profile_id) : null;
    const occupied = seat.status === 'occupied';
    const isSelected = selectedSeat?.id === seat.id;
    return (
      <div
        key={seat.id}
        role="button"
        tabIndex={0}
        onClick={() => !busy && handleSeatTouch(seat)}
        onKeyDown={e => e.key === 'Enter' && !busy && handleSeatTouch(seat)}
        className={`relative w-16 h-16 rounded-xl border-2 p-1 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5 select-none ${busy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} ${seatColor(seat)}`}
      >
        {occupied && profile ? (
          <>
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-teal-100 to-cyan-200">
              <span className="text-[10px] font-black text-teal-700">{profile.nickname.charAt(0)}</span>
            </div>
            <span className="text-[9px] font-bold text-gray-700 truncate max-w-full">{profile.nickname}</span>
            <span className="text-[8px] text-gray-400">{shortLabel(seat)}</span>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300">
              <span className="text-[10px]">빈</span>
            </div>
            <span className="text-[8px] text-gray-400">{shortLabel(seat)}</span>
          </>
        )}
        {isSelected && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black shadow">
            <Check className="w-3 h-3" />
          </span>
        )}
        {occupied && !isSelected && (
          <button
            onClick={e => { e.stopPropagation(); setContactViewSeat(seat); }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shadow hover:bg-sky-600 transition-all"
          >
            <Eye className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    );
  };

  const renderTable = (tableNum: number) => {
    const cfg = TABLE_POSITIONS[tableNum];
    const tableSeats = seats.filter(s => s.table_number === tableNum);
    const get = (pos: number) => tableSeats.find(s => s.seat_position === pos);
    const currentLabel = label(tableNum);

    const tableBadge = (
      <span className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-black text-xs">
        {currentLabel}
      </span>
    );

    if (!cfg) {
      return (
        <div key={tableNum} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
          <div className="flex items-center gap-2 mb-3">
            {tableBadge}
            <span className="text-xs font-bold text-gray-700">{currentLabel}번 테이블</span>
          </div>
          <div className="flex flex-wrap gap-2">{tableSeats.sort((a, b) => a.seat_position - b.seat_position).map(s => renderSeat(s))}</div>
        </div>
      );
    }

    const sofaLabel = <span className="text-[8px] font-black text-teal-500 tracking-wider">소파</span>;
    const faceLabel = <span className="text-[8px] font-black text-slate-400 tracking-wider">맞은편</span>;

    const leftCol = (
      <div className="flex flex-col gap-1 items-center">
        {cfg.type === 'sofa' && (cfg.sofaOnLeft ? sofaLabel : faceLabel)}
        <div className={`flex flex-col gap-1.5 ${cfg.type === 'sofa' && cfg.sofaOnLeft ? 'p-1.5 rounded-xl bg-teal-50 border border-teal-200' : ''}`}>
          {cfg.leftCol.map(pos => renderSeat(get(pos)))}
        </div>
      </div>
    );
    const rightCol = (
      <div className="flex flex-col gap-1 items-center">
        {cfg.type === 'sofa' && (!cfg.sofaOnLeft ? sofaLabel : faceLabel)}
        <div className={`flex flex-col gap-1.5 ${cfg.type === 'sofa' && !cfg.sofaOnLeft ? 'p-1.5 rounded-xl bg-teal-50 border border-teal-200' : ''}`}>
          {cfg.rightCol.map(pos => renderSeat(get(pos)))}
        </div>
      </div>
    );

    return (
      <div key={tableNum} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
        <div className="flex items-center gap-2 mb-3">
          {tableBadge}
          <span className="text-xs font-bold text-gray-700">{currentLabel}번 테이블</span>
          <span className="text-[10px] text-gray-400">{tableSeats.filter(s => s.status === 'occupied').length}/{tableSeats.length}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          {cfg.topRow && <div className="flex gap-1.5">{cfg.topRow.map(pos => renderSeat(get(pos)))}</div>}
          <div className="flex items-stretch gap-1.5">
            {leftCol}
            <div className="rounded-lg bg-amber-100 border-2 border-amber-300 flex flex-col items-center justify-center gap-0.5 w-9 self-stretch">
              <span className="text-[10px] font-black text-amber-700 leading-none">{currentLabel}</span>
            </div>
            {rightCol}
          </div>
          {cfg.bottomRow && <div className="flex gap-1.5">{cfg.bottomRow.map(pos => renderSeat(get(pos)))}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 미배치 인원 패널 */}
      <div className="bg-amber-50 rounded-2xl border border-amber-200 p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-black text-amber-700">미배치 인원 {unseatedCount}명</span>
        </div>
        {unseatedCount > 0 ? (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="닉네임 검색..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border-2 border-amber-200 bg-white text-sm focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
              {unseatedProfiles.map(p => {
                const isSel = selectedProfile?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProfileTouch(p)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 transition-all ${
                      isSel ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300' : 'border-amber-200 bg-white hover:border-amber-400'
                    }`}
                  >
                    <img src={p.photo_url} alt={p.nickname} className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-xs font-bold text-gray-700 whitespace-nowrap">{p.nickname}</span>
                    {isSel && <Check className="w-3 h-3 text-orange-500" />}
                  </button>
                );
              })}
              {unseatedProfiles.length === 0 && searchQuery && (
                <span className="text-xs text-gray-400 py-2">검색 결과 없음</span>
              )}
            </div>
            {mode === 'place' && <p className="text-[10px] text-amber-500 font-medium mt-1.5">탭하여 선택 → 빈 자리에 배치</p>}
          </>
        ) : (
          <p className="text-xs text-amber-600 font-medium py-1">모든 인원이 배치되었습니다.</p>
        )}
      </div>

      {/* 모드 선택 바 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sticky top-[88px] z-10">
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            const colorMap: Record<string, string> = {
              amber: active ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-600 hover:border-amber-300',
              violet: active ? 'bg-violet-500 text-white border-violet-500' : 'border-gray-200 text-gray-600 hover:border-violet-300',
              teal: active ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:border-teal-300',
              red: active ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300',
            };
            return (
              <button key={m.id} onClick={() => { setMode(m.id); resetSelection(); }}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${colorMap[m.color]}`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-bold">{m.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 text-center mt-2.5">
          {MODES.find(m => m.id === mode)?.desc}
          {selectedProfile && mode === 'place' && (
            <span className="ml-1 text-orange-600 font-semibold">· 선택: {selectedProfile.nickname} — 빈 자리 선택</span>
          )}
          {selectedSeat && (mode === 'swap' || mode === 'place') && (
            <span className="ml-1 text-orange-600 font-semibold">
              · 선택: {shortLabel(selectedSeat)} — {mode === 'swap' ? '교체할 자리 선택' : '빈 자리 선택'}
            </span>
          )}
        </p>
      </div>

      {/* 테이블 시각적 배치도 */}
      <div className="space-y-3">
        {tableNumbers.map(tableNum => renderTable(tableNum))}
      </div>

      {/* Hybrid Assign Modal */}
      {assignTarget && (
        <HybridAssignModal
          seat={assignTarget}
          adminPassword={adminPassword}
          unseatedProfiles={unseatedProfiles}
          onAssigned={async (profileId: string) => {
            setBusy(true);
            const { error } = await supabase.rpc('admin_force_seat', {
              p_profile_id: profileId, p_seat_id: assignTarget.id, p_admin_password: adminPassword,
            });
            setBusy(false);
            if (error) { showToast(`배치 실패: ${error.message}`); }
            else { await onReload(); showToast(`${shortLabel(assignTarget)} 배치 완료`); }
            setAssignTarget(null);
          }}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {/* Admin Contact View Modal */}
      {contactViewSeat && contactViewSeat.profile_id && (() => {
        const profile = profileMap.get(contactViewSeat.profile_id!);
        if (!profile) return null;
        return <AdminContactModal profile={profile} onClose={() => setContactViewSeat(null)} />;
      })()}

      {/* Edit 모달 */}
      {editSeat && editSeat.profile_id && (() => {
        const profile = profileMap.get(editSeat.profile_id);
        if (!profile) return null;
        return <EditProfileModal profile={profile} seat={editSeat} adminPassword={adminPassword} onClose={() => setEditSeat(null)} onSaved={async () => { await onReload(); setEditSeat(null); showToast('정보 수정 완료'); }} />;
      })()}

      {/* Remove 확인 모달 */}
      {confirmRemove && (() => {
        const profile = confirmRemove.profile_id ? profileMap.get(confirmRemove.profile_id) : null;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmRemove(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 w-72 text-center" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <UserX className="w-6 h-6 text-red-500" />
              </div>
              <p className="font-black text-gray-900 text-base mb-1">자리에서 제거</p>
              <p className="text-sm text-gray-500 mb-4">
                <strong>{profile?.nickname ?? '사용자'}</strong> ({shortLabel(confirmRemove)})를 자리에서 제거합니다.
                <br /><span className="text-xs text-gray-400">프로필은 유지되고 자리만 비워집니다.</span>
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmRemove(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">취소</button>
                <button onClick={doRemove} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-all">제거</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fixed bottom status bar — always visible when an op is in progress */}
      <div className={`fixed bottom-0 left-0 right-0 z-[290] transition-all duration-300 ${opStatus || busy ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-slate-900 border-t border-slate-700 px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center flex-shrink-0">
            <span className="text-teal-400 font-black text-xs">{opStatus?.seat ?? '...'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{opStatus?.msg ?? '처리 중...'}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {[0,1,2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Edit Profile Modal ──────────────────────────────────────────────────────

function EditProfileModal({ profile, seat, adminPassword, onClose, onSaved }: {
  profile: Profile; seat: Seat; adminPassword: string; onClose: () => void; onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [mbti, setMbti] = useState(profile.mbti ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_profile', {
      p_profile_id: profile.id,
      p_nickname: nickname.trim(),
      p_mbti: mbti,
      p_bio: bio,
      p_admin_password: adminPassword,
    });
    setSaving(false);
    if (error) { alert(`수정 실패: ${error.message}`); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-black text-gray-900">참여자 정보 변경</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-50">
            <img src={profile.photo_url} alt={profile.nickname} className="w-14 h-14 rounded-xl object-cover" />
            <div>
              <p className="text-sm font-bold text-gray-700">{shortLabel(seat)}</p>
              <p className="text-xs text-gray-400">현재 닉네임: {profile.nickname}</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">닉네임</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">MBTI</label>
            <input value={mbti} onChange={e => setMbti(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="예: ENFP" className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">관심사 (콤마 구분)</label>
            <input value={bio} onChange={e => setBio(e.target.value)}
              placeholder="예: 운동, 맛집탐방, 여행" className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none text-sm" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm">취소</button>
          <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600 disabled:opacity-50 transition-all">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Contact Modal ─────────────────────────────────────────────────────

function AdminContactModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const isPrivate = profile.contact_private;
  const [selectedKakao, setSelectedKakao] = useState(false);
  const [selectedInstagram, setSelectedInstagram] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(false);

  const hasAny = profile.kakao_id || profile.instagram_id || profile.phone_number;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-black text-gray-900">연락처 조회</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-200 flex items-center justify-center">
              <span className="text-lg font-black text-teal-700">{profile.nickname.charAt(0)}</span>
            </div>
            <div>
              <p className="font-black text-gray-900">{profile.nickname}</p>
              {profile.mbti && <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{profile.mbti}</span>}
            </div>
          </div>

          {isPrivate ? (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <Lock className="w-6 h-6 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-600">연락처 비공개</p>
                <p className="text-xs text-gray-400">이 참여자는 연락처 공유를 거부했습니다.</p>
              </div>
            </div>
          ) : !hasAny ? (
            <p className="text-sm text-gray-400 text-center py-3">등록된 연락처가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 mb-1">공유할 연락처 선택</p>
              {profile.kakao_id && (
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedKakao ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 bg-gray-50 hover:border-yellow-200'}`}>
                  <input type="checkbox" checked={selectedKakao} onChange={e => setSelectedKakao(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                  <span className="w-6 h-6 rounded-lg bg-yellow-400 text-white flex items-center justify-center text-xs font-black">K</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500">카카오톡</p>
                    <p className="text-sm font-bold text-gray-800">{profile.kakao_id}</p>
                  </div>
                </label>
              )}
              {profile.instagram_id && (
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedInstagram ? 'border-pink-400 bg-pink-50' : 'border-gray-100 bg-gray-50 hover:border-pink-200'}`}>
                  <input type="checkbox" checked={selectedInstagram} onChange={e => setSelectedInstagram(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center text-xs font-black">@</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500">인스타그램</p>
                    <p className="text-sm font-bold text-gray-800">@{profile.instagram_id}</p>
                  </div>
                </label>
              )}
              {profile.phone_number && (
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedPhone ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-gray-50 hover:border-green-200'}`}>
                  <input type="checkbox" checked={selectedPhone} onChange={e => setSelectedPhone(e.target.checked)} className="w-4 h-4 accent-green-500" />
                  <span className="w-6 h-6 rounded-lg bg-green-500 text-white flex items-center justify-center text-xs font-black">#</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500">전화번호</p>
                    <p className="text-sm font-bold text-gray-800">{profile.phone_number}</p>
                  </div>
                </label>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 transition-all">닫기</button>
        </div>
      </div>
    </div>
  );
}

// ─── Korean 초성 Search Utility ──────────────────────────────────────────────

const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChosung(str: string): string {
  return str.split('').map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join('');
}
function matchesSearch(text: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (text.toLowerCase().includes(q)) return true;
  // Check if query is all chosung
  const isChosung = [...q].every(c => CHOSUNG.includes(c));
  if (isChosung) return getChosung(text).includes(q);
  return false;
}


// ─── Hybrid Assign Modal ─────────────────────────────────────────────────────

type AssignMode = 'show_qr' | 'qr' | 'code' | 'nickname';

function HybridAssignModal({
  seat, adminPassword, unseatedProfiles, onAssigned, onClose,
}: {
  seat: Seat;
  adminPassword: string;
  unseatedProfiles: Profile[];
  onAssigned: (profileId: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AssignMode>('show_qr');
  const [copied, setCopied] = useState(false);
  const [pin, setPin] = useState('');
  const [nickSearch, setNickSearch] = useState('');
  const [pinResult, setPinResult] = useState<Profile | null | 'not_found'>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<unknown>(null);
  const rafRef = useRef<number>(0);

  const filteredProfiles = unseatedProfiles.filter(p =>
    !nickSearch || matchesSearch(p.nickname, nickSearch)
  );

  // ── QR scanning ──────────────────────────────────────────────────────────
  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setQrError(null);
    if (!('BarcodeDetector' in window)) {
      setQrError('이 기기는 QR 스캔을 지원하지 않습니다.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraActive(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setQrError('카메라 접근 권한이 필요합니다. 번호 입력 또는 닉네임 검색을 이용해 주세요.');
    }
  };

  useEffect(() => {
    if (mode === 'qr') startCamera();
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !detectorRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    const scan = async () => {
      if (!detectorRef.current || !video.readyState || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const barcodes = await (detectorRef.current as any).detect(video);
        if (barcodes.length > 0) {
          const raw = (barcodes[0].rawValue as string).trim();
          stopCamera();
          if (raw.startsWith('PROFID:')) {
            await handleProfileIdLookup(raw.replace('PROFID:', ''));
          } else {
            await handlePinLookup(raw);
          }
          return;
        }
      } catch { /* continue */ }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  // ── Profile ID lookup (for QR scanning with PROFID: prefix) ───────────────
  const handleProfileIdLookup = async (profileId: string) => {
    setPinLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
    setPinLoading(false);
    if (data) {
      setPinResult(data as Profile);
      setMode('code');
      setPin((data as Profile).pin_code ?? '');
    } else {
      setPinResult('not_found');
      setMode('code');
    }
  };

  // ── PIN lookup (shared by QR & code mode) ────────────────────────────────
  const handlePinLookup = async (code: string) => {
    setPinLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('pin_code', code.padStart(4, '0')).maybeSingle();
    setPinLoading(false);
    if (data) {
      setPinResult(data as Profile);
      setMode('code');
      setPin(code);
    } else {
      setPinResult('not_found');
      setMode('code');
      setPin(code);
    }
  };

  const handlePinSubmit = async () => {
    if (pin.length !== 4) return;
    await handlePinLookup(pin);
  };

  const seatLabel = seat.seat_label.split(' ').pop() ?? seat.seat_label;

  const seatQrUrl = (() => {
    const base = localStorage.getItem('qr_base_url') || window.location.origin;
    return `${base}/?seat=${seat.id}`;
  })();
  const copyUrl = () => {
    navigator.clipboard.writeText(seatQrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const TABS: { id: AssignMode; icon: typeof Camera; label: string }[] = [
    { id: 'show_qr', icon: QrCode, label: '좌석 QR' },
    { id: 'qr', icon: Camera, label: 'QR 스캔' },
    { id: 'code', icon: Hash, label: '번호 입력' },
    { id: 'nickname', icon: User, label: '닉네임' },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <h3 className="font-black text-gray-900 text-base">좌석 배정</h3>
            <p className="text-xs text-gray-400">자리: {seatLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 transition-all">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 border-b border-gray-100">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button key={tab.id} onClick={() => { setMode(tab.id); setPin(''); setPinResult(null); }}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-bold transition-all border-b-2 ${active ? 'border-teal-500 text-teal-600 bg-teal-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* ── SHOW QR MODE ── */}
          {mode === 'show_qr' && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-gray-400">참여자가 아래 QR을 스캔하면 이 자리로 바로 입장합니다</p>
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-2xl border-2 border-gray-100 shadow-inner inline-block">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(seatQrUrl)}&size=240x240&margin=10`}
                    alt="Seat QR"
                    className="w-52 h-52 rounded-xl"
                  />
                </div>
              </div>
              <p className="text-sm font-black text-gray-800">{seatLabel} 입장 QR</p>
              <button
                onClick={copyUrl}
                className={`w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl transition-all ${copied ? 'bg-teal-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
              >
                {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '복사됨!' : '링크 복사'}
              </button>
            </div>
          )}

          {/* ── QR SCAN MODE ── */}
          {mode === 'qr' && (
            <div className="space-y-3">
              {qrError ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-semibold text-amber-700">{qrError}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setMode('code')} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 transition-all">번호 입력</button>
                    <button onClick={() => setMode('nickname')} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-all">닉네임 검색</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative bg-black rounded-2xl overflow-hidden aspect-square w-full">
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    {/* scanning overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 relative">
                        <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-lg" />
                        <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-lg" />
                        <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-lg" />
                        <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-lg" />
                        <div className="absolute inset-x-0 top-1/2 h-0.5 bg-teal-400 animate-pulse" />
                      </div>
                    </div>
                    {!cameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <p className="text-white text-sm font-semibold">카메라 시작 중...</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-center text-gray-400">참여자 QR 코드를 카메라에 비춰주세요</p>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setMode('code')} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold text-xs hover:bg-gray-200 transition-all">번호 입력으로</button>
                    <button onClick={() => setMode('nickname')} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold text-xs hover:bg-gray-200 transition-all">닉네임으로</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CODE MODE ── */}
          {mode === 'code' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 mb-2 block">참여자 4자리 고유번호 입력</label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    maxLength={4}
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && pin.length === 4 && handlePinSubmit()}
                    placeholder="0000"
                    className="flex-1 text-center text-2xl font-black tracking-[0.5em] px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none"
                    autoFocus
                  />
                  <button onClick={handlePinSubmit} disabled={pin.length !== 4 || pinLoading}
                    className="px-4 py-3 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600 disabled:opacity-40 transition-all">
                    {pinLoading ? '...' : '조회'}
                  </button>
                </div>
              </div>

              {pinResult === 'not_found' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-600 font-semibold">해당 번호의 참여자를 찾을 수 없습니다.</p>
                </div>
              )}

              {pinResult && pinResult !== 'not_found' && (
                <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4">
                  <p className="text-xs font-semibold text-teal-600 mb-2">참여자 확인</p>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-200 flex items-center justify-center text-lg font-black text-teal-700 flex-shrink-0">
                      {pinResult.nickname.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900">{pinResult.nickname}</p>
                      {pinResult.mbti && <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">{pinResult.mbti}</span>}
                    </div>
                    <span className="text-2xl font-black text-teal-400 tracking-widest">#{pinResult.pin_code}</span>
                  </div>
                  <button onClick={() => onAssigned(pinResult.id)}
                    className="w-full py-3 rounded-xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-600 transition-all flex items-center justify-center gap-2">
                    {seatLabel} 자리에 배정 <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── NICKNAME MODE ── */}
          {mode === 'nickname' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={nickSearch}
                  onChange={e => setNickSearch(e.target.value)}
                  placeholder="닉네임 검색..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-teal-400 focus:outline-none text-sm"
                  autoFocus
                />
              </div>
              {filteredProfiles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  {nickSearch ? '검색 결과 없음' : '미배치 인원이 없습니다'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {filteredProfiles.map(p => (
                    <button key={p.id} onClick={() => onAssigned(p.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-100 hover:border-teal-300 hover:bg-teal-50 transition-all text-left">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-200 flex items-center justify-center font-black text-teal-700 text-sm flex-shrink-0">
                        {p.nickname.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{p.nickname}</p>
                        {p.mbti && <span className="text-xs text-violet-500">{p.mbti}</span>}
                      </div>
                      {p.pin_code && <span className="text-xs font-black text-gray-300">#{p.pin_code}</span>}
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
