import { useEffect, useState } from "react";
import { TutorialModal } from "../components/TutorialModal";
import {
  readHubBrowserValue,
  writeHubBrowserValue,
} from "../lib/event-hub-browser-storage";
import type {
  HubController,
  HubEvent,
  PrivateApplication,
} from "../lib/event-hub-client";
import { HubButton, HubCard, HubCheck, useHubDark } from "./HubUi";
export function ApplicationGuide({ event }: { event: HubEvent }) {
  const key = `binpc2_application_guide_v6:${event.campaign?.kind ?? "normal"}`;
  const [open, setOpen] = useState(false);
  const shouldOffer = !!event.campaign;
  useEffect(() => {
    if (!shouldOffer || readHubBrowserValue("session", key)) return;
    // Defer initial open past StrictMode's mount/cleanup probe; no phantom history entry.
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [key, shouldOffer]);
  const dark = useHubDark();
  const close = () => {
    setOpen(false);
    writeHubBrowserValue("session", key, "1");
  };
  useEffect(() => {
    if (!open) return;
    const marker = crypto.randomUUID();
    window.history.pushState(
      { ...window.history.state, applicationGuide: marker },
      "",
      window.location.href,
    );
    const back = () => {
      setOpen(false);
      writeHubBrowserValue("session", key, "1");
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("popstate", back);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("popstate", back);
      window.removeEventListener("keydown", escape);
      if (window.history.state?.applicationGuide === marker)
        window.history.back();
    };
  }, [open, key]);
  return (
    <>
      <HubButton onClick={() => setOpen(true)}>? 신청 방법</HubButton>
      {open && (
        <TutorialModal
          applicationMode={
            event.campaign?.kind === "tour"
              ? "tour"
              : event.campaign
                ? "halloween"
                : "normal"
          }
          darkMode={dark}
          onClose={close}
        />
      )}
    </>
  );
}
export function ScreeningPhoto({
  app,
  hub,
  admin = false,
}: {
  app: PrivateApplication;
  hub: HubController;
  admin?: boolean;
}) {
  const [consent, setConsent] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const object = URL.createObjectURL(file);
    setPreview(object);
    return () => URL.revokeObjectURL(object);
  }, [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!app.eligibility) return null;
  const act = (action: string, data: Record<string, unknown> = {}) =>
    hub.mutate({ action, target: app.id, revision: app.revision, data });
  return (
    <HubCard>
      <h3 className="font-black">관리자 사전 검토 · 비공개 사진</h3>
      <p>
        검토 상태: {app.eligibility.status} · {app.eligibility.message}
      </p>
      <p className="text-sm">
        1990년생 이전은 관리자에게 먼저 문의해 주세요. 사진으로
        나이·성별·성정체성을 자동 판단하지 않습니다. 사진 첨부는 요청받은
        경우에만 사용하세요.
      </p>
      {!admin &&
        app.eligibility.status === "review" &&
        (!app.screeningPhoto || app.screeningPhoto.deletedAt) && (
          <>
            <p className="text-xs">
              검토 목적으로만 사진을 저장합니다. 이 시험 기능은 원장에 원본1개만
              저장하고 별도 썸네일·서버 임시본을 만들지 않습니다. 미리보기는
              현재 브라우저 메모리입니다. 검토 후 원본 삭제를 확인할 수 있지만
              백업까지 즉시 삭제된다고 보장하지 않습니다. 운영 보관·백업 정책은
              미확정이며 운영 업로드는 차단됩니다.
            </p>
            <input
              aria-label="사전 검토 사진 선택"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                if (selected && selected.size > 2 * 1024 * 1024) {
                  setError("사진은 2MB 이하만 가능합니다.");
                  return;
                }
                setFile(selected);
                setError("");
              }}
            />
            {preview && (
              <img
                src={preview}
                alt="전송 전 사진 미리보기"
                className="max-h-48 rounded-xl"
              />
            )}
            <HubCheck
              label="사전 검토용 사진 별도 수집·이용 안내를 확인하고 동의합니다"
              checked={consent}
              onChange={setConsent}
            />
            <HubButton
              disabled={!file || !consent || hub.status === "saving"}
              onClick={async () => {
                const buffer = await file!.arrayBuffer();
                let binary = "";
                for (const byte of new Uint8Array(buffer))
                  binary += String.fromCharCode(byte);
                if (
                  await act("application.screening.photo", {
                    mime: file!.type,
                    base64: btoa(binary),
                    photoConsent: consent,
                  })
                )
                  setFile(null);
              }}
            >
              비공개 사진 전송
            </HubButton>
          </>
        )}
      {app.screeningPhoto && !app.screeningPhoto.deletedAt && (
        <>
          <HubButton
            onClick={async () => {
              try {
                const r = await fetch(
                  `/api/event-hub/screening-photo/${app.screeningPhoto!.id}`,
                  {
                    credentials: "include",
                    headers: admin
                      ? {
                          "x-admin-token":
                            localStorage.getItem("admin_token_v1") ?? "",
                        }
                      : {},
                  },
                );
                if (!r.ok)
                  throw new Error("사진이 없거나 열람 권한이 없습니다.");
                const next = URL.createObjectURL(await r.blob());
                if (url) URL.revokeObjectURL(url);
                setUrl(next);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            비공개 사진 열람
          </HubButton>
          {url && (
            <img
              src={url}
              alt="사전 검토 비공개 사진"
              className="max-h-48 rounded-xl"
            />
          )}
          <HubButton
            disabled={
              hub.status === "saving" ||
              (admin && app.eligibility.status === "review")
            }
            onClick={async () => {
              if (
                await act(
                  admin
                    ? "admin.application.screening.delete"
                    : "application.screening.delete",
                )
              ) {
                setUrl("");
                setFile(null);
              }
            }}
          >
            사진 원본 삭제·결과 확인
          </HubButton>
        </>
      )}
      {app.screeningPhoto?.deletedAt && (
        <p role="status">
          서버 원본 삭제 완료 · {app.screeningPhoto.deletedAt} · 별도 백업
          삭제는 미확인
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </HubCard>
  );
}
