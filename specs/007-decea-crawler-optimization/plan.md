# Implementation Plan: Otimização do tempo de execução do coletor DECEA

**Branch**: `feature/007-decea-crawler-optimization` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-decea-crawler-optimization/spec.md`

## Summary

Reduzir a varredura completa do `decea-crawler` de ~7 min 30 s para **≤ 5 min** (estimativa: ~1 min
em regime estável, ~4 min no pior caso), sem perder nenhuma garantia da feature 002.

A sondagem ao vivo da AISWEB (research R1–R3) mudou a abordagem prevista na spec original:

1. **O indicador `lastupdate` é global**, não por aeródromo — não serve para pular um aeródromo
   específico. Ele passa a decidir apenas **quando revalidar as pistas de todos**.
2. **A fonte responde em lote**: o catálogo inteiro (com nome, cidade, UF e coordenadas) e todas
   as 1.807 cartas IFR vêm em **duas** consultas, no lugar de ~9.000. Só as pistas exigem o
   detalhamento individual.

Abordagem técnica:

- **Consultas em lote** (`listAirports` com página de 5.000 e `fetchIfrChartCatalog`), em paralelo
  entre si.
- **Retrato do banco** carregado uma vez e **comparação de conteúdo em memória** por uma função
  pura, que decide para cada aeródromo: *inalterado*, *gravar* ou *revalidar pistas* (R4).
- **Revalidação de pistas** guiada por `source_sync_state.observed_at` e
  `airport.runways_checked_at`, com revalidação de 7 dias limitada a 1.000 por execução (R5).
- **Uma listagem do bucket** por execução no lugar de um `HeadObject` por carta (R6).
- **Fila única** sem barreira entre páginas, mantendo 4 requisições simultâneas à fonte (R7).
- **Resumo** com duração, novos contadores e tempo por etapa (R9).

## Technical Context

**Language/Version**: TypeScript (modo `strict`), Node.js 22

**Primary Dependencies**: as já em uso — `p-limit`, `fast-xml-parser` + `zod` (parsers),
`@aws-sdk/client-s3` (`ListObjectsV2Command`, já disponível no SDK instalado), Drizzle ORM +
`drizzle-kit` (migração), `commander` (CLI). **Nenhuma dependência nova.**

**Storage**: PostgreSQL — migração `0003` com a coluna `airport.runways_checked_at` e a tabela
`source_sync_state` ([data-model.md](./data-model.md)). Bucket S3 inalterado; só passa a ser
listado.

**Testing**: Vitest. Unitários sem rede nem banco para parsers (fixtures reais recortadas), para a
função pura de planejamento e para a orquestração da rotina com dublês das interfaces. Integração
(`test:integration`, com Testcontainers como na feature 002) para os repositórios novos, a
migração e `listKeys`.

**Target Platform**: processo CLI efêmero disparado pelo cron do Railway.

**Project Type**: CLI em monorepo pnpm (`apps/jobs`) e bibliotecas de workspace.

**Performance Goals**: varredura completa ≤ 5 min em produção em regime estável (SC-001); forçada
≤ 7 min 30 s (SC-002). Orçamento detalhado em research R8.

**Constraints**: no máximo 4 requisições simultâneas à fonte (FR-011); resultado persistido
equivalente ao da versão atual (FR-012); ordem bucket → banco → remoção de órfãos (FR-013);
códigos de saída inalterados.

**Scale/Scope**: ~4.491 aeródromos, ~9.000 pistas, ~1.807 cartas em 247 aeródromos. Três pacotes
tocados (`aisweb-client`, `object-storage`, `domain`) e a rotina em `apps/jobs`.

## Constitution Check

*GATE: revisto antes da Fase 0 e após a Fase 1.*

| Princípio | Situação | Observação |
|-----------|----------|------------|
| I. Monorepo pnpm / Node 22 | ✅ | Sem pacote novo; dependências entre pacotes continuam por `workspace:*` e entrypoints públicos. |
| II. TypeScript strict | ✅ | Tipos novos (`AirportCatalogEntry`, `IfrChartCatalog`, `AirportSnapshot`, `SourceSyncState`) exportados pelos entrypoints dos pacotes donos; sem `any`. |
| III. OO no backend / DI | ✅ | Repositórios e `ChartStorage` continuam interfaces injetadas; as decisões de planejamento são funções puras (exceção já prevista na feature 002 para `procedure-diff`). Relógio via `Clock`. Montagem só na `CompositionRoot`. |
| IV. Vitest (não negociável) | ✅ | Testes unitários para parsers, planejador e rotina; integração obrigatória para as mudanças de contrato entre pacotes (`AisWebClient`, `ChartStorage`, repositórios) e para a migração. |
| V. Biome | ✅ | `pnpm lint` no portão. |
| VI. pt-BR / inglês no código | ✅ | Artefatos e comentários em pt-BR; identificadores em inglês. |
| GitFlow / commits | ✅ | `feature/007-decea-crawler-optimization` a partir de `develop`. A mudança de padrão de `--page-size` e a remoção de métodos de `AisWebClient` não quebram consumidores externos (único consumidor é `apps/jobs`), então não exigem `!`. |

**Re-check pós-design**: sem violações. Nenhuma entrada em *Complexity Tracking*.

## Project Structure

### Documentation (this feature)

```text
specs/007-decea-crawler-optimization/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — descobertas da fonte e decisões R1–R9
├── data-model.md        # Fase 1 — coluna, tabela, regras de decisão e igualdade
├── quickstart.md        # Fase 1 — roteiro de validação
├── contracts/
│   ├── aisweb-api.md    # Adendo: catálogo e cartas em lote, indicador global
│   ├── jobs-cli.md      # Adendo: opções novas e resumo
│   └── packages.md      # Interfaces alteradas entre pacotes
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/aisweb-client/src/
├── aisweb-client.ts                 # + AirportCatalogEntry, AirportCatalogPage, IfrChartCatalog;
│                                    #   listAirports, fetchIfrChartCatalog; − countAirports,
│                                    #   listAirportIcaos, fetchIfrCharts
├── http-aisweb-client.ts            # Consultas em lote
├── index.ts                         # Exporta os tipos novos
└── parsers/
    ├── rotaer-parser.ts             # parseCatalog (itens com dados cadastrais)
    ├── charts-parser.ts             # parseCatalog (IcaoCode por item, lastupdate, emenda)
    └── __fixtures__/                # rotaer-catalogo, cartas-lote, cartas-lote-truncado, cartas-lote-sem-icao

