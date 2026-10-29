import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  LockKeyhole,
  Sparkles,
  Check,
} from "lucide-react";
import type { HubEvent, PrivateApplication } from "../lib/event-hub-client";
import { paymentSatisfied } from "../../../../lib/api-zod/src/event-campaign";
import { eventEnded } from "../../../../lib/api-zod/src/event-hub-modules";
import { recruitmentIsOpen } from "../../../../lib/api-zod/src/event-hub";
import { EventMedia } from "./EventMedia";
import { Preview } from "./MediaManager";
import { useEventTheme } from "./HubUi";
import { TOUR_WEEKS } from "../../../../lib/api-zod/src/event-policy-tour";
import { VenueLogo } from "./VenueLogos";
import { NoticePages } from "./NoticePages";

export function eventDateLabel(event: HubEvent) {
  const day = new Date(event.date + "T12:00:00+09:00").getUTCDay();
  return `${Number(event.date.slice(5, 7))}월 ${Number(event.date.slice(8))}일 (${["일", "월", "화", "수", "목", "금", "토"][day]})`;
}
export function EventArtwork({
  event,
  admin = false,
  compact = false,
}: {
  event: HubEvent;
  admin?: boolean;
  compact?: boolean;
}) {
  const theme = useEventTheme(event);
  // Only explicitly public notices can become a list thumbnail. Never use a map,
  // protected poster, venue logo or a legacy media URL as a pre-approval cover.
  const cover = event.materials?.find(
    (m) => m.purpose === "notice" && !m.hidden && event.media.includes(m.url),
  );
  return (
    <div className="hub-event-art" data-art-theme={theme ?? "normal"} data-art-compact={compact || undefined}>
      {cover ? (
        <Preview
          interactive={false}
          url={cover.url}
          alt={`${cover.alt || "행사 공지 이미지"} · 미리보기`}
          secured={admin && cover.url.startsWith("/api/event-hub/media/")}
        />
      ) : event.type === "tour" && TOUR_WEEKS.some((w) => event.date >= w.start && event.date <= new Date(Date.parse(w.start + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10)) ? (
        <div className="hub-tour-art">
          {TOUR_WEEKS.filter((w) => event.date >= w.start && event.date <= new Date(Date.parse(w.start + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10)).map((w) => (
            <div key={w.region}>
              <strong>{w.region} · 전국투어</strong>
              <div className="hub-tour-logos">
                {w.logoIds.map((id) => <VenueLogo key={id} id={id} />)}
              </div>
            </div>
          ))}
        </div>
      ) : theme === "halloween" ? (
        <img
          src="/event-art/halloween-lounge.webp"
          alt="할로윈 행사 분위기 일러스트"
          loading="lazy"
        />
      ) : (
        <div
          className="hub-art-placeholder"
          aria-label={event.type === "tour" ? "전국투어 행사" : "술번개 행사"}
        >
          <Sparkles aria-hidden="true" />
          <span>{event.type === "tour" ? "KOREA TOUR" : "BINPC2"}</span>
        </div>
      )}
    </div>
  );
}
export function eventListStatus(event: HubEvent, now: Date) {
  if (eventEnded(event, now)) return "종료";
  if (recruitmentIsOpen(event, now)) return "신청 가능";
  if (event.scheduleEnabled && !event.schedulePaused) return "접수 예정";
  return "접수 중지";
}
export function applicationListStatus(app: PrivateApplication) {
  if (app.approvalRevokedAt) return "승인 취소 · 관리자 문의";
  if (app.profileId) return "입장 완료";
  if (app.waivedAt) return "무료 승인";
  if (paymentSatisfied(app))
    return app.attendance === "paid_waitlist" ? "입금확정 대기" : "승인 완료";
  if (app.payment === "reported") return "입금 확인 중";
  if (app.payment === "held" || app.payment === "mismatch")
    return "관리자 확인 중";
  return app.stage === 4 ? "입금 전" : "작성 중";
}
export function EventListCard({
  event,
  app,
  onOpen,
  now,
}: {
  event: HubEvent;
  app?: PrivateApplication;
  onOpen: () => void;
  now: Date;
}) {
  const status = app ? applicationListStatus(app) : eventListStatus(event, now);
  const publicTourVenues = event.type === "tour" ? TOUR_WEEKS.find((w) =>
    event.date >= w.start && event.date <= new Date(Date.parse(w.start + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10))?.venues : undefined;
  return (
    <button type="button" className="hub-event-list-card" onClick={onOpen}>
      <EventArtwork event={event} compact />
      <span className="hub-event-card-copy">
        <span className="hub-event-card-title">
          <strong>{event.title}</strong>
          <span
            className="hub-status-pill"
            data-approved={!!app && paymentSatisfied(app)}
          >
            {status}
          </span>
        </span>
        <span className="hub-event-date">
          <CalendarDays size={13} aria-hidden="true" />
          {eventDateLabel(event)}
        </span>
        <span className="hub-event-meta">
          <Clock3 size={13} aria-hidden="true" />
          {event.start} → {event.end <= event.start ? "익일 " : ""}
          {event.end}
        </span>
        <span className="hub-event-meta">
          <MapPin size={13} aria-hidden="true" />
          {event.area || "지역 안내 예정"}
        </span>
        {publicTourVenues && <span className="hub-event-meta">{publicTourVenues.join(" · ")}</span>}
        <span className="hub-card-next">
          {app ? "내 신청 이어보기" : "행사 자세히 보기"}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
export function EventDetailHeader({
  event,
  app,
}: {
  event: HubEvent;
  app?: PrivateApplication;
}) {
  const [tab, setTab] = useState("공지사항");
  const theme = useEventTheme(event);
  const approved = !!app && paymentSatisfied(app);
  const notices =
    event.materials?.filter((m) => m.purpose === "notice" && !m.hidden) ?? [];
  const maps = approved
    ? (event.materials?.filter((m) => m.purpose === "map" && !m.hidden) ?? [])
    : [];
  return (
    <section className="hub-detail-card" data-event-accent={theme ?? "normal"}>
      <div className="hub-detail-cover">
        <EventArtwork event={event} />
        <span className="hub-cover-caption">
          {theme === "halloween"
            ? "HALLOWEEN NIGHT"
            : event.type === "tour"
              ? "2026 · KOREA TOUR"
              : "GOOD PEOPLE, SPECIAL NIGHT"}
        </span>
      </div>
      <div className="hub-detail-heading">
        <h2>{event.title}</h2>
        <p>
          <CalendarDays size={14} />
          {eventDateLabel(event)} · {event.start}~
          {event.end <= event.start ? "익일 " : ""}
          {event.end}
        </p>
        <p>
          <MapPin size={14} />
          {(approved ? app?.venue?.address : undefined) ??
            `${event.area || "지역 안내 예정"} · 상세 위치는 승인 후 안내`}
        </p>
      </div>
      <div className="hub-segmented" role="tablist" aria-label="행사 상세 안내">
        {["공지사항", "위치·지도"].map((t) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="hub-detail-panel" role="tabpanel" aria-label={tab}>
        {tab === "공지사항" ? (
          <>
            <NoticePages key={event.noticeVersion} notice={event.notice} />
            {notices.length > 0 && (
              <EventMedia
                links={notices.map((m) => m.url)}
                materials={notices}
              />
            )}
          </>
        ) : approved && app?.venue ? (
          <>
            <p>{app.venue.address}</p>
            {app.venue.mapUrl && (
              <a
                className="hub-location-link"
                href={app.venue.mapUrl}
                target="_blank"
                rel="noreferrer"
              >
                지도·길찾기 열기 <ChevronRight size={15} />
              </a>
            )}
            <EventMedia links={maps.map((m) => m.url)} materials={maps} />
          </>
        ) : (
          <div className="hub-location-locked">
            <LockKeyhole size={24} />
            <strong>상세 장소는 승인 후 열려요</strong>
            <p>
              입금 확인 또는 무료 참가 승인 후<br />내 신청대기방에서 확인해
              주세요.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
export function WaitingSummary({
  app,
  event,
}: {
  app: PrivateApplication;
  event: HubEvent;
}) {
  const paid = paymentSatisfied(app);
  return (
    <section className="hub-waiting-summary">
      <div className="hub-waiting-title">
        <EventArtwork event={event} compact />
        <div>
          <span className="hub-eyebrow">MY APPLICATION</span>
          <h2>{event.title}</h2>
          <p>
            {eventDateLabel(event)} · {event.start}
          </p>
          <span className="hub-status-pill" data-approved={paid}>
            {applicationListStatus(app)}
          </span>
        </div>
      </div>
      <ol className="hub-progress">
        {[
          ["신청 완료", true],
          ["입금·참가 확인", paid],
          ["현장 입장", !!app.profileId],
        ].map(([label, done], i) => (
          <li key={String(label)} data-done={!!done}>
            <span>{done ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}
