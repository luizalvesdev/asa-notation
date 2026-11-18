-- Histórico de versões das páginas e links públicos de leitura.
create table page_versions (
  id         bigserial primary key,
  page_id    uuid not null references pages(id),
  title      text not null,
  body       jsonb not null,
  body_text  text not null default '',
  created_at timestamptz not null default now()
);

create index page_versions_page_idx on page_versions (page_id, id desc);

create table page_shares (
  page_id    uuid primary key references pages(id),
  -- Aleatório e impossível de adivinhar: quem tem o link lê a página.
  slug       text not null unique,
  views      integer not null default 0,
  created_at timestamptz not null default now()
);
