import { useEffect, useState } from "react";
import { HubButton, HubCard, HubCheck, HubFeedback } from "./HubUi";
import type { TestModeController } from "./test-mode-client";

export function TestModePanel({ controller }: { controller: TestModeController }) {
  const { data, busy, error, write, load } = controller;
  const [resetConfirm, setResetConfirm] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const mode = data?.mode;
  useEffect(() => {
    setResetConfirm(false);
    setOpenConfirm(false);
  }, [mode?.generation, mode?.dirty, mode?.enabled]);
  const clean = !!mode && !mode.dirty && mode.resetGeneration === mode.generation;
  return <HubCard>
    <h3 className="font-black">관리자 테스트 모드</h3>
    <p className="text-sm">테스트 ON에서는 실제 신청·순위·입금·현장 입장을 차단합니다. 시험실의 신청·뽑기·하트·채팅은 별도 테스트 저장소에만 보관합니다.</p>
    <p role="status">현재 상태: {mode ? mode.enabled ? "ON · 테스트 및 점검 중" : "OFF · 실제 오픈 조건 확인" : "상태 확인 중 · 신청 차단"}</p>
    <HubButton role="switch" aria-checked={mode?.enabled ?? true}
      disabled={busy || !mode || (mode.enabled && (!clean || !openConfirm))}
      onClick={async () => {
        if (!mode) return;
        if (await write({ operation: "mode", enabled: !mode.enabled,
          ...(!mode.enabled ? {} : { resetGeneration: mode.resetGeneration }) })) setOpenConfirm(false);
      }}>
      {mode?.enabled === false ? "테스트 모드 ON" : "테스트 모드 OFF"}
    </HubButton>
    {mode?.enabled && <>
      <p className="text-sm">{mode.dirty ? "테스트 데이터 있음 · 초기화 후 OFF 가능" : clean ? "전체 테스트 데이터 초기화 완료" : "OFF 전에 전체 테스트 데이터를 초기화해 주세요."}</p>
      <fieldset disabled={busy}>
        <HubCheck label="모든 시험실의 가상 신청·결제·대기방·뽑기·경품·하트·채팅을 삭제하는 것을 확인했습니다." checked={resetConfirm} onChange={setResetConfirm} />
        <HubButton disabled={!resetConfirm || busy} onClick={async () => {
          if (await write({ operation: "reset" })) { setResetConfirm(false); setOpenConfirm(false); }
        }}>테스트 데이터 초기화</HubButton>
        {clean && <HubCheck label="초기화 완료를 확인했습니다. 테스트 모드 OFF 후에도 개인정보·접수 일정 등 실제 오픈 조건을 별도로 확인합니다." checked={openConfirm} onChange={setOpenConfirm} />}
      </fieldset>
    </>}
    <p className="text-xs">초기화는 테스트 저장소 전체에 적용됩니다. 실제 운영 기록과 재고는 변경하지 않습니다. OFF만으로 접수가 열리지는 않습니다.</p>
    <HubFeedback status={busy ? "saving" : ""} error={error} />
    {error && <HubButton disabled={busy} onClick={() => void load()}>테스트 상태 다시 확인</HubButton>}
  </HubCard>;
}
