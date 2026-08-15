# Changelog

Todas as alterações notáveis deste projeto são registadas neste ficheiro.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere
ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-08-15

O primeiro código de produção do repositório: um host de rotinas operacionais e a rotina que
coleta o catálogo de aeródromos e cartas IFR do DECEA.

### Adicionado

- `@open-nav-charts/jobs` (`apps/jobs`): host de rotinas operacionais executáveis por linha de
  comando, com registo de rotinas, validação de configuração no arranque, progresso contínuo,
  resumo final e códigos de saída distintos (`0` limpo, `1` com falhas, `2` configuração
  inválida, `3` dependência indisponível, `130` interrompido).
- Rotina `decea-crawler`: coleta da API AISWEB do DECEA todos os aeródromos do tipo `AD` com
  coordenadas e pistas, as respetivas cartas IFR, e arquiva os PDFs em `<ICAO>/<id>.pdf` num
  bucket compatível com S3. Pagina de 100, processa 4 aeródromos em simultâneo e repete cada
  aeródromo até 3 vezes em falha transitória. Reexecutar é idempotente.
- `@open-nav-charts/domain` (`packages/domain`): entidades `Airport`, `AirportRunway` e
  `AirportProcedure`, interfaces de repositório e persistência em PostgreSQL com Drizzle, com
  migrações SQL versionadas. É o pacote que a futura API REST vai consumir.
- `@open-nav-charts/aisweb-client` (`packages/aisweb-client`): único ponto que conhece o XML,
  as credenciais e os nomes de campo da AISWEB. Classifica os erros da fonte em retentáveis,
  definitivos e de autenticação.
- `@open-nav-charts/object-storage` (`packages/object-storage`): abstração do bucket S3 com
  chave determinística e validação da assinatura `%PDF-` antes de gravar.
- Ambiente local com `docker compose up -d`: PostgreSQL 17 e MinIO com o bucket já criado, e
  `.env.example` com as nove variáveis documentadas.
- `pnpm test:integration`: testes contra PostgreSQL e MinIO efémeros via Testcontainers,
  isolados do `pnpm test`, que continua a correr sem rede e sem Docker.
- Documentação de utilização em `apps/jobs/README.md` (host, configuração, códigos de saída,
  como acrescentar uma rotina) e em `apps/jobs/src/jobs/decea-crawler/README.md` (opções da
  rotina, pipeline e peculiaridades da fonte).

### Removido

- Pacotes de referência `@open-nav-charts/core` (`packages/core`) e `@open-nav-charts/cli`
  (`apps/cli`). Existiam apenas para provar o esqueleto do monorepo ponta a ponta na versão
  0.1.0 e cumpriram esse propósito; nenhum código de produção dependia deles. Foram substituídos
  pelos pacotes do coletor do DECEA, listados acima.

### Notas

- Validado contra a AISWEB real a 2026-08-15: 4439 dos 4441 aeródromos publicados foram
  coletados (99,95%), em 45 páginas e cerca de 10 minutos com `--skip-documents`. As duas
  falhas são aeródromos que constam na listagem mas cujo detalhamento a fonte devolve vazio.
- A fonte publica o tipo de carta `AGMC`, ausente das 13 siglas conhecidas da espécie IFR. As
  cartas são persistidas na mesma e a rotina emite um alerta — a fonte é a autoridade. Convém
  confirmar a sigla com o DECEA.
- A fonte publica pistas repetidas em alguns aeródromos, uma das ocorrências com dimensões
  espúrias. O coletor deduplica mantendo a de maior comprimento; sem isso, o índice único
  `(airport_icao, ident)` derrubaria a gravação do aeródromo inteiro.
- Correr a rotina exige credenciais da AISWEB, pedidas no portal do DECEA, e um PostgreSQL e um
  bucket compatível com S3 — ambos sobem com `docker compose up -d`.

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
