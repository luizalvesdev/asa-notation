-- Meta ligada a uma página: o progresso vira o número de checkboxes marcados na página.
-- target (opcional) é o alvo fixo (ex.: ler 30 livros); sem ele, o alvo é o total de checkboxes da página.
-- Uma página liga a no máximo uma meta ativa.
alter table goals add column page_id uuid references pages(id) on delete set null;
alter table goals add column target integer check (target is null or target > 0);
create unique index goals_page_idx on goals (page_id) where page_id is not null and deleted_at is null;
