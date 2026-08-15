# Implementation Plan: Coletor de aeroportos e cartas IFR do DECEA

**Branch**: `feature/002-decea-crawler-job` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-decea-crawler-job/spec.md`

## Summary

Cria a aplicação `apps/jobs`, um host de rotinas operacionais executáveis por linha de comando,
cuja primeira rotina (`decea-crawler`) coleta da API AISWEB do DECEA todos os aeródromos do tipo
`AD`, enriquece cada um com coordenadas e pistas, coleta suas cartas IFR e arquiva os PDFs
correspondentes em um bucket compatível com S3.

A abordagem técnica separa três responsabilidades em camadas com fronteiras explícitas: um pacote
de domínio e persistência reutilizável (`packages/domain`) que a futura API REST consumirá sem
duplicação (FR-031); um cliente da fonte externa isolado atrás de interfaces (`AisWebClient`,
`ChartStorage`) para manter os testes determinísticos e sem rede (Princípio IV); e um orquestrador
de pipeline em `apps/jobs` que aplica paginação de 100, concorrência de 4 e a política de 3
tentativas por aeródromo. A escolha central de projeto é tratar **o aeródromo como unidade
atômica de retry**: detalhamento, cartas e documentos de um mesmo ICAO são processados por um
único caso de uso reexecutável e idempotente, o que satisfaz FR-021/FR-022 sem estado de execução
parcial persistido.

## Technical Context

**Language/Version**: TypeScript 7 em modo `strict`, Node.js 22 (ESM, `module: NodeNext`)

**Primary Dependencies**:
- `drizzle-orm` 0.45 + `drizzle-kit` 0.31 (esquema em TypeScript e migrações versionadas em SQL)
- `pg` 8.23 (driver PostgreSQL; pool injetado, não gerenciado pelo ORM)
- `@aws-sdk/client-s3` 3.x (armazenamento de objetos compatível com S3)
- `fast-xml-parser` 5.x (a AISWEB responde em XML, não JSON)
- `zod` 4.x (validação do XML já parseado e das variáveis de ambiente)
- `p-limit` 7.x (limite de concorrência de 4 aeródromos)
- `commander` 15.x (registro e despacho de subcomandos de rotina)

**Storage**: PostgreSQL 17 (contêiner local); bucket compatível com S3 — MinIO local, Railway
Storage Buckets em produção

**Testing**: Vitest 4 — unitários com dublês em memória para todos os colaboradores de I/O;
integração com `@testcontainers/postgresql` e MinIO efêmero, isolados por tag e fora do
`pnpm test` padrão

**Target Platform**: Linux/macOS via Node.js 22; execução sob demanda por CLI

**Project Type**: Monorepo pnpm — aplicação CLI de rotinas + pacotes de biblioteca

**Performance Goals**: Execução completa do catálogo nacional (~4.500 aeródromos AD, dezenas de
milhares de cartas) em janela compatível com lote único; 4 aeródromos concorrentes é o teto
imposto pela spec (FR-023) e também a proteção contra limitação de taxa da fonte

**Constraints**: Rede da fonte é instável e sem SLA — toda falha de etapa é retentável (3
tentativas por aeródromo, FR-021); reexecução deve ser idempotente (FR-024); nenhum segredo no
código versionado (FR-004)

**Scale/Scope**: ~4.500 aeródromos, ~30.000 cartas IFR, ~30 GB de PDFs no bucket em regime
estacionário

**Unknowns resolvidos na Phase 0**: nenhum pendente. Os campos das cartas (`id`, `nome`, `tipo`,
`amdt`, `link`), o mecanismo de filtro (`especie=IFR`, com 13 siglas na espécie) e o formato das
coordenadas (decimais com sinal) foram **confirmados contra respostas reais da API** em 2026-08-15.
Ver [research.md](./research.md) R2 e R4.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Portão | Avaliação inicial | Pós-design |
|-----------|--------|-------------------|------------|
| I. Monorepo pnpm / Node 22 | Todo pacote sob `apps/` ou `packages/`, `engines.node: 22.x`, deps internas por `workspace:*`, sem import relativo cruzando fronteira | PASS — `apps/jobs` e os três pacotes seguem o contrato de estrutura da feature 001 | PASS |
| II. TypeScript strict | Sem `any` em API pública; tipos compartilhados em pacote dedicado, não copiados | PASS — entidades vivem só em `packages/domain`; XML externo entra como `unknown` e é estreitado por Zod | PASS |
| III. OO com injeção por construtor | Toda unidade de comportamento é classe com responsabilidade única e dependências por construtor; I/O atrás de interfaces; sem estado global nem singleton implícito | PASS — ver "Desenho orientado a objetos" abaixo; grafo montado só em `CompositionRoot` | PASS |
| IV. Vitest, testes determinísticos | Domínio e regras com teste unitário; sem rede real; contratos entre pacotes com teste de integração | PASS — política de retry, filtro IFR, diff de cartas e paginação são unidades puras testáveis com dublês | PASS |
| V. Biome | Config única na raiz, sem ESLint/Prettier | PASS — herda a configuração existente | PASS |

**Portões adicionais derivados da constituição:**

- **Commits em pt-BR, Conventional Commits com escopo de pacote** — aplicável na implementação.
- **GitFlow**: trabalho em `feature/002-decea-crawler-job`, com origem e destino em `develop`.
- **`pnpm check` verde antes do merge** (lint + build + typecheck + test).

**Resultado do portão inicial**: PASS, sem violações a justificar.

**Resultado do portão pós-design (Phase 1)**: PASS. O design não introduziu dependência que
substitua item das Restrições Tecnológicas; PostgreSQL, S3 e as bibliotecas escolhidas são
adições de domínio, não trocas de ferramenta constitucional. A seção *Complexity Tracking*
permanece vazia por ausência de violações.

## Project Structure

### Documentation (this feature)

```text
specs/002-decea-crawler-job/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Phase 0 (/speckit-plan)
├── data-model.md        # Phase 1 (/speckit-plan)
├── quickstart.md        # Phase 1 (/speckit-plan)
├── contracts/           # Phase 1 (/speckit-plan)
│   ├── aisweb-api.md    # Contrato consumido (fonte externa)
│   ├── jobs-cli.md      # Contrato exposto (linha de comando)
│   └── domain-package.md# Contrato exposto (pacote reutilizável)
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Phase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
apps/
└── jobs/                         # NOVO — host de rotinas operacionais
    ├── src/
    │   ├── main.ts               # Entrypoint: instancia CompositionRoot e despacha
    │   ├── composition-root.ts   # class CompositionRoot — raiz de injeção
    │   ├── config/
    │   │   └── environment-config.ts  # class EnvironmentConfig (FR-004, FR-005)
    │   ├── runtime/
    │   │   ├── job.ts            # interface Job — contrato de uma rotina
    │   │   ├── job-registry.ts   # class JobRegistry (FR-002, FR-003)
    │   │   ├── retry-policy.ts   # class RetryPolicy (FR-021)
    │   │   ├── run-report.ts     # class RunReport (FR-026, FR-027)
    │   │   └── progress-reporter.ts # interface + class ConsoleProgressReporter (FR-025)
    │   └── jobs/
    │       └── decea-crawler/
    │           ├── decea-crawler-job.ts  # class DeceaCrawlerJob implements Job (FR-007, FR-023)
    │           ├── process-airport.ts    # class ProcessAirport — unidade atômica de retry
    │           └── chart-archiver.ts     # class ChartArchiver — download + arquivamento
    └── tests/                    # Integração (fora do include padrão de unitários)

