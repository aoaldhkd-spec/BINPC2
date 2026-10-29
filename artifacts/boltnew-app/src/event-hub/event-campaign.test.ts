import { describe, it, expect } from "vitest";
import {
  campaignPresets,
  campaignQuote,
  HALLOWEEN_STOCK,
  tourDates,
  tourDrawEligible,
  tourSessionSchedule,
  campaignInitialStocks,
} from "../../../../lib/api-zod/src/event-campaign";
import {
  HubEventInput,
  type HubEvent,
} from "../../../../lib/api-zod/src/event-hub";
const event = (key: string): HubEvent => ({
  ...HubEventInput.parse(campaignPresets().find((p) => p.key === key)!.event),
  id: key,
  revision: 1,
  recruitment: false,
  nextRank: 0,
  history: [],
});
describe("latest campaign policy, never the V7 draft", () => {
  for (const [day, prices] of [
    [
      "2026-10-30",
      [0, 12000, 14000, 16000, 16000, 18000, 18000, 18000, 18000, 18000],
    ],
    [
      "2026-10-31",
      [
        0, 10000, 10000, 13000, 13000, 15000, 15000, 15000, 15000, 15000, 18000,
        18000, 18000, 18000, 18000,
      ],
    ],
  ] as const) {
    for (const [index, price] of prices.entries())
      it(`${day} effective rank ${index + 1} has ${price} fixed fee without stacking`, () => {
        const e = event(`halloween-${day}`);
        expect(
          campaignQuote(e, index + 1, new Date(day + "T20:00:00+09:00")).fee,
        ).toBe(price);
        expect(
          campaignQuote(e, index + 1, new Date(day + "T21:00:00+09:00")).fee,
        ).toBe(price);
      });
    it(`${day} applies strict KST 21:00 boundary outside ranked benefits`, () => {
      const e = event(`halloween-${day}`);
      expect(
        campaignQuote(e, 100, new Date(day + "T20:59:59.999+09:00")).fee,
      ).toBe(day.endsWith("30") ? 20000 : 22000);
      expect(campaignQuote(e, 100, new Date(day + "T21:00:00+09:00")).fee).toBe(
        day.endsWith("30") ? 23000 : 25000,
      );
    });
  }
  it("keeps exact 23/49/72 inventory and Friday zero bands", () => {
    expect(
      Object.values(HALLOWEEN_STOCK["2026-10-30"]).reduce((a, b) => a + b, 0),
    ).toBe(23);
    expect(
      Object.values(HALLOWEEN_STOCK["2026-10-31"]).reduce((a, b) => a + b, 0),
    ).toBe(49);
    expect(HALLOWEEN_STOCK["2026-10-30"]["LED 밴드"]).toBe(0);
  });
  it("preserves the 16 November dates and adds exactly four confirmed Daegu first-round dates", () => {
    expect(tourDates()).toHaveLength(20);
    expect(tourDates().filter((d) => d.date.startsWith("2026-11"))).toHaveLength(16);
    expect(tourDates().filter((d) => d.region === "대구").map((d) => d.date)).toEqual(["2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    for (const d of tourDates()) {
      const e = event(`tour-${d.date}`);
      expect(e.campaign?.round).toBe(1);
      expect(e.address).toBe("");
      expect(e.campaign?.advance).toBe(10000); // Latest user-confirmed tour advance; Halloween remains fixed-fee.
    }
    expect(campaignPresets()).toHaveLength(22);
  });
  it("uses exact KST midnight rollover for all four BLACK days without inventing a third-round end", () => {
    for (const [date, start, firstEnd, secondEnd] of [
      ["2026-12-03", "21:00", "2026-12-03T23:30", "2026-12-04T01:30"],
      ["2026-12-04", "22:00", "2026-12-05T00:30", "2026-12-05T02:30"],
      ["2026-12-05", "22:00", "2026-12-06T00:30", "2026-12-06T02:30"],
      ["2026-12-06", "21:00", "2026-12-06T23:30", "2026-12-07T01:30"],
    ]) {
      const schedule = tourSessionSchedule(date)!;
      expect(schedule.first.startsAt).toBe(new Date(`${date}T${start}:00+09:00`).toISOString());
      expect(schedule.first.endsAt).toBe(new Date(`${firstEnd}:00+09:00`).toISOString());
      expect(schedule.second.startsAt).toBe(schedule.first.endsAt);
      expect(schedule.second.endsAt).toBe(new Date(`${secondEnd}:00+09:00`).toISOString());
      expect(schedule.third).toEqual({ startsAt: schedule.second.endsAt, endsAt: null });
      expect(event(`tour-${date}`).venueLogoId).toBe("black");
    }
  });
  it("never describes a tour advance as a final fixed fee", () => {
    const e = event("tour-2026-11-06");
    e.campaign!.advance = 17000;
    expect(campaignQuote(e, 1, new Date())).toMatchObject({
      fee: 17000,
      kind: "advance",
    });
    expect(campaignQuote(e, 15, new Date()).fee).toBe(17000);
  });
  for (const date of ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"])
    it(`${date} enforces Friday/Saturday first-10 drawing only`, () => {
      const e = event(`tour-${date}`);
      const allowed = date.endsWith("06") || date.endsWith("07");
      expect(tourDrawEligible(e, { rank: 10 })).toBe(allowed);
      expect(tourDrawEligible(e, { rank: 11 })).toBe(false);
      expect(tourDrawEligible(e, { rank: 1, benefitExcluded: true })).toBe(
        false,
      );
      const stocks = campaignInitialStocks(e);
      expect(stocks.reduce((a, s) => a + s.remaining, 0)).toBe(
        allowed ? 10 : 0,
      );
      expect(
        stocks.reduce((a, s) => a + s.remaining * (s.coupon ?? 0), 0),
      ).toBe(allowed ? 30000 : 0);
    });
  it("rejects tour rounds two and three at the input schema", () => {
    const e = event("tour-2026-11-06");
    for (const round of [2, 3])
      expect(() =>
        HubEventInput.parse({ ...e, campaign: { ...e.campaign, round } }),
      ).toThrow();
  });
});

import {
  effectiveEventTheme,
  eventEndAt,
  eventExpiryAt,
  drawModuleEnabled,
} from "../../../../lib/api-zod/src/event-hub-modules";
describe("soft-detached modules and KST theme expiry", () => {
  for (const [day, expiry] of [
    ["2026-10-30", "2026-10-31T17:00:00+09:00"],
    ["2026-10-31", "2026-11-01T17:00:00+09:00"],
  ])
    it(`${day} restores the base theme exactly at ${expiry}`, () => {
      const e = event(`halloween-${day}`);
      expect(eventExpiryAt(e)).toBe(Date.parse(expiry));
      expect(eventEndAt(e)).toBe(Date.parse(expiry) - 16 * 3600000);
      expect(effectiveEventTheme(e, new Date(Date.parse(expiry) - 1))).toBe(
        "halloween",
      );
      expect(effectiveEventTheme(e, new Date(expiry))).toBe("default");
      expect(
        effectiveEventTheme(
          { ...e, themeEnabled: false },
          new Date(Date.parse(expiry) - 1),
        ),
      ).toBe("default");
      expect(
        effectiveEventTheme(
          { ...e, type: "normal" },
          new Date(Date.parse(expiry) - 1),
        ),
      ).toBe("default");
    });
  it("disables Halloween drawing independently while preserving tour and normal policies", () => {
    const h = event("halloween-2026-10-31"),
      t = event("tour-2026-11-06");
    const flags = { campaignModules: { halloweenDraw: false, tourDraw: true } };
    expect(drawModuleEnabled(h, flags)).toBe(false);
    expect(drawModuleEnabled(t, flags)).toBe(true);
    expect(
      drawModuleEnabled({ ...h, type: "normal", campaign: undefined }, flags),
    ).toBe(true);
    expect(
      drawModuleEnabled(t, {
        campaignModules: { halloweenDraw: true, tourDraw: false },
      }),
    ).toBe(false);
  });
});

it("V3 corrects an existing Saturday 00:30 draft to 01:00 while keeping tour's distinct end",()=>{
 const legacy={...event("halloween-2026-10-31"),end:"00:30"};
 expect(eventEndAt(legacy)).toBe(Date.parse("2026-11-01T01:00:00+09:00"));
 expect(eventExpiryAt(legacy)).toBe(Date.parse("2026-11-01T17:00:00+09:00"));
 const tour=event("tour-2026-11-06");
 expect(eventEndAt(tour)).toBe(Date.parse("2026-11-07T00:30:00+09:00"));
 const saturday=event("halloween-2026-10-31");
 expect(effectiveEventTheme(saturday,new Date("2026-10-31T17:00:00+09:00"))).toBe("halloween");
});

describe("Halloween recognized costume fees choose one lowest eligible amount", () => {
  for (const [date, rank, recognition, fee] of [
    ["2026-10-30", 1, "costume", 0],
    ["2026-10-30", 2, "costume", 12000],
    ["2026-10-30", 3, "costume", 14000],
    ["2026-10-30", 4, "costume", 15000],
    ["2026-10-30", 6, "costume", 15000],
    ["2026-10-30", 4, "painting-sticker", 16000],
    ["2026-10-30", 11, "painting-sticker", 18000],
    ["2026-10-31", 1, "painting-sticker", 0],
    ["2026-10-31", 3, "costume", 10000],
    ["2026-10-31", 5, "costume", 13000],
    ["2026-10-31", 6, "costume", 15000],
    ["2026-10-31", 11, "costume", 15000],
    ["2026-10-31", 11, "painting-sticker", 18000],
    ["2026-10-31", 16, "painting-sticker", 18000],
  ] as const) {
    it(`${date} rank ${rank} with ${recognition} pays ${fee} without stacking`, () => {
      const e = event(`halloween-${date}`);
      for (const time of ["20:59:59.999", "21:00:00"]) {
        expect(campaignQuote(e, rank, new Date(`${date}T${time}+09:00`), recognition).fee).toBe(fee);
      }
    });
  }

  for (const [date, early, regular] of [["2026-10-30", 20000, 23000], ["2026-10-31", 22000, 25000]] as const) {
    it(`${date} never awards an unrecognized costume fee or an invalid rank benefit`, () => {
      const e = event(`halloween-${date}`);
      for (const rank of [0, 100]) {
        expect(campaignQuote(e, rank, new Date(`${date}T20:59:59.999+09:00`)).fee).toBe(early);
        expect(campaignQuote(e, rank, new Date(`${date}T21:00:00+09:00`), "none").fee).toBe(regular);
      }
    });
  }

  it("keeps tour advances independent of Halloween operator recognition", () => {
    const e = event("tour-2026-11-06");
    e.campaign!.advance = 17000;
    expect(campaignQuote(e, 1, new Date(), "costume")).toMatchObject({ fee: 17000, kind: "advance" });
  });
});
