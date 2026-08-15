---

description: "Lista de tarefas da feature 003 — API REST de Aeródromos e Cartas"
---

# Tasks: API REST de Aeródromos e Cartas

**Input**: Documentos de design em `/specs/003-rest-api-airports/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md)

**Testes**: **incluídos e obrigatórios**. O Princípio IV da constituição é explícito — Vitest
para toda lógica de domínio, e testes de integração obrigatórios para mudanças em APIs
públicas de pacotes do workspace. As extensões de `domain` e `object-storage` são exatamente
isso.

**Organização**: agrupadas por história de usuário, para que cada uma possa ser implementada,
testada e demonstrada de forma independente.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: pode correr em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: história a que a tarefa pertence (US1–US5)
- Todo caminho de arquivo é relativo à raiz do repositório

## Convenções de caminho

Monorepo pnpm. App novo em `apps/api/`; pacotes estendidos em `packages/domain/` e
`packages/object-storage/`. Testes unitários ficam ao lado do código (`src/**/*.test.ts`);
testes de integração em `tests/**/*.integration.test.ts`.

---

## Phase 1: Setup (infraestrutura compartilhada)

**Objetivo**: criar o pacote `@open-nav-charts/api` em conformidade com o contrato de
estrutura de `specs/001-monorepo-skeleton/contracts/package-structure.md`.

- [X] T001 Criar `apps/api/package.json` como aplicação (sem `exports`, `main` ou `types`), com `name` `@open-nav-charts/api`, `private: true`, `type: "module"`, `engines.node: "22.x"`, `bin` apontando para `./dist/main.js`, os scripts obrigatórios (`build`, `typecheck`, `test`, `test:watch`, `test:coverage`, `test:integration`, `start`, `prestart`) e as dependências `@open-nav-charts/domain` e `@open-nav-charts/object-storage` por `workspace:*`
- [X] T002 [P] Criar `apps/api/tsconfig.json` estendendo `../../tsconfig.base.json` com `outDir: "dist"` e `rootDir: "src"`, e `apps/api/tsconfig.test.json` estendendo o anterior com `noEmit` e `rootDir: "."`, espelhando `apps/jobs/`
- [X] T003 [P] Criar `apps/api/vitest.config.ts` reexportando `../../vitest.shared.js` via `mergeConfig`, e `apps/api/vitest.integration.config.ts` com `include: ["tests/**/*.integration.test.ts"]`, `fileParallelism: false` e tempos limite de 180 s, espelhando `apps/jobs/`
- [X] T004 Instalar as dependências de produção do app em `apps/api/package.json` — `express@^5.2`, `zod@^4.4`, `helmet`, `cors`, `express-rate-limit` — e as de desenvolvimento `supertest`, `@types/express`, `@types/supertest`, `@types/cors`, e correr `pnpm install` na raiz
- [X] T005 Adicionar `@aws-sdk/s3-request-presigner@^3.1111.0` às dependências de `packages/object-storage/package.json`, fixando a mesma linha de versão do `@aws-sdk/client-s3` já presente

**Checkpoint**: `pnpm --filter @open-nav-charts/api build` corre sem erro sobre um `src/` vazio.

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Objetivo**: as extensões de pacote e a espinha do servidor HTTP. Nenhuma história pode
começar antes desta fase.

**⚠️ CRÍTICO**: as histórias dependem destas capacidades, que hoje não existem nos pacotes.

### Extensão do pacote `domain` — busca e normalização

- [X] T006 Implementar a função pura `normalizeSearchText` em `packages/domain/src/drizzle/mappers.ts`, aplicando `normalize("NFD")`, remoção de diacríticos por `/\p{Diacritic}/gu` e `toLowerCase()`, conforme [research.md R5](./research.md)
- [X] T007 [P] Escrever os testes unitários de `normalizeSearchText` em `packages/domain/src/drizzle/mappers.test.ts`, cobrindo acentos do português (`ã`, `ç`, `é`, `ô`), caixa mista e texto já normalizado (idempotência)
- [X] T008 Acrescentar a coluna `searchText` (`text`, anulável) à tabela `airport` em `packages/domain/src/drizzle/schema.ts`
- [X] T009 Gerar a migração com `pnpm --filter @open-nav-charts/domain migrate:generate` e editar o SQL resultante em `packages/domain/src/migrations/` para incluir o `UPDATE` de backfill com `translate()` e o índice `airport_search_text_idx` com `text_pattern_ops`, conforme [data-model.md §4](./data-model.md)
- [X] T010 Alterar `saveAirportWith` em `packages/domain/src/drizzle/airport-repository.ts` para preencher `searchText` com `normalizeSearchText(icao + " " + name + " " + (city ?? ""))` tanto no `insert` quanto no `onConflictDoUpdate`, de modo que a rotina `decea-crawler` continue funcionando sem alteração (depende de T006, T008)

### Extensão do pacote `domain` — contratos de consulta

- [X] T011 [P] Declarar o tipo `AirportSummary` como `Omit<Airport, "runways">` em `packages/domain/src/entities/index.ts` e exportá-lo em `packages/domain/src/index.ts`
- [X] T012 Declarar `AirportListQuery` (`page`, `pageSize`, `state?`, `search?`) e `AirportPage` (`items`, `total`) em `packages/domain/src/repositories/index.ts`, acrescentar `list(query)` a `AirportRepository` e `findById(id)` a `AirportProcedureRepository`, e exportar os tipos novos em `packages/domain/src/index.ts` (depende de T011)
- [X] T013 Implementar `list()` em `DrizzleAirportRepository` (`packages/domain/src/drizzle/airport-repository.ts`) com `limit`/`offset`, ordenação por `icao` ascendente, filtro opcional por `state`, busca opcional por `LIKE` sobre `searchText` com o termo normalizado, e contagem total em consulta separada — sem carregar pistas (FR-008) (depende de T006, T012)
- [X] T014 [P] Implementar `findById()` em `DrizzleAirportProcedureRepository` (`packages/domain/src/drizzle/airport-procedure-repository.ts`), devolvendo o procedimento ou `null` (depende de T012)
- [X] T015 Escrever os testes de integração das extensões de `domain` em `packages/domain/tests/`, contra PostgreSQL real via Testcontainers: paginação sem repetição nem omissão (SC-008), filtro por unidade federativa, busca por termo sem acento encontrando registro acentuado, e `findById` devolvendo `null` para id inexistente (depende de T009, T010, T013, T014)

### Extensão do pacote `object-storage` — URL assinada

- [X] T016 Acrescentar `presignGetUrl(key: string, expiresInSeconds: number): Promise<string>` ao contrato `ChartStorage` em `packages/object-storage/src/chart-storage.ts`
- [X] T017 Implementar `presignGetUrl` em `S3ChartStorage` (`packages/object-storage/src/s3-chart-storage.ts`) usando `getSignedUrl` de `@aws-sdk/s3-request-presigner` sobre um `GetObjectCommand`, sem ida à rede (depende de T005, T016)
- [X] T018 Repassar `presignGetUrl` no objeto devolvido por `createChartStorage` em `packages/object-storage/src/s3-client-factory.ts`, mantendo o SDK do S3 confinado ao pacote (depende de T017)
- [X] T019 [P] Escrever os testes unitários de `presignGetUrl` em `packages/object-storage/src/s3-chart-storage.test.ts`, verificando a forma da URL gerada — host do endpoint, chave no caminho e presença de `X-Amz-Signature` e `X-Amz-Expires=300` — sem acessar o bucket pela rede (depende de T017)

### Espinha do servidor HTTP

- [X] T020 [P] Implementar `EnvironmentConfig` em `apps/api/src/config/environment-config.ts` com Zod, validando `DATABASE_URL`, as variáveis `S3_*`, `API_PORT` e `API_LOG_LEVEL`, reportando **todas** as ausências de uma vez e nunca ecoando valores (FR-034), espelhando `apps/jobs/src/config/environment-config.ts`
- [X] T021 [P] Escrever os testes unitários de `EnvironmentConfig` em `apps/api/src/config/environment-config.test.ts`, cobrindo ambiente completo, múltiplas ausências reportadas juntas e ausência de credencial no texto do erro (depende de T020)
- [X] T022 [P] Implementar a hierarquia de erro da API em `apps/api/src/http/api-error.ts`, com classe base portando `code` e `status` HTTP e as subclasses correspondentes aos códigos do [contrato](./contracts/rest-api.md)
- [X] T023 [P] Implementar o logger JSON injetável em `apps/api/src/observability/logger.ts`, com interface própria e implementação sobre `console`, sem biblioteca externa ([research.md R8](./research.md))
- [X] T024 Implementar o middleware de erro final em `apps/api/src/http/error-handler.ts`, convertendo `ApiError` na resposta correspondente e qualquer exceção não prevista em `500 INTERNAL_ERROR` com corpo genérico, sem rastreamento de pilha nem detalhe de infraestrutura (FR-026, FR-035) (depende de T022, T023)
- [X] T025 [P] Implementar o middleware de log de requisição em `apps/api/src/http/request-logger.ts`, registrando rota, status e duração (FR-031) (depende de T023)
- [X] T026 [P] Implementar os schemas Zod de validação de parâmetros em `apps/api/src/http/validation.ts` — ICAO, id de procedimento, paginação, unidade federativa, termo de busca e tipo — conforme a tabela de [data-model.md §6](./data-model.md) (depende de T022)
- [X] T027 [P] Escrever os testes unitários da validação em `apps/api/src/http/validation.test.ts`, cobrindo cada regra e o código de erro produzido por cada violação (depende de T026)
- [X] T028 [P] Implementar os conversores de entidade para corpo de resposta em `apps/api/src/presentation/responses.ts` — `AirportSummaryResponse`, `AirportDetailResponse`, `ProcedureResponse` com `hasChart` derivado, e `PageResponse` com `hasNext` derivado — sem expor `storageKey`, `sourceUrl` nem `archivedAt` (FR-017)
- [X] T029 [P] Escrever os testes unitários dos conversores em `apps/api/src/presentation/responses.test.ts`, incluindo a asserção explícita de que campos internos não aparecem no corpo serializado (depende de T028)
- [X] T030 Implementar `createApp` em `apps/api/src/http/create-app.ts`, montando o Express com `helmet`, `cors`, o logger de requisição, o prefixo `/v1`, o tratador de rota inexistente (`404 ROUTE_NOT_FOUND`), o de método não permitido (`405`) e o middleware de erro por último (depende de T024, T025)
- [X] T031 [P] Implementar os dublês em memória dos repositórios e do armazenamento em `apps/api/src/testing/doubles.ts`, para os testes unitários e de contrato correrem sem banco nem rede (depende de T012, T016)
- [X] T032 Implementar `CompositionRoot` em `apps/api/src/composition-root.ts`, instanciando banco e armazenamento a partir da configuração, montando serviços e roteadores e expondo `close()`, espelhando `apps/jobs/src/composition-root.ts` (depende de T020, T030)
- [X] T033 Implementar `main.ts` em `apps/api/src/main.ts`, subindo o servidor na porta configurada e tratando `SIGTERM`/`SIGINT` com `server.close()`, tempo limite de 10 s e fechamento da `CompositionRoot` (FR-033) (depende de T032)

**Checkpoint**: o servidor sobe, responde `404 ROUTE_NOT_FOUND` em envelope uniforme e encerra
de forma ordenada. As histórias podem começar, inclusive em paralelo.

---

## Phase 3: User Story 1 — Consultar o catálogo de aeródromos (P1) 🎯 MVP

**Objetivo**: `GET /v1/airports` paginado, com filtro por unidade federativa e busca textual.

**Teste independente**: com o acervo populado, percorrer todas as páginas e verificar que cada
aeródromo aparece exatamente uma vez; aplicar filtro e busca e conferir a redução coerente do
conjunto.

- [X] T034 [P] [US1] Escrever os testes de contrato de `GET /v1/airports` em `apps/api/src/routes/airports-router.test.ts` com `supertest` e dublês: página padrão de 20, `hasNext` e `total` corretos, página além do fim devolvendo `items: []` com `200`, acervo vazio, `pageSize=500` devolvendo `400 INVALID_PAGINATION`, e ausência de `runways` nos itens (depende de T031)
- [X] T035 [US1] Implementar `AirportService.list` em `apps/api/src/services/airport-service.ts`, recebendo `AirportRepository` por construtor, normalizando o termo de busca e a unidade federativa e delegando ao repositório (depende de T012)
- [X] T036 [P] [US1] Escrever os testes unitários de `AirportService.list` em `apps/api/src/services/airport-service.test.ts`, cobrindo normalização de entrada e cálculo de `hasNext` (depende de T035)
- [X] T037 [US1] Implementar a rota `GET /v1/airports` em `apps/api/src/routes/airports-router.ts`, validando os parâmetros de consulta, chamando o serviço e serializando com `PageResponse` (depende de T026, T028, T035)
- [X] T038 [US1] Registrar o roteador de aeródromos em `apps/api/src/http/create-app.ts` e instanciá-lo em `apps/api/src/composition-root.ts` (depende de T032, T037)

**Checkpoint**: os cenários C1, C2 e C3 do [quickstart.md](./quickstart.md) passam. É o MVP —
demonstrável sozinho.

---

## Phase 4: User Story 2 — Obter os detalhes de um aeródromo (P1)

**Objetivo**: `GET /v1/airports/:icao` com as pistas.

**Teste independente**: pedir um ICAO conhecido e conferir que todos os campos e a coleção de
pistas vêm preenchidos; verificar a distinção entre formato inválido e ICAO inexistente.

- [X] T039 [P] [US2] Escrever os testes de contrato de `GET /v1/airports/:icao` em `apps/api/src/routes/airports-router.test.ts`: ICAO em minúsculas devolvendo o mesmo recurso, aeródromo sem pistas devolvendo `runways: []`, coordenadas ausentes vindo como `null` explícito, `XX` devolvendo `400 INVALID_ICAO` e `SBXX` devolvendo `404 AIRPORT_NOT_FOUND` (depende de T031)
- [X] T040 [US2] Implementar `AirportService.findByIcao` em `apps/api/src/services/airport-service.ts`, normalizando o ICAO para maiúsculas e lançando o erro de não encontrado quando ausente (depende de T035)
- [X] T041 [P] [US2] Escrever os testes unitários de `AirportService.findByIcao` em `apps/api/src/services/airport-service.test.ts` (depende de T040)
- [X] T042 [US2] Implementar a rota `GET /v1/airports/:icao` em `apps/api/src/routes/airports-router.ts`, serializando com `AirportDetailResponse` (depende de T040)

**Checkpoint**: cenário C4 do quickstart passa. Histórias 1 e 2 funcionam de forma
independente.

---

## Phase 5: User Story 3 — Listar os procedimentos de um aeródromo (P2)

**Objetivo**: `GET /v1/airports/:icao/procedures` com `hasChart` e filtro por tipo.

**Teste independente**: pedir os procedimentos de um ICAO conhecido e conferir a relação
contra o acervo, com `hasChart` correto e sem campos internos no corpo.

- [X] T043 [P] [US3] Escrever os testes de contrato de `GET /v1/airports/:icao/procedures` em `apps/api/src/routes/procedures-router.test.ts`: relação completa com `hasChart`, aeródromo existente sem procedimentos devolvendo `items: []` com `200`, aeródromo inexistente devolvendo `404 AIRPORT_NOT_FOUND`, filtro por tipo, e ausência de `storageKey`/`sourceUrl`/`archivedAt` no corpo (depende de T031)
- [X] T044 [US3] Implementar `ProcedureService.listByAirport` em `apps/api/src/services/procedure-service.ts`, recebendo os dois repositórios por construtor, confirmando a existência do aeródromo antes de listar e aplicando o filtro por tipo (depende de T012)
- [X] T045 [P] [US3] Escrever os testes unitários de `ProcedureService.listByAirport` em `apps/api/src/services/procedure-service.test.ts`, cobrindo a distinção entre aeródromo inexistente e sem procedimentos (depende de T044)
- [X] T046 [US3] Implementar a rota `GET /v1/airports/:icao/procedures` em `apps/api/src/routes/procedures-router.ts` e registrá-la em `createApp` e na `CompositionRoot` (depende de T028, T044)

**Checkpoint**: cenário C5 do quickstart passa.

---

## Phase 6: User Story 4 — Abrir o documento PDF de um procedimento (P2)

**Objetivo**: `GET /v1/airports/:icao/procedures/:id/chart` respondendo `302` para URL
pré-assinada válida por 5 minutos, sem os bytes atravessarem a aplicação.

**Teste independente**: pedir a carta de um procedimento arquivado e confirmar `302` com
`Location` assinado e corpo vazio; seguir o redirect e obter o PDF.

- [X] T047 [P] [US4] Escrever os testes de contrato da rota de carta em `apps/api/src/routes/procedures-router.test.ts`: `302` com `Location` assinado e `Cache-Control: no-store`, corpo vazio, procedimento inexistente e procedimento de outro aeródromo devolvendo `404 PROCEDURE_NOT_FOUND`, procedimento sem documento devolvendo `404 CHART_NOT_AVAILABLE`, e falha na assinatura devolvendo `502 CHART_STORAGE_UNAVAILABLE` (depende de T031)
- [X] T048 [US4] Implementar `ChartService.resolveChartUrl` em `apps/api/src/services/chart-service.ts`, recebendo `AirportProcedureRepository` e `ChartStorage` por construtor e seguindo a ordem de verificação de [data-model.md §7](./data-model.md) — existência, pertencimento ao aeródromo do caminho (FR-021), disponibilidade do documento (FR-022) e só então a assinatura com 300 segundos (depende de T012, T016)
- [X] T049 [P] [US4] Escrever os testes unitários de `ChartService` em `apps/api/src/services/chart-service.test.ts`, cobrindo cada ramo da ordem de verificação e confirmando que procedimento de outro aeródromo produz `PROCEDURE_NOT_FOUND`, e não `CHART_NOT_AVAILABLE` (depende de T048)
- [X] T050 [US4] Implementar a rota `GET /v1/airports/:icao/procedures/:id/chart` em `apps/api/src/routes/procedures-router.ts`, respondendo `302` com `Location` e `Cache-Control: no-store` (FR-019, FR-020, FR-024) (depende de T048)
- [X] T051 [US4] Registrar no log a falha de assinatura antes de converter em `502` (FR-023), em `apps/api/src/services/chart-service.ts` (depende de T023, T048)

**Checkpoint**: cenários C6, C7 e C8 do quickstart passam. Todas as histórias de valor ao
consumidor estão entregues.

---

## Phase 7: User Story 5 — Operar e monitorar a API (P3)

**Objetivo**: indicador de saúde e limitação de taxa.

**Teste independente**: consultar a saúde com o banco disponível e novamente com ele parado;
disparar requisições acima do limite.

- [X] T052 [P] [US5] Escrever os testes de contrato de `GET /health` em `apps/api/src/routes/health-router.test.ts`: `200` com `status: "ok"` e `503` com `status: "degraded"` quando a verificação do banco falha (depende de T031)
- [X] T053 [US5] Implementar a verificação de saúde em `apps/api/src/routes/health-router.ts`, executando `SELECT 1` no banco e devolvendo `200`/`503` conforme o resultado, sem verificar o bucket ([research.md R10](./research.md)) (depende de T030)
- [X] T054 [US5] Expor uma operação de verificação de conectividade no pacote `domain` — método `ping()` na interface `Database` em `packages/domain/src/drizzle/client.ts` — para que a rota de saúde não emita SQL diretamente (depende de T012)
- [X] T055 [US5] Configurar `express-rate-limit` em `apps/api/src/http/create-app.ts` com janela de 1 minuto, limite de 120 requisições por IP, resposta `429 RATE_LIMITED` com `Retry-After`, e `/health` isento (FR-030) (depende de T030)
- [X] T056 [P] [US5] Escrever o teste de contrato da limitação de taxa em `apps/api/src/http/create-app.test.ts`, verificando que a requisição acima do limite devolve `429` com `Retry-After` (depende de T055)

**Checkpoint**: cenários C9 e C10 do quickstart passam.

---

## Phase 8: Polish e questões transversais

- [X] T057 [P] Implementar `GET /docs` em `apps/api/src/routes/docs-router.ts`, publicando a descrição dos endpoints, parâmetros, formatos e códigos de erro, suficiente para um desenvolvedor listar aeródromos e abrir uma carta em menos de 10 minutos (FR-032, SC-006)
- [X] T058 Escrever o teste de integração ponta a ponta em `apps/api/tests/api.integration.test.ts`, com PostgreSQL via Testcontainers: popular o acervo, percorrer a listagem, obter detalhe, listar procedimentos e verificar que a rota de carta devolve `302` com `Location` assinado (depende de T038, T042, T046, T050)
- [X] T059 [P] Acrescentar `API_PORT` e `API_LOG_LEVEL` ao arquivo `.env.example` na raiz do repositório, com valores apontando para o ambiente local
- [X] T060 [P] Atualizar `README.md`: corrigir a afirmação de que `domain` é o único pacote consumido pela API — ela também depende de `object-storage` para assinar URLs ([research.md R3](./research.md)) — acrescentar `apps/api` à árvore da estrutura e documentar como subir e consumir a API
- [X] T061 Escrever o teste transversal do envelope de erro em `apps/api/src/http/error-handler.test.ts`, exercendo cada código do contrato e asseverando que nenhuma resposta expõe rastreamento de pilha, SQL ou nome de recurso de infraestrutura (SC-007, SC-009, cenário C11 do quickstart) (depende de T038, T042, T046, T050, T053)
- [X] T062 Medir a latência da listagem com o acervo completo e confirmar SC-001 e SC-002; se a busca com `%termo%` estourar o previsto, registrar a medição e avaliar `pg_trgm` ou busca por prefixo, conforme o ponto de verificação de [research.md R5](./research.md) (depende de T058)
- [X] T063 Correr `pnpm check` na raiz — lint, build, tipos e suíte completa — e corrigir o que falhar (depende de todas as anteriores)

---

## Dependências e ordem de execução

### Dependências entre fases

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup. **Bloqueia todas as histórias** — as extensões
  de `domain` e `object-storage` são capacidades que hoje não existem.
- **Histórias (Fases 3–7)**: dependem da Fase 2. Podem então correr em paralelo.
- **Polish (Fase 8)**: depende das histórias que se quer entregar.

### Dependências entre histórias

- **US1 (P1)**: só depende da Fase 2. É o MVP.
- **US2 (P1)**: só depende da Fase 2. Partilha o arquivo `airport-service.ts` com a US1, então
  T040 vem depois de T035 — é a única costura entre histórias.
- **US3 (P2)**: só depende da Fase 2. Independente das anteriores.
- **US4 (P2)**: só depende da Fase 2. Partilha `procedures-router.ts` com a US3; se ambas
  correrem em paralelo, coordenar o arquivo.
- **US5 (P3)**: só depende da Fase 2. Totalmente independente.

### Oportunidades de paralelismo

Dentro da Fase 2, três frentes independentes podem avançar ao mesmo tempo:

```text
Frente A (domain):          T006, T007 → T008 → T009 → T010 → T013, T014 → T015
Frente B (object-storage):  T016 → T017 → T018 → T019
Frente C (espinha HTTP):    T020–T029 (quase todas [P]) → T030 → T031 → T032 → T033
```

A Frente C só depende de T012 nos dublês (T031), então pode começar imediatamente após o
Setup.

Depois da Fase 2, com mais de uma pessoa:

- Pessoa A: US1 (Fase 3) → US2 (Fase 4) — partilham o serviço de aeródromo
- Pessoa B: US3 (Fase 5) → US4 (Fase 6) — partilham o roteador de procedimentos
- Pessoa C: US5 (Fase 7) + T057

---

## Exemplo de paralelismo: Fase 2, espinha HTTP

```bash
# Estas tarefas tocam arquivos distintos e não dependem umas das outras:
Task: "T020 EnvironmentConfig em apps/api/src/config/environment-config.ts"
Task: "T022 Hierarquia de erro em apps/api/src/http/api-error.ts"
Task: "T023 Logger JSON em apps/api/src/observability/logger.ts"
Task: "T028 Conversores de resposta em apps/api/src/presentation/responses.ts"
```

---

## Estratégia de implementação

### MVP primeiro

1. Fase 1 (Setup) → Fase 2 (Foundational) → Fase 3 (US1).
2. **Parar e validar**: correr os cenários C1, C2 e C3 do quickstart.
3. A listagem de aeródromos já sustenta uma tela de busca — é demonstrável sozinha.

### Entrega incremental

| Incremento | Fases | Valor entregue |
|------------|-------|----------------|
| 1 (MVP) | 1 → 3 | Catálogo navegável, com filtro e busca |
| 2 | 4 | Ficha do aeródromo com pistas |
| 3 | 5 | Índice de cartas por aeródromo |
| 4 | 6 | Carta em PDF — a entrega final de valor |
| 5 | 7 → 8 | Pronta para publicar |

### Observações

- A Fase 2 é desproporcionalmente grande porque as capacidades que a API precisa não existem
  nos pacotes. É trabalho de fundação, não acidental.
- A rotina `decea-crawler` **não** é alterada por nenhuma tarefa. T010 muda uma função que ela
  já chama, preservando seu comportamento — coberto por T015.
- Commits seguem Conventional Commits com descrição em português do Brasil e escopo do pacote
  afetado: `feat(domain): …`, `feat(api): …`, `feat(object-storage): …`.
- Correr `pnpm check` antes de cada merge; ele aborta no primeiro portão que falhar.
