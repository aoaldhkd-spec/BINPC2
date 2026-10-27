import { AdminInquiry } from "./AdminInquiry";
import { StrictMode } from "react";
import { ApplicationGuide } from "./CampaignParticipant";
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { NicknameSetupScreen } from "../components/NicknameSetupScreen";
import { EventLaboratory } from "./EventLaboratory";
import { AdminThreads, ApplicationAdmin } from "./EventHubAdmin";
import { NoticeHistory } from "./NoticeHistory";
import { WaitingRoom } from "./EventHubPage";
import { EventLaboratoryStore } from "./event-laboratory-store";
import { rememberRecoveryCode } from "../lib/event-hub-client";
import { useEventHub } from "../lib/event-hub-client";
import {
  profileMissing,
  quoteFor,
} from "../../../../lib/api-zod/src/event-hub";
vi.mock("../lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../lib/webPush", () => ({
  currentPushStatus: () => ({ code: "unsupported" }),
  requestPushPermissionFromClick: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
describe("event hub profile draft persistence and sandbox", () => {
  it("keeps the existing MBTI screen until the actual server save resolves, then skips already-known birth year/location", async () => {
    let resolve!: (v: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    render(
      <NicknameSetupScreen
        loading={false}
        onReset={() => {}}
        onSubmit={() => {}}
        eventDraft={{
          initial: { nickname: "테스터", birthYear: 1995, location: "부산" },
          save,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ENFP" }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByRole("heading", { name: "MBTI" })).toBeTruthy();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ mbti: "ENFP", nickname: "테스터" }),
      3,
    );
    await act(async () => resolve(true));
    expect(screen.getByRole("heading", { name: "관심사" })).toBeTruthy();
  });
  it("retains input and step after save failure, and restores partial drafts without creating public profiles", async () => {
    const save = vi.fn(async (_data: unknown, _step: number) => false);
    render(
      <NicknameSetupScreen
        loading={false}
        onReset={() => {}}
        onSubmit={() => {}}
        eventDraft={{
          initial: {
            nickname: "테스터",
            birthYear: 1995,
            location: "부산",
            mbti: "INTJ",
            lastStep: 1,
          },
          save,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "MBTI" })).toBeTruthy();
    expect(save.mock.calls[0]?.[0]).toMatchObject({ mbti: "INTJ" });
  });
  it("laboratory uses actual quote rules for rank 3/4 and makes zero network writes", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<EventLaboratory />);
    expect(screen.getByText("최종 납부 금액 40,000원")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4등" }));
    expect(screen.getByText("최종 납부 금액 50,000원")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "관리자 화면으로 보기" }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("profile completion requires all existing mandatory fields and a notification decision, with optional signals excluded", () => {
    expect(profileMissing({ lastStep: 6 })).toHaveLength(5);
    expect(
      profileMissing({
        lastStep: 6,
        mbti: "INTJ",
        interests: ["음악", "여행"],
        personalityScore: -1,
        pushDecision: "skip",
        privacyConsent: {
          collection: true,
          sharing: true,
          version: "2026-10-13-v1",
        },
      }),
    ).toEqual([]);
    expect(
      quoteFor(
        {
          fee: 50000,
          revision: 1,
          benefitsEnabled: false,
          benefits: [{ from: 1, to: 3, type: "free", value: 0, label: "혜택" }],
        },
        1,
      ).fee,
    ).toBe(50000);
  });
});
describe("client uncertain saves", () => {
  const empty = {
    enabled: true,
    events: [],
    applications: [],
    threads: [],
    stocks: [],
  };
  it("acknowledges a lost response only after reading its durable receipt", async () => {
    let writes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, _options) => {
      if (String(url).endsWith("/mutate")) {
        writes++;
        throw new TypeError("network response lost");
      }
      if (String(url).includes("/receipt/"))
        return new Response(
          JSON.stringify({ saved: true, id: "application-id" }),
        );
      return new Response(JSON.stringify(empty));
    });
    const { result } = renderHook(() => useEventHub(true));
    await waitFor(() => expect(result.current.state).toBeTruthy());
    let response: unknown;
    await act(async () => {
      response = await result.current.mutate({
        action: "application.report",
        target: "application-id",
        revision: 2,
      });
    });
    expect(response).toMatchObject({ saved: true, id: "application-id" });
    expect(result.current.status).toBe("saved");
    expect(writes).toBe(1);
  });
  it("retains the same request id on retry when no committed receipt exists", async () => {
    const ids: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).endsWith("/mutate")) {
        ids.push(JSON.parse(String(options?.body)).requestId);
        if (ids.length === 1) throw new TypeError("offline");
        return new Response(JSON.stringify({ saved: true }));
      }
      if (String(url).includes("/receipt/"))
        return new Response(JSON.stringify({ saved: false }));
      return new Response(JSON.stringify(empty));
    });
    const { result } = renderHook(() => useEventHub(true));
    await waitFor(() => expect(result.current.state).toBeTruthy());
    const command = {
      action: "application.profile",
      target: "app-id",
      revision: 2,
      data: { profile: { mbti: "INTJ" } },
    };
    await act(async () => {
      await result.current.mutate(command);
    });
    expect(result.current.status).toBe("failed");
    await act(async () => {
      await result.current.mutate(command);
    });
    expect(result.current.status).toBe("saved");
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("session bootstrap and receipt-first recovery", () => {
  const empty = {
    enabled: true,
    hasSession: false,
    events: [],
    applications: [],
    threads: [],
    stocks: [],
  };
  it("retries a failed initial session creation with the same recovery code, including after remount", async () => {
    const bodies: { recoveryCode: string; create: boolean }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).endsWith("/session")) {
        bodies.push(JSON.parse(String(options?.body)));
        if (bodies.length === 1)
          throw new TypeError("first creation response lost");
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(JSON.stringify(empty));
    });
    const first = renderHook(() => useEventHub());
    await waitFor(() =>
      expect(first.result.current.error).toContain(
        "first creation response lost",
      ),
    );
    first.unmount();
    const second = renderHook(() => useEventHub());
    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() => expect(second.result.current.state).toBeTruthy());
    expect(bodies[0].create).toBe(true);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(
      localStorage.getItem("binpc2_event_recovery_v6:creating"),
    ).toBeNull();
  });
  it("checks a previously uncertain request before retrying; a durable receipt avoids a second write", async () => {
    let durable = false;
    const sequence: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith("/mutate")) {
        sequence.push("write");
        throw new TypeError("lost response");
      }
      if (path.includes("/receipt/")) {
        sequence.push("receipt");
        return new Response(
          JSON.stringify({ saved: durable, id: durable ? "app" : undefined }),
        );
      }
      return new Response(JSON.stringify(empty));
    });
    const { result } = renderHook(() => useEventHub(true));
    await waitFor(() => expect(result.current.state).toBeTruthy());
    const cmd = { action: "application.report", target: "app", revision: 2 };
    await act(async () => {
      await result.current.mutate(cmd);
    });
    expect(result.current.status).toBe("failed");
    durable = true;
    await act(async () => {
      await result.current.mutate(cmd);
    });
    expect(sequence).toEqual(["write", "receipt", "receipt"]);
    expect(result.current.status).toBe("saved");
  });
});

