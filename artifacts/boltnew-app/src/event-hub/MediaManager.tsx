import { useEffect, useState, useRef } from "react";
import type { HubEvent, HubController } from "../lib/event-hub-client";
import { HubButton, HubCard, HubCheck, HubField, inputClass } from "./HubUi";
import { readHubBrowserValue } from "../lib/event-hub-browser-storage";
type Purpose = "notice" | "map" | "poster" | "video";
const labels: Record<Purpose, string> = {
  notice: "공지 사진",
  map: "지도·약도 사진",
  poster: "사진·포스터",
  video: "영상",
};
export function Preview({
  url,
  alt,
  video = false,
  secured = false,
  interactive = true,
}: {
  url: string;
  alt: string;
  video?: boolean;
  secured?: boolean;
  interactive?: boolean;
}) {
  const [src, setSrc] = useState(secured ? "" : url);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    if (!secured) {
      setSrc(url);
      return;
    }
    let active = true,
      object = "";
    setSrc("");
    const abort = new AbortController();
    void fetch(url, {
      credentials: "include",
      headers: {
        "x-admin-token": readHubBrowserValue("local", "admin_token_v1") ?? "",
      },
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        object = URL.createObjectURL(await r.blob());
        if (active) setSrc(object);
        else URL.revokeObjectURL(object);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      abort.abort();
      if (object) URL.revokeObjectURL(object);
    };
  }, [url, secured, retry]);
  return src ? (
    video ? (
      <video
        src={src}
        controls
        preload="none"
        className="w-full max-h-56 rounded-xl"
      />
    ) : !interactive ? (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full object-contain"
      />
    ) : (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label={`${alt} 크게 보기`}
      >
        <img
          src={src}
          alt={alt}
          className="w-full max-h-56 object-contain rounded-xl"
        />
      </a>
    )
  ) : failed && !interactive ? (
    <span className="text-xs">사진을 불러오지 못했습니다</span>
  ) : failed ? (
    <div role="alert" className="space-y-2 text-sm">
      <p>미리보기를 불러오지 못했습니다. 저장한 원본은 그대로 있습니다.</p>
      <button
        type="button"
        className="underline font-bold"
        onClick={() => setRetry((n) => n + 1)}
      >
        미리보기 다시 불러오기
      </button>
    </div>
  ) : (
    <p>사진을 불러오는 중…</p>
  );
}
export function MediaManager({
  event,
  hub,
  ensureEvent,
}: {
  event?: HubEvent;
  hub: HubController;
  ensureEvent?: () => Promise<HubEvent | undefined>;
}) {
  const [purpose, setPurpose] = useState<Purpose>("notice"),
    [files, setFiles] = useState<File[]>([]),
    [previews, setPreviews] = useState<string[]>([]),
    [alt, setAlt] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const choose = (list: File[]) => {
    const valid = list.filter(
      (f) =>
        [
          "image/png",
          "image/jpeg",
          "image/webp",
          "video/mp4",
          "video/webm",
        ].includes(f.type) &&
        f.size <= (f.type.startsWith("image/") ? 2 : 5) * 1024 * 1024,
    );
    if (valid.length !== list.length)
      hub.setError(
        "사진은 PNG/JPEG/WebP 2MB, 영상은 MP4/WebM 5MB 이하로 선택해 주세요. HEIC는 지원하지 않습니다.",
      );
    setFiles((p) => [...p, ...valid].slice(0, 10));
  };
  async function upload() {
    setBusy(true);
    try {
      let current = event ?? (await ensureEvent?.());
      if (!current) return;
      for (const file of files) {
        const state = await hub.load();
        current = state.events.find((e) => e.id === current!.id)!;
        if (!current) throw Error("행사 정보를 다시 확인해 주세요.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const result = await hub.mutate({
          action: "event.media.upload",
          target: current.id,
          revision: current.revision,
          data: {
            purpose,
            publicConfirmed: confirmed,
            alt,
            mime: file.type,
            base64: btoa(binary),
          },
        });
        if (!result) return;
        setFiles((p) => p.filter((f) => f !== file));
      }
    } catch (e) {
      hub.setError(
        e instanceof Error
          ? e.message
          : "사진을 저장하지 못했습니다. 선택한 파일은 남아 있습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(
    id: string,
    kind: "up" | "hide" | "alt",
    value?: string,
  ) {
    if (!event) return;
    const items = (event.materials ?? []).map((v) => ({
      id: v.id,
      alt: v.alt,
      hidden: v.hidden,
    }));
    const i = items.findIndex((v) => v.id === id);
    if (i < 0) return;
    if (kind === "up" && i > 0)
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (kind === "hide") items[i].hidden = !items[i].hidden;
    if (kind === "alt") items[i].alt = value ?? "";
    await hub.mutate({
      action: "event.media.update",
      target: event.id,
      revision: event.revision,
      data: { items },
    });
  }
  return (
    <HubCard>
      <h3 className="text-lg font-black">공지·장소 사진</h3>
      <p className="text-sm text-slate-600">
        공지 사진은 신청 전에, 지도와 대기방 자료는 승인된 참가자에게 보여요.
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Purpose[]).map((k) => (
          <button
            type="button"
            key={k}
            aria-pressed={purpose === k}
            disabled={busy || files.length > 0}
            onClick={() => {
              setPurpose(k);
              setConfirmed(false);
            }}
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${purpose === k ? "bg-teal-700 text-white" : "bg-white text-slate-700"}`}
          >
            {labels[k]} 추가
          </button>
        ))}
      </div>
      <div
        className="rounded-2xl border-2 border-dashed border-teal-200 p-4 space-y-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(Array.from(e.dataTransfer.files));
        }}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            choose(Array.from(e.clipboardData.files));
          }
        }}
      >
        <HubField label={`${labels[purpose]} 파일 선택`}>
          <input
            type="file"
            multiple
            accept={
              purpose === "video"
                ? "video/mp4,video/webm"
                : "image/png,image/jpeg,image/webp"
            }
            disabled={busy}
            onChange={(e) => {
              choose(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </HubField>
        <p className="text-xs text-slate-600">
          파일을 끌어놓거나 붙여넣을 수도 있어요. 사진 2MB / 영상 5MB 이하 ·
          원본 비율 유지
        </p>
        {files.map((f, i) => (
          <div key={f.name + f.lastModified + i}>
            <Preview
              url={previews[i] ?? ""}
              alt="선택한 자료 미리보기"
              video={f.type.startsWith("video/")}
            />
            <p className="text-xs">
              {f.name} · {(f.size / 1024).toFixed(0)}KB
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setFiles((p) => p.filter((x) => x !== f))}
            >
              선택 취소
            </button>
          </div>
        ))}
        <HubField label="사진 설명">
          <input
            className={inputClass}
            value={alt}
            maxLength={200}
            onChange={(e) => setAlt(e.target.value)}
          />
        </HubField>
        {purpose === "notice" ? (
          <HubCheck
            checked={confirmed}
            onChange={setConfirmed}
            label="신청 전 공개할 공지 사진입니다. 계좌·상세 장소·개인정보가 없는지 확인했습니다."
          />
        ) : (
          <p className="text-sm">
            입금 확인 또는 무료 참가 승인 후 본인에게만 공개됩니다.
          </p>
        )}
        <HubButton
          type="button"
          disabled={
            !files.length ||
            busy ||
            hub.status === "saving" ||
            (purpose === "notice" && !confirmed)
          }
          onClick={() => void upload()}
        >
          {busy ? "저장 중…" : "선택한 자료 저장"}
        </HubButton>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {event?.materials?.map((v) => (
          <article key={v.id} className="rounded-xl border p-3 space-y-2">
            <p className="font-bold">
              {labels[v.purpose]} ·{" "}
              {v.hidden
                ? "숨김"
                : v.purpose === "notice"
                  ? "신청 전 공개"
                  : "승인 후 공개"}
            </p>
            <Preview
              url={v.url}
              alt={v.alt || labels[v.purpose]}
              secured
              video={v.purpose === "video"}
            />
            <input
              aria-label="저장한 사진 설명"
              defaultValue={v.alt}
              key={v.id + v.alt}
              className={inputClass}
              maxLength={200}
              onBlur={(e) => {
                if (e.target.value !== v.alt)
                  void change(v.id, "alt", e.target.value);
              }}
            />
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                disabled={busy || hub.status === "saving"}
                onClick={() => void change(v.id, "up")}
              >
                앞으로
              </button>
              <button
                type="button"
                disabled={busy || hub.status === "saving"}
                onClick={() => void change(v.id, "hide")}
              >
                {v.hidden ? "다시 표시" : "연결 해제"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="text-xs text-slate-600">
        교체할 사진을 먼저 저장한 뒤 이전 자료의 연결을 해제하세요. 연결 해제는
        원본 삭제가 아닙니다.
      </p>
    </HubCard>
  );
}
export function NoticeEditor({
  event,
  hub,
  drafts,
}: {
  event: HubEvent;
  hub: HubController;
  drafts?: Record<string, Record<string, string>>;
}) {
  const fields = ["notice", "area", "address", "mapUrl"] as const;
  const initial = useRef(
    (drafts?.[event.id]?.__base
      ? JSON.parse(drafts[event.id].__base)
      : Object.fromEntries(fields.map((k) => [k, event[k]]))) as Record<
      (typeof fields)[number],
      string
    >,
  );
  const [values, setValues] = useState(
    (drafts?.[event.id] ?? initial.current) as typeof initial.current,
  );
  useEffect(() => {
    if (drafts)
      drafts[event.id] = { ...values, __base: JSON.stringify(initial.current) };
  }, [values, drafts, event.id]);
  async function save() {
    try {
      const latest = (await hub.load()).events.find((e) => e.id === event.id);
      if (!latest) return;
      const changed = fields.filter((k) => values[k] !== initial.current[k]);
      if (
        changed.some(
          (k) => latest[k] !== initial.current[k] && latest[k] !== values[k],
        )
      ) {
        hub.setError(
          "다른 관리자가 같은 내용을 변경했습니다. 작성한 내용은 남아 있습니다. 최신 내용과 비교해 주세요.",
        );
        return;
      }
      const result = await hub.mutate({
        action: "event.save",
        target: event.id,
        revision: latest.revision,
        data: {
          ...latest,
          ...Object.fromEntries(changed.map((k) => [k, values[k]])),
        },
      });
      if (result) initial.current = { ...values };
    } catch {
      hub.setError("서버에 연결하지 못했습니다. 작성한 내용은 남아 있습니다.");
    }
  }
  return (
    <div className="space-y-4">
      <HubCard>
        <h3 className="font-black">공지·장소 수정</h3>
        <HubField label="참가자 공지">
          <textarea
            className={inputClass}
            rows={5}
            value={values.notice}
            onChange={(e) =>
              setValues((v) => ({ ...v, notice: e.target.value }))
            }
          />
        </HubField>
        <HubField label="신청 전 공개할 지역">
          <input
            className={inputClass}
            value={values.area}
            onChange={(e) => setValues((v) => ({ ...v, area: e.target.value }))}
          />
        </HubField>
        <details>
          <summary className="cursor-pointer font-bold py-2">
            승인 후 공개할 상세 장소
          </summary>
          <div className="space-y-3">
            <HubField label="상세 주소·층수">
              <input
                className={inputClass}
                value={values.address}
                onChange={(e) =>
                  setValues((v) => ({ ...v, address: e.target.value }))
                }
              />
            </HubField>
            <HubField label="지도 링크 (선택)">
              <input
                type="url"
                className={inputClass}
                value={values.mapUrl}
                onChange={(e) =>
                  setValues((v) => ({ ...v, mapUrl: e.target.value }))
                }
              />
            </HubField>
            <p className="text-sm">
              지도·약도 사진은 아래에서 바로 추가할 수 있어요.
            </p>
          </div>
        </details>
        <HubButton
          disabled={hub.status === "saving"}
          onClick={() => void save()}
        >
          공지·장소 저장
        </HubButton>
      </HubCard>
      <MediaManager event={event} hub={hub} />
    </div>
  );
}
