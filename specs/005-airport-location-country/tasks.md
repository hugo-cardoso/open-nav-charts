---

description: "Task list template for feature implementation"
---

# Tasks: País do aeródromo e objeto `location` na API

**Input**: Design documents from `/specs/005-airport-location-country/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Obrigatórios. O template trata testes como opcionais, mas o Princípio IV da
constituição é **NÃO NEGOCIÁVEL**: toda lógica de domínio exige teste unitário, e contratos
entre pacotes do workspace, APIs públicas e schemas compartilhados exigem teste de
integração. Esta feature toca os três.

**Organization**: Tarefas agrupadas por história de usuário, na ordem de prioridade da spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: História a que a tarefa pertence (US1, US2, US3)
- Todo caminho de arquivo é relativo à raiz do repositório

## Path Conventions

Monorepo pnpm: `packages/domain/`, `apps/api/`, `apps/jobs/`. Imports ESM levam sufixo
`.js`, como no código existente.

---

## ⚠️ Aviso de breaking change

As tarefas T017–T021 removem `city`, `state`, `latitude` e `longitude` do nível superior da
resposta. Entre T017 e T021 a suíte da API fica vermelha por construção — os testes afirmam
o formato antigo. Isso é esperado; conclua a US2 inteira antes de avaliar o resultado.

O commit da API MUST levar `!` após o escopo (`feat(api)!: ...`). Rodapés são proibidos pela
constituição, então `BREAKING CHANGE:` MUST NOT ser usado — a migração do consumidor está em
[contracts/README.md](./contracts/README.md) e vai na descrição do PR.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar que o ambiente responde antes de mudar qualquer coisa

- [X] T001 Verificar que a suíte está verde antes de começar, rodando `pnpm check` na raiz
- [X] T002 Verificar acesso ao PostgreSQL de integração com `pnpm test:integration` na raiz, confirmando `DATABASE_URL` no `.env`

**Checkpoint**: Base verde e banco acessível — qualquer vermelho daqui em diante é da feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Coluna, entidade e migration. Nenhuma história pode começar sem isto

**⚠️ CRITICAL**: Toda a Fase 2 é bloqueante. `apps/api` e `apps/jobs` dependem do tipo
exportado por `packages/domain`; inverter a ordem quebra a compilação no meio do caminho

- [X] T003 Adicionar a coluna `country: char("country", { length: 2 })` à tabela `airport` e o índice `airport_country_idx` em `packages/domain/src/drizzle/schema.ts`, espelhando `state` e `airport_state_idx`
- [X] T004 Gerar a migration `0002` com `pnpm --filter @open-nav-charts/domain migrate:generate` (arquivo SQL + entrada em `packages/domain/src/migrations/meta/_journal.json` — nunca escrever à mão, o journal carrega timestamp e hash do gerador)
- [X] T005 Acrescentar o backfill `UPDATE "airport" SET "country" = 'BR' WHERE "country" IS NULL;` ao SQL gerado em `packages/domain/src/migrations/0002_*.sql`, entre `--> statement-breakpoint`, no formato da `0001` (ver research.md R2)
- [X] T006 [P] Adicionar `country: string | null` à entidade `Airport` em `packages/domain/src/entities/index.ts` (`AirportSummary` herda via `Omit`, sem alteração própria)
- [X] T007 [P] Adicionar `country: string | null` a `AirportRow` e copiá-lo em `toAirportSummary` em `packages/domain/src/drizzle/mappers.ts`
- [X] T008 Incluir `country` no `values` e no `set` do `onConflictDoUpdate` de `saveAirportWith` em `packages/domain/src/drizzle/airport-repository.ts` — ponto único de escrita, cobre repositório e sync do crawler de uma vez
- [X] T009 Aplicar a migration com `pnpm --filter @open-nav-charts/domain migrate` e confirmar por SQL que zero aeródromos ficaram com `country IS NULL` (quickstart.md §1)

**Checkpoint**: Coluna existe, acervo retroalimentado, entidade carrega o país — as três histórias podem começar

---

## Phase 3: User Story 1 - Consumidor identifica o país de cada aeródromo (Priority: P1) 🎯 MVP

**Goal**: A rotina de coleta grava `BR` para todo aeródromo processado, de forma idempotente
e independente de cidade, UF e coordenadas estarem presentes

**Independent Test**: Executar a coleta para um ICAO qualquer e verificar que o registro
persistido contém `country = 'BR'`, sem alteração nos demais campos

### Tests for User Story 1

- [X] T010 [P] [US1] Atualizar `apps/jobs/src/jobs/decea-crawler/process-airport.test.ts` afirmando que `toAirport` produz `country: "BR"`, inclusive quando a fonte não traz cidade, UF nem coordenadas (FR-005)
- [X] T011 [P] [US1] Estender `apps/jobs/tests/decea-crawler.integration.test.ts` verificando que o aeródromo persistido tem `country = 'BR'` e que reprocessar o mesmo ICAO não altera o valor nem duplica o registro (FR-004)
- [X] T012 [P] [US1] Estender `packages/domain/tests/airport-repository.integration.test.ts` cobrindo o round-trip do país: `save` grava e `findByIcao` devolve o valor gravado

### Implementation for User Story 1

- [X] T013 [US1] Criar e exportar a constante `BRAZIL_COUNTRY_CODE = "BR"` em `packages/aisweb-client/src/index.ts` (ou módulo próprio reexportado por ele), com comentário registrando que o valor é propriedade da fonte: é `BR` porque o DECEA cobre só o Brasil (research R3)
- [X] T014 [US1] Preencher `country: BRAZIL_COUNTRY_CODE` no retorno de `toAirport` em `apps/jobs/src/jobs/decea-crawler/process-airport.ts`, fora de qualquer condicional de cidade/UF/coordenadas
- [X] T015 [US1] Reexportar de `packages/domain/src/index.ts` o que a API passará a consumir, confirmando que `Airport` e `AirportSummary` já saem com `country`

**Checkpoint**: O acervo passa a registrar o país a cada coleta. US1 entregue e verificável isoladamente

---

## Phase 4: User Story 2 - Consumidor recebe os dados de localização agrupados (Priority: P2)

**Goal**: Listagem e ficha expõem `location` com cidade, UF, país e coordenadas; os campos
planos somem do nível superior

**Independent Test**: Consultar listagem e ficha e verificar que ambas trazem `location` com
os cinco campos, e que nenhum deles aparece no nível superior

**⚠️ Breaking change**: entre T017 e T021 a suíte da API fica vermelha por construção

### Tests for User Story 2

- [X] T016 [P] [US2] Atualizar `apps/api/src/presentation/responses.test.ts` para o formato aninhado: `location` sempre presente, cinco chaves, `null` explícito em campo ausente, país como código sem tradução (FR-010, FR-011, FR-012)

### Implementation for User Story 2

- [X] T017 [US2] Criar a interface `AirportLocationResponse` e reestruturar `AirportSummaryResponse` para `{ icao, name, location }` em `apps/api/src/presentation/responses.ts` (`AirportDetailResponse` segue estendendo o resumo com `runways`, então ficha e listagem compartilham o mesmo `location` por construção)
- [X] T018 [US2] Montar o objeto aninhado em `toAirportSummaryResponse` no mesmo arquivo, mantendo a regra de `null` explícito que o módulo já aplica
- [X] T019 [US2] Atualizar `apps/api/src/routes/airports-router.test.ts` para afirmar o formato aninhado nas duas rotas
- [X] T020 [US2] Atualizar `apps/api/tests/api.integration.test.ts` para o formato aninhado, incluindo o caso de aeródromo sem cidade/UF/coordenadas (contracts/airports.http.md §7)
- [X] T021 [US2] Atualizar a chave `response` de `GET /v1/airports/:icao` em `apps/api/src/routes/docs-router.ts` para descrever `location` no lugar dos campos planos (FR-023)

**Checkpoint**: Suíte da API verde de novo, agora no formato novo. US1 e US2 funcionam independentemente

---

## Phase 5: User Story 3 - Consumidor filtra o catálogo por país (Priority: P3)

**Goal**: `GET /v1/airports?country=BR` recorta o catálogo, combinável com UF e busca,
insensível a caixa, com erro próprio para valor malformado

**Independent Test**: Filtrar por um país e conferir que total e itens correspondem apenas a
ele; repetir com código sem correspondência e obter lista vazia com 200

### Tests for User Story 3

- [X] T022 [P] [US3] Adicionar a `apps/api/src/http/validation.test.ts` os casos de `parseCountry`: aceita `BR`/`br`/` br ` normalizando para `BR`; recusa `Brazil`, `BRA`, `B`, vazio, só espaços e valores com dígitos (FR-016, FR-018)
- [X] T023 [P] [US3] Estender `packages/domain/tests/airport-list.integration.test.ts` com o filtro por país: recorte correto, `total` refletindo o conjunto filtrado, combinação com `state` e `search`, e exclusão de registros com `country` nulo (FR-015, FR-017, FR-022)
- [X] T024 [P] [US3] Estender `apps/api/src/services/airport-service.test.ts` afirmando que `country` chega ao repositório em caixa alta
- [X] T025 [P] [US3] Estender `apps/api/tests/api.integration.test.ts` com o percurso HTTP: 200 filtrado, 200 vazio para código sem correspondência, 400 `INVALID_COUNTRY` para malformado

### Implementation for User Story 3

- [X] T026 [P] [US3] Adicionar `country?: string | undefined` a `AirportListQuery` em `packages/domain/src/repositories/index.ts`, documentando "duas letras maiúsculas quando presente", como o campo `state` vizinho
- [X] T027 [US3] Acrescentar `eq(airport.country, query.country)` ao array `filters` de `DrizzleAirportRepository.list` em `packages/domain/src/drizzle/airport-repository.ts` — o `count()` já reusa o mesmo `where`, então FR-017 vem por construção
- [X] T028 [P] [US3] Acrescentar `INVALID_COUNTRY` a `ERROR_CODES` e criar `InvalidCountryError` (status 400, mensagem `O país deve ser um código de 2 letras (ISO 3166-1 alpha-2).`) em `apps/api/src/http/api-error.ts`
- [X] T029 [US3] Implementar `parseCountry` em `apps/api/src/http/validation.ts`, com schema Zod idêntico ao `stateSchema` (`/^[A-Za-z]{2}$/`, `trim`, `toUpperCase`), lançando `InvalidCountryError` — validação de formato apenas, sem tabela ISO (FR-019)
- [X] T030 [US3] Adicionar `country` a `AirportListCriteria` e repassá-lo com `toUpperCase()` defensivo em `AirportService.list` em `apps/api/src/services/airport-service.ts`, no padrão de `state`
- [X] T031 [US3] Ler e repassar `country` em `GET /v1/airports` em `apps/api/src/routes/airports-router.ts`, com a validação antes de qualquer acesso ao acervo (FR-020)
- [X] T032 [US3] Implementar o filtro por país em `FakeAirportRepository.list` em `apps/api/src/testing/doubles.ts`, sem o qual os testes de roteador não exercitam o recorte
- [X] T033 [US3] Documentar `query.country` e incluir `INVALID_COUNTRY` na lista `errors` de `GET /v1/airports` em `apps/api/src/routes/docs-router.ts`, e acrescentar ao `quickstart` do documento um passo exercitando o filtro (FR-023, FR-024)

**Checkpoint**: As três histórias funcionam de forma independente

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T034 [P] Atualizar `apps/jobs/src/jobs/decea-crawler/README.md` registrando que a coleta grava o país como código ISO alpha-2
- [X] T035 [P] Revisar os comentários tocados nesta feature quanto ao Princípio VI: pt-BR com acentuação preservada, identificadores em inglês
- [X] T036 Executar o roteiro de `quickstart.md` de ponta a ponta e conferir os 14 itens do checklist de aceitação
- [X] T037 Rodar os portões de qualidade obrigatórios: `pnpm check` e `pnpm test:integration` na raiz

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Foundational (Fase 2)**: depende do Setup — **BLOQUEIA todas as histórias**
- **US1 (Fase 3)**, **US2 (Fase 4)**, **US3 (Fase 5)**: dependem da Fase 2
- **Polish (Fase 6)**: depende das histórias desejadas

### Dependências internas da Fase 2

```text
T003 (schema) → T004 (generate) → T005 (backfill) → T009 (migrate)
T003 → T006 [P] ─┐
T003 → T007 [P] ─┴→ T008 (saveAirportWith)
```

T006 e T007 são paralelos entre si: arquivos distintos, ambos dependendo apenas de T003.

### Dependências entre histórias

- **US1 (P1)**: independente após a Fase 2
- **US2 (P2)**: independente após a Fase 2. Não depende de US1 — `location` monta com o que
  houver, e `country` sai `null` se a coleta ainda não rodou (o backfill de T005 já
  preencheu o acervo, então na prática sai `BR`)
- **US3 (P3)**: independente após a Fase 2. O filtro opera sobre a coluna, que existe desde
  T003 e foi preenchida em T005 — não depende de US1 nem de US2

As três compartilham a Fase 2 e nada além disso. É o backfill de T005 que torna US2 e US3
demonstráveis sem esperar uma coleta completa.

### Dentro de cada história

- Testes antes da implementação, exceto onde a tarefa é *atualizar* um teste que a mudança
  de tipo quebra (T019, T020) — nesses casos, o teste acompanha a implementação
- Entidade e tipos antes de repositório; repositório antes de serviço; serviço antes de rota

### Parallel Opportunities

- **Fase 2**: T006 e T007 juntos, após T003
- **US1**: T010, T011 e T012 juntos
- **US3**: T022, T023, T024 e T025 juntos (testes); T026 e T028 juntos (arquivos e pacotes
  distintos)
- **Fase 6**: T034 e T035 juntos
- Com mais de uma pessoa: após a Fase 2, US1 (jobs) e US3 (domain + api) avançam em
  paralelo com pouco atrito. US2 e US3 tocam `apps/api` em arquivos majoritariamente
  distintos, mas ambas mexem em `docs-router.ts` (T021 e T033) e em
  `api.integration.test.ts` (T020 e T025) — coordene esses dois arquivos

---

## Parallel Example: User Story 3

```bash
# Testes da US3, todos em arquivos distintos:
Task: "Casos de parseCountry em apps/api/src/http/validation.test.ts"
Task: "Filtro por país em packages/domain/tests/airport-list.integration.test.ts"
Task: "country em caixa alta em apps/api/src/services/airport-service.test.ts"
Task: "Percurso HTTP do filtro em apps/api/tests/api.integration.test.ts"

