import { describe, expect, it } from "vitest";
import { addDays, formatHeading, formatWeekRange, formatWhen, localDate, weekDates, weekStart, weekdayShort } from "../src/tasks-dates";

describe("tasks-dates", () => {
  it("localDate usa o dia local, não UTC", () => {
    expect(localDate(new Date(2026, 10, 18, 23, 30))).toBe("2026-11-18");
    expect(localDate(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });

  it("weekStart devolve a segunda-feira, inclusive para domingo", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16"); // quarta
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // segunda
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // domingo
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });

  it("weekDates lista 7 dias atravessando o mês", () => {
    expect(weekDates("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formata o título do dia", () => {
    expect(formatHeading("2026-11-18")).toBe("quarta, 18 de novembro");
    expect(formatHeading("2026-11-21")).toBe("sábado, 21 de novembro");
  });

  it("formata o intervalo da semana", () => {
    expect(formatWeekRange("2026-11-16")).toBe("16 a 22 de novembro");
    expect(formatWeekRange("2026-11-30")).toBe("30 de nov a 6 de dez");
  });

  it("nomes curtos dos dias não levam ponto", () => {
    expect(weekdayShort("2026-11-16")).toBe("seg");
    expect(weekdayShort("2026-11-21")).toBe("sáb");
  });

  it("formatWhen usa palavras para perto e data curta para longe", () => {
    expect(formatWhen("2026-11-18", "2026-11-18")).toBe("hoje");
    expect(formatWhen("2026-11-17", "2026-11-18")).toBe("ontem");
    expect(formatWhen("2026-11-19", "2026-11-18")).toBe("amanhã");
    expect(formatWhen("2026-11-16", "2026-11-18")).toBe("seg, 16 nov");
  });
});
