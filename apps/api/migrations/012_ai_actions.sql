-- Rascunhos de ações gerais dos assistentes (editar, mover, apagar, metas, cards...).
alter table ai_drafts drop constraint ai_drafts_kind_check;
alter table ai_drafts add constraint ai_drafts_kind_check check (kind in ('tasks', 'capture', 'page', 'action'));
