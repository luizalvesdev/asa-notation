import { addDays } from "../tasks/recurrence.js";
import type { DayActivity } from "../progress/activity.js";

export interface WeekMetrics {
  tasksDone: number;
  tasksTotal: number;
  studySeconds: number;
  cardsReviewed: number;
  /** Dias da semana com ao menos uma tarefa concluída ou uma revisão. */
  activeDays: number;
  days: number;
}

export type Verdict = "forte" | "boa" | "abaixo";

/** Soma a atividade de uma semana (7 dias a partir de `start`). `tasksTotal` vem da lista de tarefas. */
export function weekMetrics(start: string, activity: Map<string, DayActivity>, tasksDone: number, tasksTotal: number): WeekMetrics {
  let studySeconds = 0;
  let cardsReviewed = 0;
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const a = activity.get(addDays(start, i));
    if (!a) continue;
    studySeconds += a.seconds;
    cardsReviewed += a.reviews;
    if (a.tasks > 0 || a.reviews > 0) activeDays += 1;
  }
  return { tasksDone, tasksTotal, studySeconds, cardsReviewed, activeDays, days: 7 };
}

/**
 * Avaliação por regra (sem IA): mistura a taxa de tarefas concluídas (60%) com a constância (40%).
 * 70 pontos ou mais é uma semana forte; 40 a 69, boa; abaixo disso, abaixo do ritmo.
 * Sem tarefas planejadas, só a constância conta.
 */
export function verdict(m: WeekMetrics): { verdict: Verdict; score: number } {
  const consistency = m.activeDays / m.days;
  const completion = m.tasksTotal === 0 ? consistency : Math.min(1, m.tasksDone / m.tasksTotal);
  const score = Math.round((completion * 0.6 + consistency * 0.4) * 100);
  return { verdict: score >= 70 ? "forte" : score >= 40 ? "boa" : "abaixo", score };
}
