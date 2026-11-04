create sequence change_seq;

create table pages (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references pages(id),
  database_id uuid references pages(id),
  kind        text not null check (kind in ('page', 'database')),
  title       text not null default '',
  body        jsonb,
  body_text   text not null default '',
  source_md   text,
  props       jsonb not null default '{}',
  origin      text not null default 'app' check (origin in ('app', 'hermes', 'renato', 'obsidian')),
  vault_path  text unique,
  rev         bigint not null default nextval('change_seq'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index pages_rev_idx on pages (rev);
create index pages_parent_idx on pages (parent_id);
create index pages_database_idx on pages (database_id);
create index pages_search_idx on pages using gin (to_tsvector('portuguese', title || ' ' || body_text));

create table db_properties (
  database_id uuid not null references pages(id),
  key         text not null,
  name        text not null,
  type        text not null,
  options     jsonb not null default '{}',
  position    int not null,
  primary key (database_id, key)
);

create table views (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references pages(id),
  name        text not null,
  type        text not null check (type in ('table', 'kanban', 'calendar')),
  config      jsonb not null default '{}'
);

create table links (
  from_page uuid not null references pages(id),
  to_page   uuid references pages(id),
  to_title  text not null,
  primary key (from_page, to_title)
);

create table cards (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references pages(id),
  kind        text not null check (kind in ('basic', 'cloze')),
  front       text not null,
  back        text not null,
  fingerprint text not null,
  suspended   boolean not null default false,
  due         timestamptz not null default now(),
  stability   real,
  difficulty  real,
  state       smallint not null default 0,
  reps        int not null default 0,
  lapses      int not null default 0,
  last_review timestamptz,
  unique (page_id, fingerprint)
);

create index cards_due_idx on cards (due) where not suspended;

create table reviews (
  id           uuid primary key,
  card_id      uuid not null references cards(id),
  rating       smallint not null check (rating between 1 and 4),
  reviewed_at  timestamptz not null,
  state_before jsonb not null
);

create table passkeys (
  id            uuid primary key default gen_random_uuid(),
  credential_id text not null unique,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[],
  name          text not null,
  created_at    timestamptz not null default now()
);

create table device_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  token_hash   text not null,
  scope        text not null check (scope in ('full', 'bot', 'sync')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
