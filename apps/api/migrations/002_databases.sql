drop table views;
drop table db_properties;

alter table pages add column sort_key text collate "C";

create index pages_database_sort_idx on pages (database_id, sort_key) where deleted_at is null;
