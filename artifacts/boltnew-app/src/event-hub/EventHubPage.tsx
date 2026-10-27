import { eventEnded } from "../../../../lib/api-zod/src/event-hub-modules";
import { ApplicationGuide, ScreeningPhoto } from "./CampaignParticipant";
import {
  paymentSatisfied,
  campaignCardLimit,
  tourSessionHours,
} from "../../../../lib/api-zod/src/event-campaign";
import {
  readHubBrowserValue,
  canStoreHubOnsiteIdentity,
} from "../lib/event-hub-browser-storage";
import "./event-hub.css";
import { NoticeHistory } from "./NoticeHistory";
import { EventMedia } from "./EventMedia";
import { useEffect, useState } from "react";
import {
  useEventHub,
  clearOnsiteBrowserIdentity,
  HUB_CONSENT_VERSION,
  profileMissing,
  savedRecoveryCode,
  rememberRecoveryCode,
  recoverHub,
  hubFetch,
  type PrivateApplication,
  type HubState,
  type HubController,
} from "../lib/event-hub-client";
import { NicknameSetupScreen } from "../components/NicknameSetupScreen";
import {
  useEventTheme,
  HubLoading,
  HubButton,
  HubField,
  HubCheck,
  HubFeedback,
  HubCard,
  inputClass,
  hubNavigate,
} from "./HubUi";
import type { NicknameSetupInput } from "../lib/nickname-registration";
import { getDeviceSecret, setDeviceRecoveryPin } from "../lib/supabase";
import { MATCHING_USER_KEY } from "../lib/constants";
import { setPushOptIn } from "../lib/webPush";

