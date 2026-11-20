-- Parar o agente sem encerrar o trabalho: ele interrompe o Claude Code, guarda a sessão e espera a sua resposta.
-- Uma mensagem enviada com o agente trabalhando também pede a parada e fica em "feedback" até ele parar.
alter table agent_jobs add column interrupt_requested boolean not null default false;
