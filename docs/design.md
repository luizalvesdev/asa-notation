# Design: asa-notation, o hub único de anotações, estudo e assistentes

> **Recomeço do zero.** O projeto vai ser replanejado do início: o código atual é só referência e as funcionalidades estão em [features.md](features.md). Este documento é um rascunho de arquitetura, a revisar nas etapas de modelo de dados e backend.

Status: v2, replanejamento. Substitui o rascunho original (Notion para Linux e celular com ponte Obsidian e bots no Telegram). O que já está implementado está marcado na seção 3.

## 1. Objetivo

Um workspace sob medida, no estilo do Notion, para estudar e evoluir na profissão. Tudo mora num lugar só: o asa. Os assistentes Hermes e Renato deixam o Telegram e passam a viver dentro do app, com acesso direto aos dados.

Consequências assumidas:

- **Notion é aposentado.** Tarefas e metas do Hermes passam a ser databases do asa.
- **O Vault no GitHub é aposentado.** Check-ins, métricas, revisões e as notas do Renato viram páginas do asa.
- **Obsidian e a ponte `vaultd` saem do projeto.** Não há mais sincronização de arquivos nem conflito de Markdown.
- **Telegram sai.** Não há mais webhook do Telegram. Avisos proativos passam a ser notificações do próprio app (seção 7).
- **Passkey sai.** A autenticação é só senha do dono (seção 4).
- O repositório `hermes-v2` é arquivado depois da migração. Suas regras de domínio são portadas, não reescritas do zero (seção 6).

## 2. Decisões

- PWA web-first, instalável no Android e no Linux.
- Serverless na AWS `sa-east-1`: Lambda + API Gateway HTTP API (SAM) atrás do CloudFront. Neon Postgres com scale-to-zero.
- O banco é a fonte da verdade. Corpo da página guardado como JSON do editor (Tiptap/ProseMirror). Soft delete em tudo.
- Uso de uma pessoa só.
- SRS com FSRS (`ts-fsrs`).
- Um único conjunto de ferramentas (tools) de dados, usado pelo app e pelos agentes. O agente nunca tem um caminho de escrita que o app não tenha.
- Saída de IA entra sempre como rascunho. Nada gerado por IA vira card ativo ou página final sem revisão.

## 3. Estado atual

Implementado:

- Monorepo (`apps/api`, `apps/web`, `packages/core`), SAM, Neon, CloudFront servindo app e API.
- Páginas aninhadas, editor de blocos (Tiptap), menu de comandos `/`, arrastar blocos, busca.
- Databases com propriedades tipadas, view de tabela e view de kanban (`docs/databases.md`).
- Login por senha com bloqueio após falhas (`apps/api/src/auth/password.ts`) e device tokens com escopo (`full`, `bot`, `sync`).
- Tabelas `cards` e `reviews` já existem na migração 001, sem uso ainda.

Não existe ainda: relação entre databases, filtros, calendário, diagramas, SRS, agentes, notificações, importação, PWA offline.

## 4. Autenticação: só senha

Remover tudo de passkey:

- Apagar `apps/api/src/auth/webauthn.ts` e as rotas `passkey/register/*` e `passkey/login/*` do router, mais os campos de passkey nos stores (`pg-store`, `memory-store`, `store`).
- Migração `004`: `drop table passkeys`.
- Apagar o token de bootstrap (`/asa/prod/auth/bootstrap-token` no SSM) e `AuthGate`/telas de cadastro de passkey no web. O cadastro inicial da senha precisa de outro gatilho; hoje ele depende do bootstrap. Opção simples: um script `npm run set-password` que grava o hash direto no banco.
- Remover `RpId` do `samconfig.toml` e `@simplewebauthn/server` das dependências.
- Sem passkey, o domínio deixa de ser pré-requisito. O endereço do CloudFront serve; domínio próprio fica opcional.

Mantidos: cookie de sessão assinado, checagem de `Origin`, bloqueio por falhas (5 falhas, 15 min), device tokens para integrações. Como a senha é a única barreira numa URL pública, o mínimo de 12 caracteres e o bloqueio por falhas continuam obrigatórios.

## 5. Diagramas e mapas mentais

Dois níveis, para cobrir desenho rápido e desenho livre.

