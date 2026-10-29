import { supabase, onSseReconnect, isSseHealthy } from "./supabase";
import { useState, useEffect, useCallback, useRef } from "react";
import type { PublicEventTestMode } from "../../../../lib/api-zod/src/event-test-mode";
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
    accounts?: NonNullable<HubApplication["paymentAccount"]>[];
    deadline: string;
    included: string;
    deposit: number;
  };
  venue?: { address: string; addressRecord?: Pick<import("../../../../lib/api-zod/src/event-venue-directory").VenueAddress,"roadOriginal"|"parcelOriginal"|"floor">; mapUrl: string; logoId?: string; logo?: {url:string;label:string;width:number;height:number}; thanksLogo?: {url:string;label:string;width:number;height:number} };
  resultDetails?: HubApplication["cards"];
};
export type HubThread = {
  consentVersion?: string;
  consentAt?: string;
  status?: "open" | "resolved";
  id: string;
  messages: { id: string; sender: string; text: string; at: string }[];
  readUserAt: string;
  readAdminAt: string;
  tags: string[];
  history: HubAudit[];
};
export type HubState = {
  companionDrafts?: Record<string,{revision:number;items:{id:string;basic:Pick<import('../../../../lib/api-zod/src/event-hub').HubBasicDraft['basic'],'nickname'|'birthYear'|'location'|'residence'>;claimedAt?:string;removedAt?:string}[]}>;
  bossParticipationAllowed?: boolean;
  venueDirectory?: import("../../../../lib/api-zod/src/event-venue-directory").VenueDirectory;
  basicDrafts?: Record<string, import("../../../../lib/api-zod/src/event-hub").HubBasicDraft>;
  testMode?: PublicEventTestMode;
  serverNow?: string;
  privacyNotice?:{policyVersion:string;controllerName:string;contact:string;notice:string;fingerprint:string;periods:{purpose:string;days:number|null}[]};
  publicationBlocked?:boolean;
  privacyPolicy?: import("../../../../lib/api-zod/src/event-hub-privacy").PrivacyPolicy;
  privacyCase?: Pick<
    import("../../../../lib/api-zod/src/event-hub-privacy").PrivacyCase,
    "status" | "createdAt" | "updatedAt" | "publicMessage"
  >;
  marketingPreference?: { enabled: boolean; at: string; version: string };
  unsubscribeToken?: string;
  retentionDays?: number;
  owners?: {
    id: string;
    restricted?: { active: boolean; reason: string };
    deleteRequestedAt?: string;
    privacyCase?: import("../../../../lib/api-zod/src/event-hub-privacy").PrivacyCase;
    privacyHold?: { reason: string; until?: string };
    loginLockedUntil?: string;
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
const BOOTSTRAP_KEY = RECOVERY_KEY + ":creating";
let memoryCode = "";
let memoryCreating = false;
function recoveryRead() {
  try {
    return localStorage.getItem(RECOVERY_KEY) ?? memoryCode;
  } catch {
    return memoryCode;
  }
}
function recoveryWrite(code: string) {
  memoryCode = code;
  try {
    localStorage.setItem(RECOVERY_KEY, code);
  } catch {
    /* HttpOnly session and manual code backup remain available */
  }
}
function creatingRead() {
  try {
    return localStorage.getItem(BOOTSTRAP_KEY) === "1" || memoryCreating;
  } catch {
    return memoryCreating;
  }
}
function creatingWrite(value: boolean) {
  memoryCreating = value;
  try {
    if (value) localStorage.setItem(BOOTSTRAP_KEY, "1");
    else localStorage.removeItem(BOOTSTRAP_KEY);
  } catch {}
}

let sessionPromise: Promise<void> | null = null;
export function savedRecoveryCode() {
  return recoveryRead();
}
export function rememberRecoveryCode(code: string) {
  recoveryWrite(code);
  creatingWrite(false);
}
export function clearOnsiteBrowserIdentity() {
  try {
    localStorage.removeItem("matching_app_user_id");
  } catch {}
  try {
    for (const key of [
      "session_bearer_v1",
      "session_bearer_uid_v1",
      "session_bearer_exp_v1",
      "binpc2_inquiry_draft_v6",
    ])
      sessionStorage.removeItem(key);
  } catch {
    /* A blocked browser store must not invalidate server recovery. */
  }
}
export async function recoverHub(code: string) {
  await hubFetch("/session", { recoveryCode: code, create: false });
  clearOnsiteBrowserIdentity();
  rememberRecoveryCode(code);
}
async function ensureSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const state = await hubFetch<HubState>("/state");
    if (state.hasSession) return;
    let code = savedRecoveryCode();
    // OFF must still recover an existing paid owner; never create a new session from an unknown draft.
    if (!state.enabled && !code) return;
    const create = state.enabled && (!code || creatingRead());
    if (!code) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      code = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      recoveryWrite(code);
      creatingWrite(true);
    }
    await hubFetch("/session", { recoveryCode: code, create });
    creatingWrite(false);
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
  const readSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    const value = await hubFetch<HubState>(
      admin ? "/admin" : "/state",
      undefined,
      admin,
    );
    if (sequence === readSequence.current) setState(value);
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
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true, inFlight = false, dirty = false;
    // An approval can arrive while the participant's own save/read is pending.
    // Preserve that invalidation until a fresh read can run; a healthy SSE
    // connection alone does not mean the last response contains the update.
    const schedule = (delay = 350) => {
      if (!active || !dirty || document.visibilityState !== "visible" || timer || inFlight) return;
      timer = setTimeout(async () => {
        timer = undefined;
        if (!active || document.visibilityState !== 'visible') return;
        if (busy.current) { schedule(); return; }
        dirty=false;inFlight=true;
        let retryDelay=350;
        try { await load(); }
        catch { dirty=true;retryDelay=10000; }
        finally { inFlight=false;schedule(retryDelay); }
      }, delay);
    };
    const refresh = () => { dirty=true;schedule(); };
    const channel=supabase.channel("event-hub-invalidation").on("postgres_changes",
      {event:"UPDATE",schema:"public",table:"event_hub_updates"},refresh).subscribe();
    const reconnect=onSseReconnect(refresh);
    const foreground=()=>{if(document.visibilityState==="visible") refresh();};
    document.addEventListener("visibilitychange",foreground);
    // Existing waiting-room fallback cadence; never poll every second.
    const fallback=setInterval(()=>{if(!isSseHealthy()) refresh();},10000);
    return ()=>{active=false;if(timer)clearTimeout(timer);clearInterval(fallback);reconnect();document.removeEventListener("visibilitychange",foreground);supabase.removeChannel(channel);};
  }, [load]);
  useEffect(() => {
    const times=(state?.events??[]).flatMap(e=>[e.opensAt,e.closesAt]).filter((v):v is string=>!!v).map(Date.parse).filter(t=>t>Date.parse(state?.serverNow??new Date().toISOString()));
    if (!times.length) return;
    const timer=setTimeout(()=>{void load().catch(()=>{});},Math.min(Math.min(...times)-Date.parse(state?.serverNow??new Date().toISOString())+20,2147483647));
    return ()=>clearTimeout(timer);
  },[state?.events,state?.serverNow,load]);
  const mutate = useCallback(
    async (command: HubCommand) => {
      if (busy.current) return null;
      busy.current = true;
      setStatus("saving");
      setError("");
      const signature = JSON.stringify(command);
      const retry = pending.current?.signature === signature;
      if (!retry)
        pending.current = {
          signature,
          command: { ...command, requestId: crypto.randomUUID() },
        };
      try {
        // Retry checks durable acknowledgement first. Reuse the nonce if no receipt exists.
        // Entry still replays the mutation to refresh its HttpOnly/bearer binding.
        if (retry) {
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
        }
        const result = await hubFetch<Record<string, unknown>>(
          "/mutate",
          pending.current!.command,
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

export type HubController = Pick<
  ReturnType<typeof useEventHub>,
  "state" | "status" | "error" | "mutate" | "load" | "setError"
>;
