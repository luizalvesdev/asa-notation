import { describe, expect, it } from "vitest";
import { formatAgo } from "../src/time-utils";

const now = new Date(2026, 10, 18, 12, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("formatAgo", () => {
  it("minutos, horas, ontem e data", () => {
    expect(formatAgo(ago(10_000), now)).toBe("agora");
    expect(formatAgo(ago(5 * 60_000), now)).toBe("há 5 min");
    expect(formatAgo(ago(3 * 3_600_000), now)).toBe("há 3 h");
    expect(formatAgo(new Date(2026, 10, 17, 23, 0).toISOString(), now)).toBe("ontem");
    expect(formatAgo(new Date(2026, 10, 10, 9, 0).toISOString(), now)).toBe("10 nov");
  });
});
