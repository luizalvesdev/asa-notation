-- Web Push: navegadores inscritos para receber avisos com o app fechado.
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  -- Só para a tela de configurações reconhecer o aparelho (ex.: "Chrome no Android").
  label       text not null default '',
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

-- Quando o aviso saiu por push. As notificações antigas contam como enviadas: nada de rajada ao ativar.
alter table notifications add column pushed_at timestamptz;
update notifications set pushed_at = now();
