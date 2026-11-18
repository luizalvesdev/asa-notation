-- Notificações do app (check-ins e avisos) e revisão semanal.
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('plan', 'thursday', 'saturday', 'study', 'info')),
  title      text not null,
  body       text not null default '',
  -- Rota do app (ex.: "#/rotina/sabado"). Nunca uma URL externa.
  link       text,
  -- Impede gerar o mesmo check-in duas vezes (ex.: "plan:2026-11-18").
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index notifications_created_idx on notifications (created_at desc);

create table weekly_reviews (
  week_start date primary key,
  rating     smallint check (rating between 1 and 5),
  worked     text not null default '',
  blocked    text not null default '',
  -- Até 3 itens de foco da semana seguinte.
  focus      jsonb not null default '[]'::jsonb,
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);
