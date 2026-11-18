# Prompt para o Claude Design

Prompt para colar no Claude Design. Gera o design completo do asa-notation antes da implementação. Baseado em [features.md](features.md).

---

## Prompt

Você é um designer de produto sênior. Crie o design completo de **asa-notation**: um hub pessoal e sob medida de anotações, estudo e assistentes de IA. Ele substitui Notion, Obsidian e Telegram. É de uso individual (um único usuário), em português do Brasil, com experiência desktop em primeiro lugar e PWA mobile logo depois.

### Como entregar

Entregue um **protótipo navegável e interativo**, não telas estáticas. Quero:

1. Um design system (tokens, componentes, estados, movimento).
2. Todas as telas listadas abaixo, em tema claro e escuro.
3. Fluxos clicáveis entre as telas, com dados de exemplo realistas em português.
4. Anotações de design **dentro do próprio design**: em cada tela e componente importante, deixe notas visíveis (num modo "Anotações" que eu ligo e desligo) explicando a intenção, o comportamento, os estados, a animação aplicada e a prioridade da funcionalidade. Essas notas servem de especificação para quem for implementar depois.

### Princípios

- Sensação de ferramenta rápida, calma e densa de informação, parecida com Notion e Linear, mas com identidade própria. Nada de visual genérico de template.
- Tipografia forte, muito espaço em branco, poucas cores de acento, bordas sutis.
- Tudo acessível por teclado. Atalhos visíveis nos menus.
- Saída de IA é sempre rascunho: precisa de um estado visual claro de "rascunho a aprovar" com aprovar, editar e descartar.

### Movimento e fluidez (requisito central)

O sistema precisa parecer fluido em cada interação. Defina um sistema de movimento com durações e curvas nomeadas (por exemplo rápido, médio, lento, mola) e aplique de forma consistente:

- Transições de página sem corte seco: elementos compartilhados se movem entre telas (título da página na árvore para o cabeçalho, linha do database para a página aberta).
- Árvore lateral: expandir e recolher com altura animada, seta girando, itens reordenáveis com arrastar.
- Editor de blocos: menu `/` abrindo com escala e fade a partir do cursor, bloco novo entrando com leve deslize, arrastar bloco com alça, sombra elevada, linha de destino e os vizinhos se afastando suavemente.
- Toggle abrindo e fechando, callout, menu de formatação flutuando ao selecionar texto.
- Kanban: cartão levantando ao arrastar, colunas abrindo espaço, soltar com mola.
- Tabela: troca de view (tabela, kanban, lista, calendário) com transição suave, filtros e ordenação reorganizando linhas com animação.
- Painel de chat dos assistentes deslizando da lateral, resposta chegando em streaming, ação do assistente (criar tarefa, anotar) aparecendo como cartão que se materializa.
- Captura rápida: atalho global abrindo um painel pequeno com foco imediato, salvando com confirmação discreta e desaparecendo.
- Toasts, notificações, check de tarefa concluída (microinteração satisfatória), cartão de estudo virando e a avaliação do FSRS deslizando.
- Estados de carregamento com skeletons, nunca spinners soltos.
- Respeitar `prefers-reduced-motion`: versão reduzida de cada animação.
- Meta de 60 fps: use apenas transformações e opacidade nas animações principais.

### Telas e componentes

**Shell**
- Barra lateral: árvore de páginas aninhadas, favoritos, recentes, atalhos para Hoje, Semana, Inbox, Estudo, Lixeira, configurações. Recolhível.
- Barra superior: caminho da página (breadcrumb), busca global, botão do chat, alternância de tema.
- Busca global estilo paleta de comandos (abrir páginas, executar ações, buscar conteúdo).
- Painel de chat lateral com seletor entre **Hermes** (rotina, tarefas, metas) e **Renato** (captura e organização de notas), cada um com identidade visual própria.

**A. Workspace e editor**
- Página com título, ícone e capa opcional.
- Blocos: texto, títulos, listas, checklist, código, citação, imagem, tabela simples, toggle, callout, divisor, embed, colunas.
- Menu `/` com busca e categorias, alça de arrastar, menu de formatação ao selecionar texto, menção `@` de página, links `[[ ]]`.
- Painel de backlinks na página.
- Templates de página, lixeira com restauração, histórico de versões, compartilhar por link público (estados e telas simples).

**B. Databases**
- Propriedades tipadas: texto, número, seleção, multi-seleção, data, checkbox, status, URL, relação.
- Views: tabela, kanban, lista, calendário. Barra de filtros, ordenação e agrupamento.
- Cada linha abre como página com corpo (peek lateral e página cheia).

**C. Diagramas**
- Bloco Mermaid com edição do código e preview ao vivo.
- Página canvas livre (estilo Excalidraw) com barra de ferramentas.
- Mapa mental gerado pelo assistente a partir de um tema, com exportar SVG e PNG.

**D. Tarefas e metas (Hermes)**
- Metas com prazo e status, tarefas ligadas a meta, subtarefas.
- Telas **Hoje** e **Semana** (atrasadas, do dia, sem prazo), tarefas recorrentes.

**E. Rotina e acompanhamento (Hermes)**
- Check-ins agendados, métricas da quinta, revisão do sábado com avaliação, lembretes semanais.
- Central de notificações e permissão de Web Push.
- Painel de progresso: tarefas, metas e constância (gráficos limpos, com animação de entrada).

**F. Captura e organização (Renato)**
- Captura rápida acessível de qualquer tela, Inbox, classificação (ideia, estudo, trabalho, projeto, referência), tags e projeto.
- Organizar e mover notas em lote, recuperar notas conversando ("o que anotei sobre X?").

**G. Assistentes**
- Chat com histórico, ações pelo chat, cartão de rascunho a aprovar, estado de streaming.

**H. Estudo**
- Trilha de estudo ligada às metas.
- Cards `basic` e `cloze` extraídos das páginas, tela de revisão com FSRS (frente, verso, quatro avaliações), fim de sessão.
- Estatísticas de retenção, erros e tempo. Fontes e referências por nota.
- Pesquisa com citações, resumo e quiz, quiz nos pontos fracos, sessão guiada com tutor socrático.

**I. Plataforma**
- Login só com senha.
- Instalação como PWA, estado offline com fila de capturas.
- Importação do Notion e do Vault do GitHub (assistente em passos com progresso).
- Backup e export (Markdown e JSON).
- Configurações: horários dos check-ins, fuso, chaves de IA, tokens de API, tema.

### Estados que preciso ver

Vazio, carregando (skeleton), erro, sucesso, offline, rascunho de IA, arrastando, selecionado, foco por teclado, desabilitado.

### Responsivo

Desktop (principal), tablet e celular. No celular: navegação inferior, árvore em gaveta, chat em tela cheia, captura rápida em destaque.

### O que não fazer

- Não use Obsidian, Telegram nem passkey em lugar nenhum da interface.
- Não invente funcionalidades fora da lista.
- Não use animação decorativa que atrase uma ação: nenhuma transição acima de 300 ms em interações frequentes.

### Ordem sugerida de trabalho

1. Design system e sistema de movimento.
2. Shell, árvore, busca e editor de blocos.
3. Databases e views.
4. Hoje, Semana, metas e tarefas.
5. Chat, captura rápida e Inbox.
6. Estudo e revisão FSRS.
7. Diagramas, plataforma e configurações.
8. Estados, responsivo e modo Anotações completo.

Comece pelo passo 1 e me mostre antes de seguir.
