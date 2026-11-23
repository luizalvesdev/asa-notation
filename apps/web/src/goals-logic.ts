import { daysBetween } from "./tasks-dates";
import type { Goal, GoalStatus } from "./goals-types";

type Progressive = Pick<Goal, "tasksTotal" | "tasksDone"> & Partial<Pick<Goal, "page" | "target" | "checked" | "checkboxes">>;

/** O que conta como feito e como total: os checkboxes da página, quando há; senão as tarefas. */
export function goalCounts(goal: Progressive): { done: number; total: number; linked: boolean } {
  if (goal.page) return { done: goal.checked ?? 0, total: goal.target ?? goal.checkboxes ?? 0, linked: true };
  return { done: goal.tasksDone, total: goal.tasksTotal, linked: false };
}

/** 0 a 100, arredondado (passar do alvo não passa de 100). Meta sem nada para contar está em 0%. */
export function goalPct(goal: Progressive): number {
  const { done, total } = goalCounts(goal);
  return total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
}

/** Quanto passou do alvo (0 se não passou). Só vale para meta ligada a uma página. */
export function goalExcess(goal: Progressive): number {
  const { done, total, linked } = goalCounts(goal);
  return linked && total > 0 ? Math.max(0, done - total) : 0;
}

/** Meta ligada a uma página que já alcançou o alvo. */
export function goalReached(goal: Progressive): boolean {
  const { done, total, linked } = goalCounts(goal);
  return linked && total > 0 && done >= total;
}

/**
 * Compara o progresso com o tempo que já passou entre a criação e o prazo.
 * Até 10 pontos abaixo do esperado ainda é "no ritmo"; até 30, "atrás"; mais que isso, "em risco".
 * Prazo vencido e não concluída é sempre "em risco". Sem prazo não há ritmo a cobrar.
 */
export function goalStatus(goal: Pick<Goal, "done" | "dueDate" | "createdAt"> & Progressive, today: string): GoalStatus {
  if (goal.done) return "concluida";
  if (goalReached(goal)) return "batida";
  if (!goal.dueDate) return "ritmo";
  if (today > goal.dueDate) return "risco";
  const created = goal.createdAt.slice(0, 10);
  const span = Math.max(1, daysBetween(created, goal.dueDate));
  const elapsed = Math.min(1, Math.max(0, daysBetween(created, today) / span));
  const gap = elapsed * 100 - goalPct(goal);
  return gap <= 10 ? "ritmo" : gap <= 30 ? "atras" : "risco";
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  concluida: "Concluída",
  batida: "Meta batida",
  ritmo: "No ritmo",
  atras: "Atrás do ritmo",
  risco: "Em risco",
};

export const STATUS_BADGE: Record<GoalStatus, string> = {
  concluida: "badge",
  batida: "badge ok",
  ritmo: "badge ok",
  atras: "badge warn",
  risco: "badge bad",
};

/** "5 de 12 tarefas" (ou "5 de 12 itens" para meta ligada a uma página; "31 de 30 itens · excedente de 1"). */
export function progressLabel(goal: Progressive): string {
  const { done, total, linked } = goalCounts(goal);
  const noun = linked ? (total === 1 ? "item" : "itens") : total === 1 ? "tarefa" : "tarefas";
  if (total === 0) return linked ? "sem itens" : "sem tarefas";
  const excess = goalExcess(goal);
  return `${done} de ${total} ${noun}${excess > 0 ? ` · excedente de ${excess}` : ""}`;
}
