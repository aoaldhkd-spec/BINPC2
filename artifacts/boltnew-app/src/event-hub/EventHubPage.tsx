import {
  EventListCard,
  EventDetailHeader,
  WaitingSummary,
  applicationListStatus,
  eventListStatus,
} from "./EventPresentation";
import { AdminInquiry } from "./AdminInquiry";
import { TourOverview, tourWeekFor } from './TourOverview';
import { VenueLogo, GoraeThanks } from "./VenueLogos";
import { ParticipantOperations, ScheduledOpening } from "./EventOperations";
import { eventExpired } from "../../../../lib/api-zod/src/event-hub-modules";
import { ApplicationGuide, ScreeningPhoto } from "./CampaignParticipant";
import { HalloweenRecognitionNotice } from "./HalloweenRecognition";
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
import { NoticePages } from "./NoticePages";
import { TEST_MODE_BANNER, testModeBlocksParticipation } from "../lib/public-test-mode";
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
export default function EventHubPage({ path }: { path: string }) {
  const hub = useEventHub();
  return (
    <>
      <EventHubContent path={path} hub={hub} />
      <AdminInquiry hub={hub} />
    </>
  );
}
function EventHubContent({ path, hub }: { path: string; hub: Hub }) {
  const s = hub.state;
  const [dark, setDark] = useState(
    () => readHubBrowserValue("local", "dark_mode") !== "0",
  );
  useEffect(() => {
    const sync = () =>
      setDark(readHubBrowserValue("local", "dark_mode") !== "0");
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [applying, setApplying] = useState(false);
  const [eventFilter, setEventFilter] = useState("전체");
  const [tourRegion,setTourRegion]=useState('');
  const [visibleEvents, setVisibleEvents] = useState(6);
  const [waitingFilter, setWaitingFilter] = useState("전체");
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
    setApplying(false);
  }, [appId, eventId]);
  if (!s)
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-5">
        <a href="/">← 뒤로</a>
        <HubLoading label="신청 기록을 불러오는 중…" />
        <HubFeedback status={hub.status} error={hub.error} />
      </main>
    );
  const testMode = testModeBlocksParticipation(s);
  if (editing && app && !testMode) {
    return (
      <EventProfileEditor
        app={app}
        hub={hub}
        onClose={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="event-hub-theme hub-participant" data-event-dark={dark}>
      <main className="min-h-screen bg-slate-50 text-slate-900 pb-28">
        <header className="hub-participant-header">
          <div className="max-w-2xl mx-auto">
            <a href="/" className="text-sm">
              ← BINPC2
            </a>
            <span className="hub-eyebrow">BINPC2 · EVENT</span>
            <h1 className="mt-2 text-2xl font-black">
              {path.startsWith("/events/cards") ? "MY · 행사 뽑기" : path === "/events/waiting" || app?.stage === 4
                ? "신청대기방"
                : event
                  ? "행사 상세"
                  : "술번개 신청"}
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              {event
                ? "공지부터 확인하고, 내 신청을 이어가세요"
                : path === "/events/waiting"
                  ? "내 신청과 승인 상태를 한눈에 확인하세요"
                  : "좋은 사람들과, 특별한 밤"}
            </p>
          </div>
        </header>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <HubFeedback status={hub.status} error={hub.error} />
          {testMode && <HubCard><p role="status" className="font-bold text-amber-800">{TEST_MODE_BANNER}</p></HubCard>}
          {(event || path === "/events") && (
            <ApplicationGuide
              key={event?.id ?? "events"}
              event={event}
              webOpen={!testMode && s.enabled && !s.publicationBlocked && (event
                ? event.recruitment
                : s.events.some((e) => e.recruitment))}
            />
          )}
          {(appId || eventId) && (
            <HubButton onClick={() => hubNavigate("/events/waiting")}>
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
          {path.startsWith("/events/cards") ? (
            <>
              <HubButton onClick={() => hubNavigate("/")}>← MY로 돌아가기</HubButton>
              {s.applications.filter((a) => a.profileId).length === 0 && <HubCard><p>입장한 술번개가 없습니다. 승인과 필수 프로필을 확인한 뒤 입장해 주세요.</p></HubCard>}
              {s.applications.filter((a) => a.profileId).map((a) => {
                const e = s.events.find((e) => e.id === a.eventId);
                return e ? <section key={a.id}><h2 className="font-bold">{e.title}</h2><EventCards app={a} event={e} hub={hub} /></section> : null;
              })}
            </>
          ) : app && event ? (
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
            <>
              <EventDetailHeader key={event.id} event={event} />
              {event.recruitment ? (
                applying ? <BasicForm key={event.id} eventId={event.id} hub={hub} /> :
                <HubButton disabled={testMode || !s.enabled || !!s.publicationBlocked} onClick={() => setApplying(true)}>신청하기</HubButton>
              ) : (
                <ScheduledOpening event={event} hub={hub} />
              )}
            </>
          ) : (
            <>
              {path === "/events/waiting" && s.applications.length === 0 && (
                <HubCard>
                  <h2 className="font-bold">아직 신청한 술번개가 없습니다</h2>
                  <HubButton disabled={testMode} onClick={() => hubNavigate("/events")}>
                    술번개 신청
                  </HubButton>
                </HubCard>
              )}
              {s.applications.length > 0 && (
                <HubCard>
                  <h2 className="font-black">내 신청 목록</h2>
                  <div className="hub-segmented" aria-label="내 신청 상태 필터">
                    {["전체", "작성 중", "확인 대기", "승인"].map((f) => (
                      <button
                        type="button"
                        key={f}
                        aria-pressed={waitingFilter === f}
                        onClick={() => setWaitingFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="hub-event-list">
                    {s.applications
                      .filter(
                        (a) =>
                          waitingFilter === "전체" ||
                          (waitingFilter === "승인"
                            ? paymentSatisfied(a)
                            : waitingFilter === "작성 중"
                              ? a.stage < 4
                              : a.stage === 4 && !paymentSatisfied(a)),
                      )
                      .map((a) => {
                        const e = s.events.find((e) => e.id === a.eventId);
                        return e ? (
                          <EventListCard
                            key={a.id}
                            event={e}
                            app={a}
                            now={new Date(s.serverNow ?? Date.now())}
                            onOpen={() => hubNavigate(`/events/a/${a.id}`)}
                          />
                        ) : (
                          <button
                            key={a.id}
                            onClick={() => hubNavigate(`/events/a/${a.id}`)}
                          >
                            기존 신청 · {applicationListStatus(a)}
                          </button>
                        );
                      })}
                  </div>
                </HubCard>
              )}
              {path !== "/events/waiting" && (
                <><TourOverview events={s.events} selected={tourRegion} onSelect={region=>{setTourRegion(region);setEventFilter('전체');setVisibleEvents(6);}}/><HubCard>
                  <h2 className="font-black">행사·신청 일정</h2>
                  <div className="hub-segmented" aria-label="행사 상태 필터">
                    {["전체", "신청 가능", "접수 예정", "종료"].map((f) => (
                      <button
                        type="button"
                        key={f}
                        aria-pressed={eventFilter === f}
                        onClick={() => {
                          setEventFilter(f);
                          setVisibleEvents(6);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="hub-event-list">
                    {[...s.events]
                      .filter(e=>!tourRegion||tourWeekFor(e)?.region===tourRegion)
                      .sort(
                        (a, b) =>
                          Number(!!b.campaign) - Number(!!a.campaign) ||
                          a.date.localeCompare(b.date) ||
                          a.start.localeCompare(b.start),
                      )
                      .filter(
                        (e) =>
                          eventFilter === "전체" ||
                          eventListStatus(
                            e,
                            new Date(s.serverNow ?? Date.now()),
                          ) === eventFilter,
                      )
                      .slice(0, visibleEvents)
                      .map((e) => (
                        <EventListCard
                          key={e.id}
                          event={e}
                          now={new Date(s.serverNow ?? Date.now())}
                          onOpen={() => {
                            const a = s.applications.find(
                              (a) => a.eventId === e.id,
                            );
                            hubNavigate(
                              a ? `/events/a/${a.id}` : `/events/e/${e.id}`,
                            );
                          }}
                        />
                      ))}
                  </div>
                  {s.events.filter(
                    (e) =>
                      (!tourRegion||tourWeekFor(e)?.region===tourRegion) && (eventFilter === "전체" ||
                      eventListStatus(
                        e,
                        new Date(s.serverNow ?? Date.now()),
                      ) === eventFilter),
                  ).length > visibleEvents && (
                    <button
                      className="hub-more"
                      onClick={() => setVisibleEvents((n) => n + 6)}
                    >
                      행사 더 보기
                    </button>
                  )}
                  {!s.events.some(
                    (e) =>
                      (!tourRegion||tourWeekFor(e)?.region===tourRegion) && (eventFilter === "전체" ||
                      eventListStatus(
                        e,
                        new Date(s.serverNow ?? Date.now()),
                      ) === eventFilter),
                  ) && (
                    <p className="hub-empty-state">
                      {eventFilter === "전체"
                        ? "등록된 모집 일정이 없습니다."
                        : `${eventFilter} 행사가 없습니다.`}
                    </p>
                  )}
                </HubCard></>
              )}
              <HubCard>
                <details>
                  <summary className="font-bold cursor-pointer">
                    이전 신청 복구 / 기존 신청자 로그인
                  </summary>
                  <div className="mt-3 space-y-3">
                    <HubField label="닉네임">
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
                      기존 신청자 로그인
                    </HubButton>
                    <details><summary>다른 방법으로 복구</summary>                    <p className="text-sm">
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
                    </details>
                  </div>
                </details>
              </HubCard>
            </>
          )}
          {!s.member && s.hasSession && (
            <HubCard>
              {s.applications.length > 0 && <MemberSetup hub={hub} />}
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
                새 기기에서도 닉네임과 비밀번호로 같은 신청을 이어갈 수 있습니다.
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
                  처리 상태:{" "}
                  {(
                    {
                      requested: "요청 접수",
                      reviewing: "보관 기준 검토 중",
                      approved: "처리 승인",
                      completed: "처리 완료",
                      rejected: "보관 사유 확인",
                      restricted: "이용 제한",
                    } as Record<string, string>
                  )[s.privacyCase.status] ?? "운영자 확인 중"}{" "}
                  ·{" "}
                  {s.privacyCase.publicMessage ||
                    "운영자가 본인 확인·보관 예외를 검토합니다. 삭제 완료 전 기록은 유지됩니다."}
                </p>
              )}
            </details>
          </HubCard>
          <HubCard>
            <details>
              <summary className="font-bold cursor-pointer">
                    추가 복구 방법
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
function MemberSetup({ hub }: { hub: Hub }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reuse, setReuse] = useState(false);
  return <details className="mb-4"><summary className="font-bold">다음에도 닉네임으로 로그인하기</summary>
    <p className="text-sm py-2">현재 연결된 본인 신청에 비밀번호를 한 번 설정합니다. 광고 수신과는 별개이며 신청·입금 상태는 그대로 유지됩니다.</p>
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (password !== confirm) { hub.setError("비밀번호 확인이 일치하지 않습니다."); return; }
      if (await hub.mutate({ action: "member.setup", data: { password, reuse, version: HUB_CONSENT_VERSION } })) { setPassword(""); setConfirm(""); }
    }}>
      <HubField label="로그인 비밀번호 (10자 이상)"><input className={inputClass} type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></HubField>
      <HubField label="로그인 비밀번호 확인"><input className={inputClass} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></HubField>
      <HubCheck label="[선택] 다음 행사에도 내 기본정보와 프로필을 재사용하는 데 동의합니다" checked={reuse} onChange={setReuse} />
      <HubButton type="submit" disabled={!reuse || hub.status === "saving"}>로그인 설정 저장</HubButton>
    </form>
  </details>;
}

export function BasicForm({ eventId, hub, app, onSaved }: {
  eventId: string; hub: Hub; app?: PrivateApplication; onSaved?: () => void;
}) {
  const member = hub.state?.member;
  const draft = hub.state?.basicDrafts?.[eventId];
  const known = app?.basic ?? draft?.basic ?? member?.basic;
  const [v, setV] = useState({ nickname: known?.nickname ?? "", birthYear: String(known?.birthYear ?? ""), location: known?.location ?? "", phone: known?.phone ?? "", depositor: known?.depositor ?? "" });
  const [collection, setCollection] = useState(app?.basic.collection ?? draft?.basic.collection ?? false);
  const [step, setStep] = useState(app ? 1 : draft?.nextStep ?? 0);
  const [advancing, setAdvancing] = useState(false);
  const fields = [["nickname", "닉네임"], ["birthYear", "태어난 년도"], ["location", "사는 지역"], ["phone", "연락용 전화번호 (문자 인증 없음)"], ["depositor", "실제 은행 입금 시 보내는 분 이름"]] as const;
  const field = fields[Math.max(0, step - 1)];
  if (testModeBlocksParticipation(hub.state)) return <HubCard><HubButton disabled>술번개 신청</HubButton><p className="text-sm">행사 공지와 관리자 문의는 계속 확인할 수 있습니다.</p></HubCard>;
  const next = async () => {
    if (advancing || !collection) return;
    setAdvancing(true);
    try {
      const basic: Record<string, unknown> = { collection, version: HUB_CONSENT_VERSION };
      // Send only completed fields. Later input stays in this screen until consented Next.
      for (let i = 0; i < Math.min(step, fields.length); i++) {
        const key = fields[i][0]; basic[key] = key === "birthYear" ? Number(v[key]) : v[key];
      }
      const final = step === fields.length;
      const r = await hub.mutate({
        action: app || final ? "application.basic" : "application.basic-draft",
        revision: app?.revision ?? draft?.revision ?? 0,
        data: { eventId, edit: !!app, privacyPolicyFingerprint: hub.state?.privacyNotice?.fingerprint,
          basic: app || final ? { ...v, birthYear: Number(v.birthYear), collection, version: HUB_CONSENT_VERSION } : basic,
          nextStep: Math.min(step + 1, fields.length) },
      });
      if (!r) return;
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (final && r.id) { if (onSaved) onSaved(); else hubNavigate(`/events/a/${r.id}`); }
      else setStep((n) => Math.min(n + 1, fields.length));
    } finally { setAdvancing(false); }
  };
  return <HubCard>
    <div className="flex items-center justify-between gap-2"><h2 className="font-black text-lg">{step === 0 ? "신청 전 개인정보 안내" : field[1]}</h2><small>{step === 0 ? "먼저 확인해 주세요" : `${step} / ${fields.length}`}</small></div>
    {member && step === 1 && <p className="text-sm">기존 프로필의 닉네임을 불러왔습니다. 수정 없이 이어갈 수 있습니다.</p>}
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void next(); }}>
      {step > 0 && <HubField key={field[0]} label={field[1]}><input required autoFocus className={inputClass} value={v[field[0]]}
        autoComplete={field[0] === "phone" ? "tel" : "off"} maxLength={field[0] === "nickname" ? 12 : field[0] === "birthYear" ? 4 : 40}
        inputMode={field[0] === "phone" ? "tel" : field[0] === "birthYear" ? "numeric" : "text"}
        onChange={(e) => setV({ ...v, [field[0]]: e.target.value })} /></HubField>}
      {step === 0 && <>
        <details className="text-sm">
          <summary>개인정보 수집 안내 · 보유기간</summary>
          {hub.state?.privacyNotice ? (
            <div className="py-3 space-y-2">
              <p>
                {hub.state.privacyNotice.policyVersion} ·{" "}
                {hub.state.privacyNotice.controllerName} · 문의{" "}
                {hub.state.privacyNotice.contact}
              </p>
              <p className="whitespace-pre-wrap">
                {hub.state.privacyNotice.notice}
              </p>
              <ul>
                {hub.state.privacyNotice.periods.map((r) => (
                  <li key={r.purpose}>
                    {(
                      {
                        application: "신청·행사",
                        finance: "입금·분쟁",
                        member: "회원 재사용",
                        inquiry: "문의",
                        audit: "운영 이력",
                        recovery: "세션·복구",
                        backup: "백업",
                      } as Record<string, string>
                    )[r.purpose] ?? r.purpose}
                    : {r.days ?? "미확정"}일
                  </li>
                ))}
              </ul>
              <p>보류·백업 예외는 확정 고지 원문에서 확인하세요.</p>
            </div>
          ) : (
            <p className="py-3">
              행사 운영자가 신청 처리·입금 확인·연락을 위해
              닉네임·출생연도·지역·연락처·입금자명을 수집합니다. 행사 운영기록은
              기본 {hub.state?.retentionDays ?? 180}일의 보관 검토기간을
              사용하며 법정 보관이 필요한 기록은 별도 정책을 따릅니다. 필수
              수집을 거부하면 신청할 수 없습니다. 현장 공개 프로필은 입장 승인
              후에만 생성합니다.
            </p>
          )}
        </details>
        <HubCheck
          label="[필수] 위 개인정보 수집·이용 안내를 확인하고 동의합니다"
          checked={collection}
          onChange={setCollection}
        />
      </>}
      {step === 4 && <p className="text-sm">연락·상품·상금·할인 확인에 사용합니다. 번호 인증이나 별도 승인은 요구하지 않습니다.</p>}
      <div className="flex gap-2">
        {step > 0 && <HubButton disabled={advancing || hub.status === "saving"} onClick={() => setStep(step - 1)}>← 이전</HubButton>}
        <HubButton type="submit" disabled={!collection || advancing || hub.status === "saving"}>{hub.status === "saving" ? "저장 중…" : advancing ? "저장되었습니다 ✓" : "다음"}</HubButton>
      </div>
      <p className="text-xs">다음을 누르면 서버에 저장됩니다. 신청을 마치기 전에는 선착순 순번이 부여되지 않습니다.</p>
    </form>
  </HubCard>;
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
  const noticeTheme=useEventTheme(event);
  const blocked = testModeBlocksParticipation(hub.state);
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
    if (blocked) return;
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
      <EventMedia links={event.media} materials={event.materials} />
      {panelStage === 2 && <NoticePages key={event.noticeVersion} notice={event.notice} halloween={noticeTheme==='halloween'} />}
      <NoticeHistory history={event.noticeHistory} />
      {panelStage === 2 ? (
        <>
          <HubCheck label="필수 안내를 모두 확인하고 동의합니다" checked={c.notice && c.collection && c.sharing} onChange={(v) => setC({ ...c, notice: v, collection: v, sharing: v })} />
          <details><summary className="text-sm">필수 동의 내용 확인</summary>
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
          </details>
          <details><summary className="text-sm">선택 설정 · 알림과 다음 행사 프로필 재사용</summary>
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
          </details>
          <fieldset>
            <legend className="font-bold text-sm">
              프로필을 미리 설정하시겠습니까?
            </legend>
            <div className="flex gap-2"><HubButton onClick={() => setC({ ...c, profileNow: true })} aria-pressed={c.profileNow}>지금 설정</HubButton><HubButton onClick={() => setC({ ...c, profileNow: false })} aria-pressed={!c.profileNow}>대기방에서 나중에</HubButton></div>
            <p className="text-xs">
              어느 쪽을 선택해도 대기방에서 언제든 작성할 수 있습니다.
            </p>
          </fieldset>
          <HubButton
            disabled={
              blocked ||
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
          <HalloweenRecognitionNotice app={app} />
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
            disabled={testModeBlocksParticipation(hub.state) || hub.status === "saving"}
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
  const noticeTheme=useEventTheme(event);
  const blocked = testModeBlocksParticipation(hub.state);
  const missing = profileMissing(app.profile);
  const enter = async () => {
    if (blocked) return;
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
      <WaitingSummary app={app} event={event} />
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
        <HubButton disabled={blocked} onClick={edit}>
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
        {event.type === "tour" && <GoraeThanks logo={app.venue?.thanksLogo} />}
        <fieldset disabled={blocked}><ParticipantOperations app={app} event={event} hub={hub} /></fieldset>
        <HalloweenRecognitionNotice app={app} />
        {app.eligibility && <fieldset disabled={blocked}><ScreeningPhoto app={app} hub={hub} /></fieldset>}
        <h2 className="font-black">{event.title}</h2>
        <p>
          {event.date} {event.start}~{event.end}
        </p>
        <strong>
          {app.approvalRevokedAt ? "승인이 취소되었습니다 · 재입금하지 말고 관리자에게 문의해 주세요" : app.waivedAt
            ? "무료 참가 승인 완료 · 재입금 불필요"
            : event.campaign && app.quote?.fee === 0
              ? "무료 참가 승인 대기"
              : paymentLabel[app.payment]}
        </strong>
        <p>{paymentSatisfied(app) ? (app.profileId ? "입장 완료" : "참가 확정 · 프로필 완료 후 입장") : "관리자 확인 대기"}</p>
        <details><summary>내 신청 정보</summary><p className="text-xs break-all">신청번호 {app.id}</p></details>
        {!paymentSatisfied(app) &&
          !app.waivedAt &&
          app.lateArrival?.status !== "review" &&
          app.lateArrival?.status !== "declined" && (
            <p className="text-sm">
              관리자가 업무 중이거나 취침 중이면 입금 승인이 늦어질 수 있습니다.
              이미 송금했다면 다시 송금하지 마세요.
            </p>
          )}
        {app.billing &&
          (paymentSatisfied(app) ||
            (app.lateArrival?.status !== "review" &&
              app.lateArrival?.status !== "declined")) && (
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
        app.lateArrival?.status !== "review" &&
        app.lateArrival?.status !== "declined" &&
        app.quote?.fee !== 0 &&
        (app.payment === "none" ||
          app.payment === "held" ||
          app.payment === "mismatch") ? (
          <HubButton
            disabled={testModeBlocksParticipation(hub.state) || hub.status === "saving"}
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
            {(app.lateArrival?.status === "review" ||
              app.lateArrival?.status === "declined") &&
            !paymentSatisfied(app)
              ? "도착 예정시간을 관리자와 확인 중입니다. 먼저 송금하지 마세요."
              : app.waivedAt
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
        {app.venue?.logoId && <VenueLogo id={app.venue.logoId} />}
        {app.venue?.logo && (
          <figure>
            <img
              src={app.venue.logo.url}
              alt={app.venue.logo.label}
              width={app.venue.logo.width}
              height={app.venue.logo.height}
              className="h-36 max-w-full object-contain bg-white rounded-xl"
            />
            <figcaption>{app.venue.logo.label}</figcaption>
          </figure>
        )}
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
        {event.campaign?.kind === "tour" && event.campaign.secondRoundLink && (blocked ? (
          <div>
            <HubButton disabled>2차 오픈채팅 신청 (접수 전)</HubButton>
            <p className="text-sm">웹·오픈채팅 모두 접수 전입니다. 오픈 확인 전에는 신청하거나 송금하지 마세요.</p>
          </div>
        ) : (
          <a
            className="underline text-teal-700"
            href={event.campaign.secondRoundLink}
            target="_blank"
            rel="noreferrer"
          >
            2차 오픈채팅 신청 (BINPC2 외부)
          </a>
        ))}
        <EventMedia links={event.media} materials={event.materials} />
        <details>
          <summary>행사 공지</summary>
          <NoticePages key={event.noticeVersion} notice={event.notice} halloween={noticeTheme==='halloween'} />
        </details>
        <NoticeHistory history={event.noticeHistory} />
        {app.consent?.noticeVersion !== event.noticeVersion && (
          <HubButton disabled={blocked}
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
          disabled={testModeBlocksParticipation(hub.state) || hub.status === "saving"}
          onClick={missing.length ? edit : enter}
        >
          {missing.length ? "남은 프로필 설정 완료하기" : "술번개 입장하기"}
        </HubButton>
        <p className="text-xs">
          입장 시 서버에서 참가 승인·회식 시작·필수 프로필을 확인하고 입장을 기록합니다.
        </p>
      </HubCard>

    </>
  );
}

export function EventCards({ app, event, hub }: { app: PrivateApplication; event: HubState["events"][number]; hub: Hub }) {
  const currentTheme = useEventTheme(event);
  const blocked = testModeBlocksParticipation(hub.state) || !paymentSatisfied(app);
  if (!app.profileId) return <HubCard><p>술번개에 입장한 뒤 MY에서 뽑기를 이용할 수 있습니다.</p></HubCard>;
  return <>
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
              blocked ||
              !app.profileId ||
              !event.cardsEnabled ||
              eventExpired(event, new Date(hub.state?.serverNow ?? Date.now())) ||
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
              : "하리보는 1인 1개입니다."}
          </p>
        </HubCard>
      )}
  </>;
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
  if (testModeBlocksParticipation(hub.state))
    return <HubCard><p role="status">{TEST_MODE_BANNER}</p><HubButton onClick={onClose}>신청 기록으로 돌아가기</HubButton></HubCard>;
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
