-- Lembretes de tarefa: um aviso quando chega o horário de uma tarefa marcada.
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('plan', 'thursday', 'saturday', 'study', 'info', 'task'));
