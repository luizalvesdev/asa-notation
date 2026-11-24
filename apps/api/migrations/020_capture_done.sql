-- Captura finalizada: sai da Inbox pendente, mas continua listável (aba Finalizadas) e pode ser reaberta.
alter table captures add column done_at timestamptz;

drop index captures_inbox_idx;
create index captures_inbox_idx on captures (created_at desc) where archived_at is null and moved_page_id is null and done_at is null;
