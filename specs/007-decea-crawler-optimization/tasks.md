---

description: "Lista de tarefas da feature 007 — Otimização do tempo de execução do coletor DECEA"
---

# Tasks: Otimização do tempo de execução do coletor DECEA

**Input**: Documentos de design em `/specs/007-decea-crawler-optimization/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluídos e **obrigatórios** pelo Princípio IV da constituição: lógica de negócio exige
teste unitário determinístico (sem rede, sem relógio real) e mudanças de contrato entre pacotes do
workspace exigem teste de integração. Escrever cada teste **antes** da implementação e vê-lo falhar.

**Organization**: Tarefas agrupadas por história de usuário. As consultas em lote, a listagem do
bucket e a persistência nova são pré-requisito de todas as histórias e ficam na fase Foundational.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: História a que a tarefa pertence (US1, US2, US3)
- Todo caminho de arquivo é relativo à raiz do repositório

## Path Conventions

Monorepo pnpm existente. Pacotes tocados: `packages/aisweb-client`, `packages/object-storage`,
`packages/domain` e a aplicação `apps/jobs`. Dublês de teste da rotina em
`apps/jobs/src/testing/doubles.ts`. Testes de integração usam Testcontainers, como na feature 002.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch e fixtures reais das consultas em lote, que todos os testes de parser usam.

- [X] T001 Criar a branch `feature/007-decea-crawler-optimization` a partir de `develop` (GitFlow; não commitar em `main`)
- [X] T002 [P] Capturar e versionar `packages/aisweb-client/src/parsers/__fixtures__/rotaer-catalogo.xml`: recorte real de `area=rotaer&type=AD&rowstart=0&rowend=5000` com `<rotaer pagesize total>` e 3–4 itens completos (incluir `SBGL` e `SI5J`), mantendo `<dt>`, `ciad_id`, `<id>` e CDATA acentuado (ver contracts/aisweb-api.md, operação 1)
- [X] T003 [P] Capturar e versionar `packages/aisweb-client/src/parsers/__fixtures__/cartas-lote.xml`: recorte real de `area=cartas&especie=IFR` (sem `icaoCode`) preservando os atributos com espaços (`emenda="     2026-10-01     "`, `lastupdate="     {ts '2026-09-30 17:35:34'}     "`), com itens de pelo menos 3 ICAOs, um deles fora do catálogo (ex.: `SBEN`), e `total` ajustado ao número de itens; trocar a `apikey` dos `<link>` por `1234567890`
- [X] T004 [P] Criar as fixtures derivadas `packages/aisweb-client/src/parsers/__fixtures__/cartas-lote-truncado.xml` (`total` maior que os itens) e `packages/aisweb-client/src/parsers/__fixtures__/cartas-lote-sem-icao.xml` (um item sem `<IcaoCode>`) a partir de `cartas-lote.xml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contratos novos entre pacotes (contracts/packages.md) e persistência nova
(data-model.md). Nenhuma história começa antes desta fase.

**⚠️ CRITICAL**: Os tipos e interfaces desta fase são consumidos por todas as histórias.

### Fonte — `@open-nav-charts/aisweb-client`

