-- asa-notation · modelo inicial: auth por senha e páginas.

-- Sequência de mudanças. Cada escrita em pages recebe um rev novo, base para sincronização futura.
create sequence change_seq;

-- Senha do dono. A linha única (id = 1) guarda o hash e o controle de bloqueio por falhas.
create table owner_password (
  id           smallint primary key default 1 check (id = 1),
  hash         text not null,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

create table pages (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references pages(id),
  title      text not null default '' check (char_length(title) <= 500),
  icon       text check (icon is null or char_length(icon) <= 16),
  favorite   boolean not null default false,
  -- chave fracionária entre irmãos (fractional-indexing); ordena a árvore sem renumerar
  position   text not null,
  -- documento do editor (Tiptap/ProseMirror) e o texto puro extraído dele, para a busca
  body       jsonb,
  body_text  text not null default '',
  rev        bigint not null default nextval('change_seq'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- soft delete: a subárvore apagada de uma vez compartilha o mesmo deleted_at
  deleted_at timestamptz,
  check (parent_id is distinct from id)
);

create index pages_parent_idx on pages (parent_id, position) where deleted_at is null;
create index pages_rev_idx on pages (rev);
create index pages_deleted_idx on pages (deleted_at) where deleted_at is not null;
-- Busca sem diferenciar acento ("reuniao" acha "reunião"). O wrapper é imutável para poder entrar no índice.
create extension if not exists unaccent;

create function asa_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create index pages_search_idx on pages using gin (to_tsvector('portuguese', asa_unaccent(title || ' ' || body_text)));

-- Links [[Título]] encontrados no corpo. A resolução é por título (sem diferenciar maiúsculas) na consulta.
create table page_links (
  from_page uuid not null references pages(id),
  to_title  text not null,
  primary key (from_page, to_title)
);

create index page_links_title_idx on page_links (to_title);
