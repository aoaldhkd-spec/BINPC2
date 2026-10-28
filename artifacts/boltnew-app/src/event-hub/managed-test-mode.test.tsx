// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagedEventLaboratory } from "./ManagedEventLaboratory";
import { TestModePanel } from "./TestModePanel";
import { useTestMode, type LaboratoryResponse } from "./test-mode-client";
import { EventLaboratoryStore, type LabSnapshot } from "./event-laboratory-store";
import { EVENT_TEST_MODE_BANNER } from "../../../../lib/api-zod/src/event-test-mode";

vi.mock("../lib/supabase", () => ({
  supabase: { from: vi.fn(), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
  onSseReconnect: () => () => {}, isSseHealthy: () => true,
}));
vi.mock("../lib/webPush", () => ({ currentPushStatus: () => ({ code: "unsupported" }), requestPushPermissionFromClick: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function Harness() {
  const controller = useTestMode();
  return <><TestModePanel controller={controller} /><ManagedEventLaboratory controller={controller} /></>;
}

type RequestBody = {
  operation: "save" | "reset" | "mode";
  generation: number;
  revision: number;
  workspaceId?: string;
  snapshot?: LabSnapshot;
  enabled?: boolean;
  resetGeneration?: number;
};

function server() {
  const state: LaboratoryResponse = {
    mode: {
      enabled: true, banner: EVENT_TEST_MODE_BANNER,
      generation: 1, revision: 1, dirty: false, resetGeneration: null,
      resetAt: null, changedAt: "2026-10-28T00:00:00Z",
    },
    workspaces: {},
  };
  const requests: { path: string; method: string; token: string | null; body?: RequestBody }[] = [];
  let rejectNextSave = false;
  localStorage.setItem("admin_token_v1", "laboratory-admin-token");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as RequestBody : undefined;
    requests.push({ path, method: init?.method ?? "GET", token: new Headers(init?.headers).get("x-admin-token"), body });
    if (path !== "/api/event-hub/laboratory") throw new Error(`Unexpected live request: ${path}`);
    if (!body) return Response.json(state);
    if (rejectNextSave && body.operation === "save") {
      rejectNextSave = false;
      state.mode = { ...state.mode, generation: 2, revision: state.mode.revision + 1, dirty: false, resetGeneration: 2 };
      state.workspaces = {};
      return Response.json({ code: "STALE_LABORATORY", error: "다른 탭에서 테스트 데이터를 초기화했습니다." }, { status: 409 });
    }
    if (body.generation !== state.mode.generation || body.revision !== state.mode.revision)
      return Response.json({ code: "STALE_LABORATORY", error: "최신 테스트 상태를 확인하세요." }, { status: 409 });
    if (body.operation === "save") {
      state.workspaces[body.workspaceId!] = body.snapshot;
      state.mode.dirty = true;
      state.mode.resetGeneration = null;
    } else if (body.operation === "reset") {
      state.workspaces = {};
      state.mode.generation++;
      state.mode.dirty = false;
      state.mode.resetGeneration = state.mode.generation;
      state.mode.resetAt = "2026-10-28T00:01:00Z";
    } else {
      if (body.enabled === false && (state.mode.dirty || body.resetGeneration !== state.mode.generation))
        return Response.json({ code: "TEST_RESET_REQUIRED", error: "초기화 확인이 필요합니다." }, { status: 409 });
      state.mode.enabled = body.enabled!;
    }
    state.mode.revision++;
    return Response.json(state);
  });
  return { state, requests, writes: () => requests.filter(r => r.body), staleNextSave: () => { rejectNextSave = true; } };
}

async function loaded() {
  await screen.findByTestId("event-laboratory");
  expect((screen.getByTestId("event-laboratory") as HTMLFieldSetElement).disabled).toBe(false);
}

async function saved(mock: ReturnType<typeof server>, count: number) {
  await waitFor(() => expect(mock.writes()).toHaveLength(count));
  await waitFor(() => expect((screen.getByTestId("event-laboratory") as HTMLFieldSetElement).disabled).toBe(false));
}

it("loads an empty managed workspace, saves stage/rank with the admin generation and revision, and restores after remount", async () => {
  const mock = server();
  const view = render(<Harness />);
  await loaded();
  expect((screen.getByLabelText("가상 진행 상태") as HTMLSelectElement).value).toBe("기본정보 작성 중");
  expect(mock.writes()).toHaveLength(0);
  expect(sessionStorage.length).toBe(0);
  fireEvent.change(screen.getByLabelText("가상 진행 상태"), { target: { value: "회비 확인" } });
  await saved(mock, 1);
  expect(screen.getByText("최종 납부 금액 40,000원")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "4등" }));
  await saved(mock, 2);
  expect(mock.writes().map(r => [r.body?.generation, r.body?.revision])).toEqual([[1, 1], [1, 2]]);
  expect(mock.writes()[1].body).toMatchObject({ operation: "save", workspaceId: "default", snapshot: { rank: 4 } });
  expect(mock.requests.every(r => r.path === "/api/event-hub/laboratory" && r.token === "laboratory-admin-token")).toBe(true);
  view.unmount();
  render(<Harness />);
  await loaded();
  expect((screen.getByLabelText("가상 진행 상태") as HTMLSelectElement).value).toBe("회비 확인");
  expect((screen.getByLabelText("가상 순위 직접 입력") as HTMLInputElement).value).toBe("4");
  expect(screen.getByText("최종 납부 금액 50,000원")).toBeTruthy();
  expect(mock.writes()).toHaveLength(2);
  expect(sessionStorage.length).toBe(0);
});