type Hub = HubController;
const paymentLabel = {
  none: "입금 전",
  reported: "입금 신고 · 승인 대기",
  approved: "관리자 입금 확인 완료",
  mismatch: "입금 내역 불일치 · 문의해 주세요",
  held: "입금 확인 보류",
};
const attendanceLabel = {
  pending: "참가 승인 대기",
  paid_waitlist: "입금확정 대기자",
  confirmed: "참가 확정",
};
export default function EventHubPage({ path }: { path: string }) {
  const hub = useEventHub();
  const s = hub.state;
  const [dark, setDark] = useState(
    () => readHubBrowserValue("local", "dark_mode") === "1",
  );
  useEffect(() => {
    const sync = () =>
      setDark(readHubBrowserValue("local", "dark_mode") === "1");
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [editing, setEditing] = useState(false),
    [recovery, setRecovery] = useState(""),
    [loginNick, setLoginNick] = useState(""),
    [loginPw, setLoginPw] = useState("");
  const appId = path.startsWith("/events/a/") ? path.split("/")[3] : undefined;
  const eventId = path.startsWith("/events/e/")
    ? path.split("/")[3]
    : undefined;
  const app = s?.applications.find((a) => a.id === appId);
  const event = s?.events.find((e) => e.id === (app?.eventId ?? eventId));
  useEffect(() => {
    if (
      app?.stage === 4 &&
      app.consent?.profileNow &&
      app.profile.lastStep === 1 &&
      !app.profile.mbti
    )
      setEditing(true);
  }, [
    app?.id,
    app?.stage,
    app?.consent?.profileNow,
    app?.profile.lastStep,
    app?.profile.mbti,
  ]);
  useEffect(() => {
    setEditing(false);
  }, [appId, eventId]);
  const waitingForEvent = !!app && app.stage >= 4;
  const refreshHub = hub.load;
  useEffect(() => {
    if (!waitingForEvent) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void refreshHub().catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [waitingForEvent, refreshHub]);
  if (!s)
    return (
      <main className="min-h-screen bg-slate-50 p-5">
        <a href="/">← 뒤로</a>
        <HubLoading label="신청 기록을 불러오는 중…" />
        <HubFeedback status={hub.status} error={hub.error} />
      </main>
    );
  if (editing && app) {
    return (
      <EventProfileEditor
        app={app}
        hub={hub}
        onClose={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="event-hub-theme" data-event-dark={dark}>
      <main className="min-h-screen bg-slate-50 text-slate-900 pb-48">
        <header className="bg-slate-900 text-white px-4 py-5">
          <div className="max-w-2xl mx-auto">
            <a href="/" className="text-sm">
              ← BINPC2
            </a>
            <h1 className="mt-3 text-xl font-black">🎉 술번개 신청</h1>
            <p className="text-sm text-slate-300 mt-1">
              저장한 신청부터 안전하게 이어가세요
            </p>
          </div>
        </header>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <HubFeedback status={hub.status} error={hub.error} />
          {event && <ApplicationGuide key={event.id} event={event} />}
          {(appId || eventId) && (
            <HubButton onClick={() => hubNavigate("/events")}>
              ← 내 신청 목록
            </HubButton>
          )}
          {!s.enabled && (
            <HubCard>
              <p>
                현재 신규 신청은 쉬고 있습니다. 기존 신청·입금 기록은 계속
                확인할 수 있습니다.
              </p>
            </HubCard>
          )}
          {app && event ? (
            app.stage === 4 ? (
              <WaitingRoom
                app={app}
                event={event}
                hub={hub}
                edit={() => {
                  if (app.profileId) hubNavigate("/");
                  else setEditing(true);
                }}
              />
            ) : (
              <ApplicationSteps
                key={`${app.id}:${app.stage}`}
                app={app}
                event={event}
                hub={hub}
              />
            )
          ) : event ? (
            <BasicForm key={event.id} eventId={event.id} hub={hub} />
          ) : (
            <>
              {s.applications.length > 0 && (
                <HubCard>
                  <h2 className="font-black">내 신청 목록</h2>
                  {s.applications.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => hubNavigate(`/events/a/${a.id}`)}
                      className="w-full text-left border-t py-3"
                    >
                      <strong>
                        {s.events.find((e) => e.id === a.eventId)?.title ??
                          "행사"}
                      </strong>
                      <p className="text-sm">
                        {s.events.find((e) => e.id === a.eventId)?.date} ·{" "}
                        {a.stage === 4
                          ? paymentLabel[a.payment]
                          : "작성 중 · 이어서 신청"}
                      </p>
                    </button>
                  ))}
                </HubCard>
              )}
              <HubCard>
                <h2 className="font-black">신청 가능한 행사</h2>
                {s.events
                  .filter((e) => e.recruitment)
                  .map((e) => (
                    <button
                      className="w-full text-left border-t py-4"
                      key={e.id}
                      onClick={() => {
                        const a = s.applications.find(
                          (a) => a.eventId === e.id,
                        );
                        hubNavigate(
                          a ? `/events/a/${a.id}` : `/events/e/${e.id}`,
                        );
                      }}
                    >
                      <strong>{e.title}</strong>
                      <p>
                        {e.date} · {e.start}~
                        {e.end <= e.start ? "다음 날 " : ""}
                        {e.end}
                      </p>
                      <p className="text-sm text-slate-600">{e.area}</p>
                    </button>
                  ))}
                {!s.events.some((e) => e.recruitment) && (
                  <p className="text-sm text-slate-600">
                    현재 모집 중인 행사가 없습니다.
                  </p>
                )}
              </HubCard>
              <HubCard>
                <details>
                  <summary className="font-bold cursor-pointer">
                    이전 신청 복구 / 기존 신청자 로그인
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-sm">
                      신청번호만으로는 조회할 수 없습니다. 개인 복구코드를
                      사용하세요.
                    </p>
                    <HubField label="개인 복구코드">
                      <input
                        type="password"
                        autoComplete="off"
                        className={inputClass}
                        value={recovery}
                        onChange={(e) => setRecovery(e.target.value)}
                      />
                    </HubField>
                    <HubButton
                      onClick={async () => {
                        try {
                          await recoverHub(recovery);
                          setRecovery("");
                          await hub.load();
                        } catch (e) {
                          hub.setError((e as Error).message);
                        }
                      }}
                    >
                      기존 신청 복구
                    </HubButton>
                    <hr />
                    <HubField label="재사용 회원 닉네임">
                      <input
                        className={inputClass}
                        value={loginNick}
                        onChange={(e) => setLoginNick(e.target.value)}
                      />
                    </HubField>
                    <HubField label="비밀번호">
                      <input
                        autoComplete="current-password"
                        type="password"
                        className={inputClass}
                        value={loginPw}
                        onChange={(e) => setLoginPw(e.target.value)}
                      />
                    </HubField>
                    <HubButton
                      onClick={async () => {
                        try {
                          const login = await hubFetch<{
                            recoveryCode: string;
                          }>("/member-login", {
                            nickname: loginNick,
                            password: loginPw,
                          });
                          clearOnsiteBrowserIdentity();
                          rememberRecoveryCode(login.recoveryCode);
                          setLoginPw("");
                          await hub.load();
                        } catch (e) {
                          hub.setError((e as Error).message);
                        }
                      }}
                    >
                      재사용 프로필 불러오기
                    </HubButton>
                  </div>
                </details>
              </HubCard>
            </>
          )}
          {!s.member && (
            <HubCard>
              <h2 className="font-black">향후 행사 안내 수신</h2>
              <HubCheck
                label="향후 행사 광고성 안내 받기 (재사용 회원 동의와 별도)"
                checked={s.marketingPreference?.enabled ?? false}
                onChange={(enabled) => {
                  void hub.mutate({
                    action: "marketing.preference",
                    data: { enabled },
                  });
                }}
              />
            </HubCard>
          )}
          {s.member && (
            <HubCard>
              <h2 className="font-black">재사용 프로필·안내 수신</h2>
              <HubCheck
                label="향후 행사 광고성 안내 받기 (별도 선택)"
                checked={s.marketingPreference?.enabled ?? s.member.marketing}
                onChange={(enabled) => {
                  void hub.mutate({
                    action: "member.marketing",
                    data: { enabled },
                  });
                }}
              />
              <HubButton
                onClick={() => {
                  if (
                    window.confirm(
                      "재사용 프로필·비밀번호·광고 수신 동의를 철회할까요? 이번 행사 신청·입금 기록은 보존됩니다.",
                    )
                  )
                    void hub.mutate({ action: "member.withdraw" });
                }}
              >
                재사용 동의 철회
              </HubButton>
              <p className="text-xs">
                새 기기에서 비밀번호로 로그인하면 개인 복구코드가 갱신됩니다. 새
                코드를 보관해 주세요.
              </p>
            </HubCard>
          )}
          <HubCard>
            <details>
              <summary>개인정보 열람·삭제 문의</summary>
              <p className="text-sm my-3">
                보관·법정 의무를 확인한 뒤 운영자가 처리합니다. 요청만으로
                신청·입금 기록을 삭제하지 않습니다.
              </p>
              <HubButton
                onClick={() => hub.mutate({ action: "privacy.request" })}
              >
                개인정보 삭제 검토 요청
              </HubButton>
              {s.privacyCase && (
                <p role="status" className="text-sm mt-3">
                  처리 상태: {s.privacyCase.status} ·{" "}
                  {s.privacyCase.publicMessage ||
                    "운영자가 본인 확인·보관 예외를 검토합니다. 삭제 완료 전 기록은 유지됩니다."}
                </p>
              )}
            </details>
          </HubCard>
          <HubCard>
            <details>
              <summary className="font-bold cursor-pointer">
                개인 신청 복구코드 보관
              </summary>
              <p className="text-sm my-3">
                다른 기기나 브라우저에서도 신청·입금 상태를 이어볼 수 있습니다.
                복구코드는 비밀번호처럼 보관하고 다른 사람에게 알려주지 마세요.
              </p>
              <button
                type="button"
                className="border rounded-xl p-3 w-full text-left text-sm"
                onClick={(e) => {
                  e.currentTarget.textContent =
                    savedRecoveryCode() ||
                    "현재 기기에 복구코드가 없습니다. 기존 코드를 보관해 주세요.";
                }}
              >
                눌러서 개인 복구코드 표시
              </button>
            </details>
          </HubCard>
        </div>
      </main>
    </div>
  );
}
export function BasicForm({
  eventId,
  hub,
  app,
  onSaved,
}: {
  eventId: string;
  hub: Hub;
  app?: PrivateApplication;
  onSaved?: () => void;
}) {
  const member = hub.state?.member;
  const known = app?.basic ?? member?.basic;
  const [v, setV] = useState({
    nickname: known?.nickname ?? "",
    birthYear: String(known?.birthYear ?? ""),
    location: known?.location ?? "",
    phone: known?.phone ?? "",
    depositor: known?.depositor ?? "",
  });
  const [collection, setCollection] = useState(app?.basic.collection ?? false),
    [returning, setReturning] = useState(!!member),
    [keep, setKeep] = useState(true);
  return (
    <HubCard>
      <h2 className="font-black text-lg">기본정보</h2>
      <HubCheck
        label="기존 신청자입니다"
        checked={returning}
        onChange={setReturning}
      />
      {returning && (
        <div className="bg-teal-50 rounded-xl p-3 text-sm">
          <p>지난번 사용한 닉네임을 그대로 사용하시겠습니까?</p>
          <HubCheck
            label="그대로 사용 (변경하려면 해제)"
            checked={keep}
            onChange={setKeep}
          />
          {!member && (
            <p>
              먼저 신청 목록의 기존 신청자 로그인 또는 복구코드를 이용해 주세요.
            </p>
          )}
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await hub.mutate({
            action: "application.basic",
            revision: app?.revision,
            data: {
              eventId,
              edit: !!app,
              basic: {
                ...v,
                birthYear: Number(v.birthYear),
                collection,
                version: HUB_CONSENT_VERSION,
              },
            },
          });
          if (r?.id) {
            if (onSaved) onSaved();
            else hubNavigate(`/events/a/${r.id}`);
          }
        }}
      >
        {(
          [
            ["nickname", "닉네임"],
            ["birthYear", "태어난 년도"],
            ["location", "사는 지역"],
            ["phone", "연락용 전화번호 (문자 인증 없음)"],
            ["depositor", "실제 은행 입금 시 보내는 분 이름"],
          ] as const
        ).map(([key, label]) => (
          <HubField key={key} label={label}>
            <input
              required
              className={inputClass}
              value={v[key]}
              readOnly={key === "nickname" && returning && keep && !!member}
              autoComplete={key === "phone" ? "tel" : "off"}
              maxLength={key === "nickname" ? 12 : 40}
              inputMode={
                key === "phone"
                  ? "tel"
                  : key === "birthYear"
                    ? "numeric"
                    : "text"
              }
              onChange={(e) => setV({ ...v, [key]: e.target.value })}
            />
          </HubField>
        ))}
        <details className="text-sm">
          <summary>개인정보 수집 안내 · 보유기간</summary>
          <p className="py-3">
            행사 운영자가 신청 처리·입금 확인·연락을 위해
            닉네임·출생연도·지역·연락처·입금자명을 수집합니다. 행사 운영기록은
            기본 {hub.state?.retentionDays ?? 180}일의 보관 검토기간을 사용하며
            법정 보관이 필요한 기록은 별도 정책을 따릅니다. 필수 수집을 거부하면
            신청할 수 없습니다. 현장 공개 프로필은 입장 승인 후에만 생성합니다.
          </p>
        </details>
        <HubCheck
          label="[필수] 위 개인정보 수집·이용 안내를 확인하고 동의합니다"
          checked={collection}
          onChange={setCollection}
        />
        <HubButton
          type="submit"
          disabled={!collection || hub.status === "saving"}
        >
          {hub.status === "saving" ? "◌ 저장 중…" : "다음"}
        </HubButton>
      </form>
    </HubCard>
  );
}
export function ApplicationSteps({
  app,
  event,
  hub,
}: {
  app: PrivateApplication;
  event: HubState["events"][number];
  hub: Hub;
}) {
  const [panelStage, setPanelStage] = useState(app.stage);
  const [c, setC] = useState({
    collection: app.consent?.collection ?? false,
    sharing: app.consent?.sharing ?? false,
    notice: app.consent?.notice ?? false,
    reuse: app.consent?.reuse ?? false,
    marketing: app.consent?.marketing ?? false,
    push: app.consent?.push ?? false,
    profileNow: app.consent?.profileNow ?? false,
  });
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const submit = async () => {
    if (c.reuse && password !== confirm) {
      hub.setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    const r = await hub.mutate({
      action: "application.consent",
      target: app.id,
      revision: app.revision,
      data: {
        consent: { ...c, version: HUB_CONSENT_VERSION },
        ...(c.reuse ? { password } : {}),
      },
    });
    if (r) {
      setPassword("");
      setConfirm("");
      setPanelStage(3);
    }
  };
  if (panelStage === 1)
    return (
      <BasicForm
        eventId={event.id}
        app={app}
        hub={hub}
        onSaved={() => setPanelStage(2)}
      />
    );
  return (
    <HubCard>
      <button
        type="button"
        className="text-sm underline py-2"
        onClick={() => setPanelStage((panelStage - 1) as 1 | 2)}
      >
        ← 이전
      </button>
      <h2 className="text-lg font-black">
        {panelStage === 2
          ? "공지 확인·동의"
          : event.campaign?.kind === "tour"
            ? "선입금 확인 및 신청 확정"
            : "회비 확인 및 신청 확정"}
      </h2>
      <p>
        {event.title} · {event.date} · {event.start}~{event.end}
      </p>
      <p>{event.area}</p>
      <EventMedia links={event.media} />
      <details open>
        <summary className="font-bold cursor-pointer">행사 필독 공지</summary>
        <p className="whitespace-pre-wrap text-sm leading-7 py-3">
          {event.notice}
        </p>
        <p className="text-sm">
          성인·신분증 확인이 필요합니다. 지각·불참·중도퇴장 기준은 행사 공지를
          확인해 주세요. 관리자 업무·취침 중 입금 승인이 지연될 수 있습니다.
          상세 주소는 입금 승인 후 본인 대기방에만 공개합니다.
        </p>
      </details>
      <NoticeHistory history={event.noticeHistory} />
      {panelStage === 2 ? (
        <>
          <HubCheck
            label="[필수] 행사 공지를 확인했습니다"
            checked={c.notice}
            onChange={(v) => setC({ ...c, notice: v })}
          />
          <HubCheck
            label="[필수] 행사 운영을 위한 개인정보 수집·이용에 동의합니다"
            checked={c.collection}
            onChange={(v) => setC({ ...c, collection: v })}
          />
          <HubCheck
            label="[필수] 입장 후 같은 행사 참가자에게 공개 프로필을 제공하는 데 동의합니다 (연락처·입금자명 제외)"
            checked={c.sharing}
            onChange={(v) => setC({ ...c, sharing: v })}
          />
          <HubCheck
            label="[선택] 하트·1:1 채팅 알림 받기"
            checked={c.push}
            onChange={(v) => setC({ ...c, push: v })}
          />
          <HubCheck
            label="[선택·별도] 향후 행사 광고성 안내 받기"
            checked={c.marketing}
            onChange={(v) => setC({ ...c, marketing: v })}
          />
          <HubCheck
            label="다음에도 이 프로필을 사용하시겠습니까?"
            checked={c.reuse}
            onChange={(v) => setC({ ...c, reuse: v })}
          />
          <div
            className={`grid transition-all duration-300 ${c.reuse ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden space-y-3">
              {c.reuse && (
                <>
                  <p className="text-sm">
                    재사용 동의는 자동 신청·광고 수신 동의가 아닙니다.
                  </p>
                  <HubField label="재사용 비밀번호 (10자 이상)">
                    <input
                      type="password"
                      autoComplete="new-password"
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </HubField>
                  <HubField label="비밀번호 확인">
                    <input
                      type="password"
                      autoComplete="new-password"
                      className={inputClass}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </HubField>
                </>
              )}
            </div>
          </div>
          <fieldset>
            <legend className="font-bold text-sm">
              프로필을 미리 설정하시겠습니까?
            </legend>
            <HubCheck
              label="지금 설정 (해제하면 나중에 설정)"
              checked={c.profileNow}
              onChange={(v) => setC({ ...c, profileNow: v })}
            />
            <p className="text-xs">
              어느 쪽을 선택해도 대기방에서 언제든 작성할 수 있습니다.
            </p>
          </fieldset>
          <HubButton
            disabled={
              !c.collection ||
              !c.sharing ||
              !c.notice ||
              hub.status === "saving"
            }
            onClick={submit}
          >
            {hub.status === "saving" ? "◌ 저장 중…" : "동의하고 다음"}
          </HubButton>
        </>
      ) : (
        <>
          {app.billing?.quote.kind !== "advance" && (
            <p>일반 회비 {app.billing?.quote.original.toLocaleString()}원</p>
          )}
          <p>본인 혜택: {app.billing?.quote.benefit}</p>
          <p className="text-xl font-black text-teal-700">
            {app.billing?.quote.kind === "advance"
              ? "선입금액 (최종 회비 아님)"
              : "최종 납부 금액"}{" "}
            {app.billing?.quote.fee.toLocaleString()}원
          </p>
          <p>
            선입금 {app.billing?.deposit.toLocaleString()}원 ·{" "}
            {app.billing?.included}
          </p>
          {app.billing?.quote.kind === "advance" && (
            <p>
              최종 1/N·추가 납부·초과금·중도귀가 정산은 운영자가 직접
              안내합니다. 자동 계산·돈 이동은 없습니다.
            </p>
          )}
          <p>입금 기한: {app.billing?.deadline}</p>
          <p className="break-words">계좌·예금주: {app.billing?.account}</p>
          <p className="text-sm">
            금액을 확인하고 신청을 확정하세요. 이 버튼으로 송금이나 입금 승인이
            이루어지지 않습니다.
          </p>
          <HubButton
            disabled={hub.status === "saving"}
            onClick={() =>
              hub.mutate({
                action: "application.confirm",
                target: app.id,
                revision: app.revision,
              })
            }
          >
            금액 확인 후 신청 확정
          </HubButton>
        </>
      )}
    </HubCard>
  );
}
export function WaitingRoom({
  app,
  event,
  hub,
  edit,
  onEnter,
}: {
  app: PrivateApplication;
  event: HubState["events"][number];
  hub: Hub;
  edit: () => void;
  onEnter?: (result: Record<string, unknown>) => void;
}) {
  const currentTheme = useEventTheme(event);
  const missing = profileMissing(app.profile);
  const enter = async () => {
    if (!onEnter && !canStoreHubOnsiteIdentity()) {
      hub.setError(
        "이 브라우저가 입장에 필요한 기기 저장소를 차단했습니다. 신청·입금 기록은 보존됩니다. 저장소를 허용한 브라우저에서 신청을 복구한 뒤 입장해 주세요.",
      );
      return;
    }
    const deviceSecret = crypto.randomUUID();
    const r = await hub.mutate({
      action: "application.enter",
      target: app.id,
      revision: app.revision,
      data: { deviceSecret },
    });
    if (r?.profile) {
      if (onEnter) {
        onEnter(r);
        return;
      }
      const p = r.profile as { id: string; pin_code: string };
      // Register the same binding with the existing recovery client; no new profile INSERT.
      try {
        localStorage.setItem(`bolt_device_secret_${p.id}`, deviceSecret);
        sessionStorage.setItem("session_bearer_v1", String(r.sessionToken));
        sessionStorage.setItem("session_bearer_uid_v1", p.id);
        sessionStorage.setItem("session_bearer_exp_v1", String(r.expiresAt));
        localStorage.setItem(MATCHING_USER_KEY, p.id);
        setDeviceRecoveryPin(p.pin_code);
        getDeviceSecret(p.id);
        setPushOptIn(p.id, app.profile.pushDecision === "enable");
        hubNavigate("/");
      } catch {
        hub.setError(
          "입장 승인 기록은 서버에 저장되었지만 이 기기의 연결을 완료하지 못했습니다. 재신청·재입금하지 말고 브라우저 저장소를 허용한 뒤 신청을 복구해 주세요.",
        );
      }
    }
  };
  return (
    <>
      <HubCard>
        <h2 className="font-black text-lg">👤 내 프로필</h2>
        <p>
          {app.basic.nickname} · {app.basic.birthYear}년생 ·{" "}
          {app.basic.location}
        </p>
        <div className="text-sm grid grid-cols-2 gap-2">
          <p>MBTI: {app.profile.mbti ?? "미완료"}</p>
          <p>
            관심사:{" "}
            {(app.profile.interests?.length ?? 0) >= 2 ? "완료" : "미완료"}
          </p>
          <p>
            성향: {app.profile.personalityScore != null ? "완료" : "미완료"}
          </p>
          <p>필수 동의: {app.profile.privacyConsent ? "완료" : "미완료"}</p>
        </div>
        <HubButton onClick={edit}>
          {!missing.length
            ? "프로필 수정하기"
            : app.profile.lastStep > 1
              ? "이어서 설정하기"
              : "프로필 미리 설정하기"}
        </HubButton>
        {missing.length > 0 && (
          <p className="text-sm text-amber-800">
            입장하려면 프로필을 먼저 완성해야 합니다 · {missing.join(", ")}
          </p>
        )}
      </HubCard>
      <HubCard>
        {app.eligibility && <ScreeningPhoto app={app} hub={hub} />}
        <h2 className="font-black">{event.title}</h2>
        <p>
          {event.date} {event.start}~{event.end}
        </p>
        <p className="text-xs break-all">신청번호 {app.id}</p>
        <strong>
          {app.waivedAt
            ? "무료 참가 승인 완료 · 재입금 불필요"
            : event.campaign && app.quote?.fee === 0
              ? "무료 참가 승인 대기"
              : paymentLabel[app.payment]}
        </strong>
        <p>
          {attendanceLabel[app.attendance]} · 현장 확인{" "}
          {app.checkin ? "완료" : "대기"}
        </p>
        {!paymentSatisfied(app) && !app.waivedAt && (
          <p className="text-sm">
            관리자가 업무 중이거나 취침 중이면 입금 승인이 늦어질 수 있습니다.
            이미 송금했다면 다시 송금하지 마세요.
          </p>
        )}
        {app.billing && (
          <details open={app.payment === "none"}>
            <summary>내 회비·계좌 안내</summary>
            <p>
              {app.billing.quote.kind === "advance"
                ? "선입금액 (최종 회비 아님)"
                : "확정 금액"}{" "}
              {app.billing.quote.fee.toLocaleString()}원 ·{" "}
              {app.billing.quote.benefit}
            </p>
            <p className="break-words">{app.billing.account}</p>
            <p>기한 {app.billing.deadline}</p>
          </details>
        )}
        {!app.waivedAt &&
        app.quote?.fee !== 0 &&
        (app.payment === "none" ||
          app.payment === "held" ||
          app.payment === "mismatch") ? (
          <HubButton
            disabled={hub.status === "saving"}
            onClick={() =>
              hub.mutate({
                action: "application.report",
                target: app.id,
                revision: app.revision,
              })
            }
          >
            입금했어요 (신고)
          </HubButton>
        ) : (
          <p className="text-sm">
            {app.waivedAt
              ? "무료 참가 승인 기록이 보관되어 있습니다. 재입금하지 마세요."
              : event.campaign && app.quote?.fee === 0
                ? "무료 참가 관리자 승인을 기다려 주세요. 송금할 필요가 없습니다."
                : app.payment === "reported"
                  ? "입금 신고가 저장되었습니다. 승인 결과를 기다려 주세요."
                  : "입금 확인 기록이 보관되어 있습니다."}
          </p>
        )}
        <p>
          장소:{" "}
          {app.venue?.address ??
            `${event.area} · 상세 주소는 입금 승인 후 공개`}
        </p>
        {app.venue?.mapUrl && (
          <a
            className="underline text-teal-700"
            href={app.venue.mapUrl}
            target="_blank"
            rel="noreferrer"
          >
            지도·길찾기
          </a>
        )}
        {event.replyNotice && (
          <p className="text-sm whitespace-pre-wrap">{event.replyNotice}</p>
        )}
        {event.campaign?.kind === "tour" && (
          <p className="text-sm">
            1차 {tourSessionHours(event.date)?.first} · 2차{" "}
            {tourSessionHours(event.date)?.second} · 3차{" "}
            {tourSessionHours(event.date)?.third}. BINPC2는 1차만 신청합니다.
          </p>
        )}
        {event.campaign?.secondRoundLink && (
          <a
            className="underline text-teal-700"
            href={event.campaign.secondRoundLink}
            target="_blank"
            rel="noreferrer"
          >
            2차 오픈채팅 신청 (BINPC2 외부)
          </a>
        )}
        <EventMedia links={event.media} />
        <details>
          <summary>행사 공지</summary>
          <p className="whitespace-pre-wrap text-sm leading-7">
            {event.notice}
          </p>
        </details>
        <NoticeHistory history={event.noticeHistory} />
        {app.consent?.noticeVersion !== event.noticeVersion && (
          <HubButton
            onClick={() =>
              hub.mutate({
                action: "application.notice",
                target: app.id,
                revision: app.revision,
              })
            }
          >
            변경 공지 확인·동의
          </HubButton>
        )}
        <HubButton
          disabled={hub.status === "saving"}
          onClick={missing.length ? edit : enter}
        >
          {missing.length ? "남은 프로필 설정 완료하기" : "술번개 입장하기"}
        </HubButton>
        <p className="text-xs">
          입장 시 서버에서 참가 승인·회식 시작·현장 확인·프로필을 다시
          확인합니다.
        </p>
      </HubCard>
      {(event.cardsEnabled || app.cards.length > 0) && (
        <HubCard>
          <h2 className="font-black">
            {event.campaign?.kind === "tour"
              ? "추억의 뽑기"
              : event.campaign
                ? "할로윈 경품 뽑기"
                : "🎃 행사 카드"}{" "}
            · {app.cards.length}/{campaignCardLimit(event)}
          </h2>
          <div
            className={`grid ${campaignCardLimit(event) === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2`}
            data-campaign-theme={currentTheme}
          >
            {Array.from({ length: campaignCardLimit(event) }, (_, i) => i).map(
              (i) => (
                <div
                  key={i}
                  className={`aspect-[2/3] rounded-xl grid place-items-center p-2 text-center text-sm transition-transform duration-500 ${app.cards[i] ? "hub-card-revealed bg-teal-50 border border-teal-300" : "bg-slate-800 text-white"}`}
                >
                  {app.cards[i]
                    ? app.cards[i].prize === "다음 기회에"
                      ? event.campaign?.kind === "tour"
                        ? "꽝"
                        : "다음 기회에"
                      : `🎁 ${app.cards[i].prizeLabel ?? "당첨 상품 · 관리자에게 확인해 주세요"}`
                    : "✦"}
                </div>
              ),
            )}
          </div>
          <HubButton
            disabled={
              !app.profileId ||
              !event.cardsEnabled ||
              eventEnded(event, new Date()) ||
              app.cards.length >= campaignCardLimit(event) ||
              hub.status === "saving"
            }
            onClick={() =>
              hub.mutate({
                action: "application.draw",
                target: app.id,
                revision: app.revision,
              })
            }
          >
            {event.campaign?.kind === "tour"
              ? "추억의 뽑기 두 장 열기"
              : "카드 한 장 뽑기"}
          </HubButton>
          <p className="text-sm">
            {!event.cardsEnabled
              ? "신규 뽑기 OFF · 기존 결과는 보존됩니다. "
              : ""}
            현장 입장 후 최대 {campaignCardLimit(event)}장 · 새로 열어도 결과가
            유지됩니다.{" "}
            {event.campaign?.kind === "tour"
              ? "할인권의 실제 적용과 최종 1/N 정산은 운영자가 직접 안내합니다."
              : "하리보는 두 종류 중 한 개입니다."}
          </p>
        </HubCard>
      )}
    </>
  );
}

export function EventProfileEditor({
  app,
  hub,
  onClose,
}: {
  app: PrivateApplication;
  hub: Hub;
  onClose: () => void;
}) {
  const remaining = profileMissing(app.profile);
  const resumeStep = remaining.includes("MBTI")
    ? 1
    : remaining.includes("관심사 2개 이상")
      ? 3
      : remaining.length
        ? 4
        : 6;
  const initial: Partial<NicknameSetupInput> & {
    lastStep?: number;
    pushDecision?: "enable" | "skip";
  } = {
    ...app.profile,
    ...app.basic,
    lastStep: resumeStep,
    nickname: app.basic.nickname,
    birthYear: app.basic.birthYear,
    location: app.basic.location,
    pushOptIn: app.profile.pushDecision === "enable",
  };
  return (
    <div className="event-profile-draft">
      <NicknameSetupScreen
        key={app.id}
        loading={hub.status === "saving"}
        registrationError={hub.error}
        onReset={() => onClose()}
        onSubmit={() => onClose()}
        eventDraft={{
          initial,
          save: async (data, nextStep) => {
            const profile = {
              ...(data.mbti ? { mbti: data.mbti } : {}),
              interests: data.interests ?? [],
              ...(data.personalityScore != null
                ? { personalityScore: data.personalityScore }
                : {}),
              ...(data.privacyConsent?.collection && data.privacyConsent.sharing
                ? { privacyConsent: data.privacyConsent }
                : {}),
              ...(data.pushDecision ? { pushDecision: data.pushDecision } : {}),
              idealMsg: data.idealMsg ?? null,
              featureMsg: data.featureMsg ?? null,
              lastStep: nextStep,
            };
            return !!(await hub.mutate({
              action: "application.profile",
              target: app.id,
              revision: app.revision,
              data: { profile },
            }));
          },
        }}
      />
      <div className="fixed top-2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <HubFeedback status={hub.status} error="" />
      </div>
    </div>
  );
}
