import { describe, expect, it } from "vitest";
import {
  campaignPresets,
  HUB_CONSENT_VERSION,
  HubEventInput,
  participantApplication,
  quoteFor,
  type HubApplication,
  type HubEvent,
} from "@workspace/api-zod";
import { applyApplicationOperation } from "./event-operations.js";

const reviewedAt = new Date("2026-10-30T22:30:00+09:00");
const event = (date = "2026-10-30"): HubEvent => ({
  ...HubEventInput.parse(
    campaignPresets().find((p) => p.key === `halloween-${date}`)!.event,
  ),
  id: `halloween-${date}`,
  revision: 1,
  recruitment: true,
  nextRank: 100,
  history: [],
});
const application = (
  e: HubEvent,
  rank = 100,
  appliedAt = `${e.date}T20:59:59.999+09:00`,
): HubApplication => ({
  id: "synthetic-application",
  eventId: e.id,
  owner: "synthetic-owner",
  revision: 1,
  stage: 3,
  rank,
  benefitRank: rank,
  basic: {
    nickname: "합성검사",
    birthYear: 1995,
    location: "부산",
    phone: "01000000000",
    depositor: "합성검사",
    collection: true,
    version: HUB_CONSENT_VERSION,
  },
  quote: quoteFor(e, rank, new Date(appliedAt)),
  payment: "none",
  attendance: "pending",
  checkin: false,
  profile: { lastStep: 1 },
  cards: [],
  prizesGiven: [],
  history: [{ actor: "synthetic-owner", action: "application.basic", at: appliedAt }],
  updatedAt: appliedAt,
});
const recognize = (
  a: HubApplication,
  e: HubEvent,
  kind = "costume",
  admin = true,
  reason = "현장 운영자 확인 · 내부 기록",
) => applyApplicationOperation(a, e, "admin.application.costume", { kind, reason }, new Date(`${e.date}T22:30:00+09:00`), admin);

