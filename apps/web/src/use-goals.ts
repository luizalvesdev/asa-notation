import { useCallback, useEffect, useState } from "react";
import { goalsApi, tasksApi } from "./api";
import { useDataVersion } from "./data-events";
import type { Goal, GoalPatch, NewGoalInput, OutlineGroup } from "./goals-types";
import { applyDone, applySubtaskDone } from "./tasks-logic";
import { EMPTY_LIST, type TaskItem } from "./tasks-types";

export type LoadStatus = "carregando" | "pronto" | "erro";

export interface GoalsState {
  status: LoadStatus;
  goals: Goal[];
  reload: () => void;
  create: (input: NewGoalInput) => Promise<Goal | null>;
  update: (id: string, patch: GoalPatch) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
}

export function useGoals(): GoalsState {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [status, setStatus] = useState<LoadStatus>("carregando");
  const [version, setVersion] = useState(0);
  const dataVersion = useDataVersion();

  useEffect(() => {
    let live = true;
    goalsApi
      .list()
      .then((data) => {
        if (!live) return;
        setGoals(data);
        setStatus("pronto");
      })
      .catch(() => live && setStatus((current) => (current === "pronto" ? current : "erro")));
    return () => {
      live = false;
    };
  }, [version, dataVersion]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const reload = useCallback(() => {
    setStatus((current) => (current === "pronto" ? current : "carregando"));
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: NewGoalInput) => {
      try {
        const goal = await goalsApi.create(input);
        refresh();
        return goal;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  const update = useCallback((id: string, patch: GoalPatch) => run(() => goalsApi.update(id, patch)), [run]);
  const remove = useCallback((id: string) => run(() => goalsApi.remove(id)), [run]);
  const restore = useCallback((id: string) => run(() => goalsApi.restore(id)), [run]);

  return { status, goals, reload, create, update, remove, restore };
}

export interface GoalDetailState {
  status: LoadStatus;
  tasks: TaskItem[];
  /** Conteúdo da página ligada (cursos e aulas), ou null sem página. */
  outline: OutlineGroup[] | null;
  reload: () => void;
  toggle: (item: TaskItem) => Promise<boolean>;
  toggleSubtask: (subId: string, done: boolean) => Promise<boolean>;
  addTask: (title: string) => Promise<boolean>;
  removeTask: (item: TaskItem) => Promise<boolean>;
  restoreTask: (id: string) => Promise<boolean>;
  unlinkTask: (item: TaskItem) => Promise<boolean>;
  addSubtask: (parentId: string, title: string) => Promise<boolean>;
}

/** Tarefas ligadas a uma meta. `onChanged` roda depois de cada mudança confirmada (para recontar o progresso). */
export function useGoalDetail(goalId: string | null, onChanged: () => void): GoalDetailState {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [outline, setOutline] = useState<OutlineGroup[] | null>(null);
  const [status, setStatus] = useState<LoadStatus>("carregando");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!goalId) return;
    let live = true;
    setStatus("carregando");
    goalsApi
      .get(goalId)
      .then((data) => {
        if (!live) return;
        setTasks(data.tasks);
        setOutline(data.outline);
        setStatus("pronto");
      })
      .catch(() => live && setStatus("erro"));
    return () => {
      live = false;
    };
  }, [goalId]);

  // Recarrega sem voltar para o esqueleto.
  useEffect(() => {
    if (!goalId || version === 0) return;
    let live = true;
    goalsApi
      .get(goalId)
      .then((data) => {
        if (!live) return;
        setTasks(data.tasks);
        setOutline(data.outline);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [goalId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const done = useCallback(() => {
    setVersion((v) => v + 1);
    onChanged();
  }, [onChanged]);

  const toggle = useCallback(
    async (item: TaskItem) => {
      const next = !item.done;
      setTasks((list) => applyDone({ ...EMPTY_LIST, days: list }, item.id, item.date, next).days);
      try {
        await tasksApi.setDone(item.id, next, item.recurrence ? item.date : null);
        done();
        return true;
      } catch {
        setTasks((list) => applyDone({ ...EMPTY_LIST, days: list }, item.id, item.date, !next).days);
        return false;
      }
    },
    [done],
  );

  const toggleSubtask = useCallback(
    async (subId: string, next: boolean) => {
      setTasks((list) => applySubtaskDone({ ...EMPTY_LIST, days: list }, subId, next).days);
      try {
        await tasksApi.setDone(subId, next, null);
        return true;
      } catch {
        setTasks((list) => applySubtaskDone({ ...EMPTY_LIST, days: list }, subId, !next).days);
        return false;
      }
    },
    [],
  );

  const attempt = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        done();
        return true;
      } catch {
        return false;
      }
    },
    [done],
  );

  const addTask = useCallback((title: string) => attempt(() => tasksApi.create({ title, goalId })), [attempt, goalId]);
  const removeTask = useCallback((item: TaskItem) => attempt(() => tasksApi.remove(item.id)), [attempt]);
  const restoreTask = useCallback((id: string) => attempt(() => tasksApi.restore(id)), [attempt]);
  const addSubtask = useCallback((parentId: string, title: string) => attempt(() => tasksApi.create({ title, parentId })), [attempt]);
  const unlinkTask = useCallback((item: TaskItem) => attempt(() => tasksApi.update(item.id, { goalId: null })), [attempt]);

  return { status, tasks, outline, reload, toggle, toggleSubtask, addTask, removeTask, restoreTask, unlinkTask, addSubtask };
}
