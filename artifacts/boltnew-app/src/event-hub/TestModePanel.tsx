import { useEffect, useState } from "react";
import { HubButton, HubCard, HubCheck, HubFeedback } from "./HubUi";
import type { TestModeController } from "./test-mode-client";

export function TestModePanel({ controller }: { controller: TestModeController }) {
  const { data, busy, error, write, load } = controller;
  const [resetConfirm, setResetConfirm] = useState(false);
  const [offConfirm, setOffConfirm] = useState(false);
  const [admissionConfirm, setAdmissionConfirm] = useState(false);
  const mode = data?.mode;
  useEffect(() => {
    setResetConfirm(false);
    setOffConfirm(false);
    setAdmissionConfirm(false);
  }, [mode?.generation, mode?.revision, mode?.dirty, mode?.enabled, mode?.publicAdmissionOpen, error]);
  const clean = !!mode && !mode.dirty && mode.resetGeneration === mode.generation;
  return <HubCard>
    <h3 className="font-black">관리자 테스트 모드</h3>
    <div className="hub-test-status">
    <p role="status">현재 상태: {mode ? mode.enabled ? "ON · 테스트 및 점검 중" : "OFF · 테스트 종료" : "상태 확인 중 · 신청 차단"}</p>
    <p role="status">실제 모집: {mode && !mode.enabled && mode.publicAdmissionOpen ? "오픈 확인됨 · 행사별 접수 조건 적용" : "차단 · 웹·오픈채팅 모두 접수 전"}</p>
    </div>
    <details className="hub-test-settings">
      <summary>테스트 설정</summary>
      <div className="space-y-3 pt-3">
    <HubButton role="switch" aria-checked={mode?.enabled ?? true}
      disabled={busy || !mode || (mode.enabled && (!clean || !offConfirm))}
      onClick={async () => {
        if (!mode) return;
        if (await write({ operation: "mode", enabled: !mode.enabled,
          ...(!mode.enabled ? {} : { resetGeneration: mode.resetGeneration }) })) setOffConfirm(false);
      }}>
      {mode?.enabled === false ? "테스트 모드 ON" : "테스트 모드 OFF"}
    </HubButton>
    {mode?.enabled && <>
      <p className="text-sm">{mode.dirty ? "테스트 데이터 있음 · 초기화 후 OFF 가능" : clean ? "전체 테스트 데이터 초기화 완료" : "OFF 전에 전체 테스트 데이터를 초기화해 주세요."}</p>
      <fieldset disabled={busy}>
        <HubCheck label="모든 시험실의 가상 신청·결제·대기방·뽑기·경품·하트·채팅을 삭제하는 것을 확인했습니다." checked={resetConfirm} onChange={setResetConfirm} />
        <HubButton disabled={!resetConfirm || busy} onClick={async () => {
          if (await write({ operation: "reset" })) { setResetConfirm(false); setOffConfirm(false); setAdmissionConfirm(false); }
        }}>테스트 데이터 초기화</HubButton>
        {clean && <HubCheck label="초기화 완료를 확인했습니다. 테스트 모드 OFF 후에도 개인정보·접수 일정 등 실제 오픈 조건을 별도로 확인합니다." checked={offConfirm} onChange={setOffConfirm} />}
      </fieldset>
    </>}
    <p className="text-xs">초기화는 테스트 저장소 전체에 적용됩니다. 실제 운영 기록과 재고는 변경하지 않습니다. OFF만으로 접수가 열리지는 않습니다.</p>
    {mode?.enabled === false && <fieldset disabled={busy} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <h4 className="font-bold">실제 모집 오픈 확인</h4>
      {mode.publicAdmissionOpen ? <>
        <p className="text-sm">행사별 접수 일정·개인정보 정책·모듈 조건은 계속 적용됩니다. 접수를 중지해도 기존 신청·입금·문의·당첨 기록은 보존됩니다.</p>
        <HubButton disabled={busy} onClick={() => void write({ operation: "admission", open: false })}>실제 신규 접수 중지</HubButton>
      </> : <>
        <p className="text-sm">아직 웹·오픈채팅 모두 접수 전입니다. 테스트 완료와 운영자 오픈 확인은 별도입니다. 테스트 중에는 아래 오픈 버튼을 누르지 마세요.</p>
        <HubCheck
          label="테스트와 운영 준비를 마쳤으며, 웹·오픈채팅의 실제 모집을 오픈하는 것을 확인했습니다."
          checked={admissionConfirm}
          onChange={setAdmissionConfirm}
        />
        <HubButton disabled={!clean || !admissionConfirm || busy || !!error} onClick={async () => {
          if (await write({ operation: "admission", open: true, confirmOpen: true })) setAdmissionConfirm(false);
        }}>실제 모집 오픈 확인·저장</HubButton>
        <p className="text-xs">개인정보 정책 등 운영 조건이 미확정이면 서버가 오픈을 거절합니다. 외부 오픈채팅방의 접수 안내는 운영자가 같은 상태로 관리해야 합니다.</p>
      </>}
    </fieldset>}
      </div>
    </details>
    <HubFeedback status={busy ? "saving" : ""} error={error} />
    {error && <HubButton disabled={busy} onClick={() => void load()}>테스트 상태 다시 확인</HubButton>}
  </HubCard>;
}