**Bloco `diagram` (Mermaid) dentro de qualquer página.**
- O bloco guarda o texto Mermaid e renderiza ao lado do editor, ao vivo.
- Cobre fluxograma, sequência, ER, C4, gantt e `mindmap` (mapa mental).
- Texto puro é versionável, entra na busca e é fácil de a IA gerar e editar. "Renato, faz um mapa mental de X" vira um bloco Mermaid.
- Implementação: nó Tiptap customizado com `mermaid` carregado sob demanda (lazy).

**Página `canvas` (Excalidraw) para desenho livre.**
- Novo `kind = 'canvas'` em `pages`. O corpo é o JSON da cena do Excalidraw.
- Cobre arquitetura desenhada à mão, quadro branco e mapas mentais livres.
- Também pode ser embutido numa página como bloco, mostrando uma miniatura que abre em tela cheia.
- O Excalidraw é pesado: carregar por rota, nunca no bundle principal.
- Exportação para SVG/PNG pelo próprio Excalidraw.

Os dois formatos guardam fonte editável (texto ou JSON), não imagem. Uma imagem só é gerada para exportar ou mostrar miniatura.

## 6. Hermes e Renato dentro do asa

### Papéis

- **Hermes**: metas, tarefas, check-ins, métricas, revisões semanais, lembretes e progresso. Acompanha e cobra.
- **Renato**: captura, organização e recuperação de ideias, estudos, trabalho e contexto de projetos. Captura, classifica, registra e recupera.

A divisão de domínio vem do `hermes-v2` e continua valendo. Na interface há um painel de chat único com um seletor de agente; cada agente tem seu prompt e sua lista de ferramentas permitidas.

### Ferramentas (tools)

O agente devolve uma decisão estruturada (`reply`, `clarify` ou `action`) e o código valida contra uma allowlist. Esse desenho do `hermes-v2` (`shared/ai/decision.ts`) é mantido. Ação fora da lista ou com input inválido não executa nada.

- Compartilhadas: `search`, `get_page`, `create_page`, `append_to_page`, `create_diagram`.
- Hermes: `list_tasks`, `create_task`, `create_tasks`, `set_task_due`, `complete_task`, `create_goal`, `create_reminder`, `delete_reminder`, `show_today`, `show_week`.
- Renato: `capture_note`, `save_note`, `find_notes`, `move_note`, `classify`.
- Estudo (seção 8): `research` (Perplexity), `summarize` e `quiz` (Gemini), `create_cards` (rascunho), `start_review`.

As ferramentas chamam a camada de dados do `apps/api`, não a API HTTP de fora. Regra herdada do contrato do Hermes: o corpo de uma página pertence ao usuário. O agente cria páginas e altera propriedades; só acrescenta ao corpo quando você pede, e nada é apagado.

### Execução

- Rota `POST /chat` na Lambda. Histórico da conversa numa tabela do próprio asa (substitui a `hermes_chat_history` do Neon do hermes-v2), com janela curta, como hoje (6 mensagens, 120 min).
- Modelo configurável por agente. O `hermes-v2` usa Claude Haiku 4.5 no Bedrock com API key no SSM; essa integração pode ser reaproveitada. Escolher o modelo é decisão aberta (seção 11).
- Streaming de resposta exige Lambda Function URL com response streaming atrás do CloudFront; a API Gateway HTTP API não faz isso. Começar sem streaming (resposta inteira) e migrar se a espera incomodar.
- Segredos (Bedrock, Perplexity, Gemini) no SSM, lidos no cold start, como já é feito.

### Portar do hermes-v2, em vez de reescrever

- `src/time/`: fuso `America/Sao_Paulo` fixo, semana de segunda a domingo, operação de segunda a sábado, relógio injetável.
- Regra da produtividade semanal sem IA: taxa de concluídas entre as tarefas com prazo na semana; `produtiva` a partir de 80%, `razoável` a partir de 50%.
- Métricas da quinta, revisão do sábado, check-ins de segunda, terça, quarta e sexta.
- Semântica de lembretes semanais.
- Classificação determinística do Renato (prefixos `ideia:`, hashtags `#estudo`, `@projeto`).
- Testes de cada uma dessas regras vão junto.

### Tarefas e metas como databases

Hermes passa a operar sobre dois databases: **Tarefas** (título, prazo, status, meta) e **Metas** (título, prazo, status). Isso exige **relação entre databases**, que hoje não existe (ver `docs/databases.md`, "Fica para depois"). A relação tarefa para meta entra antes dos agentes.

## 7. Avisos proativos sem Telegram

Hoje o Hermes empurra mensagens: check-ins, métricas, revisão, lembretes. Sem Telegram, o app precisa de outro canal.