- [X] T005 [P] Escrever testes de `RotaerParser.parseCatalog` em `packages/aisweb-client/src/parsers/parsers.test.ts`: lê `total` e entradas com `icao`, `name`, `city`, `state`, `latitude`, `longitude` de `rotaer-catalogo.xml`; ignora `<dt>`; meia coordenada vira ambas `null`; item sem `AeroCode` ou `name` é descartado e sinalizado (sem lançar); XML malformado lança `PermanentSourceError`
- [X] T006 [P] Escrever testes de `ChartsParser.parseCatalog` em `packages/aisweb-client/src/parsers/parsers.test.ts`: `lastUpdate` = `2026-09-30 17:35:34` (sem `{ts '…'}` e sem espaços), `airacCycle` = `2026-10-01`, `airportIcao` de cada carta vindo de `<IcaoCode>` e em caixa alta; `lastupdate` fora do formato `{ts '…'}` → `null`; `cartas-lote-truncado.xml` lança `RetryableSourceError`; `cartas-lote-sem-icao.xml` lança `PermanentSourceError`; emenda por carta continua vindo de `<amdt>`
- [X] T007 Adicionar os tipos `AirportCatalogEntry`, `AirportCatalogPage` e `IfrChartCatalog` e os métodos `listAirports(offset, limit)` e `fetchIfrChartCatalog()` à interface `AisWebClient` em `packages/aisweb-client/src/aisweb-client.ts`, e exportá-los em `packages/aisweb-client/src/index.ts` (contracts/packages.md)
- [X] T008 Implementar `parseCatalog` em `packages/aisweb-client/src/parsers/rotaer-parser.ts`, reaproveitando as regras de coordenadas e textos de `parseAirport` (decimal com sinal; sexagesimal só como recurso) e devolvendo os ICAOs descartados para o chamador alertar
- [X] T009 Implementar `parseCatalog` em `packages/aisweb-client/src/parsers/charts-parser.ts`, reaproveitando o esquema `zod` de item de `parse`, exigindo `IcaoCode` por item, mantendo a conferência `total` × itens e normalizando `lastupdate`/`emenda`
- [X] T010 Escrever testes em `packages/aisweb-client/src/http-aisweb-client.test.ts` (fetch injetado, sem rede): `listAirports` chama `area=rotaer&type=AD&rowstart&rowend`; `fetchIfrChartCatalog` chama `area=cartas&especie=IFR` **sem** `icaoCode`, `rowstart` ou `rowend`; status HTTP mapeados como nos métodos existentes
- [X] T011 Implementar `listAirports` e `fetchIfrChartCatalog` em `packages/aisweb-client/src/http-aisweb-client.ts`

### Bucket — `@open-nav-charts/object-storage`

- [X] T012 [P] Escrever teste de integração de `listKeys` em `packages/object-storage/tests/s3-chart-storage.integration.test.ts`: bucket vazio → conjunto vazio; com 1.005 objetos (forçar mais de uma página do `ListObjectsV2`) → todas as chaves, sem repetição
- [X] T013 [P] Adicionar `listKeys(): Promise<ReadonlySet<string>>` a `packages/object-storage/src/chart-storage.ts` e implementar em `packages/object-storage/src/s3-chart-storage.ts` com `ListObjectsV2Command` paginado por `ContinuationToken`

### Banco — `@open-nav-charts/domain`

- [X] T014 Adicionar `runwaysCheckedAt: timestamp("runways_checked_at", { withTimezone: true })` à tabela `airport` e a tabela `sourceSyncState` (`source` text PK, `last_update` text, `airac_cycle` text, `observed_at` timestamptz not null, `updated_at` timestamptz not null default now) em `packages/domain/src/drizzle/schema.ts` (data-model.md)
- [X] T015 Gerar a migração com `pnpm --filter @open-nav-charts/domain migrate:generate` em `packages/domain/src/migrations/` (`0003_*.sql` + `meta/`), conferindo que só adiciona a coluna anulável e a tabela
- [X] T016 Adicionar `AirportSnapshot`, `AirportSnapshotRepository`, `SourceSyncState`, `SourceSyncStateRepository`, o campo opcional `runwaysCheckedAt` em `AirportSyncInput` e `markRunwaysChecked(icaos, at)` em `AirportSyncRepository` em `packages/domain/src/repositories/index.ts`, exportando pelo entrypoint do pacote (contracts/packages.md)
- [X] T017 [P] Escrever teste de integração em `packages/domain/tests/airport-snapshot-repository.integration.test.ts`: `loadAll` devolve todos os aeródromos com pistas, cartas e `runwaysCheckedAt`, indexados por ICAO; aeródromo sem pista nem carta vem com listas vazias; coordenadas no formato do mapeador (6 casas)
- [X] T018 [P] Escrever teste de integração em `packages/domain/tests/source-sync-state-repository.integration.test.ts`: primeira observação grava com `observedAt = at`; mesmo par preserva `observedAt` original e atualiza só `updated_at`; par diferente (inclusive `null` vs. valor) substitui com o novo `observedAt`; `null`+`null` repetido não muda `observedAt`
- [X] T019 [P] Estender `packages/domain/tests/airport-sync-repository.integration.test.ts`: `syncAirport` grava `runways_checked_at` quando informado e o preserva quando omitido; `markRunwaysChecked` atualiza só a coluna, em lote, sem tocar `updated_at`; `archived_at` é preservado quando `storage_key` não muda e regravado quando muda
- [X] T020 Implementar `DrizzleAirportSnapshotRepository` em `packages/domain/src/drizzle/airport-snapshot-repository.ts` (três consultas — aeródromos, pistas, cartas — montadas em memória com os mapeadores de `packages/domain/src/drizzle/mappers.ts`)
- [X] T021 [P] Implementar `DrizzleSourceSyncStateRepository` em `packages/domain/src/drizzle/source-sync-state-repository.ts` com upsert condicional por `source`
- [X] T022 Implementar `runwaysCheckedAt` e `markRunwaysChecked` em `packages/domain/src/drizzle/airport-sync-repository.ts` e `packages/domain/src/drizzle/airport-repository.ts`, e trocar o `archivedAt` do upsert em `packages/domain/src/drizzle/airport-procedure-repository.ts` para preservar o valor existente quando `storage_key` não muda
- [X] T023 Expor os repositórios novos em `createDatabase` (objeto `Database`) em `packages/domain/src/drizzle/client.ts` e no entrypoint `packages/domain/src/index.ts`

