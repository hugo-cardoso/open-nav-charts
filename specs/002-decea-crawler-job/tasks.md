---

description: "Lista de tarefas da feature 002 — Coletor de aeroportos e cartas IFR do DECEA"
---

# Tasks: Coletor de aeroportos e cartas IFR do DECEA

**Input**: Documentos de design em `/specs/002-decea-crawler-job/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluídos e **obrigatórios**. Não por pedido explícito na spec, mas por imposição do
Princípio IV da constituição ("Testes com Vitest — NÃO NEGOCIÁVEL"): toda lógica de domínio e regra
de negócio precisa de teste unitário determinístico, e contratos entre pacotes do workspace exigem
teste de integração.

**Organization**: Tarefas agrupadas por história de usuário, permitindo implementar e validar cada
uma de forma independente.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: História a que a tarefa pertence (US1, US2, US3, US4)
- Todo caminho de arquivo é exato e relativo à raiz do repositório

## Path Conventions

Monorepo pnpm já existente: `apps/*` para aplicações executáveis, `packages/*` para bibliotecas.
`apps/` e `packages/` estão **vazios** — os pacotes de referência da feature 001 foram removidos e
nada nesta feature depende deles. A raiz já provê `biome.json`, `tsconfig.base.json`,
`vitest.shared.ts`, `.nvmrc` e os scripts agregadores (`pnpm check`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Criar os quatro pacotes do workspace e a infraestrutura local, herdando a configuração
já existente na raiz.

- [X] T001 [P] Criar `packages/domain/package.json` com nome `@open-nav-charts/domain`, `type: module`, `engines.node: 22.x`, exports do entrypoint público e scripts `build`/`typecheck`/`test`/`migrate`
- [X] T002 [P] Criar `packages/aisweb-client/package.json` com nome `@open-nav-charts/aisweb-client`, `type: module`, `engines.node: 22.x`, exports do entrypoint público e scripts `build`/`typecheck`/`test`
- [X] T003 [P] Criar `packages/object-storage/package.json` com nome `@open-nav-charts/object-storage`, `type: module`, `engines.node: 22.x`, exports do entrypoint público e scripts `build`/`typecheck`/`test`
- [X] T004 [P] Criar `apps/jobs/package.json` com nome `@open-nav-charts/jobs`, bin `open-nav-charts-jobs`, script `start` e dependências internas por `workspace:*` para os três pacotes
- [X] T005 [P] Criar `packages/domain/tsconfig.json`, `packages/aisweb-client/tsconfig.json`, `packages/object-storage/tsconfig.json` e `apps/jobs/tsconfig.json` estendendo `../../tsconfig.base.json` com `outDir: dist` e `rootDir: src`
- [X] T006 [P] Criar `packages/domain/vitest.config.ts`, `packages/aisweb-client/vitest.config.ts`, `packages/object-storage/vitest.config.ts` e `apps/jobs/vitest.config.ts` fazendo merge de `vitest.shared.ts` da raiz
- [X] T007 Instalar as dependências de produção nos pacotes corretos via `pnpm --filter`: `drizzle-orm`+`pg` em domain, `fast-xml-parser`+`zod` em aisweb-client, `@aws-sdk/client-s3` em object-storage, `commander`+`p-limit`+`zod` em apps/jobs (depende de T001–T004)
- [X] T008 [P] Instalar devDependencies de integração na raiz: `drizzle-kit`, `@testcontainers/postgresql`, `testcontainers`, `@types/pg`
- [X] T009 [P] Criar `docker-compose.yml` na raiz com PostgreSQL 17 (porta 5432) e MinIO (9000/9001) com healthchecks e criação automática do bucket `onc-charts` (FR-029)
- [X] T010 [P] Criar `.env.example` na raiz com as 9 variáveis de `contracts/jobs-cli.md` já apontando para os contêineres locais, deixando `AISWEB_API_KEY`/`AISWEB_API_PASS` em branco (FR-030)
- [X] T011 Adicionar o script `test:integration` na raiz em `package.json`, isolando os testes de integração do `pnpm test` padrão (research R9)

**Checkpoint**: `pnpm install` resolve o workspace com quatro pacotes e `pnpm check` passa em repositório ainda sem código de produção.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Entidades, interfaces, esquema do banco, cliente HTTP da fonte, armazenamento e o host
de rotinas — tudo que qualquer história precisa antes de existir.

**⚠️ CRITICAL**: Nenhuma história de usuário pode começar antes desta fase terminar.

### Domínio e persistência (`packages/domain`)

- [X] T012 [P] Definir os tipos `Airport`, `AirportRunway` e `AirportProcedure` em `packages/domain/src/entities/index.ts`, exatamente como em `contracts/domain-package.md` (readonly, sem dependência de ORM)
- [X] T013 [P] Definir as interfaces `AirportRepository`, `AirportProcedureRepository` e `AirportSyncRepository` em `packages/domain/src/repositories/index.ts` conforme `contracts/domain-package.md`
- [X] T014 Declarar o esquema Drizzle das tabelas `airport`, `airport_runway` e `airport_procedure` em `packages/domain/src/drizzle/schema.ts` com tipos, nulidade, PKs, FKs `ON DELETE CASCADE`, unique `(airport_icao, ident)` e índices em `state` e `airport_icao` (data-model.md)
- [X] T015 Criar `packages/domain/drizzle.config.ts` apontando para `src/drizzle/schema.ts` e `src/migrations/`, e gerar a migração inicial SQL em `packages/domain/src/migrations/` com `drizzle-kit generate` (FR-032, depende de T014)
- [X] T016 Implementar `createDatabase`, a interface `Database` e `runMigrations` em `packages/domain/src/drizzle/client.ts`, com o pool `pg` criado e fechado pelo chamador — sem singleton de módulo (Princípio III, research R5)
- [X] T017 Implementar `class DrizzleAirportRepository` em `packages/domain/src/drizzle/airport-repository.ts` com `findByIcao`, `listByState` e `save` (upsert por ICAO + substituição integral de pistas)
- [X] T018 Implementar `class DrizzleAirportProcedureRepository` em `packages/domain/src/drizzle/airport-procedure-repository.ts` com `listByAirport`, `saveAll` (upsert por id) e `deleteByIds`
- [X] T019 Implementar `class DrizzleAirportSyncRepository` em `packages/domain/src/drizzle/airport-sync-repository.ts`: upsert do aeródromo, substituição das pistas e *diff* dos procedimentos em **uma transação**, devolvendo `removedProcedureIds` (data-model.md, depende de T017, T018)
- [X] T020 Exportar a superfície pública (entidades, interfaces, `createDatabase`, `Database`, `runMigrations`) em `packages/domain/src/index.ts`, sem vazar tipos do Drizzle nem `any` (Princípio II)

### Cliente da fonte (`packages/aisweb-client`)

- [X] T021 [P] Definir a interface `AisWebClient` e os tipos `AirportDetails`/`ChartSummary` em `packages/aisweb-client/src/aisweb-client.ts` conforme `contracts/domain-package.md`
- [X] T022 [P] Definir `RetryableSourceError`, `PermanentSourceError` e `AuthenticationSourceError` em `packages/aisweb-client/src/errors.ts`, com a classificação da tabela de `contracts/aisweb-api.md`
- [X] T023 [P] Versionar as fixtures XML reais em `packages/aisweb-client/src/parsers/__fixtures__/`: `rotaer-list.xml`, `rotaer-sbgl.xml`, `rotaer-minimo.xml`, `cartas-sbgl.xml`, `cartas-vazio.xml` (contracts/aisweb-api.md)
- [X] T024 [P] Escrever os testes unitários dos parsers em `packages/aisweb-client/src/parsers/parsers.test.ts` sobre as fixtures, cobrindo `rotaer/@total`, extração de `AeroCode`, `CDATA` acentuado, `lat`/`lng` decimais, pistas, `<amdt>` vs. atributo `emenda` do envelope e resposta de cartas vazia (Princípio IV, depende de T023)
- [X] T025 Implementar `class RotaerParser` em `packages/aisweb-client/src/parsers/rotaer-parser.ts` com `fast-xml-parser` + validação Zod, consumindo `<lat>`/`<lng>` decimais e caindo em `latRotaer`/`lngRotaer` só como fallback (research R4, depende de T024)
- [X] T026 Implementar `class ChartsParser` em `packages/aisweb-client/src/parsers/charts-parser.ts` lendo `id`, `nome`, `tipo`, `<amdt>` e `link` (desescapando `&amp;`), conferindo `cartas/@total` contra a contagem de itens e tratando divergência como erro retentável (research R2, depende de T024)
- [X] T027 Implementar `class HttpAisWebClient` em `packages/aisweb-client/src/http-aisweb-client.ts` com `countAirports`, `listAirportIcaos`, `fetchAirport`, `fetchIfrCharts` (`especie=IFR`) e `downloadChart`, mapeando status HTTP para os erros tipados de T022 (depende de T021, T022, T025, T026)
- [X] T028 [P] Escrever teste unitário de `HttpAisWebClient` em `packages/aisweb-client/src/http-aisweb-client.test.ts` com `fetch` injetado por dublê, cobrindo a classificação de erro por status (timeout, 5xx, 429 → retentável; 4xx → definitivo; 401/403 → abortivo)
- [X] T029 Exportar a superfície pública do cliente em `packages/aisweb-client/src/index.ts`

### Armazenamento de objetos (`packages/object-storage`)

- [X] T030 [P] Definir a interface `ChartStorage` em `packages/object-storage/src/chart-storage.ts` conforme `contracts/domain-package.md`
- [X] T031 [P] Escrever teste unitário em `packages/object-storage/src/pdf-content.test.ts` para a validação de conteúdo: rejeita vazio e rejeita conteúdo que não começa com `%PDF-` (FR-019)
- [X] T032 Implementar a validação de assinatura PDF em `packages/object-storage/src/pdf-content.ts` (função pura, sem I/O — exceção prevista no plano, depende de T031)
- [X] T033 Implementar `class S3ChartStorage` em `packages/object-storage/src/s3-chart-storage.ts` com `buildKey` (`<ICAO>/<id>.pdf`), `exists`, `put` (validando via T032 antes de enviar, `Content-Type: application/pdf`) e `delete`, recebendo o `S3Client` por construtor (FR-017, FR-019, depende de T030, T032)
- [X] T034 [P] Escrever teste unitário de `buildKey` em `packages/object-storage/src/s3-chart-storage.test.ts`, garantindo ICAO em maiúsculo e sufixo `.pdf`
- [X] T035 Exportar a superfície pública em `packages/object-storage/src/index.ts`

### Host de rotinas (`apps/jobs`)

- [X] T036 [P] Definir a interface `Job` (`name`, `description`, `run(signal)`) em `apps/jobs/src/runtime/job.ts` conforme `contracts/jobs-cli.md`
- [X] T037 [P] Definir a interface `Clock` e a implementação `SystemClock` em `apps/jobs/src/runtime/clock.ts`, para relógio injetado (Princípio III, regra 7 do plano)
- [X] T038 [P] Escrever teste unitário de `EnvironmentConfig` em `apps/jobs/src/config/environment-config.test.ts`: lista **todas** as variáveis ausentes de uma vez e falha antes de qualquer coleta (FR-005)
- [X] T039 Implementar `class EnvironmentConfig` em `apps/jobs/src/config/environment-config.ts` com esquema Zod das 9 variáveis, agregando todos os erros em uma única mensagem (FR-004, FR-005, research R10, depende de T038)
- [X] T040 [P] Escrever teste unitário de `JobRegistry` em `apps/jobs/src/runtime/job-registry.test.ts`: resolve rotina por nome, rejeita nome duplicado e lista as registradas para o `--help`
- [X] T041 Implementar `class JobRegistry` em `apps/jobs/src/runtime/job-registry.ts`, permitindo adicionar rotinas sem tocar nas existentes (FR-002, FR-003, depende de T036, T040)
- [X] T042 Implementar `class CompositionRoot` em `apps/jobs/src/composition-root.ts` como **único** ponto que instancia classes concretas e monta o grafo, criando e fechando o pool do banco (Princípio III, regra 4 do plano, depende de T016, T027, T033, T039, T041)
- [X] T043 Implementar `apps/jobs/src/main.ts` com `commander`: despacha o subcomando pelo registro, trata `SIGINT`/`SIGTERM` via `AbortSignal` e devolve os códigos de saída `0`/`1`/`2`/`3`/`130` (FR-028, contracts/jobs-cli.md, depende de T042)

**Checkpoint**: Fundação pronta — `pnpm check` verde, `docker compose up -d` sobe banco e bucket, `migrate` cria o esquema e `open-nav-charts-jobs --help` responde. As histórias podem começar.

---

## Phase 3: User Story 1 - Coletar o cadastro de aeródromos (Priority: P1) 🎯 MVP

**Goal**: Ao final da rotina, todos os aeródromos do tipo `AD` publicados pela fonte estão no banco
com nome, ICAO, cidade, estado, latitude, longitude e lista de pistas.

**Independent Test**: Executar `decea-crawler --skip-documents` (ou `--only <ICAO>`) e conferir que a
contagem em `airport` corresponde ao total publicado pela fonte, com os campos obrigatórios
preenchidos e as pistas vinculadas.

### Tests for User Story 1 ⚠️

> Escrever antes da implementação e confirmar que falham.

- [X] T044 [P] [US1] Teste unitário do cálculo de páginas em `apps/jobs/src/jobs/decea-crawler/pagination.test.ts`: `Math.ceil` sobre o total, última página parcial preservada e encerramento em página vazia (research R1, cenário 3 da US1)
- [X] T045 [P] [US1] Teste unitário de `RetryPolicy` em `apps/jobs/src/runtime/retry-policy.test.ts` com `Clock` e fonte de aleatoriedade injetados: 3 tentativas no total, *backoff* exponencial com *jitter*, erro definitivo não consome tentativas (FR-021, research R7)
- [X] T046 [P] [US1] Teste unitário de `RunReport` em `apps/jobs/src/runtime/run-report.test.ts`: acumula sucessos, falhas e alertas com leitura imutável (FR-026, FR-027)
- [X] T047 [P] [US1] Teste unitário de `ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.test.ts` com dublês de `AisWebClient` e `AirportSyncRepository`: aeródromo sem cidade/UF/coordenadas é persistido com o disponível e registra alerta; aeródromo sem `name` falha (cenário 4 da US1, data-model.md)
- [X] T048 [P] [US1] Teste unitário de `DeceaCrawlerJob` em `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts` com dublês: percorre todas as páginas, respeita a concorrência de 4 e não interrompe a varredura quando um aeródromo falha em definitivo (FR-022, FR-023)

### Implementation for User Story 1

- [X] T049 [US1] Implementar o cálculo de páginas em `apps/jobs/src/jobs/decea-crawler/pagination.ts` (função pura), com `Math.ceil` e parada em página vazia (depende de T044)
- [X] T050 [US1] Implementar `class RetryPolicy` em `apps/jobs/src/runtime/retry-policy.ts` recebendo `Clock` e a fonte de aleatoriedade por construtor, distinguindo erro retentável de definitivo (depende de T037, T045)
- [X] T051 [US1] Implementar `class RunReport` em `apps/jobs/src/runtime/run-report.ts` com estado encapsulado em campos privados e leitura imutável (depende de T046)
- [X] T052 [US1] Implementar `class ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.ts`: busca o detalhamento pelo `AisWebClient` e grava aeródromo + pistas via `AirportSyncRepository`, registrando campos opcionais ausentes no relatório (FR-008, FR-009, FR-010, depende de T047, T051)
- [X] T053 [US1] Implementar `class DeceaCrawlerJob` em `apps/jobs/src/jobs/decea-crawler/decea-crawler-job.ts`: pagina de 100, aplica `p-limit` de 4 dentro de cada página e envolve cada aeródromo em `RetryPolicy` (FR-006, FR-007, FR-021, FR-023, depende de T049, T050, T052)
- [X] T054 [US1] Registrar `DeceaCrawlerJob` no `JobRegistry` dentro de `apps/jobs/src/composition-root.ts` e declarar as opções `--page-size`, `--concurrency`, `--max-attempts`, `--skip-documents` e `--only` em `apps/jobs/src/main.ts` (contracts/jobs-cli.md, depende de T043, T053)
- [X] T055 [P] [US1] Teste de integração dos repositórios de aeródromo em `packages/domain/tests/airport-repository.integration.test.ts` com `@testcontainers/postgresql`: migração aplica, upsert por ICAO não duplica e as pistas são substituídas integralmente (FR-010, Princípio IV)

**Checkpoint**: US1 completa e verificável sozinha — `decea-crawler --skip-documents` popula o catálogo nacional de aeródromos com pistas e coordenadas.

---

## Phase 4: User Story 2 - Coletar as cartas IFR de cada aeródromo (Priority: P2)

**Goal**: Cada aeródromo passa a ter suas cartas IFR persistidas com identificador, nome, tipo e
emenda, vinculadas a ele, e cartas que saíram de vigência deixam de constar.

**Independent Test**: Com o catálogo já populado, executar `decea-crawler --skip-documents` e conferir
que cada aeródromo tem suas cartas em `airport_procedure` com `storage_key` nula.

### Tests for User Story 2 ⚠️

- [X] T056 [P] [US2] Teste unitário do *diff* de cartas em `apps/jobs/src/jobs/decea-crawler/procedure-diff.test.ts`: cartas presentes são inseridas/atualizadas, ausentes são removidas e emenda alterada atualiza sem duplicar (FR-014, FR-015, cenários 3 e 4 da US2)
- [X] T057 [P] [US2] Teste unitário do alerta de tipo desconhecido em `apps/jobs/src/jobs/decea-crawler/chart-type-audit.test.ts`: tipo fora das 13 siglas da espécie IFR gera alerta no relatório **sem** descartar a carta (FR-012, research R2)
- [X] T058 [P] [US2] Estender o teste de `ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.test.ts`: aeródromo sem cartas permanece persistido e a rotina segue; carta sem `id`/`nome`/`tipo` torna o aeródromo falho (cenário 2 da US2, contracts/aisweb-api.md)

### Implementation for User Story 2

- [X] T059 [P] [US2] Implementar o *diff* de procedimentos em `apps/jobs/src/jobs/decea-crawler/procedure-diff.ts` (função pura sobre listas de cartas, sem I/O), produzindo os conjuntos a serem gravados e removidos (research R8, depende de T056)
- [X] T060 [P] [US2] Implementar `class ChartTypeAudit` em `apps/jobs/src/jobs/decea-crawler/chart-type-audit.ts` com as 13 siglas conhecidas, acumulando a distribuição de tipos e alertando os desconhecidos (FR-012, depende de T057)
- [X] T061 [US2] Estender `ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.ts` para buscar as cartas IFR pelo `AisWebClient`, aplicar o *diff* e gravá-las na mesma transação do aeródromo, alimentando `ChartTypeAudit` (FR-011, FR-013, depende de T052, T059, T060)
- [X] T062 [US2] Incluir cartas persistidas e alertas de tipo no resumo final de `apps/jobs/src/runtime/run-report.ts` e no progresso de `apps/jobs/src/runtime/progress-reporter.ts` (contracts/jobs-cli.md, depende de T051, T061)
- [X] T063 [P] [US2] Teste de integração de `DrizzleAirportSyncRepository` em `packages/domain/tests/airport-sync-repository.integration.test.ts`: a transação grava aeródromo, pistas e o *diff* de cartas atomicamente e devolve `removedProcedureIds` corretos (Princípio IV)

**Checkpoint**: US1 e US2 funcionam de forma independente — metadados completos de aeródromos e cartas, sem depender de documentos.

---

## Phase 5: User Story 3 - Arquivar o documento PDF de cada carta (Priority: P3)

**Goal**: O PDF de cada carta IFR é baixado e arquivado em `/<ICAO>/<id>.pdf`, sem rebaixar o que já
existe e removendo os documentos das cartas que saíram de vigência.

**Independent Test**: Com cartas já persistidas, executar a rotina e conferir no bucket um objeto por
carta, no caminho esperado, com conteúdo iniciando em `%PDF-`.

### Tests for User Story 3 ⚠️

- [X] T064 [P] [US3] Teste unitário de `ChartArchiver` em `apps/jobs/src/jobs/decea-crawler/chart-archiver.test.ts` com dublês de `AisWebClient` e `ChartStorage`: documento já existente não é baixado de novo (FR-018, cenário 2 da US3)
- [X] T065 [P] [US3] Teste unitário de `ChartArchiver` para falha de documento em `apps/jobs/src/jobs/decea-crawler/chart-archiver.test.ts`: conteúdo vazio ou não-PDF vira falha registrada e as demais cartas do aeródromo seguem sendo processadas (FR-019, cenário 3 da US3)
- [X] T066 [P] [US3] Teste unitário da ordem de gravação em `apps/jobs/src/jobs/decea-crawler/process-airport.test.ts`: arquiva no bucket → commit da transação → remove os objetos das cartas removidas, nunca o inverso (data-model.md, FR-020, cenário 4 da US3)

### Implementation for User Story 3

- [X] T067 [US3] Implementar `class ChartArchiver` em `apps/jobs/src/jobs/decea-crawler/chart-archiver.ts`: verifica existência pela chave determinística, baixa pelo `link` (fallback pelo id), valida o conteúdo e envia ao `ChartStorage` (FR-016, FR-017, FR-018, research R3, depende de T033, T064, T065)
- [X] T068 [US3] Ligar `ChartArchiver` ao `ProcessAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.ts` na ordem do data-model (arquivar → transação com `storage_key` → remover objetos após o commit), honrando `--skip-documents` (FR-020, depende de T061, T066, T067)
- [X] T069 [US3] Incluir documentos arquivados, já existentes e removidos no resumo final de `apps/jobs/src/runtime/run-report.ts` (contracts/jobs-cli.md, depende de T062, T068)
- [X] T070 [P] [US3] Teste de integração de `S3ChartStorage` em `packages/object-storage/tests/s3-chart-storage.integration.test.ts` contra MinIO efêmero via `testcontainers`: `put`/`exists`/`delete` com `forcePathStyle` e recuperação íntegra do conteúdo (Princípio IV, research R6)

**Checkpoint**: As três histórias de dado estão completas e independentemente verificáveis.

---

## Phase 6: User Story 4 - Executar a rotina de forma observável e reprodutível (Priority: P3)

**Goal**: A rotina roda por um comando único, exibe progresso contínuo, encerra com resumo e código
de saída significativo, e o ambiente local sobe com um comando.

**Independent Test**: Em máquina sem banco nem bucket instalados, subir o ambiente pelo comando
documentado, rodar a rotina e confirmar progresso na tela e resumo final.

### Tests for User Story 4 ⚠️

- [X] T071 [P] [US4] Teste unitário de `ConsoleProgressReporter` em `apps/jobs/src/runtime/progress-reporter.test.ts` com escritor injetado: emite início, página `n/N`, linha por aeródromo e tentativa `n/3` no formato de `contracts/jobs-cli.md` (FR-025)
- [X] T072 [P] [US4] Teste unitário do resumo em `apps/jobs/src/runtime/run-report.test.ts`: formata totais, lista cada falha definitiva de forma identificável e a duração (FR-026, FR-027)
- [X] T073 [P] [US4] Teste unitário do mapeamento de código de saída em `apps/jobs/src/runtime/exit-code.test.ts`: `0` sem falhas, `1` com falha definitiva, `2` configuração inválida, `3` credencial rejeitada/dependência indisponível, `130` interrupção (FR-028)

### Implementation for User Story 4

- [X] T074 [P] [US4] Implementar a interface `ProgressReporter` e `class ConsoleProgressReporter` em `apps/jobs/src/runtime/progress-reporter.ts` com o escritor de saída injetado por construtor (FR-025, depende de T071)
- [X] T075 [P] [US4] Implementar o mapeamento de código de saída em `apps/jobs/src/runtime/exit-code.ts` e aplicá-lo em `apps/jobs/src/main.ts` (FR-028, depende de T073)
- [X] T076 [US4] Implementar a formatação do resumo final em `apps/jobs/src/runtime/run-report.ts` conforme o bloco "Resumo" de `contracts/jobs-cli.md`, e emiti-la ao término inclusive em interrupção (FR-026, FR-027, depende de T069, T072)
- [X] T077 [US4] Garantir o encerramento limpo em `apps/jobs/src/main.ts` sob `SIGINT`/`SIGTERM`: nenhum aeródromo novo é iniciado, os em curso terminam, o resumo parcial é impresso e o pool do banco é fechado pelo `CompositionRoot` (código `130`, depende de T042, T043, T076)
- [X] T078 [P] [US4] Documentar em `README.md` o passo a passo do ambiente local e da execução da rotina, com as variáveis de `.env.example` (FR-030, SC-005)

**Checkpoint**: A rotina é operável e diagnosticável ponta a ponta; todas as histórias estão entregues.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T079 [P] Executar os cenários 1 a 6 de `quickstart.md` contra o ambiente local e corrigir divergências encontradas
- [X] T080 [P] Verificar a rastreabilidade FR → implementação da tabela de `data-model.md`, confirmando que FR-001 a FR-032 têm cobertura
- [X] T081 [P] Revisar a aderência ao Princípio III em `apps/jobs/src` e nos três pacotes: nenhum `new` de colaborador de I/O fora de `composition-root.ts`, nenhum `let` de nível de módulo, nenhuma instância exportada pronta
- [X] T082 [P] Conferir que `pnpm test` passa em máquina sem Docker e sem credenciais, e que os testes de integração só rodam por `pnpm test:integration` (Princípio IV, research R9)
- [X] T083 Rodar `pnpm check` (lint + build + typecheck + test) e deixá-lo verde — portão de merge da constituição
- [X] T084 Atualizar `CHANGELOG.md` com a feature 002 sob a versão não lançada
- [X] T085 Executar uma coleta parcial contra a AISWEB real, limitada à primeira página (`--page-size 100`, sem `--only`), e verificar: paginação percorrida com a última página parcial preservada, concorrência de 4 respeitada, nenhuma duplicata em reexecução, taxa de falha da amostra reportada no resumo e documentos arquivados em `/<ICAO>/<id>.pdf` (validação sistêmica de SC-001, SC-002 e SC-007 sobre amostra; a varredura completa do catálogo fica como passo operacional fora das tarefas)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa imediatamente
- **Foundational (Phase 2)**: depende da Phase 1 — **bloqueia todas as histórias**
- **US1 (Phase 3)**: depende da Phase 2. Não depende de nenhuma outra história
- **US2 (Phase 4)**: depende da Phase 2. Estende `ProcessAirport` da US1 — sequencial após a US1 na prática
- **US3 (Phase 5)**: depende da Phase 2. Arquiva os documentos das cartas coletadas na US2
- **US4 (Phase 6)**: depende da Phase 2. Os testes de progresso e código de saída podem ser escritos em paralelo às demais histórias; o resumo final consolida o que US1–US3 reportam
- **Polish (Phase 7)**: depende de todas as histórias desejadas

### User Story Dependencies

- **US1 (P1)**: independente — entrega o catálogo de aeródromos sozinha
- **US2 (P2)**: independentemente testável (`--skip-documents`), mas compartilha o arquivo `process-airport.ts` com a US1 — coordenar se paralelizada
- **US3 (P3)**: independentemente testável sobre cartas já persistidas; toca `process-airport.ts` e `run-report.ts`
- **US4 (P3)**: transversal por natureza — não entrega dado novo, torna as demais operáveis

### Within Each User Story

- Testes escritos antes e falhando, depois a implementação
- Funções puras (paginação, *diff*, validação de PDF) antes das classes que as consomem
- Repositórios antes dos casos de uso; casos de uso antes da rotina; rotina antes do registro na raiz de composição

### Parallel Opportunities

- Toda a Phase 1 marcada [P] roda junto (T001–T006, T008–T010)
- Na Phase 2, os três pacotes são independentes entre si: domain (T012–T020), aisweb-client (T021–T029) e object-storage (T030–T035) podem avançar em paralelo; `apps/jobs` (T036–T041) também, até `CompositionRoot` (T042), que precisa dos três
- Dentro de cada história, todos os testes marcados [P] rodam em paralelo
- Os testes de integração (T055, T063, T070) são independentes uns dos outros

---

## Parallel Example: Phase 2

```bash
# Três pacotes, três frentes simultâneas:
Task: "Entidades e interfaces do domínio (T012, T013)"
Task: "Interface AisWebClient, erros tipados e fixtures (T021, T022, T023)"
Task: "Interface ChartStorage e validação de PDF (T030, T031)"
```

## Parallel Example: User Story 1

```bash
# Todos os testes da US1 juntos, antes de qualquer implementação:
Task: "Teste de paginação em apps/jobs/src/jobs/decea-crawler/pagination.test.ts"
Task: "Teste de RetryPolicy em apps/jobs/src/runtime/retry-policy.test.ts"
Task: "Teste de RunReport em apps/jobs/src/runtime/run-report.test.ts"
Task: "Teste de ProcessAirport em apps/jobs/src/jobs/decea-crawler/process-airport.test.ts"
Task: "Teste de DeceaCrawlerJob em apps/jobs/src/jobs/decea-crawler/decea-crawler-job.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup — quatro pacotes e ambiente local
2. Phase 2: Foundational — **crítica, bloqueia tudo**
3. Phase 3: US1 — catálogo de aeródromos
4. **PARAR e VALIDAR**: cenário 2 do quickstart com `--skip-documents`, conferindo `airport` e `airport_runway`
5. O MVP já é útil: catálogo nacional de aeródromos consultável

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → catálogo de aeródromos (MVP)
3. US2 → cartas IFR vinculadas, ainda sem documentos
4. US3 → documentos arquivados no bucket
5. US4 → observabilidade e reprodutibilidade sobre tudo acima
6. Cada incremento agrega valor sem quebrar o anterior

### Parallel Team Strategy

1. Setup e Foundational feitos em conjunto — na Phase 2, um pacote por pessoa
2. Depois da fundação:
   - Pessoa A: US1 e, na sequência, US2 (compartilham `process-airport.ts`)
   - Pessoa B: US4 — progresso, resumo e códigos de saída, em paralelo
   - Pessoa C: US3 — `ChartArchiver` e o teste de integração do MinIO, integrando ao `ProcessAirport` depois da US2

---

## Notes

- Tarefas [P] tocam arquivos diferentes e não têm dependência pendente
- `process-airport.ts` é tocado por US1, US2 e US3 — é o ponto de coordenação se as histórias forem paralelizadas
- Commits em pt-BR, Conventional Commits com escopo de pacote; trabalho em `feature/002-decea-crawler-job`, destino `develop`
- Nenhum segredo versionado: apenas `.env.example`
- `pnpm check` verde é o portão de merge
