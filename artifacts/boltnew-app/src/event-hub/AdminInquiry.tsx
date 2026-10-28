import {
  readHubBrowserValue,
  writeHubBrowserValue,
} from "../lib/event-hub-browser-storage";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import { type HubController } from "../lib/event-hub-client";
import {
  HubButton,
  HubCheck,
  HubFeedback,
  inputClass,
  useHubDark,
} from "./HubUi";
export function AdminInquiry({ hub }: { hub: HubController }) {
  const dark = useHubDark();
  const [open, setOpen] = useState(window.location.hash === "#inquiry"),
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
  const [viewport, setViewport] = useState({
    height: window.innerHeight,
    inset: 0,
  });
  useEffect(() => {
    const update = () => {
      const v = window.visualViewport;
      setViewport({
        height: v?.height ?? window.innerHeight,
        inset: Math.max(
          0,
          window.innerHeight -
            (v?.height ?? window.innerHeight) -
            (v?.offsetTop ?? 0),
        ),
      });
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
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
  const thread = hub.state?.threads[0];
  const unread =
    thread?.messages.some(
      (m) => m.sender === "admin" && m.at > thread.readUserAt,
    ) ?? false;
  const hasHistory =
    !!hub.state?.applications.length ||
    !!hub.state?.threads.some((t) => t.messages.length > 0);
  const markRead = hub.mutate;
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
  return (
    <div className="event-hub-theme" data-event-dark={dark}>
      <div
        className="event-hub-dock fixed right-4 z-40"
        style={
          { "--hub-keyboard-inset": `${viewport.inset}px` } as CSSProperties
        }
      >
        <button
          className="min-h-12 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-teal-950/30 active:scale-95 transition-transform"
          onClick={() => setOpen(true)}
        >
          💬 관리자 문의 {unread ? "●" : ""}
        </button>
        {unread && (
          <span
            role="status"
            className="absolute bottom-full right-0 bg-white p-2 rounded-xl text-xs"
          >
            관리자에게서 연락이 왔습니다
          </span>
        )}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-end justify-center"
          style={{ bottom: viewport.inset }}
          onClick={() => setOpen(false)}
        >
          <section
            style={{ maxHeight: Math.max(180, viewport.height * 0.9) }}
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
