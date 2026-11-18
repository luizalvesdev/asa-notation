create table owner_password (
  id           smallint primary key default 1 check (id = 1),
  hash         text not null,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
