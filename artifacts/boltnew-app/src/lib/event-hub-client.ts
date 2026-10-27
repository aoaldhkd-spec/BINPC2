import { useState, useEffect, useCallback, useRef } from "react";
import type {
  HubApplication,
  HubEvent,
  HubSettings,
  HubAudit,
} from "../../../../lib/api-zod/src/event-hub";
export {
  budgetSplit,
  HUB_CONSENT_VERSION,
  profileMissing,
  quoteFor,
} from "../../../../lib/api-zod/src/event-hub";
export type {
  HubApplication,
  HubEvent,
  HubSettings,
} from "../../../../lib/api-zod/src/event-hub";
export type PrivateApplication = Omit<HubApplication, "rank" | "owner"> & {
  owner?: string;
  rank?: number;
  profileMissing?: string[];
  billing?: {
    quote: NonNullable<HubApplication["quote"]>;
    account: string;
    deadline: string;
    included: string;
    deposit: number;
  };
  venue?: { address: string; mapUrl: string };
};
export type HubThread = {
  id: string;
  messages: { id: string; sender: string; text: string; at: string }[];
  readUserAt: string;
  readAdminAt: string;
  tags: string[];
  history: HubAudit[];
};
export type HubState = {
  retentionDays?: number;
  owners?: {
    id: string;
    restricted?: { active: boolean; reason: string };
    deleteRequestedAt?: string;
    history?: HubAudit[];
  }[];
  members?: { id: string; owner: string; marketing: boolean }[];
  errors?: {
    id: string;
    requestId: string;
    stage: string;
    code: string;
    count: number;
    at: string;
  }[];
  hasSession?: boolean;
  enabled: boolean;
  events: HubEvent[];
  applications: PrivateApplication[];
  threads: HubThread[];
  stocks: { id: string; eventId: string; label: string; remaining: number }[];
  settings?: HubSettings;
  nextSaturday?: string;
  member?: {
    nickname: string;
    basic: HubApplication["basic"];
    profile: HubApplication["profile"];
    marketing: boolean;
  } | null;
};
export class HubClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function hubFetch<T>(
  path: string,
  body?: unknown,
  admin = false,
): Promise<T> {
  const response = await fetch(`/api/event-hub${path}`, {
    credentials: "include",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(admin
        ? { "x-admin-token": localStorage.getItem("admin_token_v1") ?? "" }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new HubClientError(
      data.error ?? "저장에 실패했습니다.",
      data.code ?? "UNKNOWN",
      response.status,
    );
  return data;
}
const RECOVERY_KEY = "binpc2_event_recovery_v6";
let sessionPromise: Promise<void> | null = null;
export function savedRecoveryCode() {
  return localStorage.getItem(RECOVERY_KEY) ?? "";
}
export function clearOnsiteBrowserIdentity() {
  localStorage.removeItem("matching_app_user_id");
  for (const key of [
    "session_bearer_v1",
    "session_bearer_uid_v1",
    "session_bearer_exp_v1",
  ])
    sessionStorage.removeItem(key);
  sessionStorage.removeItem("binpc2_inquiry_draft_v6");
}
export async function recoverHub(code: string) {
  await hubFetch("/session", { recoveryCode: code, create: false });
  clearOnsiteBrowserIdentity();
  localStorage.setItem(RECOVERY_KEY, code);
}
async function ensureSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const state = await hubFetch<HubState>("/state");
    if (state.hasSession || (!state.enabled && !state.applications.length))
      return;
    let code = savedRecoveryCode();
    const create = !code;
    if (!code) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      code = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      localStorage.setItem(RECOVERY_KEY, code);
    }
    await hubFetch("/session", { recoveryCode: code, create });
  })();
  try {
    await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}
export type HubCommand = {
  action: string;
  target?: string;
  revision?: number;
  data?: Record<string, unknown>;
};
export function useEventHub(admin = false) {
  const [state, setState] = useState<HubState | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const busy = useRef(false);
  const pending = useRef<{
    signature: string;
    command: HubCommand & { requestId: string };
  } | null>(null);
  const load = useCallback(async () => {
    const value = await hubFetch<HubState>(
      admin ? "/admin" : "/state",
      undefined,
      admin,
    );
    setState(value);
    return value;
  }, [admin]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        if (!admin) await ensureSession();
        if (active) await load();
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          try {
            await load();
          } catch {
            /* show persistent failure */
          }
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [admin, load]);
  const mutate = useCallback(
    async (command: HubCommand) => {
      if (busy.current) return null;
      busy.current = true;
      setStatus("saving");
      setError("");
      const signature = JSON.stringify(command);
      if (pending.current?.signature !== signature)
        pending.current = {
          signature,
          command: { ...command, requestId: crypto.randomUUID() },
        };
      try {
        const result = await hubFetch<Record<string, unknown>>(
          "/mutate",
          pending.current.command,
          admin,
        );
        await load();
        pending.current = null;
        setStatus("saved");
        return result;
      } catch (e) {
        setStatus("checking");
        try {
          const receipt = await hubFetch<{ saved: boolean; id?: string }>(
            `/receipt/${pending.current!.command.requestId}`,
            undefined,
            admin,
          );
          if (receipt.saved && command.action !== "application.enter") {
            await load();
            pending.current = null;
            setStatus("saved");
            return { ...receipt };
          }
        } catch {
          /* unknown until durable state can be read */
        }
        // Reconcile with durable state before another attempt. Never report success from local state.
        try {
          await load();
        } catch {
          /* retain user's inputs */
        }
        setStatus("failed");
        setError(
          `${(e as Error).message} · 입력 내용은 그대로입니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.`,
        );
        if (e instanceof HubClientError && e.code === "REVISION")
          pending.current = null;
        return null;
      } finally {
        busy.current = false;
      }
    },
    [admin, load],
  );
  return { state, error, status, load, mutate, setError };
}
