import { describe, expect, it } from "vitest";
import { applyDone, applySubtaskDone, groupByDate, maskTime, normalizeTime, parseQuickAdd, progress } from "../src/tasks-logic";
import type { TaskItem, TaskList } from "../src/tasks-types";

const task = (over: Partial<TaskItem>): TaskItem => ({ id: "a", title: "A", date: "2026-11-18", time: null, recurrence: null, done: false, goalId: null, goalTitle: null, subtasks: [], ...over });

describe("progress", () => {
  it("conta concluídas e arredonda", () => {
    expect(progress([task({ done: true }), task({ id: "b" }), task({ id: "c" })])).toEqual({ done: 1, total: 3, pct: 33 });
  });
  it("lista vazia dá 0%", () => {
    expect(progress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe("applyDone", () => {
  const list: TaskList = {
    days: [task({ id: "r", recurrence: "daily", date: "2026-11-18" }), task({ id: "r", recurrence: "daily", date: "2026-11-19" }), task({ id: "p" })],
    late: [task({ id: "p" })],
    undated: [],
  };

  it("recorrente marca só o dia pedido", () => {
    const next = applyDone(list, "r", "2026-11-19", true);
    expect(next.days.map((t) => t.done)).toEqual([false, true, false]);
  });

  it("simples marca em todas as listas e não muda a original", () => {
    const next = applyDone(list, "p", null, true);
    expect(next.days[2]!.done).toBe(true);
    expect(next.late[0]!.done).toBe(true);
    expect(list.days[2]!.done).toBe(false);
  });
});

describe("applySubtaskDone", () => {
  it("marca a subtarefa certa", () => {
    const parent = task({ subtasks: [{ id: "s1", title: "1", done: false }, { id: "s2", title: "2", done: false }] });
    const next = applySubtaskDone({ days: [parent], late: [], undated: [] }, "s2", true);
    expect(next.days[0]!.subtasks.map((s) => s.done)).toEqual([false, true]);
  });
});

describe("groupByDate", () => {
  it("agrupa por dia e ignora sem data", () => {
    const map = groupByDate([task({ id: "1" }), task({ id: "2", date: "2026-11-19" }), task({ id: "3" }), task({ id: "4", date: null })]);
    expect([...map.keys()]).toEqual(["2026-11-18", "2026-11-19"]);
    expect(map.get("2026-11-18")!.map((t) => t.id)).toEqual(["1", "3"]);
  });
});

describe("parseQuickAdd", () => {
  it("texto simples", () => {
    expect(parseQuickAdd("  Comprar pão ")).toEqual({ title: "Comprar pão", time: null, recurrence: null });
  });
  it("hora no início, em três formatos", () => {
    expect(parseQuickAdd("14:00 Revisar cards")).toMatchObject({ title: "Revisar cards", time: "14:00" });
    expect(parseQuickAdd("9h30 Daily")).toMatchObject({ title: "Daily", time: "09:30" });
    expect(parseQuickAdd("7h Corrida")).toMatchObject({ title: "Corrida", time: "07:00" });
  });
  it("recorrência no fim", () => {
    expect(parseQuickAdd("Treino /diaria")).toEqual({ title: "Treino", time: null, recurrence: "daily" });
    expect(parseQuickAdd("19:00 Treino /UTEIS")).toEqual({ title: "Treino", time: "19:00", recurrence: "weekdays" });
    expect(parseQuickAdd("Planejar /semanal")).toMatchObject({ recurrence: "weekly" });
  });
  it("número que não é hora fica no título", () => {
    expect(parseQuickAdd("25 cards de Raft")).toMatchObject({ title: "25 cards de Raft", time: null });
    expect(parseQuickAdd("2026 metas")).toMatchObject({ time: null });
  });
  it("só espaços vira null; hora ou token sozinhos viram título", () => {
    expect(parseQuickAdd("   ")).toBeNull();
    expect(parseQuickAdd("14:00 ")).toMatchObject({ title: "14:00", time: null });
    expect(parseQuickAdd("/diaria")).toMatchObject({ title: "/diaria", recurrence: null });
  });
});

describe("campo de hora", () => {
  it("máscara coloca os dois pontos e limita a 4 dígitos", () => {
    expect(maskTime("1")).toBe("1");
    expect(maskTime("143")).toBe("14:3");
    expect(maskTime("1430")).toBe("14:30");
    expect(maskTime("14:30999")).toBe("14:30");
    expect(maskTime("ab9")).toBe("9");
  });
  it("normaliza o que foi digitado", () => {
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("14")).toBe("14:00");
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("14:30")).toBe("14:30");
    expect(normalizeTime("24")).toBeNull();
    expect(normalizeTime("1260")).toBeNull();
  });
});