### Dublês de teste da rotina

- [X] T024 Atualizar `apps/jobs/src/testing/doubles.ts`: `FakeAisWebClient` passa a implementar `listAirports`/`fetchIfrChartCatalog` a partir de catálogo e cartas configurados e a registrar quantas requisições estão em voo (pico); `FakeChartStorage.listKeys`; `FakeAirportSyncRepository.markRunwaysChecked`; novos `FakeAirportSnapshotRepository` e `FakeSourceSyncStateRepository`; helper `catalogEntry(...)`

**Checkpoint**: `pnpm typecheck` passa nos três pacotes; testes de parser, do cliente HTTP e de integração da fase verdes.

---

## Phase 3: User Story 1 — Pular aeródromos sem alteração na fonte (Priority: P1) 🎯 MVP

**Goal**: A rotina passa a usar as consultas em lote, compara o publicado com o persistido e só
trabalha nos aeródromos com mudança ou com pistas pendentes (FR-001 a FR-007, FR-012, FR-013).

**Independent Test**: Duas execuções seguidas sobre a mesma fonte: a segunda grava ≈ 0 aeródromos,
não consulta detalhamento de nenhum aeródromo não pendente, e o estado do banco e do bucket é
idêntico ao da primeira (quickstart §2–§3).

### Tests for User Story 1 ⚠️

- [X] T025 [P] [US1] Escrever testes de `airport-comparison` em `apps/jobs/src/jobs/decea-crawler/airport-comparison.test.ts`: cadastro igual com coordenada da fonte de 12 casas vs. persistida de 6 → igual; texto com espaços vs. aparado → igual; `null` vs. ausente → igual; nome diferente → diferente; pistas iguais em outra ordem → iguais; largura diferente → diferente; cartas: id novo, id removido, `amendment`/`name`/`type`/`sourceUrl` diferente → diferente; `archivedAt`/`updatedAt` diferentes → iguais
- [X] T026 [P] [US1] Escrever testes de `sync-planner` em `apps/jobs/src/jobs/decea-crawler/sync-planner.test.ts` com `Clock` fixo: pendência por `runwaysCheckedAt` nulo, por `runwaysCheckedAt < observedAt`, por idade > `revalidationDays`, por `--only` e por `--force`; o orçamento limita **só** os vencidos por idade, escolhendo os mais antigos; aeródromo novo → `refresh-runways`; cadastro diferente → `write`; carta diferente → `write`; carta sem chave no conjunto do bucket → `write`; tudo igual → `unchanged`; com `skipDocuments`, chave ausente não força `write`; cartas de ICAO fora do catálogo são devolvidas à parte e contadas
- [X] T027 [P] [US1] Reescrever `apps/jobs/src/jobs/decea-crawler/process-airport.test.ts` para o novo contrato: `refresh-runways` consulta `fetchAirport` e, sem diferença, devolve "marcar pistas" sem chamar `syncAirport`; com diferença, grava com `runwaysCheckedAt`; `write` não consulta `fetchAirport` e usa as pistas do retrato; detalhamento vazio continua falha definitiva; ordem bucket → transação → remoção de órfãos preservada; cadastro gravado vem do catálogo, não do detalhamento
- [X] T028 [P] [US1] Reescrever `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts` para o novo fluxo: segunda execução sobre o mesmo estado não grava nada e não consulta detalhamento; `observe` é chamado com o par do lote; mudança do par revalida todas as pistas; falha de detalhamento deixa o aeródromo pendente na execução seguinte; falha definitiva do catálogo ou das cartas em lote encerra sem gravar nada; interrupção não inicia novos aeródromos

