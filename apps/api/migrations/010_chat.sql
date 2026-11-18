-- Assistentes (Hermes e Renato): conversas, mensagens e rascunhos a aprovar. Mais o cofre de chaves de IA.
create table secrets (
  name       text primary key,
  -- AES-256-GCM: iv + tag + texto cifrado, em base64. A chave nunca volta inteira para a tela.
  ciphertext text not null,
  last4      text not null,
  updated_at timestamptz not null default now()
);

create table chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null check (agent in ('hermes', 'renato')),
  title      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_conversations_idx on chat_conversations (agent, updated_at desc);

create table chat_messages (
  seq             bigserial primary key,
  id              uuid not null unique default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  -- Conteúdo no formato da API (lista de blocos), para reenviar o histórico com as chamadas de ferramenta.
  content         jsonb not null,
  -- Texto para mostrar. Vazio nas mensagens internas (chamadas e resultados de ferramenta).
  text            text not null default '',
  visible         boolean not null default true,
  created_at      timestamptz not null default now()
);

create index chat_messages_conv_idx on chat_messages (conversation_id, seq);

create table ai_drafts (
  seq             bigserial,
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  message_id      uuid references chat_messages(id) on delete cascade,
  kind            text not null check (kind in ('tasks', 'capture', 'page')),
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'discarded')),
  result          jsonb,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create index ai_drafts_conv_idx on ai_drafts (conversation_id);
