-- O agente de trabalho saiu do projeto: o trabalho fica no Jira, no GitHub e no Claude Code (Remote Control).
-- Apaga as tabelas dele, com o histórico dos chats, para não sobrar conteúdo do trabalho no asa.
drop table if exists agent_events;
drop table if exists agent_jobs;
drop table if exists agent_cards;
drop table if exists agent_runner;
