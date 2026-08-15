# Implementation Plan: País do aeródromo e objeto `location` na API

**Branch**: `005-airport-location-country` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-airport-location-country/spec.md`

## Summary

Acrescenta o país ao acervo de aeródromos, como código ISO 3166-1 alpha-2 (`BR`), e
reestrutura a resposta da API para agrupar os dados de localização em um objeto `location`,
que passa a ser a única forma de acessar cidade, UF, país e coordenadas. A listagem ganha o
filtro `country`, combinável com os filtros de UF e busca já existentes.

A abordagem segue a trilha que a feature 003 já abriu para `search_text`: uma coluna nova e
opcional em `airport`, preenchida por `saveAirportWith` a cada coleta e retroalimentada por
um `UPDATE` de backfill dentro da própria migration — de modo que o acervo já gravado não
precisa esperar uma execução completa do crawler para responder ao filtro. O agrupamento em
`location` vive apenas na camada de apresentação da API: a entidade `Airport` do domínio
mantém os campos planos, porque o domínio não deve se moldar ao formato de serialização.

Esta é uma **breaking change** deliberada e confirmada em Clarifications.

## Technical Context

**Language/Version**: TypeScript 5.x em modo `strict`, Node.js 22 (ESM, `.js` nos imports)

**Primary Dependencies**: Express 5, Drizzle ORM + drizzle-kit (PostgreSQL), Zod 4, `pg`

**Storage**: PostgreSQL. Tabela `airport` ganha a coluna `country char(2)`, opcional

**Testing**: Vitest — unitários por pacote e suítes de integração com Postgres real
(`vitest.integration.config.ts` em `apps/api` e `packages/domain`)

**Target Platform**: Servidor Linux (Railway); API somente leitura e job de coleta agendado

**Project Type**: Monorepo pnpm — dois aplicativos (`apps/api`, `apps/jobs`) sobre pacotes
compartilhados (`packages/domain`, `packages/aisweb-client`, `packages/object-storage`)

**Performance Goals**: O filtro por país responde na mesma faixa do filtro por UF já
existente (SC-005). Índice em `country` espelhando `airport_state_idx`

**Constraints**: Sem novas dependências. Sem tabela de países embutida — a validação é de
formato apenas (FR-019). Nenhuma migração de dados manual: o backfill vai na migration

**Scale/Scope**: Acervo na ordem de milhares de aeródromos, todos `BR` nesta feature.
Três pacotes tocados; a coluna e o filtro são preparados para múltiplos países

Nenhum item em NEEDS CLARIFICATION: as três decisões abertas foram resolvidas em
`/speckit-clarify` e estão registradas na seção `## Clarifications` da spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Situação |
|-----------|-----------|----------|
| I. Monorepo pnpm com Node.js 22 | Nenhum pacote novo; nenhuma dependência nova. As mudanças respeitam as fronteiras de workspace e passam pelos entrypoints públicos (`@open-nav-charts/domain`) | PASS |
| II. TypeScript como Padrão | Todo o código em TypeScript `strict`. Nenhum `any`. O tipo `AirportLocationResponse` é explícito no contrato da API | PASS |
| III. OO no Backend | `AirportService` e `DrizzleAirportRepository` seguem recebendo colaboradores por construtor. As conversões novas (`toAirportLocationResponse`) são funções puras sem colaboradores — a mesma exceção já adotada em `mappers.ts` e `responses.ts` | PASS |
| IV. Testes com Vitest | Cada mudança de comportamento leva teste: validação do filtro, mapeamento do país, serialização de `location` e filtro combinado nas suítes de integração. Contrato entre pacotes coberto por teste de integração, como o princípio exige | PASS |
| V. Qualidade com Biome | Sem exceção nem supressão de regra prevista | PASS |
| VI. pt-BR na comunicação, inglês no código | Comentários, mensagem de erro e artefatos em pt-BR; identificadores (`country`, `location`, `INVALID_COUNTRY`) em inglês | PASS |

**Breaking change — obrigação constitucional**: a remoção de `city`, `state`, `latitude` e
`longitude` do nível superior da resposta MUST ser sinalizada com `!` após o escopo do
commit (por exemplo `feat(api)!: agrupa localização do aeródromo em location`). Rodapés são
proibidos pela constituição, então `BREAKING CHANGE:` MUST NOT ser usado — a migração fica
descrita neste plano (ver [contracts/README.md](./contracts/README.md), seção de migração) e
na descrição do PR.

Nenhuma violação a justificar; a seção Complexity Tracking permanece vazia.

## Project Structure

### Documentation (this feature)

```text
specs/005-airport-location-country/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
│   ├── README.md        # Contrato HTTP e guia de migração do consumidor
│   └── airports.http.md # Exemplos de requisição e resposta
├── checklists/
│   └── requirements.md  # Criado por /speckit-specify
└── tasks.md             # Criado por /speckit-tasks — NÃO por /speckit-plan
```

### Source Code (repository root)

```text
packages/domain/
├── src/
│   ├── entities/index.ts               # Airport ganha `country`
│   ├── repositories/index.ts           # AirportListQuery ganha `country`
│   ├── drizzle/
│   │   ├── schema.ts                   # coluna `country` + airport_country_idx
│   │   ├── mappers.ts                  # AirportRow e toAirportSummary
│   │   └── airport-repository.ts       # saveAirportWith + filtro em list()
│   ├── migrations/
│   │   ├── 0002_<nome>.sql             # ADD COLUMN + backfill + CREATE INDEX
│   │   └── meta/_journal.json          # entrada da 0002 (gerada por drizzle-kit)
│   └── index.ts                        # reexporta o que a API consome
└── tests/
    ├── airport-repository.integration.test.ts
    └── airport-list.integration.test.ts # filtro por país e combinações

apps/api/
├── src/
│   ├── http/
│   │   ├── api-error.ts                # INVALID_COUNTRY + InvalidCountryError
│   │   └── validation.ts               # parseCountry
│   ├── presentation/responses.ts       # AirportLocationResponse + agrupamento
│   ├── routes/
│   │   ├── airports-router.ts          # lê e repassa `country`
│   │   └── docs-router.ts              # contrato publicado
│   └── services/airport-service.ts     # `country` no critério, em caixa alta
└── tests/api.integration.test.ts

apps/jobs/
├── src/jobs/decea-crawler/process-airport.ts   # grava BRAZIL_COUNTRY_CODE
└── tests/decea-crawler.integration.test.ts
```

**Structure Decision**: Mantém-se o monorepo existente, sem pacote novo. A mudança atravessa
três camadas na ordem natural de dependência — `packages/domain` (esquema, entidade,
consulta), `apps/api` (validação, serviço, apresentação) e `apps/jobs` (gravação do valor) —
e é essa ordem que as tarefas devem seguir, porque os dois aplicativos dependem do tipo
exportado pelo domínio.

O ponto de atenção estrutural é `saveAirportWith`: ela é compartilhada entre
`DrizzleAirportRepository.save` e o `AirportSyncRepository` que o crawler usa. Acrescentar
`country` ali cobre os dois caminhos de escrita de uma vez, sem tocar no repositório de
sincronização.

## Complexity Tracking

> Preenchido apenas se o Constitution Check apontar violações a justificar.

Sem violações. Nenhuma entrada.
