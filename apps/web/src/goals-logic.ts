import { daysBetween } from "./tasks-dates";
import type { Goal, GoalStatus } from "./goals-types";

/** 0 a 100, arredondado. Meta sem tarefas está em 0%. */
export function goalPct(goal: Pick<Goal, "tasksTotal" | "tasksDone">): number {
  return goal.tasksTotal === 0 ? 0 : Math.round((goal.tasksDone / goal.tasksTotal) * 100);
}

/**
 * Compara o progresso com o tempo que já passou entre a criação e o prazo.
 * Até 10 pontos abaixo do esperado ainda é "no ritmo"; até 30, "atrás"; mais que isso, "em risco".
 * Prazo vencido e não concluída é sempre "em risco". Sem prazo não há ritmo a cobrar.
 */
export function goalStatus(goal: Pick<Goal, "done" | "dueDate" | "createdAt" | "tasksTotal" | "tasksDone">, today: string): GoalStatus {
  if (goal.done) return "concluida";
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
  ritmo: "No ritmo",
  atras: "Atrás do ritmo",
  risco: "Em risco",
};

export const STATUS_BADGE: Record<GoalStatus, string> = {
  concluida: "badge",
  ritmo: "badge ok",
  atras: "badge warn",
  risco: "badge bad",
};

/** "5 de 12 tarefas" */
export function tasksLabel(goal: Pick<Goal, "tasksTotal" | "tasksDone">): string {
  if (goal.tasksTotal === 0) return "sem tarefas";
  return `${goal.tasksDone} de ${goal.tasksTotal} ${goal.tasksTotal === 1 ? "tarefa" : "tarefas"}`;
}
