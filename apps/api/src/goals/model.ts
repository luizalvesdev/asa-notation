export interface Goal {
  id: string;
  title: string;
  description: string;
  /** AAAA-MM-DD */
  dueDate: string | null;
  done: boolean;
  createdAt: string;
  /** Tarefas simples ligadas à meta (recorrentes não contam: nunca "terminam"). */
  tasksTotal: number;
  tasksDone: number;
  /** Página cujos checkboxes medem o progresso (1 para 1), ou null. */
  page: { id: string; title: string } | null;
  /** Alvo fixo (ex.: 30 livros). Sem ele, o alvo é o total de checkboxes da página. */
  target: number | null;
  /** Checkboxes marcados e total na página ligada (0 e 0 sem página). */
  checked: number;
  checkboxes: number;
}

/** Progresso que vale para a meta: os checkboxes da página, quando ligada; senão as tarefas. */
export function goalProgress(goal: Pick<Goal, "page" | "target" | "checked" | "checkboxes" | "tasksDone" | "tasksTotal">): { done: number; total: number } {
  if (goal.page) return { done: goal.checked, total: goal.target ?? goal.checkboxes };
  return { done: goal.tasksDone, total: goal.tasksTotal };
}

export interface NewGoal {
  title: string;
  description: string;
  dueDate: string | null;
  pageId?: string | null;
  target?: number | null;
}

export interface GoalPatch {
  title?: string;
  description?: string;
  dueDate?: string | null;
  done?: boolean;
  pageId?: string | null;
  target?: number | null;
}
