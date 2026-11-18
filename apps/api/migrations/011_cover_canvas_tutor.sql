-- Capa de página, páginas canvas (quadro livre) e o agente Tutor.
alter table pages add column cover text check (cover is null or char_length(cover) <= 300);

alter table pages drop constraint pages_kind_check;
alter table pages add constraint pages_kind_check check (kind in ('page', 'database', 'row', 'canvas'));

alter table chat_conversations drop constraint chat_conversations_agent_check;
alter table chat_conversations add constraint chat_conversations_agent_check check (agent in ('hermes', 'renato', 'tutor'));
