-- Chat com o Claude Code no card: as respostas do agente viram eventos "reply" e ficam guardadas (decisão do dono).
alter table agent_events drop constraint agent_events_kind_check;
alter table agent_events add constraint agent_events_kind_check check (kind in ('created', 'started', 'progress', 'review', 'feedback', 'reply', 'approved', 'done', 'failed', 'canceled'));
alter table agent_events drop constraint agent_events_text_check;
alter table agent_events add constraint agent_events_text_check check (char_length(text) <= 20000);
