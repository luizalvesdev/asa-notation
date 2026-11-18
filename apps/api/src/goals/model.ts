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
}

export interface NewGoal {
  title: string;
  description: string;
  dueDate: string | null;
}

export interface GoalPatch {
  title?: string;
  description?: string;
  dueDate?: string | null;
  done?: boolean;
}
