import { describe, it, expect } from "vitest";
import {
  campaignPresets,
  campaignQuote,
  HALLOWEEN_STOCK,
  tourDates,
  tourDrawEligible,
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
  it("prepares only 16 November first-round dates, without venue-round assignment or Daegu", () => {
    expect(tourDates()).toHaveLength(16);
    for (const d of tourDates()) {
      const e = event(`tour-${d.date}`);
      expect(e.campaign?.round).toBe(1);
      expect(e.address).toBe("");
      expect(e.campaign?.advance).toBeUndefined();
    }
    expect(campaignPresets()).toHaveLength(18);
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
  drawModuleEnabled,
} from "../../../../lib/api-zod/src/event-hub-modules";
describe("soft-detached modules and KST theme expiry", () => {
  for (const [day, expiry] of [
    ["2026-10-30", "2026-10-31T01:00:00+09:00"],
    ["2026-10-31", "2026-11-01T00:30:00+09:00"],
  ])
    it(`${day} restores the base theme exactly at ${expiry}`, () => {
      const e = event(`halloween-${day}`);
      expect(eventEndAt(e)).toBe(Date.parse(expiry));
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
