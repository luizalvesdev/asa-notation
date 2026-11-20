-- Agente em vários repositórios: o job diz em quais repos trabalhar e a partir de qual branch,
-- e guarda um PR por repo. O agente conta quais repos tem configurados.
alter table agent_jobs
  add column repos text[] not null default '{}' check (cardinality(repos) <= 5),
  add column base  text check (base is null or char_length(base) <= 200),
  add column prs   jsonb not null default '[]';

alter table agent_runner
  add column repos jsonb not null default '[]';
