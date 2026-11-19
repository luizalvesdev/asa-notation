# Funcionalidades do asa-notation

Status: planejamento. Nada implementado. O projeto recomeça do zero; o código atual (`apps/`, `packages/`) é só referência.

## Objetivo

Um hub único, sob medida, para anotações, estudo e assistentes. Substitui o Notion, o Vault no GitHub, o Obsidian e o Telegram. Hermes e Renato passam a viver dentro do app.

Prioridades:

- **[1]** essencial no primeiro uso
- **[2]** logo depois
- **[3]** talvez

## Status da implementação

Atualizado depois do primeiro ciclo completo de telas.

**Feito**: todo o bloco A (workspace e editor, exceto embed e colunas), B (databases), D (tarefas e metas, com subtarefas e recorrência), E (rotina e acompanhamento, com avisos do app aberto), F (captura e organização), G (assistentes, com streaming do texto no servidor de desenvolvimento), H (estudo: trilhas, cards, revisão FSRS, estatísticas, quiz e sessão guiada pelo Tutor) e I (login por senha, PWA, importação, backup, tokens e configurações), mais Mermaid, canvas e exportação SVG/PNG do bloco C.

**Web Push** (19/11): os check-ins chegam como notificação do sistema com o app fechado. Configurações > Rotina > "Ligar neste aparelho". Um agendamento (EventBridge, `PushSchedule`, padrão a cada 15 min) chama a mesma Lambda com `{"job":"push"}`: gera os check-ins vencidos e manda os avisos não lidos das últimas 12 h, fora do horário de silêncio. Chaves VAPID criadas no primeiro uso e guardadas cifradas na tabela `secrets`; cifra aes128gcm e VAPID implementados com `node:crypto` e conferidos contra a implementação de referência (`http_ece`). Só aceita endpoints dos serviços de push (FCM, Mozilla, Apple, Windows). No iPhone, só com o app instalado na tela de início.

**Ficou de fora**:

- Blocos de embed e colunas.
- Mapa mental como tela própria: o Renato gera um diagrama `mindmap` em Mermaid como rascunho de página.
- Pesquisa com citações (Perplexity) e resumo e quiz com Gemini: o quiz e a sessão guiada rodam no Tutor, com o Claude.
- Streaming das respostas dos assistentes e servidor MCP.
- Captura por e-mail ou compartilhamento do Android.
- Importação direta por token do Notion ou do GitHub: a importação lê o `.zip` exportado ou uma pasta de Markdown.
- Edição de um card depois de criado, tabela CSV do Notion e imagens locais na importação.

## A. Workspace

- Páginas aninhadas com árvore lateral [1]
- Editor de blocos: texto, títulos, listas, checklist, código, citação, imagem, tabela simples [1]
- Menu `/`, arrastar blocos, atalhos de teclado [1]
- Busca global [1]
- Links `[[ ]]` e backlinks [1]
- Favoritos e recentes [2]
- Lixeira com restauração (soft delete) [1]
- Templates de página [2]
- Histórico de versões [3]
- Tema claro e escuro [1]
- Bloco toggle (recolhível) [1]
- Bloco callout e divisor [1]
- Menu de formatação ao selecionar texto (negrito, itálico, link, cor) [1]
- Menção `@` de página [2]
- Colunas lado a lado [2]
- Embed de link, vídeo e arquivo [2]
- Compartilhar página por link público [3]
- Edição colaborativa em tempo real [3]

## B. Databases

- Propriedades tipadas: texto, número, seleção, multi-seleção, data, checkbox, status, URL [1]
- Relação entre databases [1]
- Views: tabela e kanban [1]; lista e calendário [2]
- Filtros, ordenação, agrupamento [1]
- Rollups e fórmulas [3]
- Cada linha é uma página com corpo [1]

## C. Diagramas e mapas mentais

- Barra lateral e painel de assistentes com largura ajustável arrastando a borda (setas do teclado e duplo clique também; a largura fica guardada no navegador)
- Bloco Mermaid na página (fluxo, sequência, ER, C4, mindmap) [1], com arrastar para mover, roda do mouse para zoom e duplo clique para ajustar
- Página canvas livre (Excalidraw) [1]
- Mapa mental gerado pelo assistente a partir de um tema [2]
- Exportar SVG e PNG [2]

## D. Tarefas e metas (Hermes)

- Metas com prazo e status [1]
- Tarefas ligadas a meta, com prazo e status [1]
- Telas Hoje e Semana (atrasadas, do dia, sem prazo) [1]
- Tarefas recorrentes [2]
- Subtarefas [3]

## E. Rotina e acompanhamento (Hermes)

- Check-ins agendados (seg, ter, qua, sex) [1]
- Métricas da quinta e revisão do sábado, com avaliação por regra [1]
- Lembretes semanais [1]
- Notificações no app e Web Push [1]
- Painel de progresso: tarefas, metas, constância [2]

## F. Captura e organização (Renato)

- Captura rápida de qualquer tela [1]
- Inbox [1]
- Classificação (ideia, estudo, trabalho, projeto, referência), tags e projeto [1]
- Organizar e mover notas depois [2]
- Recuperar notas conversando ("o que anotei sobre X?") [1]
- Captura por e-mail ou compartilhamento do Android [3]

## G. Assistentes

- Painel de chat com seletor Hermes e Renato [1]
- Ações pelo chat: criar tarefa, anotar, buscar, criar diagrama [1]
- Histórico da conversa [1]
- Saída de IA entra como rascunho a aprovar [1]
- Streaming de respostas [3]
- Servidor MCP do asa, para ferramentas externas [3]

## H. Estudo

- Trilha de estudo ligada às metas [1]
- Cards `basic` e `cloze` extraídos das páginas [1]
- Revisão com FSRS [1]
- Estatísticas: retenção, erros, tempo [2]
- Fontes e referências por nota [1]
- Pesquisa com Perplexity, com citações [2]
- Resumo e quiz com Gemini [2]
- Quiz nos pontos fracos do SRS [2]
- Sessão guiada, tutor socrático [3]

## I. Plataforma

- Login só com senha (sem passkey) [1]
- PWA instalável [1]
- Cache offline de leitura e fila de capturas [2]
- Importar do Notion e do Vault do GitHub [1]
- Backup e export completo (Markdown e JSON) [1]
- Tokens de API para integrações [2]
- Configurações: horários dos check-ins, fuso, chaves de IA [1]

## Decisões registradas

- Tarefas e metas: módulo próprio com telas dedicadas, usando o mesmo mecanismo de linhas dos databases.
- Chat: painel único com seletor de agente (Hermes e Renato), cada um com seu prompt e suas ferramentas.
- Sem Obsidian, sem Telegram, sem passkey. Notion e Vault no GitHub são aposentados depois da importação.
- Saída de IA é sempre rascunho até o usuário aprovar.

## Perguntas abertas

- Área e meta de estudo (stack, senioridade, objetivo), que define a estrutura da Trilha.
- Modelo dos agentes: Haiku no Bedrock, Gemini ou Claude pela API.
- Ajustes nas prioridades acima e funcionalidades do Notion que ainda faltam.

## Próximas etapas do planejamento

1. Fluxos e telas: mapa de navegação e wireframes.
2. Modelo de dados.
3. Backend e API.
4. Só depois, implementação.

Contexto técnico anterior (rascunho de arquitetura a revisar nas etapas 2 e 3): [design.md](design.md).
