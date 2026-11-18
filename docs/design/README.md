# Design do asa-notation (Claude Design)

Exportado do canvas do Claude Design em 2026-11-18. Cada tela é um arquivo `.dc.html` autocontido em `project/`, com dados de exemplo em português e o modo Anotações (pinos numerados e painel com intenção, estados, movimento e prioridade P0/P1/P2).

## Conteúdo

- `project/canvas.json`: índice do canvas. Lista as pranchas, os títulos (ex.: "7.4 · Login só com senha"), as páginas (passos 1 a 8 e Celular) e as posições.
- `project/*.dc.html`: uma tela ou componente por arquivo.
  - Passo 1: `Main` (fundamentos), `Movimento`, `Componentes`.
  - Passo 2: `Pagina`, `Busca`, `NovaPagina`, `Lixeira`, `Historico`, `Sidebar`.
  - Passo 3: `Database`, `DatabaseLinha`.
  - Passo 4: `Hoje`, `Semana`, `Metas`, `Rotina`, `Progresso`, `Notificacoes`.
  - Passo 5: `Chat`, `Inbox`, `PainelChat`, `Captura`, `NavInferior`.
  - Passo 6: `Estudo`, `Revisao`, `EstudoStats`, `Pesquisa`, `Tutor`.
  - Passo 7: `Mermaid`, `Canvas`, `MapaMental`, `Login`, `Importar`, `Configuracoes`.
  - Passo 8: `Estados`, `Anotacoes`, `Tablet-Database`, `Escuro-*`.
  - `Celular-*`: versões de celular (390×844) das telas acima.
- `assets/*.css`: CSS do design system, referenciado nos arquivos como `/_blob/<id>`.
  - `2590f769…`: tokens e componentes base (31 KB).
  - `335e3083…`: estilos de telas de app (3,8 KB).
  - `e230ac8d…`: estilos da captura e da navegação inferior (1,4 KB).

## Como ler

Os arquivos dependem do runtime do Claude Design (`support.js`, `<x-dc>`, `<sc-for>`, `<sc-if>`), que não está aqui. Eles servem como especificação (estrutura, classes, estados, textos e anotações), não para abrir direto no navegador. Para ver o protótipo rodando, use o link do canvas no Claude Design.
