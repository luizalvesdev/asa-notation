import { describe, expect, it } from "vitest";
import { todaySummary } from "../src/CheckinReport";

describe("resumo do check-in", () => {
  it("revisões, % lembrados e minutos de hoje, e quantos cards amanhã", () => {
    const stats = { days: [{ day: "2026-11-18", reviews: 9, seconds: 60, remembered: 9 }, { day: "2026-11-19", reviews: 8, seconds: 250, remembered: 6 }], upcoming: [{ day: "2026-11-20", due: 5 }] };
    expect(todaySummary(stats, "2026-11-19")).toEqual({ reviews: 8, remembered: 75, minutes: 4, tomorrow: 5 });
    expect(todaySummary({ days: [], upcoming: [] }, "2026-11-19")).toEqual({ reviews: 0, remembered: null, minutes: 0, tomorrow: 0 });
  });
});
