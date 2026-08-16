# Implementation Plan: Aplicação web de consulta a cartas

**Branch**: `006-frontend-charts-spa` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-frontend-charts-spa/spec.md`

## Summary

Entregar uma aplicação web de página única que torna o acervo de cartas aeronáuticas
consultável por pessoas, consumindo exclusivamente a API REST já publicada
(`@open-nav-charts/api`). A aplicação tem uma tela inicial que apresenta o produto e um
painel de busca onde o usuário localiza aeródromos pelo código ICAO com autocomplete,
inspeciona os procedimentos publicados — agrupados por natureza em abas — e abre a carta de
um procedimento.

A abordagem técnica é um novo pacote de workspace `apps/web`, em React 19 com Mantine 9 e
Vite 8, roteado por `react-router` 7 e com estado de servidor gerido por React Query. A
carta é aberta por navegação direta à rota de redirect da API, em nova aba, resolvendo o
endereço assinado no instante do clique. Toda a pilha foi instalada e exercitada neste
ambiente antes deste plano — build, testes e verificação de tipos executados de fato
(ver [research.md](./research.md)), o que revelou três incompatibilidades reais de versão
que já estão contornadas nas versões fixadas.

## Technical Context

**Language/Version**: TypeScript 7.0.2 em modo `strict` (versão da raiz do monorepo);
Node.js 22.x apenas como ambiente de build e teste — o artefato final roda no navegador.

**Primary Dependencies**: React 19.2.8 · `@mantine/core` e `@mantine/hooks` 9.5.1 ·
`react-router` 7.18.2 · `@tanstack/react-query` 5.101.4 · Vite 8.2.1 ·
`@vitejs/plugin-react` 6.0.5 · `postcss-preset-mantine` 1.18.0

**Storage**: N/A — a aplicação não persiste dados. O estado de consulta vive na URL
(FR-003) e o cache de respostas é apenas em memória, descartado ao recarregar.

**Testing**: Vitest 4.1.10 com `environment: "jsdom"` (jsdom 29.1.1),
`@testing-library/react` 16.3.2 e `@testing-library/user-event`. Servidor de API simulado
por stub do `fetch` global — sem rede real, atendendo ao determinismo do Princípio IV.

**Target Platform**: Navegadores atuais em desktop e móvel, de 320 px de largura em diante.
Entregue como arquivos estáticos.

**Project Type**: Aplicação web de página única (SPA), somente leitura, consumidora de API.

**Performance Goals**: Tela inicial visualmente completa em menos de 3 s em 3G rápido
(SC-003); resultado de busca por ICAO visível em menos de 2 s em banda larga (SC-002).

**Constraints**: Sem rolagem horizontal de 320 px a 1440 px (FR-025, SC-005); todo texto
visível em inglês (FR-024); fluxos P1 e P2 operáveis por teclado com foco visível (SC-007);
nenhuma URL assinada de carta pode ser armazenada ou pré-carregada (FR-017, R6).

**Scale/Scope**: 3 telas (inicial, painel de busca, detalhe do aeródromo) mais uma tela de
endereço desconhecido; acervo da ordem de milhares de aeródromos, consultado por sugestões
de código.

## Constitution Check

*GATE: avaliado antes da Phase 0 e reavaliado após o desenho da Phase 1.*

| # | Princípio | Situação | Como o plano atende |
|---|-----------|----------|---------------------|
| I | Monorepo pnpm com Node.js 22 | ✅ PASS | Novo pacote `apps/web` sob o workspace já declarado (`apps/*`), com `package.json` escopado `@open-nav-charts/web`, `engines.node: "22.x"` e nome consistente com os demais. Nenhuma dependência entre pacotes por caminho relativo. |
| II | TypeScript como Padrão | ✅ PASS | Todo o código em TypeScript `strict`, estendendo `tsconfig.base.json` e preservando `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e `verbatimModuleSyntax`; apenas alvo de módulo e `lib` são ajustados para navegador (R9, verificado com `tsc` limpo). Vite é o bundler, como o princípio exige. `any` explícito não é usado. |
| III | OO no Backend, Composição no Frontend | ✅ PASS | Esta feature é integralmente frontend: componentes funcionais, lógica compartilhada em hooks e funções puras. Nenhuma hierarquia de classes — inclusive o cliente de API é um conjunto de funções, não uma classe. |
| IV | Testes com Vitest (NÃO NEGOCIÁVEL) | ✅ PASS | Vitest como único runner, herdando `vitest.shared.ts`. Testes determinísticos: `fetch` sempre stubbado, sem rede e sem relógio real. Script `test` exposto via `pnpm test`. |
| V | Qualidade Automatizada com Biome | ✅ PASS | O Biome da raiz já cobre `**`, alcançando `apps/web` sem nova configuração. Nenhum ESLint ou Prettier é adicionado — inclusive para JSX, formatado pelo próprio Biome. |
| VI | pt-BR na Comunicação, Inglês no Código | ⚠️ EXCEÇÃO REGISTRADA | Ver abaixo. Código em inglês: conforme. Documentação, comentários, commits e specs em pt-BR: conforme. Textos da interface em inglês: **desvio deliberado**. |

### Exceção documentada ao Princípio VI

A seção "Governança" da constituição exige que exceções sejam documentadas no plano da
feature, com escopo e prazo definidos. Esta é a única desta feature.

- **Desvio**: os textos visíveis da interface (rótulos, botões, mensagens de estado e de
  erro) são escritos em **inglês**, embora o Princípio VI determine pt-BR para "mensagens de
  erro voltadas ao usuário final".
- **Escopo**: restrito às cadeias de texto renderizadas ao usuário final dentro de
  `apps/web`. **Não** se estende a comentários de código, nomes de arquivo, documentação,
  mensagens de commit, descrições de PR nem aos artefatos em `specs/` — todos permanecem em
  pt-BR, como este próprio plano.
- **Justificativa**: decisão explícita do solicitante, confirmada durante a especificação. O
  inglês é a língua de trabalho da aviação e o público-alvo do produto lê cartas e fraseologia
  nesse idioma; uma interface em pt-BR sobre conteúdo aeronáutico em inglês seria menos
  utilizável para o usuário real.
- **Prazo**: vigente enquanto a aplicação for monolíngue. Caso um seletor de idioma entre no
  escopo, esta exceção é substituída por infraestrutura de i18n com pt-BR disponível, e o
  registro deve ser reavaliado.
- **Encaminhamento recomendado**: o Princípio VI foi escrito quando o repositório só continha
  backend e ferramentas, contexto em que "usuário final" e "mantenedor" se confundiam. Com um
  produto de interface pública no monorepo, essa distinção passa a existir. Recomenda-se uma
  emenda futura (MINOR) que separe *texto de manutenção* — sempre pt-BR — de *texto de
  produto*, cujo idioma é decisão da feature. Enquanto a emenda não ocorre, vale esta exceção.

### Reavaliação após a Phase 1

Nenhum princípio passou a ser violado pelo desenho. Os artefatos da Phase 1 mantêm o cliente
de API como funções puras (III), o mapeamento de erros como tabela de dados testável
isoladamente (IV) e não introduzem nenhuma ferramenta que substitua item das Restrições
Tecnológicas (Governança). A exceção do Princípio VI permanece a única, com escopo
inalterado.

## Project Structure

### Documentation (this feature)

```text
specs/006-frontend-charts-spa/
├── plan.md              # Este arquivo
├── spec.md              # Especificação da feature
├── research.md          # Phase 0 — decisões técnicas verificadas
├── data-model.md        # Phase 1 — modelos de visualização e estado
├── quickstart.md        # Phase 1 — guia de execução e validação
├── contracts/
│   ├── api-client.md    # Phase 1 — contrato consumido da API REST
│   └── ui-routes.md     # Phase 1 — contrato de rotas e estados de tela
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Phase 2 — gerado por /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── api/                      # Existente — não alterado por esta feature
├── jobs/                     # Existente — não alterado por esta feature
└── web/                      # NOVO — esta feature
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.test.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── postcss.config.cjs
    ├── .env.example
    └── src/
        ├── main.tsx                       # Ponto de entrada: monta a árvore de provedores
        ├── app.tsx                        # Composição de rotas
        ├── features/                      # Fatias verticais por domínio
        │   ├── airports/
        │   │   ├── index.ts               # API pública da feature (barrel)
        │   │   ├── api/airports.ts        # listAirports, getAirport
        │   │   ├── hooks/                 # use-icao-suggestions, use-airport-detail,
        │   │   │                          #   use-search-params (FR-003, FR-006, FR-018)
        │   │   ├── components/            # Autocomplete de ICAO, seletor de país,
        │   │   │                          #   cabeçalho e localidade do aeródromo
        │   │   └── pages/                 # search-page (FR-002), airport-page (FR-013)
        │   └── procedures/
        │       ├── index.ts               # API pública da feature (barrel)
        │       ├── api/procedures.ts      # listProcedures, buildChartUrl
        │       ├── domain/                # Agrupamento dos tipos em abas (FR-014)
        │       ├── hooks/use-procedures.ts# Procedimentos, cache sem expiração (FR-013)
        │       └── components/            # Lista, abas por grupo, link da carta
        └── shared/                        # Transversal: usado por mais de uma feature
            ├── api/                       # client.ts (fetch tipado), types.ts
            ├── domain/icao.ts             # Código ICAO: normalização e validação
            ├── domain/countries.ts        # Catálogo de países do seletor (FR-008)
            ├── config/environment.ts      # Leitura e validação da URL da API
            ├── errors/error-messages.ts   # ErrorCode → texto em inglês (R7, FR-020)
            ├── i18n/messages.ts           # Todo texto da interface, em inglês (FR-024)
            ├── theme/theme.ts             # Tema Mantine e pontos de quebra (FR-025)
            ├── hooks/use-document-title.ts
            ├── components/
            │   ├── layout/                # Shell da aplicação, cabeçalho, navegação
            │   └── feedback/              # Carregamento, vazio e erro (FR-010, FR-019)
            ├── pages/                     # landing-page (FR-001), not-found-page (FR-005)
            └── testing/                   # setup-tests (R5), render, api-fixtures
```

**Structure Decision**: Um único pacote novo, `apps/web`, escolhido por ser uma aplicação
executável — a mesma categoria de `apps/api` e `apps/jobs`, já prevista pelo Princípio I.
Nenhum pacote em `packages/` é criado nem alterado.

A organização interna é **feature-based**: o primeiro corte é por domínio (`features/airports`,
`features/procedures`), e só dentro de cada feature o código se separa por papel (`api`,
`hooks`, `components`, `pages`). Tudo que serve a mais de uma feature vive em `shared/`.

O que a estrutura impõe:

- **Cada feature tem um `index.ts`** que é sua API pública. Consumidores — a composição de
  rotas e outras features — importam dele, nunca de caminhos internos. Assim o interior da
  feature pode ser reorganizado sem tocar em quem a consome, e a superfície de acoplamento
  fica visível em um arquivo.
- **`shared/` não importa de `features/`.** A dependência é sempre feature → shared; o
  inverso inverteria a hierarquia e criaria ciclos.
- **Features não dependem umas das outras por vocabulário de domínio.** O código ICAO, que
  tanto a busca quanto os procedimentos usam, vive em `shared/domain/icao.ts` — deixá-lo em
  `airports` faria `procedures` depender daquela feature por duas funções puras de string.
  A única dependência entre features é a real: `airport-page` compõe a listagem de
  procedimentos, e o faz pelo barrel de `procedures`.

Especificamente, **não** foi criado um pacote compartilhado de tipos entre a API e o
frontend, embora o Princípio II mencione essa prática: os tipos de resposta hoje vivem em
`apps/api/src/presentation/responses.ts`, que é uma camada interna da API e não um
entrypoint público. Extraí-los seria uma refatoração da feature 003, fora do escopo desta.
O frontend declara seus próprios tipos espelhando o contrato observado, e
`contracts/api-client.md` registra essa duplicação deliberada e como detectá-la se divergir.

## Complexity Tracking

Nenhuma violação de princípio a justificar. A única exceção constitucional — idioma da
interface — está registrada na seção "Constitution Check" acima, com escopo e prazo, e
decorre de decisão explícita do solicitante, não de complexidade técnica adicional.

Duas escolhas que **adicionam** dependência merecem registro, ambas dentro das Restrições
Tecnológicas (nenhuma substitui ferramenta fixada pela constituição):

| Dependência | Por que é necessária | Alternativa mais simples rejeitada porque |
|-------------|----------------------|-------------------------------------------|
| `@tanstack/react-query` | Descarte de respostas obsoletas em digitação contínua (FR-012), estados distintos de carregamento/vazio/erro (FR-010, FR-019) e nova tentativa preservando parâmetros (FR-021) | `fetch` com `useState`/`useEffect` reimplementaria controle de corrida entre respostas — a origem de defeitos sutis que FR-012 existe para evitar — sem cobertura equivalente |
| `react-router` | Endereço próprio por estado de consulta (FR-003), histórico do navegador (FR-004) e rota desconhecida (FR-005) | Um roteador próprio sobre a History API reimplementaria correspondência de rotas e sincronização de histórico sem ganho |