- **Caixa de entrada do chat**: toda mensagem proativa vira uma mensagem do agente na conversa, com a nota do check-in ou da revisão criada como página.
- **Web Push** no PWA instalado (Android e Chrome no Linux) para avisar fora do app. Exige service worker e chaves VAPID.
- **Agendamento**: manter o EventBridge Scheduler do `hermes-v2` (um schedule por regra, fuso `America/Sao_Paulo`, invoca a Lambda com um `kind`). Evita polling, então o Neon continua dormindo quando ninguém usa. Lembretes criados pelo agente criam schedules no grupo de lembretes, como hoje, com o limite de 20.
- Quem toca em dado depois do webhook é a mesma camada de dados do restante.

## 8. Camada de estudo

### SRS (FSRS)

- `cards` e `reviews` já existem. Cards `basic` e `cloze` saem do corpo das páginas, com `fingerprint` estável para que editar o texto ao redor não zere o histórico.
- Servidor aplica o FSRS (`ts-fsrs`) e devolve o novo estado. A revisão tem `id` gerado no cliente, então reenviar é seguro.
- Tela de revisão no app. O Hermes lembra da revisão diária pelo canal da seção 7.
- Cards gerados por IA nascem `suspended` até você aprovar.

### Trilha de estudo

- Database **Trilha** com tópico, status, fonte, horas, nível e próxima revisão, ligado às Metas por relação.
- Revisão semanal do Hermes inclui retenção, cards com mais `lapses` e lacunas.

### Perplexity e Gemini como ferramentas

- **Perplexity** (pesquisa com fontes): `research` recebe uma pergunta e devolve nota bruta com citações e URLs guardadas na página. Serve para mapear um assunto, comparar tecnologias e ver o estado da arte.
- **Gemini** (contexto longo): `summarize` lê PDFs, textos longos e links, e devolve resumo e rascunho de cards; `quiz` gera perguntas, em especial sobre os pontos fracos que o SRS identificou.
- Ambos entram como rascunho. O ciclo de estudo é: pesquisar, ler, você reescrever com suas palavras e fazer algo prático, aprovar os cards, revisar todo dia.

## 9. Migração e aposentadoria

Ordem obrigatória, para nada ser perdido:

1. Backup do banco do asa (já existe `backup/`) e export do Notion e do repositório do Vault.
2. Importadores únicos em `scripts/`, idempotentes (rodar duas vezes não duplica):
   - Notion para databases Tarefas e Metas, mantendo ids para mapear as relações.
   - `Hermes/{metas,tarefas,checkins,revisoes}` e `Renato/Notas` do GitHub para páginas, preservando datas e `originalContent` do Renato.
3. Hermes e Renato rodando no asa em paralelo ao Telegram por um período curto, para conferir.
4. Desligar: remover o webhook do Telegram, revogar token do Notion e o PAT do GitHub, arquivar o repositório do Vault e o `hermes-v2`, apagar os schedules antigos.

## 10. Roadmap

0. **Limpeza**: remover passkey (seção 4), atualizar README e este documento, apagar código de ponte Obsidian que sobrou (`vault_path`, `source_md`, `origin = obsidian`).
1. **Diagramas** (seção 5): bloco Mermaid e página canvas. Independente do resto e entrega valor imediato.
2. **Tarefas e metas**: relação entre databases, filtros e view de calendário no mínimo para "hoje" e "semana"; importadores do Notion e do Vault.
3. **Agentes**: painel de chat, `POST /chat`, ferramentas, Hermes e Renato com as regras portadas.
4. **Avisos**: EventBridge, Web Push, caixa de entrada do chat; check-ins, métricas, revisão e lembretes. Aqui o Telegram, o Notion e o Vault são desligados.
5. **SRS**: cards no corpo, tela de revisão, FSRS.
6. **Estudo com IA**: Perplexity e Gemini como ferramentas, trilha, quiz nos pontos fracos.
7. **PWA**: captura rápida, cache offline de leitura e fila de capturas.

## 11. Em aberto

- Área e meta de estudo (stack, senioridade, objetivo), que define a estrutura da Trilha.
- Modelo dos agentes: continuar com Haiku no Bedrock, ou usar Gemini ou Claude direto pela API.
- Se o agente precisa de streaming desde o início.
- Gatilho do cadastro inicial da senha sem o token de bootstrap.
- Domínio próprio (agora opcional).
