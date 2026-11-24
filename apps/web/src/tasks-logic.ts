import type { Recurrence, TaskItem, TaskList } from "./tasks-types";

export interface Progress {
  done: number;
  total: number;
  /** 0 a 100, arredondado. 0 quando não há tarefas. */
  pct: number;
}

export function progress(items: readonly TaskItem[]): Progress {
  const done = items.filter((t) => t.done).length;
  return { done, total: items.length, pct: items.length === 0 ? 0 : Math.round((done / items.length) * 100) };
}

const sameOccurrence = (t: TaskItem, id: string, date: string | null) => t.id === id && (t.recurrence === null || t.date === date);

/** Marca (ou desmarca) uma tarefa em todas as listas. Recorrentes: só o dia informado. */
export function applyDone(list: TaskList, id: string, date: string | null, done: boolean): TaskList {
  const mark = (items: TaskItem[]) => items.map((t) => (sameOccurrence(t, id, date) ? { ...t, done } : t));
  return { days: mark(list.days), late: mark(list.late), undated: mark(list.undated) };
}

export function applySubtaskDone(list: TaskList, subId: string, done: boolean): TaskList {
  const mark = (items: TaskItem[]) =>
    items.map((t) => (t.subtasks.some((s) => s.id === subId) ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done } : s)) } : t));
  return { days: mark(list.days), late: mark(list.late), undated: mark(list.undated) };
}

/** Agrupa por dia, mantendo a ordem de entrada dentro de cada dia. */
export function groupByDate(items: readonly TaskItem[]): Map<string, TaskItem[]> {
  const map = new Map<string, TaskItem[]>();
  for (const item of items) {
    if (!item.date) continue;
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

export interface QuickAdd {
  title: string;
  time: string | null;
  recurrence: Recurrence | null;
}

const RECURRENCE_TOKENS: Record<string, Recurrence> = { diaria: "daily", uteis: "weekdays", semanal: "weekly" };

/** Máscara do campo de hora: só dígitos, com ":" depois do segundo ("1430" vira "14:30"). */
export function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/** Hora digitada → "HH:MM". "" se vazio, null se inválida ("9" vira 09:00, "930" vira 09:30). */
export function normalizeTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  if (digits.length > 4) return null;
  const hours = digits.length <= 2 ? digits : digits.slice(0, digits.length - 2);
  const minutes = digits.length <= 2 ? "00" : digits.slice(-2);
  if (Number(hours) > 23 || Number(minutes) > 59) return null;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

/**
 * Lê a linha de "adicionar tarefa":
 *   "14:00 Revisar cards"  -> hora no início ("14h" e "9h30" também valem)
 *   "Treino /diaria"       -> recorrência no fim (/diaria, /uteis, /semanal)
 * Devolve null se sobrar título vazio.
 */
export function parseQuickAdd(raw: string): QuickAdd | null {
  let text = raw.trim();
  let time: string | null = null;
  let recurrence: Recurrence | null = null;

  const tail = /\s+\/(diaria|uteis|semanal)$/i.exec(text);
  if (tail) {
    recurrence = RECURRENCE_TOKENS[tail[1]!.toLowerCase()]!;
    text = text.slice(0, tail.index).trim();
  }
  const head = /^([01]?\d|2[0-3])(?::|h)([0-5]\d)?\s+(.+)$/.exec(text);
  if (head) {
    time = `${head[1]!.padStart(2, "0")}:${head[2] ?? "00"}`;
    text = head[3]!.trim();
  }
  return text === "" ? null : { title: text, time, recurrence };
}