describe("Halloween operator recognition through the existing application engine", () => {
  it("requires administrator recognition and validates the decision before changing the application", () => {
    const e = event(), a = application(e), original = structuredClone(a);
    expect(() => recognize(a, e, "costume", false)).toThrowError(expect.objectContaining({ code: "ADMIN" }));
    expect(() => recognize(a, e, "self-approved")).toThrow();
    expect(() => recognize(a, e, "costume", true, "   ")).toThrow();
    expect(a).toEqual(original);
  });

  it("refuses recognition for ordinary and tour events", () => {
    const e = event(), a = application(e);
    for (const campaign of [undefined, { kind: "tour", round: 1, secondRoundLink: "", advance: 17000 }] as const) {
      expect(() => recognize(a, { ...e, campaign })).toThrowError(expect.objectContaining({ code: "HALLOWEEN_POLICY" }));
    }
    expect(a.halloweenRecognition).toBeUndefined();
  });

  it("records the recognized minimum, its final fee, private reason and participant notice", () => {
    const e = event(), a = application(e, 4);
    expect(recognize(a, e)).toBe(true);
    expect(a.quote).toMatchObject({ fee: 15000, original: 23000, kind: "fixed" });
    expect(a.halloweenRecognition).toMatchObject({ kind: "costume", finalFee: 15000, proposedFee: 15000 });
    expect(a.halloweenRecognition?.participantNotice).toContain("15,000원");
    const record = a.history.find((h) => h.action === "admin.halloween.recognition")!;
    expect(record.actor).toBe("admin");
    expect(JSON.parse(record.reason!)).toMatchObject({
      reason: "현장 운영자 확인 · 내부 기록",
      previousFee: 16000,
      finalFee: 15000,
      kind: "costume",
      participantNotice: a.halloweenRecognition?.participantNotice,
    });
  });

  it("preserves a cheaper ranked fee and never substitutes a positive costume fee for free admission", () => {
    const e = event();
    for (const [rank, fee] of [[1, 0], [2, 12000], [3, 14000]]) {
      const a = application(e, rank);
      recognize(a, e);
      expect(a.quote?.fee).toBe(fee);
      expect(a.payment).toBe("none");
      expect(a.waivedAt).toBeUndefined();
      expect(a.attendance).toBe("pending");
      expect(a.checkin).toBe(false);
    }
  });

  it("does not restore an excluded rank discount when recognizing a costume", () => {
    const e = event(), a = application(e, 2);
    a.benefitExcluded = true;
    recognize(a, e);
    expect(a.quote?.fee).toBe(15000);
    expect(a.benefitExcluded).toBe(true);
  });

  it("keeps an existing zero fee even when rank benefits are disabled before costume review", () => {
    const e = event(), a = application(e, 1);
    recognize(a, { ...e, benefitsEnabled: false });
    expect(a.quote?.fee).toBe(0);
    expect(a.waivedAt).toBeUndefined();
    expect(a.halloweenRecognition).toMatchObject({ finalFee: 0, proposedFee: 15000 });
    expect(a.differenceReview).toMatchObject({ previous: 0, proposed: 15000 });
  });

  for (const [name, fields] of [
    ["confirmed", { confirmedAt: reviewedAt.toISOString() }],
    ["reported", { payment: "reported", reportedAt: reviewedAt.toISOString() }],
    ["approved", { payment: "approved", approvedAt: reviewedAt.toISOString() }],
    ["previously reported", { reportedAt: reviewedAt.toISOString() }],
    ["held", { payment: "held" }],
    ["mismatch", { payment: "mismatch" }],
  ] as const) {
    it(`keeps the ${name} fee and payment snapshot while recording the proposed minimum`, () => {
      const e = event(), a = { ...application(e), ...fields }, quote = structuredClone(a.quote);
      recognize(a, e);
      expect(a.quote).toEqual(quote);
      expect(a).toMatchObject(fields);
      expect(a.differenceReview).toMatchObject({ previous: 20000, proposed: 15000 });
      expect(a.halloweenRecognition).toMatchObject({ finalFee: 20000, proposedFee: 15000 });
      expect(a.halloweenRecognition?.participantNotice).toContain("기존 확정 금액 20,000원 유지");
    });
  }

  it("preserves an already granted free waiver even when recognition is removed", () => {
    const e = event(), a = application(e, 1);
    a.waivedAt = reviewedAt.toISOString();
    const quote = structuredClone(a.quote);
    recognize(a, e);
    recognize(a, e, "none");
    expect(a.quote).toEqual(quote);
    expect(a.quote?.fee).toBe(0);
    expect(a.waivedAt).toBe(reviewedAt.toISOString());
    expect(a.payment).toBe("none");
  });

  it("clears an obsolete proposal when removed recognition returns to the frozen payment amount", () => {
    const e = event(), a = application(e);
    a.confirmedAt = reviewedAt.toISOString();
    a.payment = "approved";
    a.approvedAt = reviewedAt.toISOString();
    recognize(a, e);
    expect(a.differenceReview).toMatchObject({ previous: 20000, proposed: 15000 });
    recognize(a, e, "none");
    expect(a.quote?.fee).toBe(20000);
    expect(a.payment).toBe("approved");
    expect(a.differenceReview).toBeUndefined();
    expect(a.halloweenRecognition).toMatchObject({ kind: "none", finalFee: 20000, proposedFee: 20000 });
    expect(a.halloweenRecognition?.participantNotice).not.toContain("15,000");
  });

  for (const [date, before, boundary] of [["2026-10-30", 20000, 23000], ["2026-10-31", 22000, 25000]] as const) {
    it(`${date} uses original application time at the strict 21:00 boundary when recognition is removed`, () => {
      const e = event(date);
      for (const [time, expectedFee] of [["20:59:59.999", before], ["21:00:00", boundary]] as const) {
        const a = application(e, 100, `${date}T${time}+09:00`);
        recognize(a, e);
        expect(a.quote?.fee).toBe(15000);
        recognize(a, e, "none");
        expect(a.quote?.fee).toBe(expectedFee);
      }
    });
  }

  it("shows only the public recognition notice after consent and keeps the internal reason out of participant history", () => {
    const e = event(), a = application(e);
    recognize(a, e);
    let visible = participantApplication(a, e);
    expect(visible.halloweenRecognition?.participantNotice).toBe(a.halloweenRecognition?.participantNotice);
    expect(visible.billing?.quote.fee).toBe(15000);
    expect(JSON.stringify(visible)).not.toContain("현장 운영자 확인 · 내부 기록");
    expect(visible.history.some((h) => h.action === "admin.halloween.recognition")).toBe(false);
    a.stage = 2;
    visible = participantApplication(a, e);
    expect(visible).not.toHaveProperty("halloweenRecognition");
    expect(visible).not.toHaveProperty("billing");
    expect(visible).not.toHaveProperty("quote");
  });
});
