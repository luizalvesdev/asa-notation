# API do asa-notation

Backend em `apps/api`: TypeScript, Postgres (Neon em produção, PGlite no desenvolvimento e nos testes), uma Lambda atrás do CloudFront. Todas as rotas ficam sob `/api` (o prefixo é removido antes do roteamento). Corpo e respostas em JSON.

## Autenticação

Uma pessoa só, só senha. A sessão é um cookie assinado (`asa_session`, `HttpOnly`, `SameSite=Strict`, `Secure` em produção, 30 dias).

- Requisições que alteram dados (tudo que não é GET) precisam de `Origin` igual a uma das origens configuradas. Sem isso, 403.
- A senha tem de 12 a 200 caracteres, guardada com scrypt.
- 5 falhas seguidas bloqueiam o login por 15 minutos (429 com `retryAfterSeconds`). Cada falha informa `remaining`.
- O primeiro cadastro da senha não tem rota pública: `npm run set-password -w @asa/api` grava o hash direto no banco (usa `DATABASE_URL`, ou o parâmetro do SSM). No servidor de dev, a primeira subida gera uma senha e imprime uma vez (ou usa `DEV_PASSWORD`).

| Método | Rota | Sessão | Descrição |
| --- | --- | --- | --- |
| GET | `/auth/me` | não | `{ authenticated, hasPassword }` |
| POST | `/auth/password/login` | não | `{ password }`. 200, 401 `{ remaining }`, 429 `{ retryAfterSeconds }` |
| POST | `/auth/password/change` | sim | `{ currentPassword, newPassword }`. 403 se a atual estiver errada |
| POST | `/auth/logout` | não | Limpa o cookie |

## Páginas

Árvore de páginas aninhadas. O corpo é o JSON do editor (Tiptap, `{ "type": "doc", ... }`, até 500 KB). A ordem entre irmãs usa chaves fracionárias (`position`), então reordenar mexe em uma linha só. Apagar é soft delete: a subárvore inteira recebe o mesmo `deletedAt`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/pages/tree` | Todas as páginas ativas, sem corpo: `id, parentId, title, icon, favorite, position` |
| POST | `/pages` | `{ parentId?, title?, icon?, body? }`. Cria no fim das irmãs. 201 |
| GET | `/pages/:id` | Página com corpo |
| PATCH | `/pages/:id` | Qualquer de `title, icon, favorite, body`, mais `baseRev?`. 409 `{ page }` se o `rev` mudou |
| POST | `/pages/:id/move` | `{ parentId, before? ou after? }`. 409 `cycle` se mover para dentro de si mesma |
| DELETE | `/pages/:id` | Manda a subárvore para a lixeira. `{ deleted: n }` |
| GET | `/pages/trash` | Raízes da lixeira (o que foi apagado direto) |
| POST | `/pages/:id/restore` | Restaura a subárvore. Se o pai continua apagado, vai para a raiz |
| GET | `/pages/search?q=&limit=` | Título e conteúdo, com prefixo e sem diferenciar acento. Trecho com o termo entre U+0001 e U+0002 (nunca HTML) |
| GET | `/pages/:id/backlinks` | Páginas que citam esta com `[[Título]]` |

Links `[[Título]]` são extraídos do texto do corpo ao salvar e casam por título, sem diferenciar maiúsculas nem espaços repetidos. Renomear a página alvo desfaz o vínculo.

`rev` vem de uma sequência global e cresce a cada escrita. Serve para detectar conflito de edição (`baseRev`) e, mais tarde, para sincronização offline.

## Tarefas

Todas exigem sessão. Datas são `AAAA-MM-DD` (o dia local de quem usa) e horas `HH:MM`. Uma tarefa é `{ id, title, date, time, recurrence, done, goalId, goalTitle, subtasks }`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/tasks?from=&to=&today=` | Intervalo de até 63 dias. `days`: tarefas com data no intervalo, recorrentes já expandidas por dia. `late`: simples, não concluídas, antes de `today`. `undated`: sem data e não concluídas |
| POST | `/tasks` | `{ title, date?, time?, recurrence?, parentId?, goalId? }`. `recurrence`: `daily`, `weekdays` ou `weekly`. Hora e recorrência exigem data; subtarefa (`parentId`) não tem data. 201 |
| PATCH | `/tasks/:id` | Qualquer de `title, date, time, recurrence, goalId` (`null` desliga da meta). `date: null` limpa também hora e recorrência |
| POST | `/tasks/:id/done` | `{ done, date? }`. Em recorrente, `date` é obrigatório e conclui só aquele dia |
| POST | `/tasks/reschedule` | `{ ids, date }`. Muda a data de tarefas simples (ignora recorrentes e subtarefas). `{ updated: n }` |
| DELETE | `/tasks/:id` | Lixeira (com as subtarefas) |
| POST | `/tasks/:id/restore` | Restaura a tarefa e as subtarefas apagadas junto com ela |

