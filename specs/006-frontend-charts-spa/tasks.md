---

description: "Lista de tarefas da feature 006 — aplicação web de consulta a cartas"
---

# Tasks: Aplicação web de consulta a cartas

**Input**: Documentos de design em `/specs/006-frontend-charts-spa/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Obrigatórios.** O template trata testes como opcionais, mas o Princípio IV da
constituição os torna NÃO NEGOCIÁVEIS: toda lógica de domínio, regra de negócio e utilitário
compartilhado MUST ter teste unitário, e a suíte completa MUST passar antes de qualquer merge.
As tarefas de teste abaixo não são dispensáveis.

**Organization**: Agrupadas por história de usuário, para que cada uma seja implementável e
testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: História a que a tarefa pertence (US1, US2, US3, US4)
- Todo caminho de arquivo é relativo à raiz do repositório

## Path Conventions

Pacote único novo: `apps/web/`. Testes convivem com o código em `src/`, no padrão
`*.test.ts(x)`, como já fazem `apps/api` e `apps/jobs` — o `vitest.shared.ts` da raiz inclui
`src/**/*.test.ts`.

⚠️ **Nenhuma tarefa altera `apps/api`, `apps/jobs` ou `packages/*`.** Esta feature apenas
consome a API existente.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Criar o pacote `apps/web` e sua cadeia de build, teste e qualidade.

⚠️ **Versões são fixas.** `react-router` MUST ser 7.x e `jsdom` MUST ser 29.x — as versões
correntes (8.x e 30.x) exigem Node acima do ambiente e **falham a instalação** com
`engine-strict=true` (research R2 e R3). Não "atualizar" sem verificar `engines`.

- [X] T001 Criar `apps/web/package.json` com nome `@open-nav-charts/web`, `private: true`, `type: "module"`, `engines.node: "22.x"` e scripts `dev`, `build`, `preview`, `test`, `test:watch`, `test:coverage`, `typecheck`, espelhando as convenções de `apps/api/package.json`
- [X] T002 Instalar dependências de runtime em `apps/web` nas versões fixadas por research.md: `react@19.2.8`, `react-dom@19.2.8`, `@mantine/core@9.5.1`, `@mantine/hooks@9.5.1` (versão idêntica à do core, exigência de peer), `react-router@7.18.2`, `@tanstack/react-query@5.101.4`
- [X] T003 Instalar dependências de desenvolvimento em `apps/web`: `vite@8.2.1`, `@vitejs/plugin-react@6.0.5`, `jsdom@29.1.1`, `@testing-library/react@16.3.2`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `postcss`, `postcss-preset-mantine`, `postcss-simple-vars`, `@types/react`, `@types/react-dom`
- [X] T004 [P] Criar `apps/web/tsconfig.json` estendendo `tsconfig.base.json` e sobrescrevendo `module: "preserve"`, `moduleResolution: "bundler"`, `types: ["vite/client"]`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"` e `noEmit: true`, preservando todas as flags de rigor da base (research R9)
- [X] T005 [P] Criar `apps/web/tsconfig.test.json` no padrão de `apps/api/tsconfig.test.json`, incluindo os arquivos `*.test.tsx`
- [X] T006 [P] Criar `apps/web/vite.config.ts` registrando o plugin de React e definindo o servidor de desenvolvimento
- [X] T007 [P] Criar `apps/web/postcss.config.cjs` com `postcss-preset-mantine` e `postcss-simple-vars` (sem ele os mixins responsivos do Mantine não são processados, o que atinge FR-025)
- [X] T008 [P] Criar `apps/web/index.html` com o elemento raiz e o módulo de entrada `/src/main.tsx`
- [X] T009 [P] Criar `apps/web/.env.example` documentando `VITE_API_BASE_URL=http://localhost:3000`
- [X] T010 Criar `apps/web/vitest.config.ts` fazendo merge de `vitest.shared.ts` com `environment: "jsdom"`, o plugin de React, `setupFiles` apontando para `src/testing/setup-tests.ts` e `include` cobrindo `src/**/*.test.tsx`
- [X] T011 Verificar que `pnpm install` na raiz conclui sem `ERR_PNPM_UNSUPPORTED_ENGINE` e que `pnpm lint` já cobre `apps/web` sem nova configuração de Biome

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cliente de API, tratamento de erros, tema, provedores e utilitários de teste —
tudo que **todas** as histórias consomem.

**⚠️ CRITICAL**: Nenhuma história pode começar antes desta fase terminar.

### Configuração e tipos

- [X] T012 [P] Criar `apps/web/src/config/environment.ts` lendo e validando `VITE_API_BASE_URL`, normalizando barra final e falhando de forma explícita quando ausente ou malformada (contracts/api-client.md §"Base e configuração")
- [X] T013 [P] Criar `apps/web/src/api/types.ts` com `AirportLocation`, `AirportSummary`, `AirportDetail`, `Runway`, `Procedure`, `PageResponse<T>`, `CollectionResponse<T>` e `ApiErrorBody`, espelhando data-model.md §1 — todos os campos nulos como `T | null`
- [X] T014 [P] Criar `apps/web/src/errors/error-messages.ts` com o tipo `ErrorCode`, o tipo `ApiFailure` e a tabela `code` → texto **em inglês**, incluindo `NETWORK_ERROR`, `UNEXPECTED_RESPONSE`, a marcação `retryable` e o recuo para `INTERNAL_ERROR` em código desconhecido (contracts/api-client.md §"Mapeamento")

### Utilitários de teste (habilitam todo teste de componente)

- [X] T015 Criar `apps/web/src/testing/setup-tests.ts` importando `@testing-library/jest-dom/vitest` e instalando stubs de `window.matchMedia` e `ResizeObserver` — **sem isso todo teste sob `MantineProvider` falha** com `TypeError: window.matchMedia is not a function` (research R5)
- [X] T016 [P] Criar `apps/web/src/testing/api-fixtures.ts` com respostas de exemplo fiéis ao contrato: aeródromo completo, aeródromo com todos os campos de `location` nulos, aeródromo sem pistas, procedimentos com `hasChart` verdadeiro e falso, página vazia e cada envelope de erro
- [X] T017 Criar `apps/web/src/testing/render.tsx` exportando um `render` que já envolve o componente em `MantineProvider`, `QueryClientProvider` (com repetição desativada) e roteador de memória — os testes MUST usar este utilitário, nunca o `render` cru

### Cliente de API

- [X] T018 Criar `apps/web/src/api/client.ts` com o `fetch` tipado: composição da URL base, envio somente de `GET`, sem credenciais, conversão de qualquer falha em `ApiFailure` e omissão de parâmetros em valor padrão (enviar `search=` vazio seria recusado com `400`)
- [X] T019 Criar `apps/web/src/api/client.test.ts` cobrindo: montagem da query com omissão de padrões, resposta de erro convertida em `ApiFailure` com o `code` correto, `fetch` rejeitado virando `NETWORK_ERROR`, corpo fora do envelope virando `UNEXPECTED_RESPONSE` — `fetch` global sempre stubbado (Princípio IV: sem rede real)
- [X] T020 [P] Criar `apps/web/src/errors/error-messages.test.ts` verificando que **todo** `ErrorCode` possui texto em inglês, que nenhum texto contém caracteres acentuados de pt-BR e que um código desconhecido recai em `INTERNAL_ERROR`
- [X] T021 [P] Criar `apps/web/src/api/airports.ts` com `listAirports(query)` e `getAirport(icao)`, normalizando o ICAO para maiúsculas antes da requisição
- [X] T022 [P] Criar `apps/web/src/api/procedures.ts` com `listProcedures(icao, type)` e `buildChartUrl(icao, procedureId)` — esta última **apenas monta a URL, nunca faz `fetch`** (research R6, FR-017)
- [X] T023 [P] Criar `apps/web/src/api/airports.test.ts` e `apps/web/src/api/procedures.test.ts` cobrindo normalização de ICAO, omissão de `type` nulo e o formato exato da URL da carta

### Tema, apresentação e casca da aplicação

- [X] T024 [P] Criar `apps/web/src/theme/theme.ts` com o tema Mantine e os pontos de quebra usados em toda a interface (nenhum valor literal de largura espalhado por componentes)
- [X] T025 [P] Criar `apps/web/src/i18n/messages.ts` centralizando **todo** texto visível da interface, em inglês (FR-024) — nenhuma cadeia embutida em componente
- [X] T026 [P] Criar `apps/web/src/components/feedback/` com os componentes dos cinco estados de tela — `idle`, `loading`, `empty`, `success`, `failure` — onde `failure` exibe texto derivado do `code` e oferece nova tentativa apenas quando `retryable` (FR-010, FR-019, FR-020)
- [X] T027 [P] Criar `apps/web/src/components/airports/airport-location.tsx` compondo apenas as partes não nulas de `city`, `state` e `country`, omitindo o elemento inteiro quando as três forem nulas (FR-023, data-model §3)
- [X] T028 [P] Criar `apps/web/src/components/airports/airport-location.test.tsx` verificando a omissão de campos nulos e a ausência de `"null"`, `"undefined"` ou rótulo órfão na saída renderizada
- [X] T029 Criar `apps/web/src/main.tsx` montando a árvore de provedores e importando `@mantine/core/styles.css` **antes** de qualquer estilo próprio (a ordem define a precedência das camadas)
- [X] T030 Criar `apps/web/src/app.tsx` com a composição de rotas de contracts/ui-routes.md: `/`, `/search`, `/airports/:icao` e o caminho curinga
- [X] T031 [P] Criar `apps/web/src/components/layout/` com a casca da aplicação — cabeçalho, navegação e região de conteúdo — responsiva de 320 px em diante (FR-025)
- [X] T032 [P] Criar `apps/web/src/pages/not-found-page.tsx` informando endereço desconhecido e oferecendo caminho de volta à busca (FR-005)

**Checkpoint**: Fundação pronta — `pnpm --filter @open-nav-charts/web dev` sobe a aplicação
com as rotas navegáveis, e as histórias podem começar em paralelo.

---

## Phase 3: User Story 1 - Encontrar um aeródromo e abrir a carta (Priority: P1) 🎯 MVP

**Goal**: Buscar aeródromos por ICAO ou nome, inspecionar os procedimentos publicados e abrir
a carta de um procedimento.

**Independent Test**: Partindo do painel de busca vazio, digitar um ICAO conhecido,
selecionar o aeródromo, escolher um procedimento com carta e confirmar que o documento abre
em nova aba (cenário C2 do quickstart).

### Busca de aeródromos

- [X] T033 [P] [US1] Criar `apps/web/src/hooks/use-airport-search.ts` com React Query, chave de cache derivada dos parâmetros e atraso na digitação (`useDebouncedValue` do `@mantine/hooks`), respeitando o limite de 120 req/min da API
- [X] T034 [P] [US1] Criar `apps/web/src/components/airports/airport-search-field.tsx` com rótulo associado ao campo — `placeholder` não é rótulo (SC-007)
- [X] T035 [US1] Criar `apps/web/src/components/airports/airport-results.tsx` exibindo ICAO, nome e localidade de cada resultado, e delegando os cinco estados aos componentes de `feedback/` (FR-007, FR-010)
- [X] T036 [US1] Criar `apps/web/src/pages/search-page.tsx` compondo campo, resultados e estados, com região `live` anunciando a mudança do conjunto de resultados (SC-007)
- [X] T037 [US1] Criar `apps/web/src/components/airports/airport-results.test.tsx` cobrindo os cinco estados: `idle` distinto de `empty`, `empty` distinto de `failure`, e `failure` com texto em inglês e ação de nova tentativa

### Detalhe do aeródromo e procedimentos

- [X] T038 [P] [US1] Criar `apps/web/src/hooks/use-airport-detail.ts` para `GET /v1/airports/:icao`
- [X] T039 [P] [US1] Criar `apps/web/src/hooks/use-procedures.ts` para `GET /v1/airports/:icao/procedures`
- [X] T040 [P] [US1] Criar `apps/web/src/components/airports/airport-header.tsx` exibindo nome, ICAO, localidade e pistas, omitindo comprimento e largura nulos individualmente e avisando quando não há pistas (FR-018, FR-023)
- [X] T041 [US1] Criar `apps/web/src/components/procedures/procedure-list.tsx` listando nome, tipo e emenda (quando não nula) de cada procedimento (FR-013)
- [X] T042 [US1] Criar `apps/web/src/components/procedures/chart-link.tsx` como **link real** (`<a>`) para `buildChartUrl`, com `target="_blank"` e `rel="noopener noreferrer"`, renderizado **somente** quando `hasChart` é `true`; a URL é montada no acionamento e nunca armazenada (FR-015, FR-016, FR-017)
- [X] T043 [US1] Criar `apps/web/src/pages/airport-page.tsx` disparando as duas requisições em **paralelo**, de modo que a falha de uma não impeça a exibição da outra (data-model §4)
- [X] T044 [US1] Tratar `AIRPORT_NOT_FOUND` em `airport-page.tsx` como tela de "não encontrado" com caminho de volta à busca, e ICAO fora do formato de 4 letras sem sequer emitir requisição (contracts/ui-routes.md)
- [X] T045 [P] [US1] Criar `apps/web/src/components/procedures/procedure-list.test.tsx` verificando que `hasChart: false` **não** renderiza controle de abertura — nem habilitado, nem desabilitado (FR-015)
- [X] T046 [P] [US1] Criar `apps/web/src/components/procedures/chart-link.test.tsx` verificando o formato da URL, `target` e `rel`, e que nenhuma requisição de rede é disparada ao renderizar a lista (prova de FR-017: a URL não é pré-carregada)
- [X] T047 [P] [US1] Criar `apps/web/src/components/airports/airport-header.test.tsx` cobrindo aeródromo sem pistas e com todos os campos de `location` nulos

**Checkpoint**: US1 completa — o produto já é utilizável de ponta a ponta e entrega o MVP.

---

## Phase 4: User Story 2 - Conhecer o produto pela tela inicial (Priority: P2)

**Goal**: Tela inicial que apresenta o produto e leva ao painel de busca em um acionamento.

**Independent Test**: Abrir o endereço raiz, verificar que a proposta é compreensível sem
conhecimento prévio e que o acionamento leva ao painel (cenário C1 do quickstart).

- [X] T048 [US2] Criar `apps/web/src/pages/landing-page.tsx` com nome do produto, descrição do acervo e acionamento visível para `/search`, **sem nenhuma requisição à API** — é o que sustenta SC-003 (visualmente completa em menos de 3 s em 3G rápido)
- [X] T049 [P] [US2] Criar `apps/web/src/pages/landing-page.test.tsx` verificando a presença dos elementos essenciais, o destino do acionamento e a ausência de chamada de rede na montagem

**Checkpoint**: US1 e US2 funcionam de forma independente.

---

## Phase 5: User Story 3 - Refinar a busca dentro de um acervo grande (Priority: P3)

**Goal**: Restringir resultados por estado e país, percorrer páginas e filtrar procedimentos
por tipo.

**Independent Test**: Com um termo amplo, aplicar filtro de estado e confirmar que os
resultados diminuem coerentemente; navegar entre páginas (cenários C4 e C5 do quickstart).

- [X] T050 [P] [US3] Criar `apps/web/src/components/airports/airport-filters.tsx` com os campos de estado e país, cada um com rótulo associado, empilhados em telas estreitas (FR-008, FR-025)
- [X] T051 [P] [US3] Criar `apps/web/src/components/airports/airport-pagination.tsx` usando o `hasNext` da API em vez de recalcular, e indicando a posição atual dentro do total (FR-009)
- [X] T052 [US3] Integrar filtros e paginação em `search-page.tsx`, garantindo que alterar `search`, `state` ou `country` redefine `page` para `1` (data-model §2)
- [X] T053 [US3] Exibir `INVALID_SEARCH`, `INVALID_STATE` e `INVALID_COUNTRY` **junto ao campo** correspondente, preservando o texto digitado (FR-021, FR-022)
- [X] T054 [P] [US3] Criar `apps/web/src/components/procedures/procedure-type-filter.tsx` normalizando o tipo para maiúsculas antes do envio (FR-014)
- [X] T055 [US3] Integrar o filtro de tipo em `airport-page.tsx`, refletindo-o na query string da rota
- [X] T056 [P] [US3] Criar `apps/web/src/components/airports/airport-pagination.test.tsx` cobrindo a página além do fim como estado `empty` com `200`, nunca `failure`
- [X] T057 [P] [US3] Criar `apps/web/src/components/airports/airport-filters.test.tsx` verificando que o erro de validação aparece junto ao campo e que o texto digitado é preservado

**Checkpoint**: US1, US2 e US3 funcionam de forma independente.

---

## Phase 6: User Story 4 - Retomar e compartilhar uma consulta (Priority: P3)

**Goal**: Estado de consulta espelhado na URL, histórico do navegador coerente e retorno à
busca preservando termo e filtros.

**Independent Test**: Navegar até um aeródromo, recarregar pelo endereço atual e confirmar
que o mesmo conteúdo é restaurado (cenário C5 do quickstart).

- [X] T058 [US4] Criar `apps/web/src/hooks/use-search-params.ts` espelhando `SearchQuery` na query string: omitir campos em valor padrão, sanear valores malformados para o padrão sem quebrar a tela e redefinir `page` ao trocar termo ou filtro (FR-003, data-model §2)
- [X] T059 [US4] Aplicar `replace` no histórico durante a digitação e `push` em mudanças de página e de filtro, para que o "voltar" não percorra cada tecla digitada (FR-004)
- [X] T060 [US4] Ligar `search-page.tsx` e `airport-page.tsx` ao estado da URL, garantindo que o retorno da tela do aeródromo preserve termo e filtros (FR-011) — o cache por chave de parâmetros torna o retorno imediato
- [X] T061 [P] [US4] Criar `apps/web/src/hooks/use-search-params.test.ts` cobrindo consulta ↔ URL nos dois sentidos, omissão de padrões, saneamento de parâmetros malformados e redefinição de `page` na troca de filtro
- [X] T062 [P] [US4] Criar `apps/web/src/pages/not-found-page.test.tsx` verificando a mensagem e o caminho de volta à busca

**Checkpoint**: Todas as histórias funcionam de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verificações que atravessam as histórias e fechamento dos critérios de sucesso.

- [ ] T063 [P] Auditar responsividade em 320 px, 768 px e 1440 px, confirmando ausência de rolagem horizontal e de elementos sobrepostos ou cortados (FR-025, SC-005, cenário C6)
- [ ] T064 [P] Auditar operação por teclado nas histórias P1 e P2: foco sempre visível, ordem de foco igual à visual, carta aberta por `Enter` (SC-007, cenário C7)
- [X] T065 [P] Definir título de documento próprio por tela e conferir a hierarquia de cabeçalhos (contracts/ui-routes.md §"Acessibilidade")
- [X] T066 [P] Auditar o idioma da interface: `grep` por caracteres acentuados de pt-BR em toda cadeia renderizada e confirmar que nenhum componente exibe `error.message` da API, que vem em português (FR-024, research R7)
- [X] T067 Criar `apps/web/README.md` em **português do Brasil** documentando execução, variáveis de ambiente e as versões travadas por conflito de engine, com o porquê (Princípio VI)
- [ ] T068 Executar o cenário C8 do quickstart: deixar a tela do aeródromo parada por mais de 6 minutos e abrir uma carta, provando que a URL assinada é resolvida no clique e não pré-carregada (FR-017)
- [ ] T069 Executar o cenário C9 do quickstart sob rede lenta, confirmando que a lista final corresponde ao termo mais recente e não a uma resposta atrasada (FR-012)
- [X] T070 Executar `pnpm check` na raiz — lint, build, typecheck e Vitest de todo o monorepo — e confirmar que passa integralmente (portão da constituição)
- [X] T071 Executar os cenários C1 a C7 do quickstart contra a API local e registrar o resultado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende da Phase 1 — **bloqueia todas as histórias**
- **User Stories (Phases 3-6)**: dependem da Phase 2; entre si podem correr em paralelo
- **Polish (Phase 7)**: depende das histórias desejadas estarem concluídas

### User Story Dependencies

- **US1 (P1)**: só depende da fundação. É o MVP.
- **US2 (P2)**: só depende da fundação. Não toca em nenhum arquivo de US1.
- **US3 (P3)**: só depende da fundação, mas **edita** `search-page.tsx` e `airport-page.tsx`,
  criados em US1 — se as duas correrem em paralelo, haverá conflito nesses dois arquivos.
- **US4 (P3)**: só depende da fundação, e **também edita** as mesmas duas páginas. US3 e US4
  MUST NOT ser trabalhadas simultaneamente por pessoas diferentes sem coordenação.

### Within Each User Story

- Hooks e componentes de folha antes das páginas que os compõem
- Componentes antes de seus testes de renderização
- História completa e validada antes de seguir para a próxima prioridade

---

## Estado da implementação (2026-08-16)

**67 de 71 tarefas concluídas.** O portão `pnpm check` passa integralmente: 458 testes em todo
o monorepo, 115 deles em `apps/web`, mais lint, build e typecheck limpos.

Validação executada no navegador contra a API local, com o acervo real (4439 aeródromos):

| Cenário | Resultado |
|---------|-----------|
| C1 — tela inicial | ✅ Produto, descrição e acionamento; nenhuma requisição à API |
| C2 — busca → procedimento → carta | ✅ PDF do Galeão aberto em nova aba, painel preservado |
| C3 — procedimento sem carta | ✅ Coberto por teste; indicação textual, sem controle |
| C4 — vazio, inválido e falha | ✅ Mensagem em inglês, nova tentativa, termo preservado |
| C5 — URL e histórico | ✅ Recarga e "voltar" restauram termo, filtros e resultados |
| C6 — responsividade | ⚠️ Parcial (ver abaixo) |
| C7 — teclado | ✅ Rótulos associados, foco, skip-link, um só `h1` |

**Defeito encontrado e corrigido durante a validação**: digitar "SBGL" rapidamente resultava
em busca por "L". Campos controlados diretamente pela URL perdem caracteres, porque a URL só
reflete a mudança no ciclo seguinte e cada tecla renderiza o valor anterior. A correção move o
texto para estado local, reconciliado com a URL. Travado por testes de regressão em
`airport-search-field.test.tsx` e `use-search-params.test.ts`.

### Tarefas pendentes

- [ ] T063 Auditoria visual de responsividade nas três larguras. **Parcial**: foi medido por
  script que o conteúdo cabe em 320 px sem overflow (`scrollWidth === 320`) e que não há
  rolagem horizontal em 570 px. Falta a inspeção visual em 768 px e 1440 px, procurando
  elementos sobrepostos ou cortados — o que uma medição de largura não detecta.
- [ ] T064 Auditoria completa de operação por teclado. **Parcial**: rótulos, foco, skip-link e
  hierarquia de cabeçalhos verificados por script. Falta percorrer as histórias P1 e P2
  usando apenas o teclado, conferindo a ordem de foco contra a ordem visual.
- [ ] T068 Cenário C8 — expiração da URL da carta. Exige deixar a tela parada por mais de 6
  minutos. O mecanismo está verificado por outras vias: a URL assinada observada no navegador
  trazia `X-Amz-Expires=300`, e `chart-link.test.tsx` prova que renderizar a lista não dispara
  requisição. Falta a confirmação temporal de ponta a ponta.
- [ ] T069 Cenário C9 — concorrência sob rede lenta. Exige limitar a rede a "3G lento" nas
  ferramentas de desenvolvimento. O descarte de respostas obsoletas está coberto pela chave de
  cache do React Query e por teste de acúmulo de digitação, mas não sob latência real.

### Parallel Opportunities

- Phase 1: T004 a T009 em paralelo (arquivos de configuração distintos)
- Phase 2: T012, T013, T014 em paralelo; depois T016, T020, T021, T022, T023 em paralelo;
  depois T024, T025, T026, T027, T028, T031, T032 em paralelo
- Phase 3: T033/T034 em paralelo; T038, T039, T040 em paralelo; T045, T046, T047 em paralelo
- Phase 5: T050, T051, T054 em paralelo; T056, T057 em paralelo
- Phase 7: T063, T064, T065, T066 em paralelo
- Entre histórias: US1 e US2 em paralelo com segurança; US3 e US4 exigem coordenação

---

## Parallel Example: User Story 1

```bash
# Hooks de dados da tela do aeródromo, juntos:
Task: "Criar use-airport-detail.ts em apps/web/src/hooks/"
Task: "Criar use-procedures.ts em apps/web/src/hooks/"
Task: "Criar airport-header.tsx em apps/web/src/components/airports/"

