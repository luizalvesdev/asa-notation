import { describe, expect, it } from "vitest";
import { activityLevel, formatStudy, groupNotifications } from "../src/routine-logic";
import type { Notification } from "../src/routine-types";

const n = (id: string, createdAt: string): Notification => ({ id, kind: "plan", title: id, body: "", link: null, createdAt, read: false });
const now = new Date(2026, 10, 18, 12, 0);

describe("groupNotifications", () => {
  it("separa hoje, ontem e antes, na ordem recebida", () => {
    const groups = groupNotifications(
      [n("a", new Date(2026, 10, 18, 9, 0).toISOString()), n("b", new Date(2026, 10, 17, 22, 0).toISOString()), n("c", new Date(2026, 10, 10, 8, 0).toISOString()), n("d", new Date(2026, 10, 18, 8, 0).toISOString())],
      now,
    );
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([["Hoje", ["a", "d"]], ["Ontem", ["b"]], ["Antes", ["c"]]]);
  });
  it("omite grupos vazios", () => {
    expect(groupNotifications([], now)).toEqual([]);
  });
});

describe("formatStudy", () => {
  it("minutos e horas", () => {
    expect(formatStudy(0)).toBe("0 min");
    expect(formatStudy(45 * 60)).toBe("45 min");
    expect(formatStudy(6 * 3600 + 40 * 60)).toBe("6h40");
    expect(formatStudy(2 * 3600)).toBe("2h");
    expect(formatStudy(3600 + 5 * 60)).toBe("1h05");
  });
});

describe("activityLevel", () => {
  it("escala relativa ao máximo", () => {
    expect(activityLevel(0, 10)).toBe(0);
    expect(activityLevel(2, 10)).toBe(1);
    expect(activityLevel(5, 10)).toBe(2);
    expect(activityLevel(7, 10)).toBe(3);
    expect(activityLevel(10, 10)).toBe(4);
    expect(activityLevel(3, 0)).toBe(0);
  });
});
