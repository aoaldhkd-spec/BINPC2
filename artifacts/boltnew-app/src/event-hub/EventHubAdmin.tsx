import { EVENT_THEME_PRESETS } from "../../../../lib/api-zod/src/event-hub-modules";
import { ScreeningPhoto } from "./CampaignParticipant";
import {
  CampaignSetup,
  CampaignOperations,
  CampaignApproval,
} from "./CampaignAdmin";
import { useState } from "react";
import {
  budgetSplit,
  useEventHub,
  profileMissing,
  type HubEvent,
  type PrivateApplication,
  type HubState,
  type HubSettings,
  type HubController,
} from "../lib/event-hub-client";
import { PrivacyManagement, OwnerRecoveryControls } from "./PrivacyManagement";
import { NoticeHistory } from "./NoticeHistory";
import { NotificationReadiness } from "./NotificationReadiness";
import { EventLaboratory } from "./EventLaboratory";
import {
  formatHubTime,
  HubLoading,
  HubButton,
  HubCard,
  HubField,
  HubCheck,
  HubFeedback,
  inputClass,
} from "./HubUi";

type Hub = HubController;
const initialEvent = {
  campaign: undefined as HubEvent["campaign"],
  theme: undefined as HubEvent["theme"],
  themeEnabled: false,
  replyNotice: "",
  venueCandidates: [] as string[],
  opensAt: undefined as string | undefined,
  title: "술번개 신청",
  type: "normal" as const,
  date: "",
  start: "22:00",
  end: "01:00",
  area: "",
  address: "",
  mapUrl: "",
  fee: 0,
  deposit: 0,
  account: "",
  deadline: "",
  included: "",
  notice:
    "성인·신분증 확인이 필요합니다. 지각·불참·중도퇴장 규정과 포함 내역을 작성해 주세요.\n관리자 업무·취침 중 입금 확인이 늦어질 수 있습니다. 상세 주소는 입금 승인 후 공개합니다.",
  noticeVersion: 1,
  benefitsEnabled: false,
  benefits: [] as HubEvent["benefits"],
  cardsEnabled: false,
  notificationsEnabled: false,
  media: [] as string[],
};
export default function EventHubAdmin() {
  const hub = useEventHub(true);
  const [tab, setTab] = useState("행사·자동방"),
    [selected, setSelected] = useState(""),
    [newEvent, setNewEvent] = useState(false);
  const s = hub.state;
  if (!s)
    return (
      <div className="p-4">
        <HubLoading label="행사 운영기록을 불러오는 중…" />
        <HubFeedback status={hub.status} error={hub.error} />
      </div>
    );
  const event = s.events.find((e) => e.id === selected);
  const tabs = [
    "행사·자동방",
    "신청·입금",
    "공지·미디어",
    "관리자 문의",
    "현장·상품",
    "이력·개인정보",
    "🧪 선착순 시험실",
  ];
  return (
    <div className="p-3 sm:p-5 space-y-4 text-slate-900 pb-24">
      <h2 className="text-xl font-black">🎉 술번개 운영</h2>
      <p className="text-xs">
        초안 생성 ≠ 모집 시작 ≠ 기존 회식 시작 · 금전·외부 발송은 자동 처리하지
        않습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl p-3 text-xs font-bold border ${tab === t ? "bg-teal-700 text-white" : "bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <HubFeedback status={hub.status} error={hub.error} />
      <HubField label="관리할 행사">
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setNewEvent(false);
          }}
        >
          <option value="">행사를 선택하세요</option>
          {s.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.date} · {e.title} · {e.recruitment ? "접수 중" : "초안/마감"}
            </option>
          ))}
        </select>
      </HubField>
      {tab === "행사·자동방" && (
        <>
          <CampaignSetup hub={hub} />
          <HubButton
            onClick={() => {
              setNewEvent(true);
              setSelected("");
            }}
          >
            + 술번개 만들기
          </HubButton>
          {(newEvent || event) && (
            <EventEditor
              key={event?.id ?? "new"}
              event={event}
              hub={hub}
              places={s.settings?.places ?? []}
              onSaved={(id) => {
                setSelected(id);
                setNewEvent(false);
              }}
            />
          )}
          {s.settings && (
            <AutoSettings
              value={s.settings}
              preview={s.nextSaturday ?? ""}
              hub={hub}
            />
          )}
        </>
      )}
      {tab === "공지·미디어" && event && (
        <EventEditor
          key={`notice:${event.id}`}
          event={event}
          hub={hub}
          places={s.settings?.places ?? []}
          onSaved={setSelected}
        />
      )}
      {tab === "신청·입금" && (
        <>
          {event && <CampaignOperations event={event} hub={hub} />}
          <p className="text-sm">
            실제 은행 거래를 직접 대조한 뒤 승인하세요. ‘입금했어요’는 신고일
            뿐입니다.
          </p>
          {s.applications
            .filter((a) => !selected || a.eventId === selected)
            .map((a) => (
              <ApplicationAdmin key={a.id} app={a} hub={hub} />
            ))}
        </>
      )}
      {tab === "관리자 문의" && <AdminThreads hub={hub} state={s} />}
      {tab === "현장·상품" && (
        <>
          <p className="text-sm">
            {event?.campaign
              ? "확정 행사별 실물·할인권 재고만 관리합니다. 현금 상금을 추가하거나 자동 지급하지 않습니다."
              : "금요일30% / 토요일70%는 과거 검토용 예산 배분입니다. 현금 무작위 지급은 비활성입니다."}
          </p>
          {!event?.campaign && <BudgetPreview hub={hub} />}
          {event && !event.campaign && (
            <StockForm eventId={event.id} hub={hub} />
          )}
          <HubCard>
            {s.stocks
              .filter((v) => !selected || v.eventId === selected)
              .map((v) => (
                <p key={v.id}>
                  {v.label} · 남은 재고 {v.remaining}
                </p>
              ))}
          </HubCard>
          {s.applications
            .filter((a) => !selected || a.eventId === selected)
            .map((a) => (
              <ApplicationAdmin key={a.id} app={a} hub={hub} onsite />
            ))}
        </>
      )}
      {tab === "이력·개인정보" && (
        <>
          <NotificationReadiness event={event} />
          <PrivacyManagement hub={hub} />
          <MemberManagement hub={hub} state={s} />
          <HubCard>
            <h3 className="font-black">현장·운영·재사용 기록 분리</h3>
            <p className="text-sm">
              현장 프로필·하트·채팅은 기존 17시 초기화 대상입니다.
              신청·입금·문의·경품은 별도 원장으로 보존합니다. 재사용 비밀번호는
              해시로만 보관하며 관리자에게 표시하지 않습니다. 개인정보 삭제·제한
              정책의 운영 적용은 별도 검토가 필요합니다.
            </p>
          </HubCard>
          {s.events.map((e) => (
            <HubCard key={e.id}>
              <h3>
                {e.date} {e.title}
              </h3>
              <Audit rows={e.history} />
            </HubCard>
          ))}
        </>
      )}
      {tab === "🧪 선착순 시험실" && (
        <EventLaboratory key={event?.id ?? "default"} event={event} />
      )}
    </div>
  );
}
function EventEditor({
  event,
  hub,
  onSaved,
  places,
}: {
  event?: HubEvent;
  hub: Hub;
  onSaved: (id: string) => void;
  places: HubSettings["places"];
}) {
  const [v, setV] = useState({ ...initialEvent, ...event }),
    [preview, setPreview] = useState(false),
    [media, setMedia] = useState(event?.media.join("\n") ?? "");
  const set = (key: string, value: unknown) =>
    setV((p) => ({ ...p, [key]: value }));
  return (
    <HubCard>
      <h3 className="font-black">
        {event ? "행사 설정·변경" : "새 술번개 초안"}
      </h3>
      <NoticeHistory history={event?.versions} />
      {v.campaign && (
        <>
          <p>행사 정책: {v.campaign.kind} · BINPC2 1차만 신청</p>
          {v.campaign.kind === "tour" && (
            <HubField label="전국투어 선입금액 (최종 회비 아님)">
              <input
                type="number"
                min="1"
                className={inputClass}
                value={v.campaign.advance ?? ""}
                onChange={(e) =>
                  set("campaign", {
                    ...v.campaign,
                    advance: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </HubField>
          )}
          <HubField label="2차 오픈채팅 링크 (미정이면 빈칸)">
            <input
              className={inputClass}
              value={v.campaign.secondRoundLink}
              onChange={(e) =>
                set("campaign", {
                  ...v.campaign,
                  secondRoundLink: e.target.value,
                })
              }
            />
          </HubField>
          <p>
            매장 후보 (차수 배정 아님):{" "}
            {v.venueCandidates?.join(", ") || "운영자 확인"}
          </p>
        </>
      )}
      <HubField label="행사 테마">
        <select
          className={inputClass}
          value={v.theme ?? "default"}
          onChange={(e) => set("theme", e.target.value)}
        >
          {["default", "halloween", "christmas", "yearend"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </HubField>
      <HubCheck
        label="행사 카드 테마 ON"
        checked={v.themeEnabled ?? false}
        onChange={(b) => set("themeEnabled", b)}
      />
      <div
        className="rounded-xl p-3"
        style={{
          ...EVENT_THEME_PRESETS[
            v.themeEnabled ? (v.theme ?? "default") : "default"
          ],
        }}
      >
        테마 미리보기{" "}
        {v.theme === "halloween" && v.themeEnabled ? "🎃 ✦" : "기본 BINPC2"}
      </div>
      <HubButton
        onClick={() => {
          set("theme", "default");
          set("themeEnabled", false);
        }}
      >
        기본 테마 복원 (저장 필요)
      </HubButton>
      <HubField label="운영자 답변 자동 안내">
        <textarea
          className={inputClass}
          value={v.replyNotice ?? ""}
          onChange={(e) => set("replyNotice", e.target.value)}
        />
      </HubField>
      <HubField label="저장된 행사·공지 템플릿">
        <select
          className={inputClass}
          defaultValue=""
          onChange={(e) => {
            const t = hub.state?.settings?.templates?.[Number(e.target.value)];
            if (t) {
              setV((v) => ({ ...v, ...t.event, date: v.date }));
              setMedia(t.event.media.join("\n"));
            }
          }}
        >
          <option value="">템플릿 선택 (행사 날짜는 유지)</option>
          {hub.state?.settings?.templates?.map((t, i) => (
            <option key={i} value={i}>
              {t.name}
            </option>
          ))}
        </select>
      </HubField>
      <HubField label="모집 시작 예약 시각 (한국시간, 비우면 즉시)">
        <input
          type="datetime-local"
          className={inputClass}
          value={
            v.opensAt
              ? new Date(Date.parse(v.opensAt) + 9 * 3600000)
                  .toISOString()
                  .slice(0, 16)
              : ""
          }
          onChange={(e) =>
            set(
              "opensAt",
              e.target.value
                ? new Date(`${e.target.value}:00+09:00`).toISOString()
                : undefined,
            )
          }
        />
      </HubField>
      {hub.state?.settings && !v.campaign && (
        <HubButton
          onClick={() => {
            const s = hub.state!.settings!;
            const { date: _date, ...template } = v;
            void hub.mutate({
              action: "settings.save",
              revision: s.revision ?? 0,
              data: {
                ...s,
                templates: [
                  ...(s.templates ?? []),
                  {
                    name: v.title,
                    event: {
                      ...template,
                      media: media
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(
                          (url) =>
                            Boolean(url) &&
                            !url.startsWith("/api/event-hub/media/"),
                        ),
                    },
                  },
                ],
              },
            });
          }}
        >
          현재 공지·장소·회비를 기본 템플릿으로 저장 (행사별 업로드 제외)
        </HubButton>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await hub.mutate({
            action: "event.save",
            target: event?.id,
            revision: event?.revision,
            data: {
              ...v,
              media: media
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          });
          if (r?.id) onSaved(String(r.id));
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <HubField label="행사 종류">
            <select
              className={inputClass}
              value={v.type}
              onChange={(e) => {
                set("type", e.target.value);
                set(
                  "title",
                  e.target.value === "halloween"
                    ? "할로윈 이벤트 술번개"
                    : "술번개 신청",
                );
              }}
            >
              <option value="normal">일반 행사</option>
              <option value="halloween">할로윈</option>
              {v.campaign?.kind === "tour" && (
                <option value="tour">전국투어 (1차 전용)</option>
              )}
              <option value="custom">직접 입력</option>
            </select>
          </HubField>
          {(
            [
              ["title", "행사 제목", "text"],
              ["date", "날짜", "date"],
              ["start", "시작 시간", "time"],
              ["end", "종료 시간 (다음 날 가능)", "time"],
              ["area", "대략적인 지역", "text"],
              ["address", "상세 주소·층수 (입금 승인자만 공개)", "text"],
              ["mapUrl", "지도 HTTPS 링크", "url"],
              ["fee", "일반 회비 (원)", "number"],
              ["deposit", "선입금 (원)", "number"],
              ["account", "계좌·예금주", "text"],
              ["deadline", "입금 기한", "text"],
              ["included", "포함 내용·정산 기준", "text"],
            ] as const
          )
            .filter(([key]) => !v.campaign || !["fee", "deposit"].includes(key))
            .map(([key, label, type]) => (
              <HubField label={label} key={key}>
                <input
                  required={!["mapUrl", "deposit", "included"].includes(key)}
                  type={type}
                  min={type === "number" ? 0 : undefined}
                  className={inputClass}
                  value={v[key]}
                  onChange={(e) =>
                    set(
                      key,
                      type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              </HubField>
            ))}
        </div>
        {places.length > 0 && (
          <HubField label="저장된 장소">
            <select
              className={inputClass}
              defaultValue=""
              onChange={(e) => {
                const p = places[Number(e.target.value)];
                if (p)
                  setV((v) => ({
                    ...v,
                    area: p.area,
                    address: p.address,
                    mapUrl: p.mapUrl,
                  }));
              }}
            >
              <option value="">장소 선택</option>
              {places.map((p, i) => (
                <option value={i} key={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </HubField>
        )}
        {hub.state?.settings && (
          <HubButton
            type="button"
            onClick={() => {
              const s = hub.state!.settings!;
              void hub.mutate({
                action: "settings.save",
                revision: s.revision ?? 0,
                data: {
                  ...s,
                  places: [
                    ...s.places,
                    {
                      name: v.area,
                      area: v.area,
                      address: v.address,
                      mapUrl: v.mapUrl,
                    },
                  ],
                },
              });
            }}
          >
            현재 장소를 장소 목록에 저장
          </HubButton>
        )}
        <HubField label="필독 공지·설명서">
          <textarea
            rows={6}
            className={inputClass}
            value={v.notice}
            onChange={(e) => set("notice", e.target.value)}
          />
        </HubField>
        <HubField label="사진·포스터·영상 HTTPS 링크 (한 줄에 하나)">
          <textarea
            rows={3}
            className={inputClass}
            value={media}
            onChange={(e) => setMedia(e.target.value)}
          />
        </HubField>
        {event ? (
          <HubField label="사진·포스터·영상 파일 업로드 (승인자 전용)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
              disabled={hub.status === "saving"}
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                const max = file.type.startsWith("image/")
                  ? 2 * 1024 * 1024
                  : 5 * 1024 * 1024;
                if (file.size > max) {
                  hub.setError("이미지 2MB·영상 5MB 이하만 가능합니다.");
                  return;
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = "";
                for (let i = 0; i < bytes.length; i += 8192)
                  binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                const r = await hub.mutate({
                  action: "event.media.upload",
                  target: event.id,
                  revision: event.revision,
                  data: { mime: file.type, base64: btoa(binary) },
                });
                if (r?.mediaUrl)
                  setMedia((current) =>
                    [current, String(r.mediaUrl)].filter(Boolean).join("\n"),
                  );
              }}
            />
            <p className="text-xs">
              행사를 저장한 뒤 업로드합니다. PNG/JPEG/WebP 2MB, MP4/WebM 5MB
              이하. 실제 신청자의 입금 승인 후 열람할 수 있습니다.
              얼굴·연락처·계좌가 없는 안내 자료만 올리세요.
            </p>
          </HubField>
        ) : (
          <p className="text-xs">
            행사 초안을 저장하면 파일 업로드가 열립니다.
          </p>
        )}
        <HubCheck
          label="선착순 혜택 ON"
          checked={v.benefitsEnabled}
          onChange={(b) => set("benefitsEnabled", b)}
        />
        {v.benefits.map((b, i) => (
          <fieldset key={i} className="rounded-xl border p-3 space-y-2">
            <legend>혜택 구간 {i + 1}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["from", "to", "value"] as const).map((k) => (
                <HubField
                  label={
                    k === "from"
                      ? "시작 등수"
                      : k === "to"
                        ? "마지막 등수"
                        : "금액 (원)"
                  }
                  key={k}
                >
                  <input
                    className={inputClass}
                    min={0}
                    type="number"
                    value={b[k]}
                    onChange={(e) =>
                      set(
                        "benefits",
                        v.benefits.map((x, j) =>
                          j === i ? { ...x, [k]: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </HubField>
              ))}
              <HubField label="혜택 종류">
                <select
                  className={inputClass}
                  value={b.type}
                  onChange={(e) =>
                    set(
                      "benefits",
                      v.benefits.map((x, j) =>
                        j === i ? { ...x, type: e.target.value } : x,
                      ),
                    )
                  }
                >
                  <option value="discount">금액 할인</option>
                  <option value="final">최종 회비 지정</option>
                  <option value="free">무료</option>
                  <option value="gift">실물 혜택</option>
                </select>
              </HubField>
            </div>
            <HubField label="참가자에게 보여줄 혜택 설명">
              <input
                className={inputClass}
                value={b.label}
                onChange={(e) =>
                  set(
                    "benefits",
                    v.benefits.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
            </HubField>
            <button
              type="button"
              className="text-sm underline"
              onClick={() =>
                set(
                  "benefits",
                  v.benefits.filter((_, j) => i !== j),
                )
              }
            >
              이 구간 제거
            </button>
          </fieldset>
        ))}
        <HubButton
          type="button"
          onClick={() =>
            set("benefits", [
              ...v.benefits,
              {
                from: 1,
                to: 3,
                type: "discount",
                value: 0,
                label: "선착순 혜택",
              },
            ])
          }
        >
          혜택 구간 추가
        </HubButton>
        <HubCheck
          label={
            v.campaign?.kind === "tour"
              ? "전국투어 추억의 뽑기 ON"
              : v.campaign
                ? "할로윈 경품 뽑기 ON"
                : "카드 뽑기 ON"
          }
          checked={v.cardsEnabled}
          onChange={(b) => set("cardsEnabled", b)}
        />
        <HubCheck
          label="향후 행사 안내 설정 ON (외부 발송은 별도 승인 필요)"
          checked={v.notificationsEnabled}
          onChange={(b) => set("notificationsEnabled", b)}
        />
        <div className="flex flex-wrap gap-2">
          <HubButton type="button" onClick={() => setPreview(!preview)}>
            미리보기
          </HubButton>
          <HubButton type="submit" disabled={hub.status === "saving"}>
            {hub.status === "saving" ? "저장 중…" : "초안·변경 저장"}
          </HubButton>
          {event && (
            <HubButton
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    event.recruitment
                      ? "신청 접수를 닫을까요? 기록은 보존됩니다."
                      : "실제로 모집을 시작할까요? 이 작업은 회식 시작과 별개입니다.",
                  )
                )
                  void hub.mutate({
                    action: "event.recruitment",
                    target: event.id,
                    revision: event.revision,
                    data: { enabled: !event.recruitment },
                  });
              }}
            >
              {event.recruitment ? "접수 OFF" : "별도 확인 후 모집 시작"}
            </HubButton>
          )}
        </div>
        {preview && (
          <div className="bg-slate-50 rounded-xl p-4 whitespace-pre-wrap">
            <h3>
              {v.title} · {v.date} {v.start}~{v.end}
            </h3>
            <p>{v.area}</p>
            <p>{v.notice}</p>
            <p>회비는 참가자 공지 동의 후에만 공개됩니다.</p>
          </div>
        )}
      </form>
    </HubCard>
  );
}
function AutoSettings({
  value,
  preview,
  hub,
}: {
  value: HubSettings;
  preview: string;
  hub: Hub;
}) {
  const [v, setV] = useState(value);
  return (
    <HubCard>
      <h3 className="font-black">토요일 자동방 · 기본 OFF</h3>
      <p>
        다음 행사 미리보기: {preview} {v.autoTemplate?.start ?? "22:00"}~
        {v.autoTemplate?.end ?? "01:00"}
      </p>
      <p className="text-xs">
        자동 생성은 초안만 만들며 모집·회식 시작은 자동 실행하지 않습니다.
        금요일은 자동 생성하지 않습니다.
      </p>
      <HubCheck
        label="할로윈 경품 모듈 ON (모든 할로윈 행사)"
        checked={v.campaignModules?.halloweenDraw ?? true}
        onChange={(b) =>
          setV({
            ...v,
            campaignModules: {
              halloweenDraw: b,
              tourDraw: v.campaignModules?.tourDraw ?? true,
            },
          })
        }
      />
      <HubCheck
        label="전국투어 추억의 뽑기 모듈 ON"
        checked={v.campaignModules?.tourDraw ?? true}
        onChange={(b) =>
          setV({
            ...v,
            campaignModules: {
              halloweenDraw: v.campaignModules?.halloweenDraw ?? true,
              tourDraw: b,
            },
          })
        }
      />
      <p className="text-xs">
        OFF는 신규 뽑기만 중단합니다. 기존 신청·입금·당첨 조회와 관리자 지급
        확인은 유지합니다. 전체 이벤트 모듈은 기존 DB헬스에서 관리합니다.
      </p>
      <HubCheck
        label="토요일 자동 초안 생성"
        checked={v.autoSaturday}
        onChange={(b) => setV({ ...v, autoSaturday: b })}
      />
      <HubCheck
        label="자동 생성 일시정지"
        checked={v.paused}
        onChange={(b) => setV({ ...v, paused: b })}
      />
      <HubField label="행사 며칠 전에 방을 생성할까요?">
        <input
          type="number"
          min={1}
          max={30}
          className={inputClass}
          value={v.leadDays}
          onChange={(e) => setV({ ...v, leadDays: Number(e.target.value) })}
        />
      </HubField>
      <HubField label="행사 운영기록 보관 검토기간 (일)">
        <input
          className={inputClass}
          type="number"
          min={30}
          max={365}
          value={v.retentionDays}
          onChange={(e) =>
            setV({ ...v, retentionDays: Number(e.target.value) })
          }
        />
      </HubField>
      <p className="text-xs">
        신청 시 검토 예정일을 기록합니다. 법정 보관 예외·삭제 범위 확정 전 자동
        파기는 실행하지 않습니다.
      </p>
      <HubButton
        onClick={() =>
          setV({ ...v, skipDates: [...new Set([...v.skipDates, preview])] })
        }
      >
        이번 주 건너뛰기
      </HubButton>
      <p className="text-sm">제외일: {v.skipDates.join(", ") || "없음"}</p>
      <div className="flex flex-wrap gap-2">
        {v.skipDates.map((date) => (
          <button
            className="border rounded-lg p-2 text-xs"
            key={date}
            onClick={() =>
              setV({ ...v, skipDates: v.skipDates.filter((d) => d !== date) })
            }
          >
            {date} 제외 해제
          </button>
        ))}
      </div>
      <HubField label="자동방 기본 템플릿">
        <select
          className={inputClass}
          defaultValue=""
          onChange={(e) =>
            setV({
              ...v,
              autoTemplate: v.templates?.[Number(e.target.value)]?.event,
            })
          }
        >
          <option value="">미설정 초안으로 생성</option>
          {v.templates?.map((t, i) => (
            <option value={i} key={i}>
              {t.name}
            </option>
          ))}
        </select>
      </HubField>

      <HubButton
        onClick={async () => {
          if (
            await hub.mutate({
              action: "settings.save",
              revision: v.revision ?? 0,
              data: { ...v },
            })
          )
            setV({ ...v, revision: (v.revision ?? 0) + 1 });
        }}
      >
        자동방 설정 저장
      </HubButton>
    </HubCard>
  );
}
export function ApplicationAdmin({
  app,
  hub,
  onsite = false,
}: {
  app: PrivateApplication;
  hub: Hub;
  onsite?: boolean;
}) {
  const [note, setNote] = useState(""),
    [fee, setFee] = useState(String(app.quote?.fee ?? 0));
  const act = (action: string, data: Record<string, unknown> = {}) =>
    hub.mutate({
      action: `admin.application.${action}`,
      target: app.id,
      revision: app.revision,
      data,
    });
  return (
    <HubCard>
      <fieldset
        disabled={hub.status === "saving" || hub.status === "checking"}
        className="space-y-3 min-w-0"
      >
        <legend className="sr-only">신청 처리 · {app.basic.nickname}</legend>
        <strong>
          {app.basic.nickname} · 접수 {app.rank}번
        </strong>
        <CampaignApproval app={app} hub={hub} />
        {app.eligibility && <ScreeningPhoto app={app} hub={hub} admin />}
        <p className="text-xs break-all">신청번호 {app.id}</p>
        <p className="text-sm">
          입금자명: {app.basic.depositor} · 회비{" "}
          {app.quote?.fee.toLocaleString() ?? "미확정"}원
        </p>
        <p className="text-sm">
          단계 {app.stage} · 입금 {app.payment} · 참가 {app.attendance} · 현장{" "}
          {app.checkin ? "확인" : "미확인"}
        </p>
        <p className="text-xs">
          입금 신고 시각 {formatHubTime(app.reportedAt)} · 최근 저장{" "}
          {formatHubTime(app.updatedAt)}
        </p>
        <p className="text-sm">
          프로필{" "}
          {profileMissing(app.profile).length
            ? "미완료: " + profileMissing(app.profile).join(", ")
            : "완료"}
        </p>
        <div className="flex gap-2 flex-wrap">
          {!onsite && (
            <>
              <HubButton
                disabled={
                  hub.status === "saving" ||
                  !!app.waivedAt ||
                  (hub.state?.events.find((e) => e.id === app.eventId)
                    ?.campaign &&
                    app.quote?.fee === 0)
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "실제 은행 거래의 입금자명·금액·시간을 대조했습니까?",
                    )
                  )
                    void act("payment", {
                      status: "approved",
                      bankChecked: true,
                    });
                }}
              >
                입금 승인
              </HubButton>
              <HubButton onClick={() => act("payment", { status: "mismatch" })}>
                불일치
              </HubButton>
              <HubButton onClick={() => act("payment", { status: "held" })}>
                보류
              </HubButton>
              <HubButton
                onClick={() => act("attendance", { status: "paid_waitlist" })}
              >
                입금확정 대기자
              </HubButton>
              <HubButton
                onClick={() => act("attendance", { status: "confirmed" })}
              >
                참가 확정
              </HubButton>
            </>
          )}
          <HubButton onClick={() => act("checkin", { checked: true })}>
            현장 확인
          </HubButton>
        </div>
        {onsite && (
          <>
            <div className="flex flex-wrap gap-2">
              <HubButton
                disabled={!!app.candy}
                onClick={() => act("candy", { kind: "haribo-a" })}
              >
                하리보 A 지급
              </HubButton>
              <HubButton
                disabled={!!app.candy}
                onClick={() => act("candy", { kind: "haribo-b" })}
              >
                하리보 B 지급
              </HubButton>
            </div>
            {app.cards.map((c) => (
              <p key={c.id}>
                카드:{" "}
                {c.prizeLabel ??
                  hub.state?.stocks.find((stock) => stock.id === c.prize)
                    ?.label ??
                  (c.prize === "다음 기회에"
                    ? c.prize
                    : "당첨 상품 · 기록 확인")}{" "}
                {app.prizesGiven.includes(c.id)
                  ? "지급 완료"
                  : c.prize !== "다음 기회에" && (
                      <HubButton onClick={() => act("prize", { cardId: c.id })}>
                        상품 지급 확인
                      </HubButton>
                    )}
              </p>
            ))}
          </>
        )}
        <details>
          <summary>메모·회비 변경·처리 이력</summary>
          <div className="space-y-2 mt-3">
            <HubField label="메모·변경 사유">
              <textarea
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </HubField>
            <HubButton
              disabled={!note.trim()}
              onClick={() => act("note", { reason: note })}
            >
              메모 저장
            </HubButton>
            <HubField label="변경할 회비 (기존 금액·사유 보존)">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </HubField>
            <HubButton
              disabled={!note.trim()}
              onClick={() => act("reprice", { fee: Number(fee), reason: note })}
            >
              사유와 함께 회비 변경
            </HubButton>
            <Audit rows={app.history} />
          </div>
        </details>
      </fieldset>
    </HubCard>
  );
}
function Audit({
  rows,
}: {
  rows: { at: string; action: string; reason?: string }[];
}) {
  return (
    <ol className="space-y-2 text-xs py-2">
      {[...rows].reverse().map((h, i) => (
        <li key={i} className="break-words">
          {formatHubTime(h.at)} · {h.action} {h.reason && `· ${h.reason}`}
        </li>
      ))}
    </ol>
  );
}
export function AdminThreads({ hub, state }: { hub: Hub; state: HubState }) {
  const [selected, setSelected] = useState(""),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = drafts[selected] ?? "";
  const setDraft = (text: string) =>
    setDrafts((previous) => ({ ...previous, [selected]: text }));
  const t = state.threads.find((v) => v.id === selected);
  const owners = [
    ...new Set([
      ...state.threads.map((t) => t.id),
      ...state.applications.map((a) => a.owner!).filter(Boolean),
    ]),
  ];
  return (
    <HubCard>
      <h3 className="font-black">문의함 · 관리자 먼저 연락</h3>
      <p className="text-sm">
        미처리 {state.threads.filter((t) => t.status !== "resolved").length}건 ·
        안 읽은 문의{" "}
        {
          state.threads.filter((t) =>
            t.messages.some((m) => m.sender === "user" && m.at > t.readAdminAt),
          ).length
        }
        건
      </p>
      {t && (
        <div className="flex items-center gap-2">
          <span>{t.status === "resolved" ? "처리 완료" : "처리 중"}</span>
          <HubButton
            onClick={() => {
              const reason = window.prompt("처리 상태 변경 사유");
              if (reason)
                void hub.mutate({
                  action: "thread.resolve",
                  target: t.id,
                  data: {
                    status: t.status === "resolved" ? "open" : "resolved",
                    reason,
                  },
                });
            }}
          >
            {t.status === "resolved" ? "다시 열기" : "처리 완료로 변경"}
          </HubButton>
        </div>
      )}
      <HubField label="문의 대상">
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            void hub.mutate({ action: "thread.read", target: e.target.value });
          }}
        >
          <option value="">대상 선택</option>
          {owners.map((id) => (
            <option value={id} key={id}>
              {state.applications.find((a) => a.owner === id)?.basic.nickname ??
                "신청 전 문의"}{" "}
              {state.threads
                .find((t) => t.id === id)
                ?.messages.some(
                  (m) =>
                    m.sender === "user" &&
                    m.at >
                      (state.threads.find((t) => t.id === id)?.readAdminAt ??
                        ""),
                )
                ? "● 안 읽음"
                : ""}
            </option>
          ))}
        </select>
      </HubField>
      {t?.messages.map((m) => (
        <p
          className="rounded-xl p-3 bg-slate-50 text-sm whitespace-pre-wrap break-words"
          key={m.id}
        >
          {m.sender === "admin" ? "관리자" : "신청자"}: {m.text}
        </p>
      ))}
      <HubField label="빠른문구 (입력칸에 채운 뒤 수정·전송)">
        <select
          className={inputClass}
          value=""
          onChange={(e) => setDraft(e.target.value)}
        >
          <option value="">문구 선택</option>
          {[
            "입금자명과 신청정보가 달라 확인 부탁드립니다.",
            "업무 중으로 입금 확인이 지연되고 있습니다. 조금만 기다려 주세요.",
            "입금 확인이 완료되었습니다. 대기방에서 상세 장소를 확인해 주세요.",
            "늦게 도착하실 경우 예상 도착 시간을 알려주세요.",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </HubField>
      <HubField label="관리자 답장">
        <textarea
          className={inputClass}
          value={draft}
          disabled={!selected}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
        />
      </HubField>
      <HubButton
        disabled={!selected || !draft.trim() || hub.status === "saving"}
        onClick={async () => {
          if (
            await hub.mutate({
              action: "thread.send",
              target: selected,
              data: { text: draft },
            })
          )
            setDrafts((previous) =>
              previous[selected] === draft
                ? { ...previous, [selected]: "" }
                : previous,
            );
        }}
      >
        수정한 답장 보내기
      </HubButton>
      <div className="flex gap-2 flex-wrap">
        {["답장 지연", "연락두절", "중도이탈", "미참석", "검토 필요"].map(
          (tag) => (
            <button
              disabled={!selected}
              key={tag}
              className="text-xs border rounded-xl p-2"
              onClick={() => {
                const reason = window.prompt("상태 변경 사유를 입력하세요");
                if (reason)
                  void hub.mutate({
                    action: "thread.tag",
                    target: selected,
                    data: {
                      tags: t?.tags.includes(tag)
                        ? t.tags.filter((v) => v !== tag)
                        : [...(t?.tags ?? []), tag],
                      reason,
                    },
                  });
              }}
            >
              {t?.tags.includes(tag) ? "✓ " : ""}
              {tag}
            </button>
          ),
        )}
      </div>
    </HubCard>
  );
}
function StockForm({ eventId, hub }: { eventId: string; hub: Hub }) {
  const [label, setLabel] = useState("소품 2번"),
    [amount, setAmount] = useState(0);
  return (
    <HubCard>
      <h3 className="font-black">실물 재고 등록</h3>
      <p className="text-sm">
        확인된 실물 수량만 추가하세요. 옵션별 실제 수량·배송일은 현재
        미확인입니다.
      </p>
      <select
        aria-label="상품 종류"
        className={inputClass}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      >
        {["소품 2번", "소품 10번", "소품 15번", "소품 24번"].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <input
        aria-label="추가할 수량"
        type="number"
        min={0}
        className={inputClass}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <HubButton
        onClick={() =>
          hub.mutate({
            action: "stock.save",
            data: { eventId, label, add: amount },
          })
        }
      >
        확인한 재고 추가
      </HubButton>
    </HubCard>
  );
}

function MemberManagement({ hub, state }: { hub: Hub; state: HubState }) {
  return (
    <>
      <HubCard>
        <h3 className="font-black">개별 회원 제한·해제 / 개인정보 요청</h3>
        <p className="text-sm">
          IP·년생·지역으로 자동 제한하지 않습니다. 확인된 개인에게만 사유를
          기록해 처리합니다.
        </p>
        {state.owners?.map((o) => (
          <div className="border-t py-3 space-y-2" key={o.id}>
            <strong>
              {state.applications.find((a) => a.owner === o.id)?.basic
                .nickname ?? "신청 전 문의자"}
            </strong>
            <p className="text-xs">
              {o.restricted?.active
                ? "제한 중: " + o.restricted.reason
                : "제한 없음"}{" "}
              · 재사용{" "}
              {state.members?.some((m) => m.owner === o.id) ? "동의" : "미선택"}
            </p>
            {o.deleteRequestedAt && (
              <p className="text-sm text-amber-800">
                삭제 검토 요청: {formatHubTime(o.deleteRequestedAt)}
              </p>
            )}
            <HubButton
              onClick={() => {
                const reason = window.prompt(
                  "본인 확인·제한 또는 해제 사유를 입력하세요",
                );
                if (reason)
                  void hub.mutate({
                    action: "admin.owner.restrict",
                    target: o.id,
                    data: { active: !o.restricted?.active, reason },
                  });
              }}
            >
              {o.restricted?.active
                ? "사유 기록 후 제한 해제"
                : "사유 기록 후 개별 제한"}
            </HubButton>
            <OwnerRecoveryControls owner={o} hub={hub} />
            <Audit rows={o.history ?? []} />
          </div>
        ))}
      </HubCard>
      <HubCard>
        <h3 className="font-black">저장 오류 기록</h3>
        {state.errors?.length ? (
          state.errors.map((e) => (
            <p className="text-xs break-words" key={e.id}>
              오류번호 {e.requestId} · 단계 {e.stage} · {e.code} · {e.count}회 ·{" "}
              {formatHubTime(e.at)}
            </p>
          ))
        ) : (
          <p className="text-sm">
            기록된 저장 오류가 없습니다. DB 장애 중에는 익명 서버 로그의
            요청번호로 확인합니다.
          </p>
        )}
      </HubCard>
    </>
  );
}

function BudgetPreview({ hub }: { hub: Hub }) {
  const [amount, setAmount] = useState(
    hub.state?.settings?.budget?.totalCandidate ?? 100000,
  );
  const allocation = budgetSplit(amount);
  return (
    <HubCard>
      <h3 className="font-black">할로윈 상품·상금 예산 후보</h3>
      <p className="text-sm">
        참가 인원 비율과 별개입니다. 실제 수량·배송은 확인한 재고만 등록하세요.
      </p>
      <HubField label="검토할 총 예산 후보 (원)">
        <input
          type="number"
          min={0}
          max={10000000}
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </HubField>
      <p>
        금요일 30%: {allocation.friday.toLocaleString()}원 · 토요일 70%:{" "}
        {allocation.saturday.toLocaleString()}원
      </p>
      <p className="text-sm text-amber-800">
        법률·세무 검토 전 무작위 현금 당첨·지급은 비활성 상태입니다.
      </p>
      <HubButton
        disabled={!hub.state?.settings}
        onClick={() => {
          const s = hub.state!.settings!;
          void hub.mutate({
            action: "settings.save",
            revision: s.revision ?? 0,
            data: {
              ...s,
              budget: { totalCandidate: amount, cashEnabled: false },
            },
          });
        }}
      >
        검토용 예산 후보 저장
      </HubButton>
    </HubCard>
  );
}
