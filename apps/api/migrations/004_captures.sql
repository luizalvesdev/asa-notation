-- Capturas rápidas: caem na Inbox até serem arquivadas ou movidas para uma página.
create table captures (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  kind          text check (kind in ('idea', 'study', 'work', 'project', 'reference')),
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  moved_page_id uuid references pages(id)
);

create index captures_inbox_idx on captures (created_at desc) where archived_at is null and moved_page_id is null;
