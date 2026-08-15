# Implementation Plan: Esqueleto do Monorepo

**Branch**: `feature/001-monorepo-skeleton` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-monorepo-skeleton/spec.md`

## Summary

Estabelecer o esqueleto estrutural do repositório: um monorepo pnpm com workspaces em
`packages/` e `apps/`, TypeScript em modo estrito, Biome como ferramenta única de lint e
formatação, e Vitest como framework único de testes — tudo herdado de configuração
centralizada na raiz, com comandos agregadores executáveis por um único script.

A abordagem técnica evita qualquer orquestrador de build adicional: `pnpm -r` cobre os portões
de tipos e testes, e o Biome varre a árvore inteira a partir de um único `biome.json`. Dois
pacotes de referência — a biblioteca `@open-nav-charts/core` e a aplicação
`@open-nav-charts/cli` — provam o esqueleto ponta a ponta, incluindo o consumo cruzado via
`workspace:*`. Nenhuma lógica de domínio de cartas náuticas entra nesta feature.

## Technical Context

**Language/Version**: TypeScript `^7.0.2` em modo estrito, ESM (`"type": "module"`)

**Primary Dependencies**: pnpm 9.9.0 (workspaces), `@biomejs/biome@^2.5.8`,
`vitest@^4.1.10`, `@vitest/coverage-v8@^4.1.10`, `@types/node@^22`. Vite fica **fora** desta
feature — nenhum pacote do esqueleto é frontend, e o Vitest 4 traz sua própria pipeline de
transformação (ver [research.md](./research.md), D7 e resumo de versões).

**Storage**: N/A — a feature não possui persistência

**Testing**: Vitest 4, ambiente `node`, arquivos `**/*.test.ts` colocados ao lado do código,
cobertura via provider `v8`

**Target Platform**: Node.js 22 (fixado em `.nvmrc` e `engines.node: "22.x"`)

**Project Type**: Monorepo — biblioteca + aplicação CLI

**Performance Goals**: O portão agregado `pnpm check` conclui em segundos no estado inicial;
nenhuma meta de throughput se aplica a esta feature

**Constraints**: Instalação em comando único a partir de clone limpo; nenhum passo manual;
pacote novo coberto pelos três portões sem alterar a raiz; suíte determinística entre
execuções

**Scale/Scope**: 2 pacotes iniciais; ~12 arquivos de configuração e código de exemplo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constituição v1.0.0. Avaliação por princípio:

| Princípio | Gate | Status | Evidência no design |
|-----------|------|--------|---------------------|
| I. Monorepo pnpm / Node 22 | `pnpm-workspace.yaml` na raiz; pacotes sob `packages/`/`apps/`; nome escopado; `workspace:*`; sem npm/yarn; `.nvmrc` + `engines.node`; sem import relativo cruzando fronteira | ✅ PASS | data-model (Workspace, Pacote); research D3, D6, D8; contrato de estrutura de pacote |
| II. TypeScript como Padrão | Produção em TS; `strict` habilitado; sem `any` em API pública; tipos compartilhados em pacote dedicado | ✅ PASS | `tsconfig.base.json` com strictness estendida (research D2); `vitest.shared.ts` e `vitest.config.ts` em TS. Vite não se aplica: sem frontend nesta feature |
| III. OO no backend, composição no frontend | Classes com responsabilidade única e DI por construtor fora do frontend; sem estado global mutável | ✅ PASS (não exercitado) | O esqueleto não contém lógica de domínio; o exemplo em `packages/core` é uma função pura mínima, não um singleton nem estado global. Nenhum grafo de objetos a compor ainda |
| IV. Testes com Vitest | Vitest único; sem Jest/Mocha/AVA; script `test` por pacote; determinismo; suíte verde | ✅ PASS | research D4, D5; contrato de scripts (obrigatoriedade de `test` por pacote); quickstart cenários 7–9 |
| V. Qualidade com Biome | Biome único; sem ESLint/Prettier; config única na raiz; CI falha em violação; sem supressão global | ✅ PASS | research D9, D10; `biome ci` em `pnpm check`; nenhuma regra desabilitada no ponto de partida |

**Fluxo de Desenvolvimento**: o script `check` encadeia exatamente os três portões exigidos
antes do merge (tipos, Biome, Vitest). Conventional Commits em pt-BR permanece
responsabilidade da pessoa e da revisão — automação de commit hooks está fora do escopo desta
feature por decisão registrada nas Assumptions da spec.

**Veredito inicial**: PASS, sem violações. Nenhuma entrada em Complexity Tracking.

### Re-avaliação pós-Phase 1

Reexecutada após gerar research, data-model, contratos e quickstart:

- Nenhum design introduziu ferramenta fora das Restrições Tecnológicas.
- Nenhuma dependência de runtime foi adicionada à raiz nem aos pacotes; tudo é `devDependency`
  de raiz, exceto `@open-nav-charts/core` como dependência interna da CLI.
- A decisão de **não** adotar Turborepo (D1) e de **não** usar project references (D2) segue a
  regra de Governança de preferir a alternativa mais simples na ausência de justificativa.
- A decisão de deixar Vite fora (D7 / resumo de versões) é uma redução de escopo, não um
  desvio do Princípio II: ele exige Vite *para aplicações de frontend*, e esta feature não
  entrega nenhuma.

**Veredito pós-design**: PASS, sem violações. Complexity Tracking permanece vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-monorepo-skeleton/
├── plan.md                        # Este arquivo (/speckit-plan)
├── spec.md                        # Especificação (/speckit-specify)
├── research.md                    # Phase 0 — decisões D1–D10 e versões
├── data-model.md                  # Phase 1 — estrutura declarativa do repositório
├── quickstart.md                  # Phase 1 — 14 cenários de validação
├── contracts/
│   ├── scripts.md                 # Contrato dos scripts do workspace
│   └── package-structure.md       # Contrato de estrutura de pacote
├── checklists/
│   └── requirements.md            # Checklist de qualidade da spec
└── tasks.md                       # Phase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
.nvmrc                             # 22
.npmrc                             # engine-strict=true
.gitignore                         # já existe e cobre todos os artefatos (FR-008)
package.json                       # raiz privada: packageManager, engines, scripts, devDeps
pnpm-workspace.yaml                # globs: packages/*, apps/*
biome.json                         # config única de lint e formatação
tsconfig.base.json                 # flags estritas herdadas por todos os pacotes
tsconfig.json                      # config de editor da raiz (não compila pacotes)
vitest.shared.ts                   # base de configuração de testes
README.md                          # instalar, verificar, testar, criar pacote (FR-025)

packages/
└── core/                          # @open-nav-charts/core — biblioteca de referência
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── index.ts
        └── index.test.ts

apps/
└── cli/                           # @open-nav-charts/cli — aplicação de referência
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── index.ts               # consome @open-nav-charts/core via workspace:*
        └── index.test.ts
```

**Structure Decision**: Monorepo de duas categorias — `packages/` para bibliotecas
reutilizáveis e `apps/` para aplicações executáveis — conforme FR-002 e o Princípio I. A
configuração compartilhada (`biome.json`, `tsconfig.base.json`, `vitest.shared.ts`) vive
exclusivamente na raiz e é herdada de cima para baixo, nunca lateralmente entre pacotes; é
essa topologia que garante SC-004 (pacote novo coberto sem alterar a raiz). Os dois pacotes
iniciais são de referência estrutural: `packages/core` é uma biblioteca sem dependências e
`apps/cli` é uma aplicação Node que a consome via `workspace:*`, exercitando de fato a
fronteira entre workspaces sem introduzir bundler, DOM ou dependências de UI.

## Complexity Tracking

> Nenhuma violação de Constitution Check. Seção intencionalmente vazia.