### Implementation for User Story 1

- [X] T029 [P] [US1] Implementar as funções puras de igualdade (cadastro, pistas, cartas) em `apps/jobs/src/jobs/decea-crawler/airport-comparison.ts`, arredondando coordenadas da fonte a 6 casas como `packages/domain/src/drizzle/mappers.ts` e reaproveitando `diffProcedures` de `apps/jobs/src/jobs/decea-crawler/procedure-diff.ts` para inclusão/remoção de cartas
- [X] T030 [US1] Implementar `planSync(...)` em `apps/jobs/src/jobs/decea-crawler/sync-planner.ts`: recebe catálogo, cartas agrupadas por ICAO, retrato, chaves do bucket, `observedAt`, agora e opções (`force`, `only`, `revalidationDays`, `revalidationBudget`, `skipDocuments`); devolve um `AirportPlan` por aeródromo (`unchanged` | `write` | `refresh-runways`, com motivos) e as cartas fora do catálogo (data-model.md, "Regras de decisão")
- [X] T031 [US1] Adaptar `ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.ts` para receber `AirportPlan`, entrada do catálogo, cartas do lote, retrato e chaves do bucket; consultar `fetchAirport` só em `refresh-runways`; montar `Airport` a partir do catálogo com as pistas do detalhamento ou do retrato; devolver no `AirportOutcome` se gravou, se só revalidou pistas ou se nada mudou
- [X] T032 [US1] Reescrever `DeceaCrawlerJob.run` em `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.ts` no fluxo do plan.md: lotes (catálogo paginado com `pagination.ts`, cartas, retrato, chaves do bucket) → `sourceSyncState.observe` → `planSync` → fila única com `p-limit(concurrency)` e `RetryPolicy` por aeródromo só sobre os destinos diferentes de `unchanged` → `markRunwaysChecked` em lote para os revalidados sem mudança; `--only` restringe a fila aos ICAOs dados
- [X] T033 [US1] Adicionar as opções `--force`, `--revalidation-days <n>` (padrão 7) e `--revalidation-budget <n>` (padrão 1000), com validação de inteiro ≥ 1, em `apps/jobs/src/main.ts` e em `CrawlerRunOptions`/`DEFAULT_CRAWLER_OPTIONS` em `apps/jobs/src/composition-root.ts` (contracts/jobs-cli.md); acrescentar os casos em `apps/jobs/src/main.test.ts`
- [X] T034 [US1] Montar na `CompositionRoot` (`apps/jobs/src/composition-root.ts`) os repositórios de retrato e de estado da fonte e repassá-los ao `DeceaCrawlerJob`
- [X] T035 [US1] Atualizar `apps/jobs/tests/decea-crawler.integration.test.ts` (servidor HTTP falso + Postgres e S3 em Testcontainers): fonte servindo catálogo e cartas em lote; primeira execução grava tudo; segunda execução não grava nenhum aeródromo e faz zero requisições de detalhamento; carta de ICAO fora do catálogo não chega ao banco; aeródromo de detalhamento vazio fica fora da base

**Checkpoint**: US1 entregue — a rotina já roda inteira pelo caminho novo e o regime estável pula os aeródromos inalterados.

---

## Phase 4: User Story 2 — Processamento mais eficiente de cada aeródromo (Priority: P2)

**Goal**: Mesmo no pior caso (virada AIRAC, `--force`, primeira execução), nenhuma espera
desnecessária: lotes em paralelo, conferência de documentos por conjunto, fila sem barreira e no
máximo 4 requisições simultâneas à fonte (FR-008 a FR-011).

**Independent Test**: `--force` sobre base populada termina abaixo de 7 min 30 s com contagens
idênticas às da versão atual (quickstart §2 e §7).

### Tests for User Story 2 ⚠️

- [X] T036 [P] [US2] Escrever testes em `apps/jobs/src/jobs/decea-crawler/chart-archiver.test.ts`: chave presente no conjunto → `already-present` sem chamar `exists` nem `downloadChart`; chave ausente → baixa e envia; falha retentável continua sendo propagada; PDF inválido continua falha da carta
- [X] T037 [P] [US2] Acrescentar a `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts`: com `concurrency = 4` e 20 aeródromos pendentes, o pico de requisições em voo registrado pelo `FakeAisWebClient` nunca passa de 4; um aeródromo lento não impede os seguintes de começar (sem barreira); catálogo, cartas, retrato e chaves do bucket são solicitados em paralelo; `--skip-documents` não chama `listKeys`

