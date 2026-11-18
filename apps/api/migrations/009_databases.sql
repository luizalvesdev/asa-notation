-- Databases: uma página `database` com o esquema (propriedades e views) e linhas `row`
-- que são páginas de verdade (têm corpo), filhas da database. As linhas não aparecem na árvore.
alter table pages add column kind text not null default 'page' check (kind in ('page', 'database', 'row'));
alter table pages add column props jsonb not null default '{}'::jsonb;
alter table pages add column schema jsonb;

create index pages_rows_idx on pages (parent_id) where kind = 'row' and deleted_at is null;
