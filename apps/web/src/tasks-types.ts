export type Recurrence = "daily" | "weekdays" | "weekly";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Uma tarefa, ou a ocorrência dela num dia (recorrentes). Datas são AAAA-MM-DD; hora é HH:MM. */
export interface TaskItem {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  recurrence: Recurrence | null;
  done: boolean;
  subtasks: Subtask[];
}

export interface TaskList {
  days: TaskItem[];
  late: TaskItem[];
  undated: TaskItem[];
}

export interface NewTaskInput {
  title: string;
  parentId?: string | null;
  date?: string | null;
  time?: string | null;
  recurrence?: Recurrence | null;
}

export const EMPTY_LIST: TaskList = { days: [], late: [], undated: [] };