## Metas

Todas exigem sessão. Meta: `{ id, title, description, dueDate, done, createdAt, tasksTotal, tasksDone }`. O progresso conta só tarefas principais, simples (sem recorrência) e não apagadas ligadas à meta. O status (no ritmo, atrás, em risco) não vem da API: o cliente compara progresso com o tempo entre `createdAt` e `dueDate`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/goals` | Metas ativas, por prazo (sem prazo por último) |
| POST | `/goals` | `{ title, description?, dueDate? }`. 201 |
| GET | `/goals/:id` | `{ goal, tasks }`, com as tarefas ligadas (abertas primeiro) |
| PATCH | `/goals/:id` | Qualquer de `title, description, dueDate, done` |
| DELETE | `/goals/:id` | Lixeira. As tarefas ficam soltas até a meta voltar |
| POST | `/goals/:id/restore` | Restaura a meta e religa as tarefas |

## Capturas (Inbox)

Todas exigem sessão. Captura: `{ id, text, kind, tags, createdAt }`. `kind` é `idea`, `study`, `work`, `project`, `reference` ou `null`. As tags vêm das `#hashtags` do texto. Arquivadas e movidas saem da Inbox.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/captures?kind=` | `{ items, counts }`. `kind`: um tipo, `none` (sem tipo) ou omitido. `counts` é sempre da Inbox inteira |
| POST | `/captures` | `{ text, kind?, id?, createdAt? }`. Com `id` do cliente, reenviar não duplica (fila offline). `createdAt` do futuro é ignorado. 201 |
| PATCH | `/captures/:id` | `text` e/ou `kind` (`null` limpa) |
| POST | `/captures/bulk` | `{ ids, action }`: `archive`, `restore` ou `kind` (com `kind`). Até 200 ids |
| POST | `/captures/:id/move` | `{ parentId }`. Cria uma página (1ª linha vira o título) e tira a captura da Inbox. 409 se já foi movida |

## Estudo

Todas exigem sessão. Cards são `basic` (frente e verso) ou `cloze` (`front` com `{{lacunas}}`, sem verso). O agendamento usa FSRS (`ts-fsrs`). Estado do card: `0` novo, `1` aprendendo, `2` revisão, `3` reaprendendo. Notas: `1` De novo, `2` Difícil, `3` Bom, `4` Fácil. No máximo 10 cards novos por dia.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/study/overview?dayStart=` | `dayStart` (ISO) é a meia-noite local. Devolve `dueReview`, `newAvailable`, `avgSeconds`, `decks` e `weak` (errados 2+ vezes em 7 dias) |
| GET | `/study/queue?dayStart=` | Vencidos e novos do dia (até 100), cada um com `preview`: quando volta para cada nota |
| POST | `/study/cards/:id/review` | `{ rating, durationMs? }`. Devolve `dueAt`, `state` e o novo `preview` |
| GET | `/study/cards?deckId=` | `deckId` é um id ou `none`. Até 500 |
| POST | `/study/cards` | `{ kind, front, back?, deckId? }` |
| POST | `/study/cards/bulk` | `{ deckId?, items }`. Itens com `sourcePageId` e `sourceKey` não duplicam: `{ created, skipped }` |
| DELETE | `/study/cards/:id` | Apaga (soft delete) |
| POST | `/study/extract` | `{ pageId }`. Procura `Pergunta :: resposta` (básico) e `texto {{lacuna}}` (lacuna) nos parágrafos e títulos. `exists` marca o que já virou card |
| POST | `/study/decks` | `{ title, goalId? }`. Trilha ligada a uma meta |
| PATCH | `/study/decks/:id` | `title` e/ou `goalId` |
| DELETE | `/study/decks/:id` | Os cards ficam sem trilha |
| GET | `/study/stats?tz=&days=` | Revisões por dia no fuso `tz`, retenção (cards em revisão lembrados), tempo, cards por estado, mais errados e vencimentos dos próximos 7 dias |

## Limites conhecidos

- O destaque do trecho na busca só marca o termo quando ele é digitado com o mesmo acento do texto.
- Não há exclusão definitiva: a lixeira só restaura.
- Ainda não existem databases, cards de estudo, tarefas, agentes nem notificações. O modelo de dados cresce por migrações (`apps/api/migrations`).

## Comandos

```bash
npm run dev -w @asa/api            # API local em http://localhost:8787 (PGlite em .dev/pgdata)
npm run migrate -w @asa/api        # aplica migrações no Neon (DATABASE_URL ou SSM)
npm run set-password -w @asa/api   # define a senha do dono
npm test                           # testes (Postgres real em memória)
```
