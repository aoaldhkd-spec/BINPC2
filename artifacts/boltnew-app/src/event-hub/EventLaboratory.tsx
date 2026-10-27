import { useState, useRef } from "react";
import type {
  HubController,
  HubCommand,
  HubEvent,
} from "../lib/event-hub-client";
import {
  EventLaboratoryStore,
  laboratoryStage,
  type LabStage,
} from "./event-laboratory-store";
import {
  BasicForm,
  ApplicationSteps,
  WaitingRoom,
  EventProfileEditor,
} from "./EventHubPage";
import { ApplicationAdmin, AdminThreads } from "./EventHubAdmin";
import {
  HubButton,
  HubCard,
  HubField,
  HubCheck,
  HubFeedback,
  inputClass,
} from "./HubUi";
const stages: LabStage[] = [
  "기본정보 작성 중",
  "공지 동의 완료",
  "회비 확인",
  "신청 확정",
  "입금 신고",
  "입금 승인",
  "무료 참가 승인",
  "입금확정 대기자",
  "프로필 미완료",
  "프로필 완료",
  "현장 입장",
];
/** The adapter owns only synthetic browser state; no live mutation client is accepted. */
export function EventLaboratory({ event }: { event?: HubEvent }) {
  const [engine] = useState(() => {
    let storage: Storage | undefined;
    try {
      storage = sessionStorage;
    } catch {}
    return new EventLaboratoryStore(event, storage);
  });
  const [participant, setParticipant] = useState(() => engine.state()),
    [administrator, setAdministrator] = useState(() => engine.state(true));
  const [role, setRole] = useState<"참가자" | "관리자">(
      window.location.hash === "#admin" ? "관리자" : "참가자",
    ),
    [stage, setStage] = useState<LabStage>(() => laboratoryStage(engine.value)),
    [editing, setEditing] = useState(false),
    [inquiry, setInquiry] = useState(false),
    [draft, setDraft] = useState(""),
    [collection, setCollection] = useState(false);
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [fault, setFault] = useState("none"),
    [offline, setOffline] = useState(false),
    [delay, setDelay] = useState(150);
  const [pending, setPending] = useState<{
    signature: string;
    id: string;
  } | null>(null);
  const sync = () => {
    setParticipant(engine.state());
    setAdministrator(engine.state(true));
    setStage(laboratoryStage(engine.value));
  };
  const load = async () => {
    if (offline) throw new Error("가상 연결이 끊겼습니다.");
    sync();
    return engine.state(role === "관리자");
  };
  const busy = useRef(false);
  const mutate = async (command: HubCommand, admin = false) => {
    if (busy.current) return null;
    busy.current = true;
    const signature = JSON.stringify(command);
    const id =
      pending?.signature === signature ? pending.id : crypto.randomUUID();
    setPending({ signature, id });
    setStatus("saving");
    setError("");
    try {
      await new Promise((r) => setTimeout(r, delay));
      if (offline || fault === "before")
        throw new Error("가상 저장 실패 · 입력 내용은 그대로입니다.");
      const result = engine.execute({ ...command, requestId: id }, admin);
      if (fault === "after") {
        setStatus("checking");
        await new Promise((r) => setTimeout(r, delay));
        const replay = engine.execute({ ...command, requestId: id }, admin);
        sync();
        setStatus("saved");
        setPending(null);
        return replay;
      }
      sync();
      setStatus("saved");
      setPending(null);
      return result;
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message);
      return null;
    } finally {
      busy.current = false;
    }
  };
  const userHub: HubController = {
    state: participant,
    error,
    status,
    load,
    mutate: (c) => mutate(c),
    setError,
  };
  const adminHub: HubController = {
    ...userHub,
    state: administrator,
    mutate: (c) => mutate(c, true),
  };
  const app = participant.applications[0],
    adminApp = administrator.applications[0];
  const jump = (value: LabStage, rank = engine.value.rank) => {
    engine.jump(value, rank);
    setStage(value);
    setEditing(false);
    setError("");
    setStatus("");
    sync();
  };
  return (
    <div className="space-y-4" data-testid="event-laboratory">
      <HubCard>
        <h2 className="font-black">🧪 선착순 시험실</h2>
        <p className="text-sm text-amber-800">
          가상 화면입니다. 실제 신청·입금·공지·재고·통계에는 저장하지 않습니다.
          실제 개인정보·비밀번호·은행정보를 입력하지 마세요.
        </p>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 10, 11, 15, 16].map((rank) => (
            <HubButton
              key={rank}
              aria-pressed={engine.value.rank === rank}
              onClick={() => jump(stage, rank)}
            >
              {rank}등
            </HubButton>
          ))}
        </div>
        <HubField label="가상 순위 직접 입력">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={engine.value.rank}
            onChange={(e) =>
              jump(stage, Math.max(1, Math.floor(Number(e.target.value) || 1)))
            }
          />
        </HubField>
        {engine.value.event.campaign && (
          <HubField label="시험 기준 시각 (한국시간)">
            <select
              className={inputClass}
              value={
                engine.value.quoteAt?.includes("21:00")
                  ? "21:00:00"
                  : "20:59:59"
              }
              onChange={(e) => {
                engine.configureClock(
                  `${engine.value.event.date}T${e.target.value}+09:00`,
                );
                jump(stage);
              }}
            >
              <option value="20:59:59">당일20:59:59</option>
              <option value="21:00:00">당일21:00:00</option>
            </select>
          </HubField>
        )}
        <HubField label="가상 진행 상태">
          <select
            className={inputClass}
            value={stage}
            onChange={(e) => jump(e.target.value as LabStage)}
          >
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </HubField>
        <div className="flex flex-wrap gap-2">
          <HubButton onClick={() => setRole("참가자")}>
            참가자 화면으로 보기
          </HubButton>
          <HubButton onClick={() => setRole("관리자")}>
            관리자 화면으로 보기
          </HubButton>
          <HubButton
            onClick={() => {
              engine.reset(event);
              setStage("기본정보 작성 중");
              setEditing(false);
              setStatus("");
              setError("");
              setPending(null);
              sync();
            }}
          >
            시험 데이터만 초기화
          </HubButton>
          <HubButton
            onClick={() => {
              sync();
              setStatus("saved");
              setError("");
            }}
          >
            재접속·저장 상태 복원
          </HubButton>
        </div>
        <details>
          <summary>저장 실패·응답 유실·현장 운영 모의 조건</summary>
          <div className="space-y-3 py-3">
            <HubField label="가상 저장 장애">
              <select
                className={inputClass}
                value={fault}
                onChange={(e) => setFault(e.target.value)}
              >
                <option value="none">정상 저장</option>
                <option value="before">서버 저장 전 실패</option>
                <option value="after">저장 후 응답 유실 · 영수증 복구</option>
              </select>
            </HubField>
            <HubCheck
              label="가상 인터넷 끊김"
              checked={offline}
              onChange={setOffline}
            />
            <HubCheck
              label="가상 회식 시작"
              checked={engine.value.active}
              onChange={(active) => {
                engine.configure({ active });
                sync();
              }}
            />
            <HubField label="가상 상품 남은 재고">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={engine.value.stock}
                onChange={(e) => {
                  engine.configure({
                    stock: Math.max(0, Number(e.target.value) || 0),
                  });
                  sync();
                }}
              />
            </HubField>
            <HubField label="가상 저장 지연 (밀리초)">
              <input
                className={inputClass}
                type="number"
                min={0}
                max={3000}
                value={delay}
                onChange={(e) =>
                  setDelay(
                    Math.min(3000, Math.max(0, Number(e.target.value) || 0)),
                  )
                }
              />
            </HubField>
          </div>
        </details>
        <HubFeedback status={status} error={error} />
        <p className="text-xs">
          상태는 이 브라우저의 시험 저장소에서만 복원됩니다. 운영 DB 검증과
          구분됩니다.
        </p>
      </HubCard>
      <section aria-label="가상 참가 화면" className="space-y-4">
        <strong>
          {role} 체험 · 가상 {engine.value.rank}등
        </strong>
        <p>
          선택 행사: {engine.value.event.title} · {engine.value.event.date}{" "}
          {engine.value.event.start} · {engine.value.event.area}
        </p>
        {role === "관리자" && (
          <HubCard>
            <details>
              <summary>가상 행사·혜택·카드 설정 변경</summary>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    engine.configureEvent({
                      ...engine.value.event,
                      title: String(f.get("title")),
                      date: String(f.get("date")),
                      start: String(f.get("start")),
                      area: String(f.get("area")),
                      address: String(f.get("address")),
                      notice: String(f.get("notice")),
                      fee: Number(f.get("fee")),
                      benefitsEnabled: f.get("benefits") === "on",
                      cardsEnabled: f.get("cards") === "on",
                      benefits: [
                        {
                          from: 1,
                          to: 3,
                          type: "discount",
                          value: Number(f.get("discount")),
                          label: "가상 1~3등 할인",
                        },
                      ],
                    });
                    sync();
                    setStatus("saved");
                    setError("");
                  } catch {
                    setError("날짜·금액·필수 행사 정보를 확인해 주세요.");
                  }
                }}
              >
                {[
                  ["title", "행사 제목"],
                  ["date", "행사 날짜"],
                  ["start", "시작 시간"],
                  ["area", "공개 지역"],
                  ["address", "승인 후 상세 장소"],
                  ["notice", "공지"],
                  ["fee", "기본 회비"],
                ].map(([name, label]) => (
                  <HubField key={name} label={label}>
                    <input
                      className={inputClass}
                      name={name}
                      readOnly={!!engine.value.event.campaign && ["date","start"].includes(name)}
                      type={
                        name === "date"
                          ? "date"
                          : name === "start"
                            ? "time"
                            : name === "fee"
                              ? "number"
                              : "text"
                      }
                      defaultValue={String(
                        (
                          engine.value.event as unknown as Record<
                            string,
                            unknown
                          >
                        )[name],
                      )}
                    />
                  </HubField>
                ))}
                <label className="block">
                  <input
                    type="checkbox"
                    name="benefits"
                    defaultChecked={engine.value.event.benefitsEnabled}
                  />{" "}
                  선착순 혜택 ON
                </label>
                <HubField label="가상 1~3등 할인액">
                  <input
                    name="discount"
                    className={inputClass}
                    type="number"
                    min="0"
                    defaultValue={10000}
                  />
                </HubField>
                <label className="block">
                  <input
                    type="checkbox"
                    name="cards"
                    defaultChecked={engine.value.event.cardsEnabled}
                  />{" "}
                  카드 기능 ON
                </label>
                <HubButton type="submit">가상 행사 설정 저장</HubButton>
                <p className="text-xs">
                  위의 관리할 행사 선택으로 행사별 시험 상태를 분리해 이어볼 수
                  있습니다. 새 행사 생성·자동방 예약·전체 모듈 설정은 실제 관리
                  탭에서 검증하세요.
                </p>
              </form>
            </details>
          </HubCard>
        )}
        {role === "참가자" ? (
          editing && app ? (
            <EventProfileEditor
              app={app}
              hub={userHub}
              onClose={() => setEditing(false)}
            />
          ) : !app ? (
            <BasicForm
              key={`new:${engine.value.rank}`}
              eventId={engine.value.event.id}
              hub={userHub}
              onSaved={() => setStage("공지 동의 완료")}
            />
          ) : app.stage < 4 ? (
            <ApplicationSteps
              key={`${app.id}:${app.stage}`}
              app={app}
              event={engine.value.event}
              hub={userHub}
            />
          ) : (
            <>
              <WaitingRoom
                app={app}
                event={engine.value.event}
                hub={userHub}
                edit={() => setEditing(true)}
                onEnter={() => {
                  setStage("현장 입장");
                  sync();
                }}
              />
              {engine.value.entered && (
                <HubCard>
                  <h3 className="font-black">가상 현장 입장 완료</h3>
                  <p>
                    필수 프로필·승인·회식 시작을 확인했습니다. 실제 BINPC2
                    계정은 만들지 않았습니다.
                  </p>
                  <HubButton
                    onClick={() => {
                      void mutate({
                        action: "application.draw",
                        target: app.id,
                        revision: app.revision,
                      });
                    }}
                  >
                    추가 카드 한도 검사
                  </HubButton>
                  <p>
                    카드 {app.cards.length}/
                    {engine.value.event.campaign?.kind === "tour" ? 2 : 3} ·
                    하리보 {app.candy ?? "미지급"} · 지급{" "}
                    {app.prizesGiven.length}건
                  </p>
                </HubCard>
              )}
            </>
          )
        ) : (
          <>
            {adminApp ? (
              <ApplicationAdmin
                app={adminApp}
                hub={adminHub}
                onsite={engine.value.entered}
              />
            ) : (
              <p>가상 신청을 먼저 작성하거나 가상 상태를 선택하세요.</p>
            )}
            <AdminThreads hub={adminHub} state={administrator} />
          </>
        )}
      </section>
      <HubCard>
        <HubButton onClick={() => setInquiry(!inquiry)}>
          💬 가상 관리자 문의
        </HubButton>
        {inquiry && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate({
                  action: "thread.send",
                  data: { text: draft, collection },
                })
              )
                setDraft("");
            }}
          >
            <HubField label="가상 문의 내용">
              <textarea
                className={inputClass}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </HubField>
            <HubCheck
              label="가상 문의 수집 동의"
              checked={collection}
              onChange={setCollection}
            />
            <HubButton
              disabled={!collection || !draft.trim() || status === "saving"}
              type="submit"
            >
              가상 문의 전송
            </HubButton>
          </form>
        )}
        {participant.threads[0]?.messages.map((m) => (
          <p key={m.id} className="text-sm whitespace-pre-wrap">
            {m.sender === "admin" ? "관리자" : "참가자"}: {m.text}
          </p>
        ))}
      </HubCard>
      <details>
        <summary>가상 처리 이력 ({engine.value.audit.length}건)</summary>
        <ol className="text-xs space-y-1">
          {engine.value.audit.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
