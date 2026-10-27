import {
  effectiveEventTheme,
  eventEndAt,
} from "../../../../lib/api-zod/src/event-hub-modules";
import type { HubEvent } from "../lib/event-hub-client";
import {
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { readHubBrowserValue } from "../lib/event-hub-browser-storage";
import "./event-hub.css";

export function useHubDark() {
  const [dark, setDark] = useState(
    () => readHubBrowserValue("local", "dark_mode") === "1",
  );
  useEffect(() => {
    const sync = () =>
      setDark(readHubBrowserValue("local", "dark_mode") === "1");
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return dark;
}
export function HubButton({
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`min-h-11 rounded-2xl px-4 py-3 font-bold text-sm bg-teal-600 text-white disabled:opacity-50 active:scale-[.98] ${p.className ?? ""}`}
    >
      {children}
    </button>
  );
}
export function HubField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-bold text-slate-700 space-y-1">
      <span>{label}</span>
      {children}
    </label>
  );
}
export const inputClass =
  "w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900";
export function HubCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 py-2 text-sm">
      <input
        className="mt-1 h-5 w-5 accent-teal-600 shrink-0"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function HubFeedback({
  status,
  error,
}: {
  status: string;
  error: string;
}) {
  return (
    <div aria-live="polite">
      {status === "saving" && (
        <p role="status" className="text-sm text-teal-700">
          <span aria-hidden="true" className="inline-block animate-spin">
            ◌
          </span>{" "}
          저장 중…
        </p>
      )}
      {status === "checking" && <p role="status">저장 결과 확인 중…</p>}
      {status === "saved" && (
        <p role="status" className="text-teal-700">
          저장되었습니다 ✓
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="my-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 break-words"
        >
          저장 실패 · {error}
        </p>
      )}
    </div>
  );
}
/** Stable layout while server-owned state loads; respects reduced-motion settings. */
export function HubLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 p-4">
      <p>{label}</p>
      <div
        aria-hidden="true"
        className="space-y-3 animate-pulse motion-reduce:animate-none"
      >
        <div className="h-5 w-2/3 rounded-xl bg-slate-200" />
        <div className="h-24 rounded-2xl border border-slate-200 bg-slate-100" />
        <div className="h-24 rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}
export function HubCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm min-w-0">
      {children}
    </section>
  );
}
export function hubNavigate(path: string) {
  window.history.pushState(
    {},
    "",
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function formatHubTime(value: string | undefined) {
  if (!value) return "없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "확인 필요"
    : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

/** A route-local deadline timer; never touches the global 17:00 reset or theme preference. */
export function useEventTheme(event: HubEvent) {
  const [now, setNow] = useState(() => Date.now());
  const end = eventEndAt(event);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const sync = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      if (Number.isFinite(end) && time < end)
        timer = setTimeout(sync, Math.min(end - time, 2147483647));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [end]);
  return effectiveEventTheme(event, new Date(now));
}
