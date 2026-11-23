import { describe, expect, it } from "vitest";
import { goalExcess, goalPct, goalStatus, progressLabel } from "../src/goals-logic";
import type { Goal } from "../src/goals-types";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g",
  title: "G",
  description: "",
  dueDate: "2026-12-01",
  done: false,
  createdAt: "2026-11-01T12:00:00.000Z",
  tasksTotal: 10,
  tasksDone: 5,
  page: null,
  target: null,
  checked: 0,
  checkboxes: 0,
  ...over,
});

describe("goalPct", () => {
  it("arredonda e trata meta sem tarefas", () => {
    expect(goalPct({ tasksTotal: 12, tasksDone: 5 })).toBe(42);
    expect(goalPct({ tasksTotal: 0, tasksDone: 0 })).toBe(0);
  });
});

describe("goalStatus", () => {
  // Criada em 1/nov, prazo 1/dez: 30 dias. Em 16/nov passou 50%.
  const today = "2026-11-16";

  it("concluída vence qualquer outra regra", () => {
    expect(goalStatus(goal({ done: true, tasksDone: 0 }), "2027-01-01")).toBe("concluida");
  });

  it("no ritmo quando o progresso acompanha o tempo", () => {
    expect(goalStatus(goal({ tasksDone: 5 }), today)).toBe("ritmo");
    expect(goalStatus(goal({ tasksDone: 4 }), today)).toBe("ritmo"); // 10 pontos abaixo ainda vale
  });

  it("atrás entre 10 e 30 pontos abaixo", () => {
    expect(goalStatus(goal({ tasksDone: 3 }), today)).toBe("atras");
    expect(goalStatus(goal({ tasksDone: 2 }), today)).toBe("atras");
  });

  it("em risco com mais de 30 pontos abaixo", () => {
    expect(goalStatus(goal({ tasksDone: 1 }), today)).toBe("risco");
  });

  it("prazo vencido sem concluir é em risco, mesmo com 100% das tarefas", () => {
    expect(goalStatus(goal({ tasksDone: 10 }), "2026-12-02")).toBe("risco");
  });

  it("sem prazo fica no ritmo", () => {
    expect(goalStatus(goal({ dueDate: null, tasksDone: 0 }), today)).toBe("ritmo");
  });

  it("meta recém-criada não nasce atrasada", () => {
    expect(goalStatus(goal({ createdAt: "2026-11-16T09:00:00.000Z", tasksTotal: 0, tasksDone: 0 }), today)).toBe("ritmo");
  });

  it("criada e vencendo no mesmo dia não divide por zero", () => {
    expect(goalStatus(goal({ dueDate: "2026-11-16", createdAt: "2026-11-16T09:00:00.000Z", tasksDone: 0 }), today)).toBe("ritmo");
  });
});

describe("progressLabel", () => {
  it("singular, plural e vazio", () => {
    expect(progressLabel({ tasksTotal: 12, tasksDone: 5 })).toBe("5 de 12 tarefas");
    expect(progressLabel({ tasksTotal: 1, tasksDone: 0 })).toBe("0 de 1 tarefa");
    expect(progressLabel({ tasksTotal: 0, tasksDone: 0 })).toBe("sem tarefas");
  });
});

describe("meta ligada a uma página", () => {
  const page = { id: "p", title: "Livros que li" };
  const linked = (over: Partial<Goal>) => goal({ page, tasksDone: 0, tasksTotal: 0, ...over });

  it("o progresso vem dos checkboxes; sem alvo, o alvo é o total de caixinhas", () => {
    const g = linked({ checked: 7, checkboxes: 48 });
    expect(goalPct(g)).toBe(15);
    expect(progressLabel(g)).toBe("7 de 48 itens");
  });

  it("alvo fixo vale mais que o total de caixinhas", () => {
    const g = linked({ checked: 12, checkboxes: 12, target: 30 });
    expect(goalPct(g)).toBe(40);
    expect(progressLabel(g)).toBe("12 de 30 itens");
  });

  it("bateu o alvo: meta batida; passou: mostra o excedente e a barra para em 100%", () => {
    const exact = linked({ checked: 30, checkboxes: 30, target: 30 });
    expect(goalStatus(exact, "2026-11-16")).toBe("batida");
    expect(goalExcess(exact)).toBe(0);
    const over = linked({ checked: 31, checkboxes: 31, target: 30 });
    expect(goalStatus(over, "2026-11-16")).toBe("batida");
    expect(goalPct(over)).toBe(100);
    expect(goalExcess(over)).toBe(1);
    expect(progressLabel(over)).toBe("31 de 30 itens · excedente de 1");
  });

  it("concluída à mão continua vencendo; página sem caixinhas não é meta batida", () => {
    expect(goalStatus(linked({ done: true, checked: 1, checkboxes: 1 }), "2026-11-16")).toBe("concluida");
    const empty = linked({ checked: 0, checkboxes: 0 });
    expect(goalStatus(empty, "2026-11-16")).not.toBe("batida");
    expect(progressLabel(empty)).toBe("sem itens");
  });
});
