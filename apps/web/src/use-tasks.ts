import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "./api";
import { useDataVersion } from "./data-events";
import { applyDone, applySubtaskDone } from "./tasks-logic";
import { EMPTY_LIST, type NewTaskInput, type TaskItem, type TaskList } from "./tasks-types";

export type TasksStatus = "carregando" | "pronto" | "erro";

export interface TasksState {
  status: TasksStatus;
  list: TaskList;
  reload: () => void;
  /** Marca ou desmarca na hora e confirma no servidor; volta atrás se falhar. */
  toggle: (item: TaskItem) => Promise<boolean>;
  toggleSubtask: (subId: string, done: boolean) => Promise<boolean>;
  add: (input: NewTaskInput) => Promise<boolean>;
  remove: (item: TaskItem) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  addSubtask: (parentId: string, title: string) => Promise<boolean>;
  /** Muda a data de tarefas simples. */
  reschedule: (ids: string[], date: string) => Promise<boolean>;
}

/** Tarefas de um intervalo de dias. `today` é o dia local de quem usa (define o que está atrasado). */
export function useTasks(from: string, to: string, today: string): TasksState {
  const [list, setList] = useState<TaskList>(EMPTY_LIST);
  const [status, setStatus] = useState<TasksStatus>("carregando");
  const [version, setVersion] = useState(0);
  const dataVersion = useDataVersion();

  useEffect(() => {
    let live = true;
    tasksApi
      .list(from, to, today)
      .then((data) => {
        if (!live) return;
        setList(data);
        setStatus("pronto");
      })
      .catch(() => live && setStatus((current) => (current === "pronto" ? current : "erro")));
    return () => {
      live = false;
    };
  }, [from, to, today, version, dataVersion]);

  const reload = useCallback(() => {
    setStatus((current) => (current === "pronto" ? current : "carregando"));
    setVersion((v) => v + 1);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const toggle = useCallback(async (item: TaskItem) => {
    const done = !item.done;
    setList((l) => applyDone(l, item.id, item.date, done));
    try {
      await tasksApi.setDone(item.id, done, item.recurrence ? item.date : null);
      return true;
    } catch {
      setList((l) => applyDone(l, item.id, item.date, !done));
      return false;
    }
  }, []);

  const toggleSubtask = useCallback(async (subId: string, done: boolean) => {
    setList((l) => applySubtaskDone(l, subId, done));
    try {
      await tasksApi.setDone(subId, done, null);
      return true;
    } catch {
      setList((l) => applySubtaskDone(l, subId, !done));
      return false;
    }
  }, []);

  const attempt = useCallback(
    async (run: () => Promise<unknown>) => {
      try {
        await run();
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  const add = useCallback((input: NewTaskInput) => attempt(() => tasksApi.create(input)), [attempt]);
  const remove = useCallback((item: TaskItem) => attempt(() => tasksApi.remove(item.id)), [attempt]);
  const restore = useCallback((id: string) => attempt(() => tasksApi.restore(id)), [attempt]);
  const addSubtask = useCallback((parentId: string, title: string) => attempt(() => tasksApi.create({ title, parentId })), [attempt]);
  const reschedule = useCallback((ids: string[], date: string) => attempt(() => tasksApi.reschedule(ids, date)), [attempt]);

  return { status, list, reload, toggle, toggleSubtask, add, remove, restore, reschedule, addSubtask };
}