packages/
├── domain/                       # NOVO — entidades + persistência reutilizável (FR-031)
│   ├── src/
│   │   ├── entities/             # Airport, AirportRunway, AirportProcedure (tipos puros)
│   │   ├── repositories/         # Interfaces AirportRepository / ProcedureRepository
│   │   ├── drizzle/
│   │   │   ├── schema.ts         # Esquema das tabelas
│   │   │   ├── client.ts         # Fábrica de conexão (pool injetado)
│   │   │   └── *-repository.ts   # Implementações Drizzle das interfaces
│   │   └── migrations/           # SQL versionado gerado por drizzle-kit (FR-032)
│   └── drizzle.config.ts
├── aisweb-client/                # NOVO — cliente da fonte externa
│   └── src/
│       ├── aisweb-client.ts      # interface AisWebClient + class HttpAisWebClient
│       ├── parsers/              # XML → entidades, validado com Zod
│       └── errors.ts             # Erros tipados (retentável vs. definitivo)
└── object-storage/               # NOVO — abstração de bucket S3 (FR-017..FR-020)
    └── src/
        ├── chart-storage.ts      # interface ChartStorage
        └── s3-chart-storage.ts   # class S3ChartStorage

docker-compose.yml                # NOVO — PostgreSQL + MinIO (FR-029)
.env.example                      # NOVO — variáveis documentadas (FR-030)
```

**Structure Decision**: Adotada a estrutura de monorepo já vigente (`apps/` + `packages/`),
estendida com uma aplicação e três pacotes.

A separação em três pacotes em vez de um único responde a fronteiras de reuso distintas, não a
gosto por camadas:

- `packages/domain` é o único exigido explicitamente pela spec (FR-031) — a futura API REST
  precisa das entidades e do acesso a dados, e **não** do cliente do DECEA nem do bucket.
- `packages/aisweb-client` isola a fonte externa: é o único ponto que conhece XML, chaves de API e
  os nomes de campo da AISWEB. Mantê-lo fora de `domain` impede que o formato de um terceiro
  vaze para o modelo que a API REST vai expor.
- `packages/object-storage` isola o S3 pelo mesmo motivo e permite trocar MinIO por Railway sem
  tocar em regra de negócio.

`apps/jobs` é a primeira aplicação de produção do repositório. Os pacotes de referência criados
para validar o esqueleto na feature 001 (`apps/cli` e `packages/core`) foram removidos por terem
cumprido seu propósito, deixando `apps/` e `packages/` vazios — nada nesta feature depende deles.

## Desenho orientado a objetos

Premissa do projeto e exigência do Princípio III. Vale para `apps/jobs` e para os três pacotes;
o frontend, isento pela constituição, não existe nesta feature.

**Regras que a implementação deve seguir**

1. **Toda unidade de comportamento é uma classe.** Funções soltas exportadas ficam restritas a
   transformações puras sem dependências (ex.: normalizar uma coordenada). Qualquer coisa que
   colabore com outra — orquestrar, decidir, persistir, buscar — é classe.
2. **Dependências entram pelo construtor**, nunca por import de instância, variável de módulo ou
   parâmetro opcional com default que instancia algo. Um objeto não constrói seus próprios
   colaboradores de I/O.
3. **Todo colaborador de I/O é declarado como interface** e consumido por ela: `AisWebClient`,
   `AirportRepository`, `AirportSyncRepository`, `ChartStorage`, `ProgressReporter`, `Clock`. A
   classe concreta (`HttpAisWebClient`, `S3ChartStorage`…) só é nomeada na raiz de composição.
4. **Uma única raiz de composição**: `CompositionRoot` é o único ponto que instancia classes
   concretas e monta o grafo. `main.ts` apenas a invoca. Nenhum outro arquivo faz `new` de um
   colaborador de I/O.
5. **Sem estado global mutável e sem singleton implícito** — proibição direta do Princípio III.
   Sem `let` de nível de módulo, sem cache em variável de módulo, sem instância exportada pronta.
   O pool do banco é criado e fechado pela raiz de composição, o que é a razão técnica da escolha
   de Drizzle sobre Prisma (research R5).
6. **Estado encapsulado**: campos privados com o modificador `private` do TypeScript, sem expor
   estruturas mutáveis. Quando um getter público precisa do mesmo nome de um campo interno, o
   campo leva o prefixo `_` (`private readonly _failures` + `get failures()`) — `private` não
   admite campo e acessor homônimos, ao contrário de `#`. `RunReport` acumula internamente e
   devolve leitura imutável.
