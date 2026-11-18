-- Configurações do dono (um único documento) e tokens de API para scripts e integrações.
create table settings (
  id         boolean primary key default true check (id),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (true);

create table api_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  scope        text not null check (scope in ('read', 'write')),
  -- Só o hash (SHA-256) é guardado; o token inteiro aparece uma única vez, na criação.
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