# Tipos e erro, em pacotes distintos:
Task: "country em AirportListQuery em packages/domain/src/repositories/index.ts"
Task: "INVALID_COUNTRY e InvalidCountryError em apps/api/src/http/api-error.ts"
```

---

## Implementation Strategy

### MVP (User Story 1)

1. Fases 1 e 2
2. Fase 3 (US1)
3. **PARE E VALIDE**: o acervo registra o país a cada coleta

Observação sobre o MVP: o backfill de T005 já deixa o acervo com `country = 'BR'`. A US1
garante que a coleta *mantém* o valor — sem ela, todo aeródromo novo entraria sem país.

### Entrega incremental

1. Fases 1 + 2 → coluna existe e acervo retroalimentado
2. US1 → coleta grava o país → validar → entregar
3. US2 → resposta reestruturada → validar → entregar (**breaking change**, commit com `!`)
4. US3 → filtro por país → validar → entregar

US2 e US3 podem inverter a ordem sem prejuízo: são independentes entre si. A ordem acima
segue a prioridade da spec.

---

## Notes

- `[P]` = arquivos distintos, sem dependência pendente
- Commits de linha única, em pt-BR, sem corpo e sem coautoria de IA (constituição)
- O commit que reestrutura a resposta leva `!` após o escopo
- A migration `0002` deve ser **gerada**, nunca escrita à mão; só o `UPDATE` de backfill é
  acrescentado ao arquivo gerado
- `saveAirportWith` é o ponto único de escrita de aeródromo: T008 cobre repositório e sync
  do crawler de uma vez, sem tocar em `airport-sync-repository.ts`
