export interface Goal {
  id: string;
  title: string;
  description: string;
  /** AAAA-MM-DD */
  dueDate: string | null;
  done: boolean;
  createdAt: string;
  tasksTotal: number;
  tasksDone: number;
  /** Página ligada (1 para 1): os checkboxes marcados dela medem o progresso. */
  page: { id: string; title: string } | null;
  /** Alvo fixo (ex.: 30 livros); sem ele, o alvo é o total de checkboxes da página. */
  target: number | null;
  checked: number;
  checkboxes: number;
}

export interface NewGoalInput {
  title: string;
  description?: string;
  dueDate?: string | null;
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

export type GoalStatus = "concluida" | "batida" | "ritmo" | "atras" | "risco";
