-- Estudo: trilhas (decks), cards com estado FSRS e histórico de revisões.
create table decks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  goal_id    uuid references goals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table cards (
  id             uuid primary key default gen_random_uuid(),
  deck_id        uuid references decks(id),
  kind           text not null check (kind in ('basic', 'cloze')),
  -- basic: pergunta e resposta. cloze: `front` é o texto com {{lacunas}} e `back` fica vazio.
  front          text not null,
  back           text not null default '',
  source_page_id uuid references pages(id),
  -- Chave para não extrair o mesmo card da mesma página duas vezes.
  source_key     text,
  -- Estado do agendador FSRS (JSON do ts-fsrs) e as colunas que as consultas usam.
  fsrs           jsonb not null,
  due_at         timestamptz not null,
  state          smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (source_page_id, source_key)
);

create index cards_due_idx on cards (due_at) where deleted_at is null;
create index cards_deck_idx on cards (deck_id) where deleted_at is null;

create table review_logs (
  id          bigserial primary key,
  card_id     uuid not null references cards(id),
  rating      smallint not null check (rating between 1 and 4),
  state_before smallint not null,
  reviewed_at timestamptz not null,
  duration_ms integer
);

create index review_logs_time_idx on review_logs (reviewed_at);
create index review_logs_card_idx on review_logs (card_id, reviewed_at);
