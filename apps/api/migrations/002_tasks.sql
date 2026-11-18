-- Tarefas: com prazo (data e hora opcionais), recorrência e subtarefas de um nível.
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references tasks(id),
  title       text not null,
  due_date    date,
  due_time    time,
  -- Recorrentes começam em due_date e repetem sem data final.
  recurrence  text check (recurrence in ('daily', 'weekdays', 'weekly')),
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- Hora e recorrência só fazem sentido com data; subtarefa não tem data nem recorrência.
  check (due_time is null or due_date is not null),
  check (recurrence is null or due_date is not null),
  check (parent_id is null or (due_date is null and recurrence is null))
);

create index tasks_due_idx on tasks (due_date) where deleted_at is null and parent_id is null;
create index tasks_parent_idx on tasks (parent_id) where parent_id is not null;

-- Uma linha por dia concluído de uma tarefa recorrente.
create table task_completions (
  task_id uuid not null references tasks(id),
  day     date not null,
  primary key (task_id, day)
);
