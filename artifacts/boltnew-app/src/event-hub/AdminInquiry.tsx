import {
  readHubBrowserValue,
  writeHubBrowserValue,
} from "../lib/event-hub-browser-storage";
import { useEffect, useState, useRef } from "react";
import { useEventHub } from "../lib/event-hub-client";
import {
  HubButton,
  HubCheck,
  HubFeedback,
  inputClass,
  useHubDark,
} from "./HubUi";
export function AdminInquiry() {
  const dark = useHubDark();
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(
      () => readHubBrowserValue("session", "binpc2_inquiry_draft_v6") ?? "",
    ),
    [consent, setConsent] = useState(false),
    [draftStorageAvailable, setDraftStorageAvailable] = useState(true);
  useEffect(() => {
    setDraftStorageAvailable(
      writeHubBrowserValue(
        "session",
        "binpc2_inquiry_draft_v6",
        message || null,
      ),
    );
  }, [message]);
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = sheet.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),textarea,input,a[href]",
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = oldOverflow;
      prior?.focus();
    };
  }, [open]);
  const hub = useEventHub();
  const thread = hub.state?.threads[0];
  const unread =
    thread?.messages.some(
      (m) => m.sender === "admin" && m.at > thread.readUserAt,
    ) ?? false;
  const hasHistory =
    !!hub.state?.applications.length ||
    !!hub.state?.threads.some((t) => t.messages.length > 0);
  const canPoll = !!hub.state?.enabled || hasHistory;
  const refresh = hub.load;
  const markRead = hub.mutate;
  useEffect(() => {
    if (!canPoll) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [canPoll, refresh]);
  useEffect(() => {
    if (open && unread) void markRead({ action: "thread.read" });
  }, [open, unread, markRead]);
  useEffect(() => {
    if (!open) return;
    const marker = crypto.randomUUID();
    window.history.pushState(
      { ...window.history.state, hubInquiry: marker },
      "",
      window.location.href,
    );
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("popstate", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("popstate", close);
      window.removeEventListener("keydown", esc);
      if (window.history.state?.hubInquiry === marker) window.history.back();
    };
  }, [open]);
  if (!hub.state?.enabled && !hasHistory) return null;
  const inEventHub = window.location.pathname.includes("/events");
  return (
    <div className="event-hub-theme" data-event-dark={dark}>
      <div
        className={
          inEventHub
            ? "event-hub-dock fixed bottom-0 left-0 right-0 z-40 flex justify-center gap-3 bg-slate-900 p-3 border-t border-slate-700"
            : "fixed left-3 z-40 flex flex-col gap-2"
        }
        style={{
          bottom: inEventHub
            ? "env(safe-area-inset-bottom)"
            : "calc(90px + env(safe-area-inset-bottom))",
        }}
      >
        <a
          className="rounded-full bg-slate-800 px-3 py-2 text-xs font-bold text-white shadow"
          href="/events"
        >
          🎉 술번개 신청
        </a>
        <button
          className="rounded-full bg-teal-700 px-3 py-2 text-xs font-bold text-white shadow"
          onClick={() => setOpen(true)}
        >
          💬 관리자 문의 {unread ? "●" : ""}
        </button>
        {unread && (
          <span
            role="status"
            className={
              inEventHub
                ? "absolute bottom-full left-3 bg-white p-2 rounded-xl text-xs"
                : "bg-white p-2 rounded-xl text-xs max-w-40"
            }
          >
            관리자에게서 연락이 왔습니다
          </span>
        )}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <section
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-label="관리자 문의"
            className="w-full max-w-lg rounded-t-3xl bg-white text-slate-900 p-4 flex flex-col max-h-[85dvh] pb-[max(16px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="font-black">💬 관리자 문의</h2>
              <HubButton onClick={() => setOpen(false)}>닫기</HubButton>
            </div>
            <div
              className="overflow-y-auto py-4 min-h-24 space-y-2"
              aria-live="polite"
            >
              {thread?.messages.map((m) => (
                <p
                  key={m.id}
                  className={`rounded-xl p-3 text-sm whitespace-pre-wrap break-words ${m.sender === "admin" ? "bg-teal-50" : "bg-slate-100 ml-6"}`}
                >
                  <strong>{m.sender === "admin" ? "관리자" : "나"}</strong> ·{" "}
                  {m.text}
                </p>
              )) ?? (
                <p className="text-sm">
                  신청 전에도 문의할 수 있습니다. 전화번호·입금정보는 필요한
                  경우에만 알려주세요.
                </p>
              )}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await hub.mutate({
                    action: "thread.send",
                    data: { text: message, collection: consent },
                  })
                )
                  setMessage("");
              }}
            >
              <label className="sr-only" htmlFor="hub-inquiry-text">
                문의 내용
              </label>
              <textarea
                autoFocus
                id="hub-inquiry-text"
                className={inputClass}
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <HubCheck
                label="문의 처리 목적으로 메시지를 저장하는 데 동의합니다 (비밀번호·복구코드 전송 금지)"
                checked={consent}
                onChange={setConsent}
              />
              {!draftStorageAvailable && (
                <p role="status" className="text-xs">
                  브라우저가 임시 저장을 차단했습니다. 보내지 않은 문의는 현재
                  화면에서만 유지됩니다. 전송 완료한 문의는 서버에서 복구할 수
                  있습니다.
                </p>
              )}
              <HubFeedback status={hub.status} error={hub.error} />
              <HubButton
                type="submit"
                disabled={
                  !consent || !message.trim() || hub.status === "saving"
                }
              >
                {hub.status === "saving" ? "저장 중…" : "문의 보내기"}
              </HubButton>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
