import { useEffect, useRef, useState } from "react";
import type { HubController } from "../lib/event-hub-client";

const conversationVisible = () => document.visibilityState === "visible"
  && !document.querySelector("[data-boss-access]")?.hasAttribute("hidden");

/** A read acknowledgement belongs to the visible current conversation, not a
 * delayed response received while another app or the lock screen was showing. */
export function useInquiryReadReceipt({ active, threadId, unreadMessageId, status, markRead, admin = false }: {
  active: boolean;
  threadId?: string;
  unreadMessageId?: string;
  status: string;
  markRead: HubController["mutate"];
  admin?: boolean;
}) {
  const [visible, setVisible] = useState(conversationVisible);
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    const update = () => setVisible(conversationVisible());
    // Access rechecks preserve the mounted drawer behind a hidden boundary.
    // Seeing a foreground page is not enough until that boundary is visible.
    const boundary = document.querySelector("[data-boss-access]");
    const observer = new MutationObserver(update);
    if (boundary) observer.observe(boundary, { attributes: true, attributeFilter: ["hidden"] });
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!active || !visible || !conversationVisible()) { attempted.current = null; return; }
    if (!threadId || !unreadMessageId || status === "saving" || status === "checking") return;
    const key = `${admin ? "admin" : "participant"}:${threadId}:${unreadMessageId}`;
    if (attempted.current === key) return;
    attempted.current = key;
    // Failure retries need reopening, foregrounding or a new unread message;
    // changing saving/failed status alone cannot create an endless retry loop.
    void Promise.resolve(markRead({ action: "thread.read", ...(admin ? { target: threadId } : {}) })).catch(() => {});
  }, [active, visible, threadId, unreadMessageId, status, markRead, admin]);
}
