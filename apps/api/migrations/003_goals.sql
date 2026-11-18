-- Metas: prazo opcional, concluída à mão. O progresso vem das tarefas ligadas.
create table goals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  due_date    date,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

alter table tasks add column goal_id uuid references goals(id);
-- Só tarefas principais se ligam a uma meta; subtarefas seguem a tarefa-mãe.
alter table tasks add constraint tasks_goal_top_level check (parent_id is null or goal_id is null);
create index tasks_goal_idx on tasks (goal_id) where goal_id is not null;
