# Salvar no Asa (extensão do Firefox e do Zen)

Botão na barra do navegador que manda a aba aberta para o Asa:

- **Salvar página**: artigo (lido com o Readability), transcrição de aula (seção "Transcrição" da Alura e afins, ou o painel de transcrição do YouTube depois de aberto) ou só o trecho selecionado. Vira uma página em "Leituras" (ou na pasta escolhida), com o link de origem no topo.
- **Carreira da Alura** (`cursos.alura.com.br/dashboard/career/...`): o mesmo botão gera uma lista de tarefas, um `- [ ]` por curso com link e subtítulo, agrupada por nível (os níveis fechados entram também; curso a 100% já vem marcado). Escolha a pasta Estudos no seletor.
- **Importar datas desta página**: manda o texto (ou a seleção) para a IA do Asa, que devolve provas, entregas e aulas de hoje em diante. Você marca quais viram tarefa. As que já existem com o mesmo título e data aparecem como "já é tarefa".

A extensão lê a página dentro do navegador, com o seu login, então funciona em área de aluno que o servidor não acessa. Vídeos não são guardados, só o texto.

Atalho: `Alt+Shift+S` abre o popup.

## Montar

```sh
npm run build -w @asa/extension      # gera apps/extension/dist
npx vitest run apps/extension        # testes da extração e do cliente da API
```

## Instalar

- **Para testar** (some ao fechar o navegador): `about:debugging#/runtime/this-firefox` > "Carregar extensão temporária" > escolher `apps/extension/dist/manifest.json`.
- **Para ficar instalada**: o Firefox e o Zen só instalam extensões assinadas pela Mozilla. A assinatura "unlisted" é gratuita, automática e não publica a extensão na loja:
  1. Crie uma conta em addons.mozilla.org e gere as chaves em addons.mozilla.org/developers/addon/api/key/.
  2. `WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run sign -w @asa/extension`
  3. O `.xpi` assinado sai em `.dev/extension/`. Arraste para uma janela do navegador para instalar.
  A cada versão nova, aumente `version` em `static/manifest.json` e assine de novo.

## Conectar

No Asa: Configurações > API > criar token de **escrita**. Na extensão: Opções > endereço (`https://asa.luizalves.dev`) e o token > "Salvar e testar". O token fica só no armazenamento local da extensão.
