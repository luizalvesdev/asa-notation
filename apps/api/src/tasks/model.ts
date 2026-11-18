import type { Recurrence } from "./recurrence.js";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Uma tarefa, ou uma ocorrência dela num dia (recorrentes). */
export interface TaskItem {
  id: string;
  title: string;
  /** AAAA-MM-DD. Em recorrentes, é o dia desta ocorrência. */
  date: string | null;
  /** HH:MM */
  time: string | null;
  recurrence: Recurrence | null;
  done: boolean;
  /** Meta ligada (some se a meta foi apagada). */
  goalId: string | null;
  goalTitle: string | null;
  subtasks: Subtask[];
}

export interface TaskList {
  /** Tarefas com data dentro do intervalo, recorrentes já expandidas por dia. */
  days: TaskItem[];
  /** Sem recorrência, não concluídas, com data antes de hoje. */
  late: TaskItem[];
  /** Sem data e não concluídas. */
  undated: TaskItem[];
}

export interface NewTask {
  title: string;
  parentId: string | null;
  date: string | null;
  time: string | null;
  recurrence: Recurrence | null;
  goalId: string | null;
}

export interface TaskPatch {
  title?: string;
  date?: string | null;
  time?: string | null;
  recurrence?: Recurrence | null;
  goalId?: string | null;
}
