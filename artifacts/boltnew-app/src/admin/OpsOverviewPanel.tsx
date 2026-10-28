import { useState } from 'react';
import type { Profile, AppSettings, DbHealthData } from './shared';
import { ConfirmDialog } from './ConfirmDialog';
import { CORE_MODULES, DETACHABLE_MODULE_IDS, MODULE_LABELS, parseModuleFlags, type DetachableModuleId } from '../lib/module-flags';

/** Moved intact from DashboardTab: diagnostics and non-destructive module controls. */
export function OpsOverviewPanel({ settings, profiles, onToggleModule, dbHealth, dbHealthLoading }: {
  settings: AppSettings | null; profiles: Profile[];
  onToggleModule: (id: DetachableModuleId) => void | Promise<void>;
  dbHealth: DbHealthData | null; dbHealthLoading: boolean;
}) {
  const [confirmModuleOff, setConfirmModuleOff] = useState<DetachableModuleId | null>(null);
  const runtime = dbHealth?.runtime;
  const metrics = dbHealth?.httpMetrics;
  const uptimeMin = runtime ? Math.floor(runtime.uptimeSec / 60) : null;
  const checkedAt = dbHealth?.checkedAt ? new Date(dbHealth.checkedAt).toLocaleTimeString('ko-KR') : '-';
  const moduleFlags = parseModuleFlags(settings?.module_flags ?? runtime?.moduleFlags);
  return (
    <div className="p-4 space-y-4" data-testid="db-health-operations">
      <div data-testid="ops-overview-card" className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">개발·운영 현황</h3>
            <p className="text-[10px] text-slate-500">관리자 화면에서 5초마다 자동갱신 · 마지막 확인 {checkedAt}</p>
          </div>
          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${dbHealth?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {dbHealthLoading ? '확인 중' : dbHealth?.ok ? '정상' : '확인 필요'}
          </span>
        </div>

        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">배포 코드</div>
            <div className="font-black text-slate-800 mt-0.5">{runtime?.commit && runtime.commit !== 'unknown' ? runtime.commit.slice(0, 8) : '로컬/미확인'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">API 가동</div>
            <div className="font-black text-slate-800 mt-0.5">{uptimeMin == null ? '-' : `${uptimeMin}분`}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">SSE 실시간</div>
            <div className="font-black text-slate-800 mt-0.5">{dbHealth ? `${dbHealth.sseConnections} 연결` : '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">모바일 Push</div>
            <div className={`font-black mt-0.5 ${runtime?.pushConfigured ? 'text-emerald-700' : 'text-red-600'}`}>
              {runtime ? (runtime.pushConfigured ? `ON · ${runtime.pushSubscriptions}구독` : 'OFF') : '-'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">DB 저장 오류</div>
            <div className={`font-black mt-0.5 ${(dbHealth?.persistErrors ?? 0) > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {dbHealth ? dbHealth.persistErrors : '-'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-slate-400 font-bold">참여자</div>
            <div className="font-black text-slate-800 mt-0.5">{profiles.length}명</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-[10px] text-indigo-900">
          <div className="font-black mb-1">실시간/푸시 누적</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Push 성공 <b>{metrics?.pushSucceeded ?? 0}</b></span>
            <span>재시도 <b>{metrics?.pushRetries ?? 0}</b></span>
            <span>만료 구독 <b>{metrics?.pushExpired ?? 0}</b></span>
            <span>Push 오류 <b>{metrics?.pushErrors ?? 0}</b></span>
          </div>
        </div>

        {(dbHealth?.alarms?.length ?? 0) > 0 && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-[10px] text-red-700">
            <div className="font-black mb-1">운영 경고</div>
            {dbHealth!.alarms.slice(0, 3).map((alarm) => <div key={alarm}>• {alarm}</div>)}
          </div>
        )}
      </div>

      <div data-testid="module-switches-card" className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-black text-cyan-950">🧩 기능 붙이기 · 떼기</h3>
          <p className="mt-1 text-[10px] font-semibold text-cyan-700">
            OFF는 코드·기록을 삭제하지 않고 화면과 새 사용만 막습니다. 다시 ON 하면 그대로 복구됩니다.
          </p>
        </div>
        <div className="space-y-2">
          {DETACHABLE_MODULE_IDS.map((id) => {
            const enabled = moduleFlags[id];
            const detail: Record<DetachableModuleId, string> = {
              hearts: '하트 버튼·받은/보낸 하트·하트 안내',
              direct_chat: '1:1 채팅 버튼·목록·채팅방',
              group_chat: '단체 채팅 목록·입장·메시지',
              contact_qr: '참가자 연락처 QR 만들기·스캔',
              stats: '참여자 통계 화면',
              ranking: '참여자 랭킹 화면',
              push: '휴대폰 하트/1:1 알림',
              event_hub: '술번개 신청·대기방·행사 운영 (기본 OFF)',
              seasonal_landing: '메인 할로윈 장식 · 11/1 17시 자동 종료 (입장·모집과 별개)',
            };
            return (
              <button
                key={id}
                type="button"
                data-testid={`module-toggle-${id}`}
                onClick={() => {
                  if (enabled) setConfirmModuleOff(id);
                  else void onToggleModule(id);
                }}
                className={`w-full rounded-xl border p-3 flex items-center gap-3 text-left transition active:scale-[0.99] ${enabled ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-slate-900">{MODULE_LABELS[id]}</div>
                  <div className="text-[10px] mt-0.5 text-slate-500">{detail[id]}</div>
                </div>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                  {enabled ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl bg-white/80 p-2.5">
          <div className="text-[10px] font-black text-cyan-900 mb-2">CORE · 항상 ON</div>
          <div className="grid grid-cols-2 gap-1.5">
            {CORE_MODULES.map((item) => (
              <div key={item.id} className="rounded-lg border border-cyan-100 bg-cyan-50/60 px-2 py-1.5">
                <div className="text-[10px] font-black text-cyan-900">🟢 {item.label}</div>
                <div className="text-[9px] text-cyan-700">{item.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] font-semibold text-cyan-700">
            관리자 QR은 관리자 CORE에 포함 · 연락처 QR만 선택적으로 OFF 가능
          </div>
        </div>
      </div>

      {confirmModuleOff && (
        <ConfirmDialog
          title={`${MODULE_LABELS[confirmModuleOff]} 기능을 잠시 떼시겠습니까?`}
          message={`기존 데이터와 코드는 삭제하지 않습니다.\n참가자 화면·새 사용·해당 실시간 연결만 중지하고, 다시 ON 하면 그대로 복구됩니다.`}
          onConfirm={() => {
            const id = confirmModuleOff;
            setConfirmModuleOff(null);
            void onToggleModule(id);
          }}
          onCancel={() => setConfirmModuleOff(null)}
        />
      )}
    </div>
  );
}
