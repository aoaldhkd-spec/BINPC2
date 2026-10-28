import { useCallback, useEffect, useRef, useState } from "react";
import type { EventTestModeState } from "../../../../lib/api-zod/src/event-test-mode";
import { hubFetch } from "../lib/event-hub-client";

export type LaboratoryResponse = {
  mode: EventTestModeState;
  workspaces: Record<string, unknown>;
};

/** Every write is scoped to the generation read by this tab. No operational mutation client. */
export function useTestMode() {
  const [data, setData] = useState<LaboratoryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const current = useRef<LaboratoryResponse | null>(null);
  const writing = useRef(false);
  const sequence = useRef(0);
  const accept = useCallback((value: LaboratoryResponse) => {
    current.current = value;
    setData(value);
  }, []);
  const load = useCallback(async () => {
    if (writing.current) return;
    const read = ++sequence.current;
    try {
      const value = await hubFetch<LaboratoryResponse>("/laboratory", undefined, true);
      if (read !== sequence.current || writing.current) return;
      if (current.current && value.mode.revision !== current.current.mode.revision)
        setEpoch((n) => n + 1);
      accept(value);
      setError("");
    } catch (cause) {
      if (read === sequence.current) setError((cause as Error).message);
    }
  }, [accept]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState !== "hidden") void load(); };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      ++sequence.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const write = useCallback(async (operation: Record<string, unknown>, generation?: number) => {
    const before = current.current;
    if (!before || writing.current) return false;
    // A delayed command from an unmounted pre-reset workspace cannot acquire the new generation.
    if (generation !== undefined && generation !== before.mode.generation) return false;
    writing.current = true;
    ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const value = await hubFetch<LaboratoryResponse>("/laboratory", {
        ...operation,
        generation: before.mode.generation,
        revision: before.mode.revision,
      }, true);
      accept(value);
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      // A failed or racing save never leaves the UI claiming uncommitted synthetic results.
      try {
        accept(await hubFetch<LaboratoryResponse>("/laboratory", undefined, true));
        setEpoch((n) => n + 1);
      } catch {
        current.current = null;
        setData(null);
      }
      setError(message + " · 최신 테스트 상태를 다시 확인해 주세요.");
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }, [accept]);
  return { data, busy, error, epoch, load, write };
}

export type TestModeController = ReturnType<typeof useTestMode>;
