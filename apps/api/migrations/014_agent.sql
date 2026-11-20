-- Agente de trabalho: o asa guarda só a fila e o andamento. Código e descrição dos cards ficam na máquina do agente,
-- no Jira e no GitHub. Aqui entram a chave e o título do card, o pedido escrito pelo usuário e o status.

-- Cards do Jira atribuídos ao usuário, como o agente viu na última sincronização (substituídos a cada vez).
create table agent_cards (
  ref        text primary key check (char_length(ref) <= 40),
  title      text not null default '' check (char_length(title) <= 300),
  status     text not null default '' check (char_length(status) <= 80),
  url        text check (url is null or char_length(url) <= 500),
  position   int not null default 0
);

-- Última vez que o agente deu sinal (linha única).
create table agent_runner (
  id       smallint primary key default 1 check (id = 1),
  seen_at  timestamptz not null
);

-- queued: esperando o agente · running: trabalhando · review: esperando sua revisão · changes: você pediu mudança
-- approved: você aprovou, o agente finaliza · done · failed · canceled
create table agent_jobs (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null check (char_length(ref) <= 40),
  title            text not null default '' check (char_length(title) <= 300),
  url              text check (url is null or char_length(url) <= 500),
  instruction      text not null default '' check (char_length(instruction) <= 4000),
  status           text not null default 'queued' check (status in ('queued', 'running', 'review', 'changes', 'approved', 'done', 'failed', 'canceled')),
  -- Pedido de mudança ainda não entregue ao agente.
  feedback         text check (feedback is null or char_length(feedback) <= 4000),
  cancel_requested boolean not null default false,
  pr_url           text check (pr_url is null or char_length(pr_url) <= 500),
  summary          text not null default '' check (char_length(summary) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index agent_jobs_recent_idx on agent_jobs (created_at desc);

create table agent_events (
  id         bigserial primary key,
  job_id     uuid not null references agent_jobs(id) on delete cascade,
  kind       text not null check (kind in ('created', 'started', 'progress', 'review', 'feedback', 'approved', 'done', 'failed', 'canceled')),
  text       text not null default '' check (char_length(text) <= 4000),
  created_at timestamptz not null default now()
);

create index agent_events_job_idx on agent_events (job_id, id);