7. **Relógio e aleatoriedade injetados**: `RetryPolicy` recebe um `Clock`; o *jitter* recebe uma
   fonte de aleatoriedade. Sem isso, testar *backoff* exigiria esperar de verdade — e o
   Princípio IV proíbe teste dependente de relógio não controlado.

**Colaboração das classes principais**

```text
main.ts
  └─ CompositionRoot            monta o grafo a partir de EnvironmentConfig
       └─ JobRegistry           resolve o nome do subcomando → Job
            └─ DeceaCrawlerJob  implements Job
                 ├─ AisWebClient      (interface) paginação do catálogo
                 ├─ RetryPolicy       envolve cada aeródromo em até 3 tentativas
                 ├─ ProgressReporter  (interface) progresso por página/aeródromo
                 ├─ RunReport         acumula sucessos, falhas e alertas
                 └─ ProcessAirport    unidade atômica de retry, um ICAO
                      ├─ AisWebClient          (interface) detalhe + cartas IFR
                      ├─ ChartArchiver         baixa e arquiva os PDFs
                      │    └─ ChartStorage     (interface) bucket S3
                      └─ AirportSyncRepository (interface) transação do agregado
```

`DeceaCrawlerJob` cuida da varredura (paginação e concorrência); `ProcessAirport` cuida de um
aeródromo. Essa divisão é o que mantém a responsabilidade única: a política de retry envolve
`ProcessAirport` inteiro sem que ele saiba que está sendo repetido, e `ProcessAirport` é testável
com dublês sem nunca paginar nada.

**Como isso é verificado**: todos os testes unitários constroem seus objetos passando dublês pelo
construtor. Se uma classe não puder ser testada assim, ela está construindo dependência internamente
— e isso é o sintoma de violação a corrigir, não a contornar com mock de módulo.

## Complexity Tracking

> Preenchido apenas se o Constitution Check tiver violações a justificar.

Sem violações. Nenhuma entrada.
