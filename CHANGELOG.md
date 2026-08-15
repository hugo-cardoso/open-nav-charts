# Changelog

Todas as alterações notáveis deste projeto são registadas neste ficheiro.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere
ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-08-14

Primeira versão: o esqueleto estrutural do monorepo. Não há ainda lógica de domínio de cartas
náuticas — esta versão entrega a base sobre a qual ela será construída.

### Adicionado

- Monorepo pnpm com workspaces em `packages/` (bibliotecas) e `apps/` (aplicações),
  Node.js 22 fixado em `.nvmrc` e `engines.node`, e pnpm como único gestor suportado.
- Configuração partilhada na raiz, herdada por todos os pacotes: `biome.json` para lint e
  formatação, `tsconfig.base.json` com TypeScript em modo estrito, e `vitest.shared.ts` para
  testes. Um pacote novo fica coberto pelos três portões sem alterar a raiz.
- Comandos agregadores executáveis a partir da raiz — `lint`, `lint:fix`, `format`,
  `typecheck`, `test`, `test:watch`, `test:coverage`, `build` — e o portão de pré-merge
  `check`, que encadeia lint, build, tipos e testes, abortando na primeira falha.
- `@open-nav-charts/core`: biblioteca de referência com `formatCoordinate`, que formata
  coordenadas geográficas em graus decimais com hemisférios explícitos.
- `@open-nav-charts/cli`: aplicação de referência que consome o core via `workspace:*`,
  exercitando a fronteira entre pacotes do workspace.
- Documentação da feature em `specs/001-monorepo-skeleton/`: especificação, plano, pesquisa,
  modelo de dados, contratos e guia de validação com 14 cenários.
- `README.md` cobrindo instalação, comandos, estrutura e criação de novos pacotes.

### Alterado

- Constituição do projeto para 1.1.0: adota GitFlow como modelo de ramificação, fixando
  `main` e `develop` como permanentes e definindo os prefixos `feature/*`, `release/*` e
  `hotfix/*`.

### Notas

- O bloqueio a gestores de pacotes não suportados funciona — `npm install` falha e não gera
  lockfile —, mas o npm rebenta ao resolver o protocolo `workspace:*` antes de executar o
  hook `preinstall`, pelo que a mensagem exibida é um erro interno do npm em vez da mensagem
  do `only-allow`.