### Implementation for User Story 2

- [X] T038 [US2] Trocar `storage.exists(key)` pela pertinência no conjunto de chaves recebido em `ChartArchiver.archive` em `apps/jobs/src/jobs/decea-crawler/chart-archiver.ts`, incluindo no conjunto as chaves recém-enviadas
- [X] T039 [US2] Disparar em paralelo (`Promise.all`, cada um com sua `RetryPolicy`) as quatro leituras iniciais em `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.ts`, pulando `listKeys` em `--skip-documents`
- [X] T040 [US2] Mudar o padrão de `--page-size` de 100 para 5000 em `apps/jobs/src/main.ts` e em `DEFAULT_CRAWLER_OPTIONS` em `apps/jobs/src/composition-root.ts`, ajustando `apps/jobs/src/main.test.ts`
- [X] T041 [US2] Remover de `AisWebClient` os métodos sem consumidor (`countAirports`, `listAirportIcaos`, `fetchIfrCharts`) em `packages/aisweb-client/src/aisweb-client.ts`, `packages/aisweb-client/src/http-aisweb-client.ts`, seus testes e `apps/jobs/src/testing/doubles.ts`; remover `RotaerParser.parseList` e `ChartsParser.parse` se ficarem sem uso, mantendo os testes de regra migrados para `parseCatalog`

**Checkpoint**: US1 + US2 — o pior caso fica abaixo da linha de base.

---

## Phase 5: User Story 3 — Visibilidade sobre onde o tempo é gasto (Priority: P3)

**Goal**: O resumo mostra duração total, gravados / inalterados / falhos, pistas revalidadas por
motivo, cartas fora do catálogo, indicador e AIRAC observados, e tempo por etapa (FR-014).

**Independent Test**: Executar a rotina e conferir que `gravados + inalterados + falhos =
aeródromos no catálogo` e que todas as linhas de contracts/jobs-cli.md aparecem.

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Escrever testes em `apps/jobs/src/runtime/run-report.test.ts`: novos contadores (`airportsWritten`, `airportsUnchanged`, `runwaysRefreshed` por motivo `airac`/`age`/`pending`, `chartsOutsideCatalog`); `recordPhase(name, ms)` acumula por etapa; indicador/AIRAC observados; `format` produz as seções do contrato; invariante gravados + inalterados + falhos = total; execução interrompida reflete só o que foi feito
- [X] T043 [P] [US3] Acrescentar a `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts`: com `Clock` controlado, cada etapa (`catalog`, `charts`, `runways`, `documents`, `database`) chega ao relatório com o tempo esperado

### Implementation for User Story 3

- [X] T044 [US3] Estender `RunReport` em `apps/jobs/src/runtime/run-report.ts` com os contadores, o registro de tempo por etapa, o indicador observado (valor e `observedAt`) e o novo `format` (contracts/jobs-cli.md, seção "Resumo final")
- [X] T045 [US3] Instrumentar com o `Clock` injetado as etapas em `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.ts`, `apps/jobs/src/jobs/decea-crawler/process-airport.ts` e `apps/jobs/src/jobs/decea-crawler/chart-archiver.ts`, registrando no `RunReport`
- [X] T046 [US3] Ajustar `ProgressReporter`/`ConsoleProgressReporter` em `apps/jobs/src/runtime/progress-reporter.ts` (e `apps/jobs/src/runtime/progress-reporter.test.ts`): sem páginas, anunciar o plano (`N a gravar, M a revalidar, K inalterados`) ao iniciar a fila e o progresso por aeródromo como hoje