# Testes de componente da história, juntos:
Task: "Criar procedure-list.test.tsx em apps/web/src/components/procedures/"
Task: "Criar chart-link.test.tsx em apps/web/src/components/procedures/"
Task: "Criar airport-header.test.tsx em apps/web/src/components/airports/"
```

---

## Implementation Strategy

### MVP First (apenas US1)

1. Phase 1: Setup (T001–T011)
2. Phase 2: Foundational (T012–T032) — **crítica, bloqueia tudo**
3. Phase 3: US1 (T033–T047)
4. **PARAR e VALIDAR**: executar o cenário C2 do quickstart de ponta a ponta
5. Neste ponto o produto já entrega valor: busca → procedimento → carta

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → validar → **MVP entregue**
3. US2 → validar → produto com porta de entrada pública
4. US3 → validar → busca refinável
5. US4 → validar → consultas compartilháveis e histórico coerente
6. Polish → fecha SC-005, SC-006 e SC-007

### Parallel Team Strategy

1. Time conclui Setup + Foundational em conjunto
2. Em seguida:
   - Pessoa A: US1 (o caminho crítico, maior fase)
   - Pessoa B: US2 e, ao terminar, componentes de folha de US3 (T050, T051, T054)
3. US3 e US4 são integradas **após** US1, pois editam as páginas que ela cria

---

## Notes

- Tarefas `[P]` tocam arquivos distintos e não dependem de tarefa pendente
- Commits seguem Conventional Commits em pt-BR, **assunto de linha única**, sem corpo e sem
  coautoria de IA (constituição, "Commits e revisão")
- Textos da interface em **inglês** (exceção registrada no plan.md); comentários, README,
  commits e specs em **pt-BR**
- Nenhuma URL assinada de carta pode ser armazenada, cacheada ou pré-carregada (FR-017)
- Testes MUST usar `src/testing/render.tsx`; `render` cru falha sob `MantineProvider`
- `fetch` global sempre stubbado nos testes — sem rede real (Princípio IV)

---

## Evolução posterior à implementação

As tarefas acima registram a entrega original e permanecem como histórico. Os ajustes
seguintes foram pedidos depois, já com o produto rodando, e estão refletidos em
[spec.md](./spec.md), [plan.md](./plan.md) e [contracts/ui-routes.md](./contracts/ui-routes.md).

| Mudança | Efeito | Artefatos removidos |
|---------|--------|---------------------|
| Arquitetura *feature-based* | `src/` passou a ser cortado por domínio (`features/airports`, `features/procedures`) antes de por papel técnico, com `shared/` para o transversal e um `index.ts` por feature como API pública | — |
| Procedimentos em abas por grupo | STAR, IAC (com VAC), TAXI (ADC, AGMC, PDC) e SID, distinguidas por cor; `AOC` e tipos imprevistos caem em "Other". As abas do agrupamento são exibidas mesmo vazias | `procedure-type-filter` |
| Cache sem expiração dos procedimentos | Uma requisição por aeródromo; trocar de aba ou voltar não gera tráfego (`staleTime` e `gcTime` infinitos) | — |
| Busca por autocomplete de ICAO | O campo aceita apenas letras e sugere a partir de duas; escolher uma sugestão vai direto ao aeródromo, sem listagem intermediária | `airport-results`, `airport-pagination`, `airport-search-field`, `use-airport-search` |
| Seletor de país | Lista fechada com nomes (`Intl.DisplayNames`) em vez de campo de código; restringe as sugestões | `airport-filters` |
| Tela de busca reduzida | Apenas código ICAO e país; o filtro por unidade federativa deixou de ser exposto | — |

**Defeitos encontrados e corrigidos durante a validação no navegador**, cada um travado por
teste de regressão:

- Digitar rápido no campo de busca perdia caracteres ("SBGL" virava busca por "L"), porque o
  valor era controlado pela URL, que só atualiza no ciclo seguinte.
- O filtro por tipo desaparecia quando havia filtro ativo, deixando o usuário sem como
  removê-lo: as opções eram derivadas da lista **já filtrada**.
- O campo de autocomplete não emitia `aria-expanded`, então leitores de tela não anunciavam a
  abertura da lista.
