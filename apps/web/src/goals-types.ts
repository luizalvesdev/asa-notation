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
}

export interface NewGoalInput {
  title: string;
  description?: string;
  dueDate?: string | null;
}

export interface GoalPatch {
  title?: string;
  description?: string;
  dueDate?: string | null;
  done?: boolean;
}

export type GoalStatus = "concluida" | "ritmo" | "atras" | "risco";
