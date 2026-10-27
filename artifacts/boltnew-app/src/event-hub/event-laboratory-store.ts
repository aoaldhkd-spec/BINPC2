import {
  HubBasic,
  HubConsent,
  HubEventInput,
  HubProfile,
  HUB_CONSENT_VERSION,
  PROFILE_CONSENT_VERSION,
  DEFAULT_HUB_SETTINGS,
  quoteFor,
  profileMissing,
  type HubApplication,
  type HubEvent,
} from "../../../../lib/api-zod/src/event-hub";
import {
  applicationAdmissionIssue,
  participantApplication,
} from "../../../../lib/api-zod/src/event-hub-policy";
import type {
  HubCommand,
  HubState,
  HubController,
  HubThread,
} from "../lib/event-hub-client";
export type LabStage =
  | "기본정보 작성 중"
  | "공지 동의 완료"
  | "회비 확인"
  | "입금 신고"
  | "입금 승인"
  | "입금확정 대기자"
  | "프로필 미완료"
  | "프로필 완료"
  | "현장 입장";
export type LabSnapshot = {
  version: 1;
  rank: number;
  event: HubEvent;
  applications: HubApplication[];
  thread: HubThread;
  stock: number;
  active: boolean;
  entered: boolean;
  receipts: Record<
    string,
    { signature: string; result: Record<string, unknown> }
  >;
  audit: string[];
};
const KEY = "binpc2_event_lab_v6_complete";
const full: HubApplication["profile"] = {
  mbti: "ENFP",
  interests: ["여행", "쇼핑"],
  personalityScore: 50,
  privacyConsent: {
    collection: true as const,
    sharing: true as const,
    version: PROFILE_CONSENT_VERSION,
  },
  pushDecision: "skip" as const,
  lastStep: 6,
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const stamp = () => new Date().toISOString();
function eventFixture(input?: HubEvent): HubEvent {
  return {
    ...HubEventInput.parse({
      title: "격리 선착순 체험",
      date: "2030-10-26",
      area: "가상 행사 지역",
      address: "가상 행사장 7층",
      fee: 50000,
      account: "시험 계좌 — 실제 송금 금지",
      deadline: "시험 단계에서 확인",
      notice:
        "가상 체험입니다. 실제 신청·금전·메시지·상품에는 반영되지 않습니다.",
      benefitsEnabled: true,
      benefits: [
        {
          from: 1,
          to: 3,
          type: "discount",
          value: 10000,
          label: "선착순 1~3등 혜택",
        },
      ],
      cardsEnabled: true,
    }),
    ...(input
      ? {
          fee: input.fee,
          benefitsEnabled: input.benefitsEnabled,
          benefits: copy(input.benefits),
          type: input.type,
        }
      : {}),
    id: "lab-event-only",
    revision: 1,
    recruitment: true,
    nextRank: 0,
    history: [],
  };
}
/** No fetch, live tokens, device secrets, recovery identity or production mutation client. */
export class EventLaboratoryStore {
  value: LabSnapshot;
  private listeners = new Set<() => void>();
  constructor(
    event?: HubEvent,
    readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  ) {
    this.value = this.fresh(event);
    let restored = false;
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LabSnapshot;
        if (parsed.version === 1 && parsed.event?.id === "lab-event-only") {
          this.value = parsed;
          restored = true;
        }
      }
    } catch {
      /* a failed local restore never falls back to a real API */
    }
    if (!restored) this.jump("회비 확인");
  }
  private fresh(event?: HubEvent): LabSnapshot {
    return {
      version: 1,
      rank: 3,
      event: eventFixture(event),
      applications: [],
      thread: {
        id: "lab-owner-only",
        messages: [],
        readAdminAt: "",
        readUserAt: "",
        tags: [],
        history: [],
      },
      stock: 2,
      active: false,
      entered: false,
      receipts: {},
      audit: [],
    };
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    try {
      this.storage?.setItem(
        KEY,
        JSON.stringify({
          ...this.value,
          receipts: Object.fromEntries(
            Object.entries(this.value.receipts).map(([key, r]) => [
              key,
              { signature: "", result: r.result },
            ]),
          ),
        }),
      );
    } catch {
      /* remains usable in memory; UI labels local simulation */
    }
    this.listeners.forEach((fn) => fn());
  }
  reset(event?: HubEvent) {
    this.value = this.fresh(event);
    this.emit();
  }
  configure(p: Partial<Pick<LabSnapshot, "active" | "stock" | "rank">>) {
    this.value = { ...this.value, ...p };
    if (p.rank) {
      for (const a of this.value.applications) {
        a.rank = p.rank;
        a.quote = quoteFor(this.value.event, p.rank);
      }
    }
    this.emit();
  }
  configureEvent(raw: unknown) {
    const parsed = HubEventInput.parse(raw);
    this.value.event = { ...this.value.event, ...parsed, revision: this.value.event.revision + 1 };
    // Confirmed applications keep their agreed quote, just as on the server.
    for (const app of this.value.applications) {
      if (!app.confirmedAt) app.quote = quoteFor(this.value.event, app.rank);
    }
    this.value.audit.push(`${stamp()} 가상 행사 설정 변경`);
    this.emit();
  }
  jump(stage: LabStage, rank = this.value.rank) {
    this.value = this.fresh(this.value.event);
    this.value.rank = rank;
    if (stage !== "기본정보 작성 중") {
      const a = this.create({
        nickname: "가상회원",
        birthYear: 1995,
        location: "부산",
        phone: "01000000000",
        depositor: "가상 입금자",
        collection: true,
        version: HUB_CONSENT_VERSION,
      });
      if (stage !== "공지 동의 완료") {
        a.stage = 3;
        a.consent = {
          ...HubConsent.parse({
            collection: true,
            sharing: true,
            notice: true,
            version: HUB_CONSENT_VERSION,
          }),
          acceptedAt: stamp(),
          noticeVersion: 1,
        };
      }
      if (!["공지 동의 완료", "회비 확인"].includes(stage)) {
        a.stage = 4;
        a.confirmedAt = stamp();
      }
      if (stage === "입금 신고") a.payment = "reported";
      if (
        [
          "입금 승인",
          "입금확정 대기자",
          "프로필 미완료",
          "프로필 완료",
          "현장 입장",
        ].includes(stage)
      ) {
        a.payment = "approved";
        a.approvedAt = stamp();
      }
      if (stage === "입금확정 대기자") a.attendance = "paid_waitlist";
      if (["프로필 미완료", "프로필 완료", "현장 입장"].includes(stage)) {
        a.attendance = "confirmed";
        a.checkin = true;
        this.value.active = true;
      }
      if (["프로필 완료", "현장 입장"].includes(stage)) a.profile = copy(full);
      if (stage === "현장 입장") {
        a.profileId = "lab-profile-only";
        this.value.entered = true;
      }
    }
    this.emit();
  }
  state(admin = false): HubState {
    const e = this.value.event;
    const publicEvent = { ...e };
    if (!admin) {
      for (const k of [
        "fee",
        "account",
        "address",
        "nextRank",
        "benefits",
        "history",
      ] as const)
        delete (publicEvent as unknown as Record<string, unknown>)[k];
    }
    return copy({
      hasSession: true,
      enabled: true,
      retentionDays: 180,
      events: [publicEvent],
      applications: admin
        ? this.value.applications
        : this.value.applications.map((a) => participantApplication(a, e)),
      threads: [this.value.thread],
      stocks: admin
        ? [
            {
              id: "lab-stock",
              eventId: e.id,
              label: "소품 2번",
              remaining: this.value.stock,
            },
          ]
        : [],
      settings: admin ? DEFAULT_HUB_SETTINGS : undefined,
    });
  }
  private create(raw: unknown) {
    const basic = HubBasic.parse(raw);
    const a: HubApplication = {
      id: "lab-application-only",
      eventId: this.value.event.id,
      owner: "lab-owner-only",
      revision: 1,
      stage: 2,
      rank: this.value.rank,
      basic,
      payment: "none",
      attendance: "pending",
      checkin: false,
      profile: { lastStep: 1 },
      cards: [],
      prizesGiven: [],
      history: [],
      updatedAt: stamp(),
      quote: quoteFor(this.value.event, this.value.rank),
    };
    this.value.applications.push(a);
    return a;
  }
  execute(command: HubCommand & { requestId: string }, admin = false) {
    const signature = JSON.stringify(command);
    const receiptKey = `${admin ? "admin" : "user"}:${command.requestId}`;
    const receipt = this.value.receipts[receiptKey];
    if (receipt) {
      if (receipt.signature !== signature)
        throw new Error("같은 요청번호의 내용이 다릅니다.");
      return copy(receipt.result);
    }
    const before = copy(this.value);
    try {
      const { action, data = {}, target } = command;
      const now = stamp();
      const result: Record<string, unknown> = {
        saved: true,
        requestId: command.requestId,
      };
      if ((action.startsWith("admin.") || action === "stock.save") && !admin)
        throw new Error("관리자만 처리할 수 있습니다.");
      if (action === "application.basic") {
        let a = this.value.applications[0];
        if (!a) a = this.create(data.basic);
        else if (data.edit === true) {
          if (command.revision !== a.revision)
            throw new Error("최신 변경이 있습니다.");
          a.basic = HubBasic.parse(data.basic);
          a.revision++;
        }
        result.id = a.id;
      } else if (
        action.startsWith("application.") ||
        action.startsWith("admin.application.")
      ) {
        const a = this.value.applications.find((a) => a.id === target);
        if (!a) throw new Error("가상 신청을 찾을 수 없습니다.");
        if (a.revision !== command.revision)
          throw new Error("최신 변경이 있습니다. 화면을 확인해 주세요.");
        const e = this.value.event;
        switch (action) {
          case "application.consent":
            a.consent = {
              ...HubConsent.parse(data.consent),
              acceptedAt: now,
              noticeVersion: e.noticeVersion,
            };
            if (a.consent.reuse && String(data.password ?? "").length < 10)
              throw new Error("비밀번호는 10자 이상입니다.");
            a.stage = 3;
            break;
          case "application.confirm":
            if (a.stage !== 3 || !a.consent)
              throw new Error("공지와 회비를 확인해 주세요.");
            a.stage = 4;
            a.confirmedAt = now;
            break;
          case "application.report":
            if (!a.confirmedAt) throw new Error("신청 확정이 필요합니다.");
            if (a.payment !== "approved") {
              a.payment = "reported";
              a.reportedAt ??= now;
            }
            break;
          case "application.profile":
            a.profile = { ...a.profile, ...HubProfile.parse(data.profile) };
            break;
          case "application.notice":
            if (a.consent) a.consent.noticeVersion = e.noticeVersion;
            break;
          case "admin.application.payment":
            if (!a.confirmedAt) throw new Error("신청 확정이 필요합니다.");
            if (data.status === "approved" && data.bankChecked !== true)
              throw new Error("가상 은행 대조 확인이 필요합니다.");
            if (a.payment === "approved" && data.status !== "approved")
              throw new Error("승인을 되돌릴 수 없습니다.");
            a.payment = data.status as HubApplication["payment"];
            if (a.payment === "approved") a.approvedAt = now;
            break;
          case "admin.application.attendance":
            if (a.payment !== "approved")
              throw new Error("입금 확인 후 처리할 수 있습니다.");
            a.attendance = data.status as HubApplication["attendance"];
            break;
          case "admin.application.checkin":
            if (a.payment !== "approved" || a.attendance !== "confirmed")
              throw new Error("참가 확정 후 현장 확인하세요.");
            a.checkin = data.checked === true;
            break;
          case "admin.application.note":
            if (!String(data.reason ?? "").trim())
              throw new Error("사유가 필요합니다.");
            break;
          case "admin.application.reprice":
            if (!String(data.reason ?? "").trim())
              throw new Error("사유가 필요합니다.");
            a.quote = {
              ...a.quote!,
              fee: Number(data.fee),
              benefit: "관리자 조정",
            };
            break;
          case "application.enter": {
            const issue = applicationAdmissionIssue(a, e);
            if (issue) throw new Error(issue.message);
            if (!this.value.active)
              throw new Error("관리자의 회식 시작 후 입장할 수 있습니다.");
            a.profileId ??= "lab-profile-only";
            this.value.entered = true;
            result.profile = { id: a.profileId };
            break;
          }
          case "application.draw":
            if (
              !e.cardsEnabled ||
              !a.profileId ||
              a.payment !== "approved" ||
              !this.value.active
            )
              throw new Error("현장 입장 후 뽑을 수 있습니다.");
            if (a.cards.length >= 3)
              throw new Error("행사별 카드는 3장까지 뽑을 수 있습니다.");
            {
              const prize =
                this.value.stock > 0
                  ? "lab-event-only:소품 2번"
                  : "다음 기회에";
              if (this.value.stock > 0) this.value.stock--;
              a.cards.push({
                id: `lab-card-${a.cards.length + 1}`,
                prize,
                at: now,
              });
            }
            break;
          case "admin.application.candy":
            if (!a.checkin || a.candy)
              throw new Error("현장 확인 후 두 종류 중 한 개만 지급합니다.");
            a.candy = data.kind as string;
            break;
          case "admin.application.prize":
            if (
              !a.cards.some(
                (c) => c.id === data.cardId && c.prize !== "다음 기회에",
              ) ||
              a.prizesGiven.includes(String(data.cardId))
            )
              throw new Error("당첨이 없거나 이미 지급했습니다.");
            a.prizesGiven.push(String(data.cardId));
            break;
          default:
            throw new Error("지원하지 않는 가상 동작입니다.");
        }
        a.revision++;
        a.updatedAt = now;
        a.history.push({
          actor: admin ? "admin" : "lab-owner-only",
          action,
          at: now,
          reason: typeof data.reason === "string" ? data.reason : undefined,
        });
        result.id = a.id;
      } else if (action === "thread.send") {
        if (!admin && data.collection !== true)
          throw new Error("문의 수집 동의가 필요합니다.");
        const text = String(data.text ?? "").trim();
        if (!text) throw new Error("문의 내용을 입력하세요.");
        this.value.thread.messages.push({
          id: command.requestId,
          sender: admin ? "admin" : "user",
          text,
          at: now,
        });
      } else if (action === "thread.read") {
        if (admin) this.value.thread.readAdminAt = now;
        else this.value.thread.readUserAt = now;
      } else if (action === "thread.tag")
        this.value.thread.tags = data.tags as string[];
      else if (action === "stock.save") this.value.stock += Number(data.add);
      else throw new Error("지원하지 않는 가상 동작입니다.");
      this.value.receipts[receiptKey] = { signature, result };
      this.value.audit.push(`${now} ${action}`);
      this.emit();
      return copy(result);
    } catch (error) {
      this.value = before;
      throw error;
    }
  }
}
