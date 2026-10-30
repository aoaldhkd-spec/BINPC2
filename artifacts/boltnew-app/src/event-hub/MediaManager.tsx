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
export function MediaManager({ event, hub, ensureEvent, fixedPurpose, coverMode = false, pickRequest = 0 }: {
  event?: HubEvent; hub: HubController; ensureEvent?: () => Promise<HubEvent | undefined>;
  fixedPurpose?: Purpose; coverMode?: boolean; pickRequest?: number;
}) {
  const [purpose, setPurpose] = useState<Purpose>(fixedPurpose ?? "notice");
  const [files, setFiles] = useState<File[]>([]), [previews, setPreviews] = useState<string[]>([]);
  const [alt, setAlt] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"upload" | "library">("upload"), [previewOpen, setPreviewOpen] = useState(true);
  const [replacement, setReplacement] = useState<string | null>(null), [saved, setSaved] = useState("");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({}), [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null), saving = useRef(false);
  useEffect(() => { if (pickRequest > 0) input.current?.click(); }, [pickRequest]);
  const waiting = busy || hub.status === "saving" || hub.status === "checking";
  const visible = (event?.materials ?? []).filter(item => !item.hidden && event?.media?.includes(item.url));
  const coverId = visible.find(item => item.purpose === "notice")?.id;
  const library = (event?.materials ?? []).filter(item => !fixedPurpose || item.purpose === fixedPurpose);
  const uploadLabel = fixedPurpose ? "사진 선택" : coverMode && purpose === "notice" ? "포스터 업로드" : purpose === "map" ? "지도 사진 업로드" : purpose === "video" ? "영상 업로드" : "사진 업로드";
  useEffect(() => { const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach(url => URL.revokeObjectURL(url)); }, [files]);
  const choose = (list: File[]) => {
    if (waiting || saving.current) return;
    const valid = list.filter(file => (purpose === "video" ? ["video/mp4", "video/webm"] : ["image/png", "image/jpeg", "image/webp"]).includes(file.type) && file.size <= (purpose === "video" ? 5 : 2) * 1024 * 1024);
    if (valid.length !== list.length) hub.setError("사진은 PNG/JPEG/WebP 2MB, 영상은 MP4/WebM 5MB 이하입니다. HEIC는 지원하지 않습니다.");
    setFiles(previous => [...previous, ...valid].slice(0, replacement ? 1 : 10)); setSaved(""); if(valid.length) setConfirmed(false); setPreviewOpen(true);
  };
  async function upload() {
    if (saving.current || waiting || !files.length || (purpose === "notice" && !confirmed)) return;
    saving.current = true; setBusy(true); setSaved("");
    try {
      let current = event ?? await ensureEvent?.();
      if (!current) return;
      for (const file of files) {
        current = (await hub.load()).events.find(value => value.id === current!.id);
        if (!current) throw Error("행사 정보를 다시 확인해 주세요.");
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const result = await hub.mutate({ action: "event.media.upload", target: current.id, revision: current.revision,
          data: { purpose, publicConfirmed: confirmed, alt, mime: file.type, base64: btoa(binary), ...(replacement ? { replaceId: replacement } : {}) } });
        if (!result) return;
        // The upload is durable even if a later reordering conflicts. Never upload it twice.
        setFiles(previous => previous.filter(value => value !== file));
        if (!replacement && coverMode && purpose === "notice") {
          const latest = (await hub.load()).events.find(value => value.id === current!.id);
          if (!latest) throw Error("사진은 저장됐습니다. 목록을 다시 확인해 주세요.");
          const items = (latest.materials ?? []).map(item => ({ id: item.id, alt: item.alt, hidden: item.hidden }));
          const newItem = latest.materials?.find(item => item.url === result.mediaUrl);
          if (!newItem) throw Error("사진은 저장됐습니다. 목록을 다시 확인해 주세요.");
          const newIndex = items.findIndex(item => item.id === newItem.id);
          const [added] = items.splice(newIndex, 1);
          items.unshift(added);
          const reordered = await hub.mutate({ action: "event.media.update", target: latest.id, revision: latest.revision, data: { items } });
          if (!reordered) { setPanel("library"); setReplacement(null); return; }
        }
      }
      setReplacement(null); setAlt(""); setConfirmed(false); setSaved("사진 저장 완료"); setPanel("library");
    } catch (error) { hub.setError(error instanceof Error ? error.message : "저장하지 못했습니다. 선택한 파일은 남아 있습니다."); }
    finally { saving.current = false; setBusy(false); }
  }
  async function change(id: string, action: "up" | "down" | "hide" | "cover" | "alt", value?: string) {
    if (!event || waiting || saving.current) return;
    const items = (event.materials ?? []).map(item => ({ id: item.id, alt: item.alt, hidden: item.hidden }));
    const index = items.findIndex(item => item.id === id); if (index < 0) return;
    if (action === "up" || action === "down") {
      const position = library.findIndex(item => item.id === id);
      const adjacent = library[position + (action === "up" ? -1 : 1)];
      const destination = items.findIndex(item => item.id === adjacent?.id);
      if (destination < 0) return;
      [items[index], items[destination]] = [items[destination], items[index]];
    }
    if (action === "hide") items[index].hidden = !items[index].hidden;
    if (action === "alt") items[index].alt = value ?? "";
    if (action === "cover") {
      if (event.materials?.find(item => item.id === id)?.purpose !== "notice") return;
      const [cover] = items.splice(index, 1); cover.hidden = false; items.unshift(cover);
    }
    saving.current = true; setBusy(true); setSaved("");
    try { if (await hub.mutate({ action: "event.media.update", target: event.id, revision: event.revision, data: { items } })) {
      setSaved("사진 설정 저장 완료");
      if (action === "alt") setDescriptions(previous => { const next = { ...previous }; if (next[id] === value) delete next[id]; return next; });
    } }
    finally { saving.current = false; setBusy(false); }
  }
  return <HubCard>
    <h3 className="font-black">{coverMode ? "행사 포스터·대표 이미지" : fixedPurpose ? labels[fixedPurpose] : "행사 자료"}</h3>
    {!fixedPurpose && <div className="hub-compact-actions hub-media-actions">{(Object.keys(labels) as Purpose[]).map(value => <HubButton key={value} aria-pressed={purpose === value} disabled={waiting || files.length > 0} onClick={() => { setPurpose(value); setConfirmed(false); setReplacement(null); setPanel("upload"); }}>{coverMode && value === "notice" ? "공개 포스터" : `${labels[value]} 추가`}</HubButton>)}</div>}
    <div className="hub-compact-actions hub-media-actions">
      <HubButton aria-pressed={panel === "upload"} disabled={waiting} onClick={() => { setPanel("upload"); input.current?.click(); }}>{uploadLabel}</HubButton>
      <HubButton aria-pressed={panel === "library"} disabled={waiting} onClick={() => setPanel("library")}>기존 이미지 선택{library.length ? ` (${library.length})` : ""}</HubButton>
    </div>
    <input ref={input} type="file" className="sr-only" aria-label={`${labels[purpose]} 파일 선택`} multiple={!replacement} accept={purpose === "video" ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp"} disabled={waiting} onChange={e => { choose(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    <div hidden={panel !== "upload"} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(Array.from(e.dataTransfer.files)); }} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); choose(Array.from(e.clipboardData.files)); } }} className="space-y-3">
      {replacement && <div className="flex items-center justify-between gap-2"><p className="text-sm">교체할 사진 선택 · 이전 원본은 보존됩니다.</p><button type="button" className="min-h-11 px-3 underline text-sm shrink-0" disabled={waiting} onClick={() => { setReplacement(null); setConfirmed(false); setSaved(""); }}>교체 취소</button></div>}
      {!files.length && <p className="text-xs">{purpose === "video" ? "MP4·WebM · 5MB 이하" : "PNG·JPEG·WebP · 2MB 이하"}</p>}
      {!!files.length && <>
        <div className="hub-compact-actions hub-media-actions"><HubButton onClick={() => setPreviewOpen(value => !value)} aria-expanded={previewOpen}>미리보기</HubButton><HubButton data-primary="true" disabled={waiting || (purpose === "notice" && !confirmed)} onClick={() => void upload()}>{busy ? "저장 중…" : "저장"}</HubButton></div>
        {files.map((file, index) => <div key={file.name + file.lastModified + index} className="space-y-2">
          {previewOpen && <Preview url={previews[index] ?? ""} alt="선택한 자료 미리보기" video={file.type.startsWith("video/")} />}
          <p className="text-xs break-words">{file.name} · {(file.size / 1024).toFixed(0)}KB</p>
          <button type="button" className="min-h-11 px-3 underline text-sm" disabled={waiting} onClick={() => setFiles(previous => previous.filter(value => value !== file))}>선택 취소</button>
        </div>)}
        <HubField label="사진 설명 (선택)"><input className={inputClass} value={alt} maxLength={200} disabled={waiting} onChange={e => setAlt(e.target.value)} /></HubField>
        {purpose === "notice" ? <HubCheck checked={confirmed} onChange={setConfirmed} label="신청 전 공개할 사진입니다. 계좌·상세 장소·개인정보가 없는지 확인했습니다." /> : <p className="text-sm">승인된 참가자에게만 공개합니다.</p>}
      </>}
    </div>
    {panel === "library" && <div className="grid sm:grid-cols-2 gap-3">
      {!library.length && <p className="text-sm">저장한 이미지가 없습니다.</p>}
      {library.map((item, index) => <article key={item.id} className="rounded-xl border p-3 space-y-2">
        <p className="font-bold text-sm">{labels[item.purpose]} · {item.hidden ? "연결 해제됨" : item.purpose === "notice" ? "신청 전 공개" : "승인 후 공개"}{item.id === coverId ? " · 대표 이미지" : ""}</p>
        <details open={expanded[item.id] ?? false} onToggle={e => { const open = e.currentTarget.open; setExpanded(previous => previous[item.id] === open ? previous : { ...previous, [item.id]: open }); }}><summary className="cursor-pointer min-h-11 py-3 text-sm">미리보기</summary>{expanded[item.id] && <Preview url={item.url} alt={item.alt || labels[item.purpose]} secured video={item.purpose === "video"} />}</details>
        <input aria-label="저장한 사진 설명" value={descriptions[item.id] ?? item.alt} className={inputClass} maxLength={200} disabled={waiting} onChange={e => setDescriptions(previous => ({ ...previous, [item.id]: e.target.value }))} />
        {descriptions[item.id] !== undefined && descriptions[item.id] !== item.alt && <HubButton disabled={waiting} onClick={() => void change(item.id, "alt", descriptions[item.id])}>설명 저장</HubButton>}
        <div className="hub-compact-actions hub-media-actions">
          <HubButton disabled={waiting || index === 0} onClick={() => void change(item.id, "up")}>앞으로</HubButton>
          <HubButton disabled={waiting || index === library.length - 1} onClick={() => void change(item.id, "down")}>뒤로</HubButton>
          <HubButton disabled={waiting || files.length > 0} onClick={() => { setPurpose(item.purpose); setReplacement(item.id); setConfirmed(false); setPanel("upload"); setTimeout(() => input.current?.click(), 0); }}>교체</HubButton>
          <HubButton disabled={waiting} onClick={() => void change(item.id, "hide")}>{item.hidden ? "복원" : "연결 해제"}</HubButton>
          {item.purpose === "notice" && <HubButton disabled={waiting || item.id === coverId} onClick={() => void change(item.id, "cover")}>대표 이미지 지정</HubButton>}
        </div>
      </article>)}
    </div>}
    {saved && <p role="status" className="text-sm">{saved}</p>}
    {busy && <p role="status" className="text-sm">저장 중…</p>}
  </HubCard>;
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
  const [section, setSection] = useState<"notice" | "map" | "private">("notice");
  const [noticeMode, setNoticeMode] = useState<"text" | "photo" | "preview">("text"), [mapMode, setMapMode] = useState<"text" | "photo" | "preview">("text");
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState("");
  const [noticePick, setNoticePick] = useState(0), [mapPick, setMapPick] = useState(0);
  const saveLock = useRef(false);
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
  async function save(scope: "notice" | "map") {
    if (saveLock.current || hub.status === "saving" || hub.status === "checking") return;
    saveLock.current = true; setSaving(true); setSaved("");
    try {
      const latest = (await hub.load()).events.find((e) => e.id === event.id);
      if (!latest) return;
      const selectedFields = scope === "notice" ? ["notice", "area"] as const : ["address", "mapUrl"] as const;
      const changed = selectedFields.filter((k) => values[k] !== initial.current[k]);
      if (!changed.length) { setSaved("변경된 내용이 없습니다"); return; }
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
      if (result) { initial.current = { ...initial.current, ...Object.fromEntries(changed.map(key => [key, values[key]])) }; setSaved(scope === "notice" ? "공지 저장 완료" : "장소 저장 완료"); }
    } catch {
      hub.setError("서버에 연결하지 못했습니다. 작성한 내용은 남아 있습니다.");
    } finally { saveLock.current = false; setSaving(false); }
  }
  const waiting = saving || hub.status === "saving" || hub.status === "checking";
  const update = (field: (typeof fields)[number], value: string) => { setValues(previous => ({ ...previous, [field]: value })); setSaved(""); };
  return <div className="space-y-3">
    <div className="hub-compact-actions hub-media-actions" role="tablist" aria-label="공지·장소 편집">
      {([['notice','공지사항'],['map','지도·장소'],['private','대기방 자료']] as const).map(([value,label]) => <HubButton key={value} role="tab" aria-selected={section===value} onClick={()=>setSection(value)}>{label}</HubButton>)}
    </div>
    <div hidden={section!=="notice"} className="space-y-3">
      <HubCard>
        <h3 className="font-black">공지사항</h3>
        <div className="hub-compact-actions hub-media-actions">
          <HubButton aria-pressed={noticeMode==="text"} onClick={()=>setNoticeMode("text")}>글 작성</HubButton>
          <HubButton aria-pressed={noticeMode==="photo"} onClick={()=>{setNoticeMode("photo");setNoticePick(value=>value+1);}}>사진 업로드</HubButton>
          <HubButton aria-pressed={noticeMode==="preview"} onClick={()=>setNoticeMode("preview")}>미리보기</HubButton>
          <HubButton data-primary="true" disabled={waiting} onClick={()=>void save("notice")}>{saving?"저장 중…":"저장"}</HubButton>
        </div>
        <div hidden={noticeMode!=="text"} className="space-y-3">
          <HubField label="참가자 공지"><textarea className={inputClass} rows={5} value={values.notice} onChange={e=>update("notice",e.target.value)} /></HubField>
          <HubField label="신청 전 공개할 지역"><input className={inputClass} value={values.area} onChange={e=>update("area",e.target.value)} /></HubField>
        </div>
        {noticeMode==="preview"&&<div className="space-y-3"><p className="whitespace-pre-wrap text-sm">{values.notice}</p>{event.materials?.filter(item=>item.purpose==="notice"&&!item.hidden&&event.media.includes(item.url)).map(item=><Preview key={item.id} url={item.url} alt={item.alt||"공지 사진"} secured/>)}</div>}
      </HubCard>
      <div hidden={noticeMode!=="photo"}><MediaManager event={event} hub={hub} fixedPurpose="notice" pickRequest={noticePick}/></div>
    </div>
    <div hidden={section!=="map"} className="space-y-3">
      <HubCard>
        <h3 className="font-black">승인 후 공개할 상세 장소</h3>
        <div className="hub-compact-actions hub-media-actions">
          <HubButton aria-pressed={mapMode==="photo"} onClick={()=>{setMapMode("photo");setMapPick(value=>value+1);}}>지도 사진 업로드</HubButton>
          <HubButton aria-pressed={mapMode==="text"} onClick={()=>setMapMode("text")}>장소 안내 작성</HubButton>
          <HubButton aria-pressed={mapMode==="preview"} onClick={()=>setMapMode("preview")}>미리보기</HubButton>
          <HubButton data-primary="true" disabled={waiting} onClick={()=>void save("map")}>{saving?"저장 중…":"저장"}</HubButton>
        </div>
        <div hidden={mapMode!=="text"} className="space-y-3">
          <HubField label="상세 주소·층수"><input className={inputClass} value={values.address} onChange={e=>update("address",e.target.value)}/></HubField>
          <HubField label="지도 링크 (선택)"><input type="url" className={inputClass} value={values.mapUrl} onChange={e=>update("mapUrl",e.target.value)}/></HubField>
        </div>
        {mapMode==="preview"&&<div className="space-y-3"><p>{values.address||"상세 주소 미등록"}</p>{values.mapUrl&&<p className="text-sm break-all">{values.mapUrl}</p>}{event.materials?.filter(item=>item.purpose==="map"&&!item.hidden&&event.media.includes(item.url)).map(item=><Preview key={item.id} url={item.url} alt={item.alt||"승인자용 지도"} secured/>)}</div>}
      </HubCard>
      <div hidden={mapMode!=="photo"}><MediaManager event={event} hub={hub} fixedPurpose="map" pickRequest={mapPick}/></div>
    </div>
    <div hidden={section!=="private"}><MediaManager event={event} hub={hub}/></div>
    {saved&&<p role="status" className="text-sm">{saved}</p>}
  </div>;
}