it("does not commit live admission if browser identity storage is blocked", () => {
  const store = new EventLaboratoryStore();
  store.jump("프로필 완료");
  const state = store.state();
  const mutate = vi.fn(),
    setError = vi.fn();
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  render(
    <WaitingRoom
      app={state.applications[0]}
      event={state.events[0]}
      hub={{
        state,
        mutate,
        setError,
        error: "",
        status: "",
        load: async () => state,
      }}
      edit={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "술번개 입장하기" }));
  expect(mutate).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith(
    expect.stringContaining("신청·입금 기록은 보존"),
  );
});

describe("administrator inquiry recipient safety", () => {
  it("keeps drafts per recipient and clears only the successfully sent draft, even after changing recipients", async () => {
    const store = new EventLaboratoryStore();
    const state = store.state(true);
    state.threads = ["owner-a", "owner-b"].map((id) => ({
      id,
      messages: [],
      readAdminAt: "",
      readUserAt: "",
      tags: [],
      history: [],
    }));
    let resolve!: (result: Record<string, unknown>) => void;
    const mutate = vi.fn((command) =>
      command.action === "thread.send"
        ? new Promise<Record<string, unknown>>((r) => {
            resolve = r;
          })
        : Promise.resolve({}),
    );
    const hub = {
      state,
      error: "",
      status: "",
      load: vi.fn(),
      mutate,
      setError: vi.fn(),
    };
    render(<AdminThreads hub={hub} state={state} />);
    const target = screen.getByLabelText("문의 대상");
    fireEvent.change(target, { target: { value: "owner-a" } });
    fireEvent.change(screen.getByLabelText("관리자 답장"), {
      target: { value: "A 답장" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정한 답장 보내기" }));
    fireEvent.change(target, { target: { value: "owner-b" } });
    expect(
      (screen.getByLabelText("관리자 답장") as HTMLTextAreaElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("관리자 답장"), {
      target: { value: "B 답장" },
    });
    await act(async () => resolve({ saved: true }));
    expect(
      (screen.getByLabelText("관리자 답장") as HTMLTextAreaElement).value,
    ).toBe("B 답장");
    fireEvent.change(target, { target: { value: "owner-a" } });
    expect(
      (screen.getByLabelText("관리자 답장") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "thread.send",
        target: "owner-a",
        data: { text: "A 답장" },
      }),
    );
  });
  it("disables all payment, attendance and prize controls while a server save is being reconciled", () => {
    const state = new EventLaboratoryStore().state(true);
    const mutate = vi.fn();
    render(
      <ApplicationAdmin
        app={state.applications[0]}
        hub={{
          state,
          error: "",
          status: "checking",
          mutate,
          load: vi.fn(),
          setError: vi.fn(),
        }}
      />,
    );
    const fieldset = screen.getByRole("group", {
      name: /신청 처리/,
    }) as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("actual waiting-room cards", () => {
  it("waits for server admission before enabling draws and renders the durable prize name", () => {
    const store = new EventLaboratoryStore();
    store.jump("프로필 완료");
    const state = store.state();
    const hub = {
      state,
      error: "",
      status: "",
      mutate: vi.fn(),
      load: vi.fn(),
      setError: vi.fn(),
    };
    const app = state.applications[0];
    const { rerender } = render(
      <WaitingRoom
        app={app}
        event={state.events[0]}
        hub={hub}
        edit={() => {}}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "카드 한 장 뽑기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const admitted = {
      ...app,
      profileId: "synthetic-profile",
      cards: [
        {
          id: "synthetic-card",
          prize: "stock-internal-id",
          prizeLabel: "소품 24번",
          at: new Date().toISOString(),
        },
      ],
    };
    rerender(
      <WaitingRoom
        app={admitted}
        event={state.events[0]}
        hub={hub}
        edit={() => {}}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "카드 한 장 뽑기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.getByText("🎁 소품 24번")).toBeTruthy();
    expect(screen.queryByText(/stock-internal-id/)).toBeNull();
  });
});

it("notice history renders only public notices and dates, without old venue or bank fields", () => {
  const history = [
    {
      at: "2026-10-27T00:00:00Z",
      notice: "이전 필독 공지",
      address: "private-old-venue",
      account: "private-old-bank",
      fee: 99999,
    },
  ];
  render(<NoticeHistory history={history} />);
  expect(screen.getByText("이전 필독 공지")).toBeTruthy();
  expect(screen.queryByText(/private-old/)).toBeNull();
  expect(screen.queryByText(/99999/)).toBeNull();
});

it("keeps the first application tutorial open through StrictMode mount probes and allows reopening", async () => {
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  const e = new EventLaboratoryStore().value.event;
  e.campaign = { kind: "tour", round: 1, advance: 17000, secondRoundLink: "" };
  render(
    <StrictMode>
      <ApplicationGuide event={e} />
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "? 신청 방법" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});

import { useEventTheme } from "./HubUi";
it("automatically restores the route-local theme without a page refresh or a 17:00 timer", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-30T15:59:59.999Z"));
    const e = new EventLaboratoryStore().value.event;
    e.date = "2026-10-30";
    e.start = "22:30";
    e.end = "01:00";
    e.type = "halloween";
    e.theme = "halloween";
    e.themeEnabled = true;
    const { result, unmount } = renderHook(() => useEventTheme(e));
    expect(result.current).toBe("halloween");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("default");
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
it("keeps existing card results readable when new drawing is OFF", () => {
  const store = new EventLaboratoryStore();
  store.jump("현장 입장");
  const state = store.state();
  const app = {
    ...state.applications[0],
    cards: [
      {
        id: "saved-result",
        prize: "saved-stock",
        prizeLabel: "보존 상품",
        at: new Date().toISOString(),
      },
    ],
  };
  const event = { ...state.events[0], cardsEnabled: false };
  render(
    <WaitingRoom
      app={app}
      event={event}
      hub={{
        state,
        error: "",
        status: "",
        mutate: vi.fn(),
        load: vi.fn(),
        setError: vi.fn(),
      }}
      edit={() => {}}
    />,
  );
  expect(screen.getByText("🎁 보존 상품")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "카드 한 장 뽑기",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("keeps an existing pre-application inquiry reachable while the whole event module is OFF", async () => {
  const state = {
    hasSession: true,
    enabled: false,
    applications: [],
    events: [],
    stocks: [],
    threads: [
      {
        id: "existing-inquiry",
        messages: [
          {
            id: "saved-message",
            sender: "user",
            text: "보존한 문의",
            at: "2026-10-27T00:00:00Z",
          },
        ],
        readUserAt: "",
        readAdminAt: "",
        tags: [],
        history: [],
      },
    ],
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(state)),
  );
  render(<AdminInquiry />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /관리자 문의/ })).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: /관리자 문의/ }));
  expect(screen.getByRole("dialog").textContent).toContain("보존한 문의");
});

it("recovers an approved owner from its saved code while event_hub is OFF without creating a new owner", async () => {
  rememberRecoveryCode(
    "existing-isolated-recovery-fixture-code-for-disabled-module",
  );
  let restored = false;
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      if (String(url).endsWith("/session")) {
        expect(JSON.parse(String(options?.body))).toMatchObject({
          create: false,
          recoveryCode:
            "existing-isolated-recovery-fixture-code-for-disabled-module",
        });
        restored = true;
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(
        JSON.stringify({
          hasSession: restored,
          enabled: false,
          events: [],
          applications: restored
            ? [{ id: "existing-paid", payment: "approved" }]
            : [],
          threads: [],
          stocks: [],
        }),
      );
    });
  const { result } = renderHook(() => useEventHub());
  await waitFor(() =>
    expect(result.current.state?.applications[0]?.payment).toBe("approved"),
  );
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith("/mutate")),
  ).toBe(false);
});

it("never offers Halloween free approval or final-price editing for an advance-only tour", () => {
  const store = new EventLaboratoryStore();
  const state = store.state(true);
  state.events[0].campaign = {
    kind: "tour",
    round: 1,
    advance: 17000,
    secondRoundLink: "",
  };
  const app = {
    ...state.applications[0],
    quote: {
      fee: 0,
      original: 17000,
      benefit: "선입금",
      version: 1,
      kind: "advance" as const,
    },
  };
  render(
    <ApplicationAdmin
      app={app}
      hub={{
        state,
        error: "",
        status: "",
        mutate: vi.fn(),
        load: vi.fn(),
        setError: vi.fn(),
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "무료 참가 승인" })).toBeNull();
  expect(
    screen.queryByLabelText("변경할 회비 (기존 금액·사유 보존)"),
  ).toBeNull();
});