**Checkpoint**: Todas as histórias entregues e mensuráveis pelo resumo.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T047 [P] Atualizar `apps/jobs/src/jobs/decea-crawler/README.md` (FR-015): opções novas e padrão de `--page-size`; passo a passo do novo fluxo; peculiaridades novas da fonte (indicador global, cartas e catálogo em lote, `rowstart`/`rowend` ignorados nas cartas, 32 ICAOs fora do catálogo, `<dt>` = data da consulta); significado de `archived_at`; tabela de arquivos com `sync-planner.ts` e `airport-comparison.ts`
- [X] T048 [P] Atualizar `specs/002-decea-crawler-job/contracts/aisweb-api.md` com um aviso no topo apontando para o adendo `specs/007-decea-crawler-optimization/contracts/aisweb-api.md`
- [X] T049 Rodar os portões de qualidade da raiz — `pnpm check` e `pnpm test:integration` — e corrigir o que falhar
- [X] T050 Executar contra a AISWEB real o roteiro de `specs/007-decea-crawler-optimization/quickstart.md` §2–§7 e anotar os resultados (duração, % inalterados, contagens) na seção "Desempenho observado" de `apps/jobs/src/jobs/decea-crawler/README.md`
- [ ] T051 Após o deploy, registrar em `apps/jobs/src/jobs/decea-crawler/README.md` as durações da primeira execução em produção (todas as pistas pendentes) e da seguinte (regime estável), confirmando SC-001 e SC-002 (quickstart §8)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup (fixtures). **Bloqueia todas as histórias.**
- **US1 (Phase 3)**: depende da Foundational. É o MVP e entrega sozinha a maior parte do ganho.
- **US2 (Phase 4)**: depende da US1 — refina o mesmo fluxo (`decea-crawler-job.ts`, `chart-archiver.ts`).
- **US3 (Phase 5)**: depende da US1; independe da US2 (pode correr em paralelo com ela, com cuidado em `decea-crawler-job.ts`).
- **Polish (Phase 6)**: depois das histórias desejadas.

### Dependências dentro das fases

- T007 → T008, T009 → T011 (tipos antes dos parsers, parsers antes do cliente HTTP).
- T014 → T015 → T016 → T020, T021, T022 → T023 (esquema → migração → interfaces → implementações → entrypoint).
- T024 depende de T007, T013 e T016.
- US1: T029 → T030 → T031 → T032 → T033, T034 → T035.
- US2: T038 e T039 dependem de T032; T041 só depois de T032 (último consumidor removido).
- US3: T044 → T045 → T046.

### Parallel Opportunities

- Setup: T002, T003 e T004 em paralelo.
- Foundational: as três frentes (fonte T005–T011, bucket T012–T013, banco T014–T023) em paralelo entre si; dentro do banco, T017, T018, T019 em paralelo e T021 em paralelo com T020/T022.
- US1: os quatro testes (T025–T028) em paralelo; T029 em paralelo com os testes.
- US2: T036 e T037 em paralelo.
- US3: T042 e T043 em paralelo; a fase toda pode correr em paralelo com a US2.
- Polish: T047 e T048 em paralelo.

---

## Parallel Example: Foundational

```bash
# Três frentes independentes, uma por pacote:
Task: "T005–T011 Catálogo e cartas em lote em packages/aisweb-client"
Task: "T012–T013 listKeys em packages/object-storage"
Task: "T014–T023 Coluna, tabela e repositórios em packages/domain"
```

## Parallel Example: User Story 1

```bash
Task: "T025 Testes de igualdade em apps/jobs/src/jobs/decea-crawler/airport-comparison.test.ts"
Task: "T026 Testes do planejador em apps/jobs/src/jobs/decea-crawler/sync-planner.test.ts"
Task: "T027 Testes de ProcessAirport em apps/jobs/src/jobs/decea-crawler/process-airport.test.ts"
Task: "T028 Testes do fluxo em apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) e Phase 2 (Foundational).
2. Phase 3 (US1).
3. **Parar e validar**: quickstart §2–§3 — segunda execução ≤ 5 min e ≥ 95% inalterados.
4. A US1 já cumpre SC-001 em regime estável; pode ir para `develop` sozinha.

### Incremental Delivery

1. Setup + Foundational → contratos novos prontos.
2. US1 → regime estável dentro da meta (MVP).
3. US2 → pior caso abaixo da linha de base (SC-002) e limite de concorrência garantido por teste.
4. US3 → resumo com tempos por etapa (SC-006).
5. Polish → documentação e medição em produção.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Commits em Conventional Commits pt-BR, **só a linha de assunto**, sem rodapé de coautoria (constituição).
- Escopo sugerido: `feat(aisweb-client)`, `feat(object-storage)`, `feat(domain)`, `feat(jobs)`, `docs(jobs)`.
- Nunca versionar fixture com a `apikey` real.
