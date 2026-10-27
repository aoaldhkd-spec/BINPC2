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
import { WaitingRoom } from "./EventHubPage";
import { EventLaboratoryStore } from "./event-laboratory-store";
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
