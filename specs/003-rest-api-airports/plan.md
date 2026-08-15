# Implementation Plan: API REST de Aeródromos e Cartas

**Branch**: `feature/003-rest-api-airports` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rest-api-airports/spec.md`

## Summary

Publicar uma API REST somente-leitura sobre o acervo que a rotina `decea-crawler` já
alimenta: catálogo paginado de aeródromos com filtro e busca, detalhe do aeródromo com
pistas, relação de procedimentos e acesso ao PDF da carta.

A abordagem central é **não intermediar os bytes do documento**: a rota da carta responde
`302` para uma URL pré-assinada do bucket, válida por 5 minutos e gerada a cada requisição.
A assinatura é local (CPU sobre a chave), então o custo de servir uma carta independe do
tamanho do PDF — é o que sustenta SC-004.

A entrega cria o app `apps/api` e estende dois pacotes existentes com as capacidades que a
API exige e que hoje não existem: listagem paginada com busca em `domain`, e geração de URL
assinada em `object-storage`. Uma migração aditiva acrescenta a coluna `search_text`, que
viabiliza a busca insensível a acentuação sem depender de extensão do PostgreSQL.

## Technical Context

**Language/Version**: TypeScript 7 em modo `strict`, Node.js 22 (fixado em `.nvmrc` e
`engines.node`)

**Primary Dependencies**: Express 5.2 (roteamento HTTP), Zod 4 (validação de entrada, já no
monorepo), `@aws-sdk/s3-request-presigner` 3.1111.0 (assinatura de URL, alinhado à linha
`@aws-sdk` já usada), `helmet` + `cors` + `express-rate-limit` (borda), e os pacotes de
workspace `@open-nav-charts/domain` e `@open-nav-charts/object-storage`

**Storage**: PostgreSQL 17 via Drizzle (leitura), acessado exclusivamente pelos contratos de
repositório do pacote `domain`; bucket compatível com S3 (MinIO local) apenas para assinar
URLs — a API nunca lê o conteúdo dos objetos

**Testing**: Vitest em três níveis — unitário com dublês em memória, contrato HTTP com
`supertest`, integração com Testcontainers contra PostgreSQL real

**Target Platform**: Servidor Linux, processo Node único

**Project Type**: Serviço web (API REST) dentro de monorepo pnpm

**Performance Goals**: 95% das leituras abaixo de 500 ms (SC-002); primeira página abaixo de
1 s (SC-001); 200 requisições simultâneas sem degradar além do dobro (SC-005)

**Constraints**: consumo de memória e banda ao servir documentos independente do tamanho do
PDF (SC-004); nenhuma resposta de erro expõe detalhe interno (SC-009); somente leitura —
nenhuma rota de escrita

**Scale/Scope**: milhares de aeródromos e dezenas de milhares de procedimentos; 6 endpoints
(4 de recurso, 1 de saúde, 1 de contrato)

## Constitution Check

*GATE: verificado antes da Fase 0 e reavaliado após a Fase 1.*

| Princípio | Como esta feature adere | Situação |
|-----------|-------------------------|----------|
| **I. Monorepo pnpm / Node 22** | Novo pacote em `apps/api` com `package.json` escopado `@open-nav-charts/api`, `engines.node: 22.x`. Dependências de workspace por `workspace:*`. Importações sempre pelo nome do pacote, nunca por caminho relativo atravessando fronteira. | ✅ |
| **II. TypeScript strict** | Todo o código em TypeScript; `tsconfig.json` estende `tsconfig.base.json`. Sem `any` em superfície pública. Vite não se aplica — não há frontend nesta feature. | ✅ |
| **III. OO no backend, injeção por construtor** | Serviços e controladores são classes recebendo colaboradores por construtor. Repositórios e armazenamento chegam como interfaces. Uma `CompositionRoot` monta o grafo, espelhando `apps/jobs`. Sem singleton de módulo nem estado global. Exceção idiomática: funções puras de mapeamento e normalização, como já ocorre em `mappers.ts`. | ✅ |
| **IV. Vitest (não negociável)** | Vitest é o único framework. Testes determinísticos: sem rede real, relógio injetado onde relevante. Testes de integração obrigatórios para as mudanças nas APIs públicas de `domain` e `object-storage`. Scripts `test`/`test:watch`/`test:coverage` no pacote novo. | ✅ |
| **V. Biome** | Herda `biome.json` da raiz. Sem ESLint nem Prettier. | ✅ |
| **Fluxo — GitFlow** | Branch `feature/003-rest-api-airports`, criada de `develop` e com destino `develop`. Sufixo preserva o prefixo numérico da feature. | ✅ |
| **Fluxo — Conventional Commits** | Descrições em português do Brasil, escopo identificando o pacote (`feat(api): …`, `feat(domain): …`). | ✅ |

**Resultado**: nenhuma violação. A seção *Complexity Tracking* fica vazia e por isso foi
removida.

### Reavaliação pós-Fase 1

Refeita após `research.md`, `data-model.md`, `contracts/` e `quickstart.md`. Nenhum princípio
passou a ser violado pelo desenho. Dois pontos que a Fase 1 mudou para melhor:

- **Simplicidade (cláusula de governança)**: a busca insensível a acentuação foi movida das
  extensões `unaccent`/`pg_trgm` para normalização em JavaScript. Some o wrapper
  `immutable_unaccent`, a coluna gerada e a dependência de privilégio de `CREATE EXTENSION`.
  Na ausência de justificativa para a complexidade adicional, prevalece a alternativa mais
  simples — que é exatamente o que a governança determina.
- **Princípio I (fronteiras de workspace)**: a decisão de manter a assinatura de URL dentro
  de `object-storage`, em vez de a API montar o cliente S3, preserva o encapsulamento do SDK
  em um único pacote.

### Observação de fronteira (não é violação)

O README afirma que "`domain` é o único pacote que a futura API REST vai consumir". Com o
requisito de redirecionamento (FR-019), a API também depende de `object-storage`, porque a
assinatura da URL precisa das credenciais e do cliente S3 — que, por decisão de encapsulamento
já registrada no próprio `s3-client-factory.ts`, não podem vazar desse pacote. A alternativa
seria duplicar a assinatura na API, o que é pior. **O README deve ser corrigido nesta
feature** (ver [research.md R3](./research.md)).

## Project Structure

### Documentation (this feature)

```text
specs/003-rest-api-airports/
├── plan.md              # Este arquivo
├── spec.md              # Especificação da feature
├── research.md          # Fase 0 — decisões técnicas (R1–R12)
├── data-model.md        # Fase 1 — entidades, contratos e migração
├── quickstart.md        # Fase 1 — guia de validação ponta a ponta
├── contracts/
│   └── rest-api.md      # Fase 1 — contrato HTTP dos endpoints
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Fase 2 — gerado por /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── jobs/                          # Existente — não alterado por esta feature
└── api/                           # NOVO — @open-nav-charts/api
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.test.json
    ├── vitest.config.ts
    ├── vitest.integration.config.ts
    ├── src/
    │   ├── main.ts                # Entrada: lê config, sobe servidor, trata sinais
    │   ├── composition-root.ts    # Monta o grafo de objetos (Princípio III)
    │   ├── config/
    │   │   └── environment-config.ts   # Validação Zod das variáveis (FR-034)
    │   ├── http/
    │   │   ├── create-app.ts      # Monta o Express, middlewares e rotas
    │   │   ├── error-handler.ts   # Middleware final — erro uniforme (FR-026, FR-035)
    │   │   ├── api-error.ts       # Hierarquia de erro com código e status
    │   │   ├── request-logger.ts  # Rota, status e duração (FR-031)
    │   │   └── validation.ts      # Schemas Zod dos parâmetros (FR-027)
    │   ├── routes/
    │   │   ├── airports-router.ts     # /airports, /airports/:icao
    │   │   ├── procedures-router.ts   # /airports/:icao/procedures[/:id/chart]
    │   │   ├── health-router.ts       # /health (FR-029)
    │   │   └── docs-router.ts         # /docs — contrato publicado (FR-032)
    │   ├── services/
    │   │   ├── airport-service.ts     # Regra de listagem e detalhe
    │   │   ├── procedure-service.ts   # Regra de procedimentos
    │   │   └── chart-service.ts       # Pertencimento, disponibilidade, assinatura
    │   ├── presentation/
    │   │   └── responses.ts       # Entidade -> corpo de resposta (esconde storageKey)
    │   ├── observability/
    │   │   └── logger.ts          # Logger JSON injetável (FR-031)
    │   └── testing/
    │       └── doubles.ts         # Dublês em memória dos repositórios
    └── tests/
        └── api.integration.test.ts    # Ponta a ponta com Testcontainers