it("requires a global reset and fresh acknowledgement before OFF, clearing heart/chat and every workspace", async () => {
  const mock = server();
  render(<Harness />);
  await loaded();
  expect((screen.getByRole("switch", { name: "테스트 모드 OFF" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "가상 A 하트 보내기" }));
  await saved(mock, 1);
  fireEvent.click(screen.getByRole("button", { name: "가상 B 하트 보내기" }));
  await saved(mock, 2);
  fireEvent.change(screen.getByLabelText("가상 채팅 메시지"), { target: { value: "초기화할 가상 메시지" } });
  fireEvent.click(screen.getByRole("button", { name: "가상 채팅 전송" }));
  await saved(mock, 3);
  expect(screen.getByText("가상 A: 초기화할 가상 메시지")).toBeTruthy();
  mock.state.workspaces["another-event"] = new EventLaboratoryStore().snapshot();
  fireEvent.click(screen.getByLabelText("모든 시험실의 가상 신청·결제·대기방·뽑기·경품·하트·채팅을 삭제하는 것을 확인했습니다."));
  fireEvent.click(screen.getByRole("button", { name: "테스트 데이터 초기화" }));
  await saved(mock, 4);
  expect(mock.state.workspaces).toEqual({});
  expect(mock.state.mode.generation).toBe(2);
  expect(screen.queryByText("가상 A: 초기화할 가상 메시지")).toBeNull();
  expect(screen.getByText("테스트 결과: 상호 하트 대기")).toBeTruthy();
  expect((screen.getByRole("switch", { name: "테스트 모드 OFF" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("초기화 완료를 확인했습니다. 테스트 모드 OFF 후에도 개인정보·접수 일정 등 실제 오픈 조건을 별도로 확인합니다."));
  fireEvent.click(screen.getByRole("switch", { name: "테스트 모드 OFF" }));
  await screen.findByText("시험실을 사용하려면 테스트 모드를 ON으로 전환하세요.");
  expect(mock.writes()).toHaveLength(5);
  expect(mock.writes()[4].body).toMatchObject({ operation: "mode", enabled: false, generation: 2, revision: 5, resetGeneration: 2 });
});

it("reloads generation two after a stale save and discards old results without automatically retrying the write", async () => {
  const mock = server();
  mock.state.workspaces.default = new EventLaboratoryStore().snapshot();
  mock.state.mode.dirty = true;
  render(<Harness />);
  await loaded();
  expect(screen.getByText("최종 납부 금액 40,000원")).toBeTruthy();
  mock.staleNextSave();
  fireEvent.click(screen.getByRole("button", { name: "4등" }));
  await screen.findByText(/다른 탭에서 테스트 데이터를 초기화했습니다/);
  expect(mock.requests.filter(r => r.method === "GET")).toHaveLength(2);
  expect(mock.writes()).toHaveLength(1);
  expect(mock.writes()[0].body).toMatchObject({ generation: 1, revision: 1 });
  expect(mock.state.mode.generation).toBe(2);
  expect((screen.getByLabelText("가상 진행 상태") as HTMLSelectElement).value).toBe("기본정보 작성 중");
  expect(screen.queryByText(/최종 납부 금액/)).toBeNull();
  expect((screen.getByTestId("event-laboratory") as HTMLFieldSetElement).disabled).toBe(true);
});

it("invalidates both acknowledgements when another tab resets the generation and focus refreshes it", async () => {
  const mock = server();
  mock.state.mode.resetGeneration = 1;
  render(<Harness />);
  await loaded();
  const resetLabel = "모든 시험실의 가상 신청·결제·대기방·뽑기·경품·하트·채팅을 삭제하는 것을 확인했습니다.";
  const openLabel = "초기화 완료를 확인했습니다. 테스트 모드 OFF 후에도 개인정보·접수 일정 등 실제 오픈 조건을 별도로 확인합니다.";
  fireEvent.click(screen.getByLabelText(resetLabel));
  fireEvent.click(screen.getByLabelText(openLabel));
  expect((screen.getByRole("switch", { name: "테스트 모드 OFF" }) as HTMLButtonElement).disabled).toBe(false);
  mock.state.mode = { ...mock.state.mode, generation: 2, revision: 2, resetGeneration: 2 };
  fireEvent.focus(window);
  await waitFor(() => expect((screen.getByLabelText(openLabel) as HTMLInputElement).checked).toBe(false));
  expect((screen.getByLabelText(resetLabel) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("switch", { name: "테스트 모드 OFF" }) as HTMLButtonElement).disabled).toBe(true);
  expect(mock.writes()).toHaveLength(0);
});
