import { useState, useEffect, useRef, useCallback } from "react";
import type { VerificationResponse } from "../../../../lib/api-zod/src/event-verification";
import { hubFetch } from "../lib/event-hub-client";
import { HubButton, HubCard, formatHubTime } from "./HubUi";
const labels = {
  PASS: "성공",
  FAIL: "실패",
  NOT_RUN: "미실행",
  UNKNOWN: "UNKNOWN · 미검증",
};
export function VerificationResults() {
  const [value, setValue] = useState<VerificationResponse | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const result = await hubFetch<VerificationResponse>(
        "/verification",
        undefined,
        true,
      );
      if (seq.current === n && mounted.current) {
        setValue(result);
        setError(result.error ?? "");
      }
    } catch {
      if (seq.current === n && mounted.current)
        setError("검사 이력을 읽지 못했습니다. 성공으로 처리하지 않습니다.");
    } finally {
      if (seq.current === n && mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  const clientFingerprint = import.meta.env.VITE_CODE_FINGERPRINT as
    string | undefined;
  const mismatch = !!(
    value?.currentFingerprint &&
    /^[a-f0-9]{64}$/.test(clientFingerprint ?? "") &&
    value.currentFingerprint !== clientFingerprint
  );
  const current = value?.runs.filter((r) => !r.historical && !mismatch) ?? [];
  return (
    <HubCard>
      <h3 className="font-black">코드 버전별 실제 검사결과</h3>
      <p className="text-sm">
        기존 CI·격리 DB에서 생성된 증거를 조회합니다. 이 화면에서는
        부하검사·시간변경·DB 초기화를 실행하지 않습니다.
      </p>
      <p className="text-xs break-all">
        {error ? "마지막 확인 코드" : "실행 중 코드"}:{" "}
        {value?.currentVersion ?? "확인 중"}
        {value?.builtAt && ` · 빌드 ${formatHubTime(value.builtAt)}`}
      </p>
      <p className="text-xs break-all">
        화면 빌드 지문: {clientFingerprint ?? "UNKNOWN"}
      </p>
      {mismatch && (
        <p role="alert" className="text-red-600">
          화면과 API의 코드 버전이 다릅니다. 아래 성공 기록을 현재 전체 앱
          검증으로 사용하지 않습니다.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {value && !current.length && (
        <p className="font-bold">
          현재 코드 버전 검사결과: 미실행/미등록. 아래 이전 성공 결과를 현재
          PASS로 사용하지 않습니다.
        </p>
      )}
      <HubButton disabled={loading} onClick={load}>
        {loading ? "검사 이력 조회 중…" : "저장된 실제 검사 이력 새로고침"}
      </HubButton>
      <div className="space-y-3">
        {value?.runs.map((run) => (
          <details
            key={run.id}
            open={!run.historical}
            className="rounded-xl border p-3"
          >
            <summary className="font-bold">
              {error
                ? "재조회 실패 · 마지막 확인 기록"
                : run.historical
                  ? "과거 버전"
                  : "현재 코드 내용과 일치"}{" "}
              · {run.id} · {formatHubTime(run.startedAt)}
            </summary>
            <p className="text-xs break-all">검사 커밋: {run.sourceVersion}</p>
            {run.codeFingerprint && (
              <p className="text-xs break-all">
                코드 내용 지문: {run.codeFingerprint}
              </p>
            )}
            <p className="text-sm">환경: {run.environment}</p>
            <p className="text-xs">
              시작 {formatHubTime(run.startedAt)} / 종료{" "}
              {run.finishedAt ? formatHubTime(run.finishedAt) : "기록 없음"}
            </p>
            <a
              href={run.reportUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              관련 실제 보고서·실행 기록
            </a>
            <ul className="mt-3 space-y-2">
              {run.checks.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg bg-slate-50 p-2 text-slate-900"
                >
                  <strong>
                    {c.title}: {labels[c.status]}
                  </strong>
                  <span className="text-xs">
                    {" "}
                    · {c.kind}
                    {c.count !== undefined ? ` · ${c.count}개` : ""}
                  </span>
                  {c.reason && <p className="text-sm">{c.reason}</p>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="text-xs">
        문서·검사 이력만 바뀐 커밋은 앱·의존성·빌드·시험 코드의 지문이 모두 같을
        때만 동일 코드로 묶습니다. 실제 코드가 다르면 과거 결과입니다.
      </p>
      <p className="text-xs">
        가상 시험실(laboratory), 실제 DB(postgres/mixed-http-postgres),
        실기기(physical-device)를 구분합니다. 물리 Galaxy/iPhone 기록이 없으면
        UNKNOWN입니다.
      </p>
    </HubCard>
  );
}