packages/
├── domain/                        # ESTENDIDO
│   └── src/
│       ├── entities/index.ts      # + AirportSummary
│       ├── repositories/index.ts  # + AirportListQuery, AirportPage,
│       │                          #   AirportRepository.list,
│       │                          #   AirportProcedureRepository.findById
│       ├── drizzle/
│       │   ├── airport-repository.ts      # + list(); saveAirportWith preenche search_text
│       │   ├── airport-procedure-repository.ts  # + findById()
│       │   ├── mappers.ts                 # + normalizeSearchText()
│       │   └── schema.ts                  # + coluna search_text
│       └── migrations/
│           └── 0001_*.sql                 # NOVA — coluna + índice + backfill
└── object-storage/                # ESTENDIDO
    └── src/
        ├── chart-storage.ts       # + presignGetUrl no contrato
        ├── s3-chart-storage.ts    # + implementação via presigner
        └── s3-client-factory.ts   # + repasse no ManagedChartStorage
```

**Structure Decision**: app novo em `apps/api`, seguindo a divisão que o repositório já
estabelece — `apps/` para executáveis, `packages/` para bibliotecas. A estrutura interna
espelha `apps/jobs` (`main.ts` + `composition-root.ts` + `config/`), o que mantém um único
padrão de inicialização no monorepo. As camadas `routes` → `services` → repositórios
materializam o Princípio III: o roteador não conhece persistência e o serviço não conhece
HTTP, o que permite testar toda a regra de negócio sem levantar servidor.

## Implementation Phases

Ordem derivada das dependências técnicas, não da prioridade das histórias: as extensões dos
pacotes precisam existir antes de a API poder consumi-las. Dentro da fase 3, a ordem das
rotas segue as prioridades da spec (P1 antes de P2).

### Fase A — Extensões dos pacotes (fundação)

1. `domain`: `normalizeSearchText` nos mappers, coluna `search_text` no schema, migração
   com backfill, `saveAirportWith` passando a preencher a coluna.
2. `domain`: tipos `AirportListQuery`, `AirportPage`, `AirportSummary`; `list()` em
   `AirportRepository` e implementação Drizzle; `findById()` em
   `AirportProcedureRepository`.
3. `object-storage`: `presignGetUrl` no contrato, na implementação S3 e no
   `ManagedChartStorage`.
4. Testes de integração das três mudanças — exigência do Princípio IV para alteração de API
   pública de pacote.

### Fase B — Esqueleto do app

5. `apps/api` com `package.json`, tsconfigs, configs de Vitest, conforme o contrato de
   pacote de `specs/001-monorepo-skeleton/contracts/package-structure.md`.
6. `EnvironmentConfig` com Zod, reportando todas as ausências de uma vez (FR-034).
7. `create-app.ts` com middlewares de borda, logger, tratamento de erro uniforme e `/health`.
8. `main.ts` com encerramento ordenado (FR-033) e `CompositionRoot`.

### Fase C — Rotas de recurso

9. `GET /airports` — paginação, filtro, busca (História 1, P1).
10. `GET /airports/:icao` — detalhe com pistas (História 2, P1).
11. `GET /airports/:icao/procedures` — relação com `hasChart` (História 3, P2).
12. `GET /airports/:icao/procedures/:id/chart` — redirect assinado (História 4, P2).

### Fase D — Acabamento

13. `/docs` publicando o contrato (FR-032).
14. Limitação de taxa (FR-030) e verificação dos cenários da História 5.
15. Teste de integração ponta a ponta.
16. Correção do README (fronteira `object-storage`, seção da API, variáveis novas em
    `.env.example`).

## Riscos e pontos de verificação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Divergência entre a normalização em SQL da migração e a em JavaScript | Aeródromos gravados antes e depois respondem diferente à mesma busca | Teste de integração que grava acentuado e busca sem acento; o mapa de `translate()` cobre os diacríticos do português |
| Busca com `%termo%` não usa índice | Latência acima de SC-002 se o acervo crescer de ordem | Medir com acervo completo; havendo estouro, adotar `pg_trgm` ou restringir a prefixo — não abandonar a normalização |
| Endpoint do bucket não alcançável pelo cliente em produção | Redirect leva a URL inacessível | Validar na primeira publicação; se necessário, configuração de endpoint público separado do interno, sem mudar o contrato da rota |
| Limitador de taxa em memória | Com múltiplas instâncias, o limite efetivo se multiplica | Aceito nesta entrega (instância única); migrar para armazenamento compartilhado é evolução conhecida |