packages/object-storage/src/
├── chart-storage.ts                 # + listKeys()
└── s3-chart-storage.ts              # ListObjectsV2 paginado

packages/domain/src/
├── repositories/index.ts            # + AirportSnapshot(Repository), SourceSyncState(Repository);
│                                    #   AirportSyncInput.runwaysCheckedAt; markRunwaysChecked
├── drizzle/
│   ├── schema.ts                    # + airport.runwaysCheckedAt, sourceSyncState
│   ├── airport-snapshot-repository.ts   # novo — 3 consultas, montagem em memória
│   ├── source-sync-state-repository.ts  # novo
│   ├── airport-sync-repository.ts       # runwaysCheckedAt + markRunwaysChecked
│   └── airport-procedure-repository.ts  # preserva archived_at quando storage_key não muda
└── migrations/0003_*.sql            # gerada por drizzle-kit

apps/jobs/src/
├── composition-root.ts              # Monta os repositórios novos; opções novas
├── main.ts                          # --force, --revalidation-days, --revalidation-budget; --page-size 5000
├── runtime/run-report.ts            # Contadores novos, tempo por etapa, indicador observado
└── jobs/decea-crawler/
    ├── decea-crawler-job.ts         # Fluxo: lote → retrato → plano → fila única
    ├── sync-planner.ts              # novo — função pura: pendência de pistas e destino (R4, R5)
    ├── airport-comparison.ts        # novo — igualdade de cadastro, pistas e cartas (data-model)
    ├── process-airport.ts           # Recebe entrada do catálogo, cartas, retrato e chaves do bucket
    ├── chart-archiver.ts            # Confere pertinência no conjunto de chaves em vez de exists()
    ├── procedure-diff.ts            # Reaproveitado na comparação de cartas
    ├── pagination.ts                # Inalterado
    └── README.md                    # Indicador, lotes, novas opções e medição (FR-015)

apps/jobs/tests/decea-crawler.integration.test.ts   # Cenários de regime estável e forçado
```

**Structure Decision**: mantém a estrutura da feature 002. A lógica nova de decisão fica em
funções puras dentro da rotina (`sync-planner.ts`, `airport-comparison.ts`), testáveis sem I/O; o
acesso a dados novos fica nos pacotes donos de cada fronteira (fonte, bucket, banco).

## Fluxo da execução

```text
1. Em paralelo (cada um com RetryPolicy):
     client.listAirports(0, 5000)           → catálogo (paginando se total > página)
     client.fetchIfrChartCatalog()           → cartas + lastupdate + emenda
     snapshotRepository.loadAll()            → retrato do banco
     storage.listKeys()                      → chaves do bucket (pulado em --skip-documents)
2. syncState.observe(lastupdate, emenda, agora)   → observedAt
3. sync-planner: para cada aeródromo do catálogo → inalterado | gravar | revalidar pistas
   (cartas de ICAO fora do catálogo descartadas e contadas)
4. Fila única, p-limit(concurrency), RetryPolicy por aeródromo:
     revalidar pistas → fetchAirport → compara → gravar ou marcar
     gravar           → arquiva ausentes → syncAirport (tx) → remove órfãos
5. markRunwaysChecked em lote para os revalidados sem mudança
6. Resumo
```

Falha definitiva de qualquer item do passo 1 encerra a execução sem gravar nada (research R2).

## Riscos

| Risco | Mitigação |
|-------|-----------|
| A fonte passar a paginar ou limitar a consulta de cartas em lote | Conferência de `total` já detecta truncamento e aborta sem gravar; fixtures quebram se o formato mudar |
| Comparação acusar diferença falsa (ex.: arredondamento) e regravar tudo | Regras de igualdade explícitas no data-model, cobertas por teste; SC-003 (≥ 95% inalterados) detecta na validação |
| Primeira execução após o deploy revalida todas as pistas | Esperado e estimado em ~4 min (≤ SC-002); registrado no quickstart |
| `archived_at` muda de significado para a API | Passa a ser o momento real do arquivamento — mais correto; nenhum consumidor depende do valor ser recente |

## Complexity Tracking

Sem violações da constituição.
