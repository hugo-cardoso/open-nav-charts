# Phase 1 Data Model: Esqueleto do Monorepo

**Feature**: `001-monorepo-skeleton` | **Date**: 2026-08-14

Esta feature não possui persistência nem entidades de domínio. O "modelo de dados" aqui é a
**estrutura declarativa do repositório**: os arquivos de configuração e suas relações de
herança e referência. As entidades abaixo mapeiam diretamente as Key Entities da spec.

## Entidade: Workspace

O repositório como unidade. Materializado nos arquivos de raiz.

| Campo | Arquivo / chave | Valor | Requisito |
|-------|-----------------|-------|-----------|
| Diretórios de pacotes | `pnpm-workspace.yaml` → `packages` | `packages/*`, `apps/*` | FR-001, FR-002 |
| Gerenciador fixado | `package.json` → `packageManager` | `pnpm@9.9.0` | FR-007 |
| Bloqueio de gerenciador | `package.json` → `scripts.preinstall` | `npx only-allow pnpm` | FR-007 |
| Runtime exigido | `.nvmrc` | `22` | FR-006 |
| Runtime exigido (manifesto) | `package.json` → `engines.node` | `22.x` | FR-006 |
| Strictness de engine | `.npmrc` → `engine-strict` | `true` | FR-006 |
| Privacidade | `package.json` → `private` | `true` | — |
| Comandos agregadores | `package.json` → `scripts` | ver contrato de scripts | FR-024, FR-026 |
| Artefatos ignorados | `.gitignore` | ver lista abaixo | FR-008 |

**Regras de validação**:

- `pnpm-workspace.yaml` MUST existir na raiz e listar exatamente os dois globs.
- A raiz MUST ser `private: true` — não é um pacote publicável.
- A raiz MUST NOT declarar dependências de runtime; apenas `devDependencies`.

**Artefatos ignorados** (FR-008, SC-008): `node_modules/`, `.pnpm-store/`,
`package-lock.json`, `yarn.lock`, `dist/`, `build/`, `*.tsbuildinfo`, `coverage/`, `.vite/`,
`.turbo/`, `.env*` (exceto `.env.example`), `.DS_Store`, `*.log`.

> O `.gitignore` atual da raiz já cobre toda essa lista — nenhuma alteração é necessária.

## Entidade: Pacote

Unidade versionável dentro do workspace. Duas instâncias no esqueleto.

| Campo | Origem | Regra |
|-------|--------|-------|
| `name` | `package.json` | `@open-nav-charts/<dir>`, derivado do nome do diretório (FR-003, D8) |
| Categoria | Caminho | `packages/*` = biblioteca; `apps/*` = aplicação (FR-002) |
| `private` | `package.json` | `true` em `apps/*`; `true` em `packages/*` enquanto não houver publicação |
| `type` | `package.json` | `"module"` — ESM em todo o repositório |
| `engines.node` | `package.json` | `22.x` (FR-006) |
| `exports` | `package.json` | Superfície pública; nada fora dela é importável (Princípio I, D3) |
| `scripts.test` | `package.json` | Obrigatório em todo pacote (FR-018, D5) |
| `scripts.typecheck` | `package.json` | Obrigatório em todo pacote (FR-015) |
| `scripts.build` | `package.json` | Obrigatório onde há `dist` a produzir |
| Dependências internas | `package.json` → `dependencies` | Protocolo `workspace:*` (FR-005) |
| Config de tipos | `tsconfig.json` | `extends` a base da raiz (FR-014) |
| Config de testes | `vitest.config.ts` | Merge da base compartilhada (FR-021) |

**Regras de validação**:

- Dois pacotes MUST NOT compartilhar o mesmo `name` (edge case de nome duplicado; garantido
  por derivar o nome do caminho, que é único por construção).
- Um pacote MUST NOT importar de outro por caminho relativo atravessando a fronteira do
  workspace (Princípio I); o consumo se dá pelo `name` do pacote.
- Todo pacote MUST ser alcançado pelos globs do `pnpm-workspace.yaml`.

### Instâncias no esqueleto

| Diretório | Nome | Categoria | Dependências internas |
|-----------|------|-----------|-----------------------|
| `packages/core` | `@open-nav-charts/core` | Biblioteca | nenhuma |
| `apps/cli` | `@open-nav-charts/cli` | Aplicação | `@open-nav-charts/core` (`workspace:*`) |

## Entidade: Configuração compartilhada

Definições que vivem na raiz e são herdadas. Ponto único de alteração (FR-011, FR-014,
FR-021).

| Arquivo | Escopo | Mecanismo de herança | Requisito |
|---------|--------|----------------------|-----------|
| `biome.json` | Qualidade (lint + formatação) | Varredura da árvore a partir da raiz — pacotes não configuram nada | FR-011, FR-013 |
| `tsconfig.base.json` | Tipagem | `extends` no `tsconfig.json` de cada pacote | FR-014 |
| `tsconfig.json` (raiz) | Editor / IDE | Não compila pacotes; referencia a base | — |
| `vitest.shared.ts` | Testes | Import + merge no `vitest.config.ts` de cada pacote | FR-021 |

**Relação-chave**: a herança é sempre **raiz → pacote**, nunca lateral entre pacotes. Um pacote
novo obtém as três configurações sem tocar em nenhum arquivo da raiz (SC-004).

## Entidade: Portão de qualidade

Verificação executável com veredito binário. Compõe o agregador de pré-merge.

| Portão | Comando raiz | Cobertura | Falha quando | Requisito |
|--------|--------------|-----------|--------------|-----------|
| Qualidade de código | `pnpm lint` (`biome ci .`) | Árvore inteira, menos artefatos | Qualquer violação de lint ou formatação | FR-009, FR-012 |
| Correção automática | `pnpm lint:fix` (`biome check --write .`) | Idem | — (aplica correções) | FR-010 |
| Tipos | `pnpm typecheck` (`pnpm -r typecheck`) | Todos os pacotes | Qualquer erro de tipo em qualquer pacote | FR-015, FR-016 |
| Testes | `pnpm test` (`pnpm -r test`) | Todos os pacotes | Qualquer teste falhando | FR-017, FR-023 |
| Cobertura | `pnpm test:coverage` | Todos os pacotes | Conforme thresholds | FR-020 |
| Agregador | `pnpm check` | Os três portões, em sequência | Primeira falha aborta | FR-026, FR-027 |

**Regra de validação**: todo portão MUST comunicar seu veredito por código de saída — `0` para
sucesso, diferente de `0` para falha (FR-027).

## Diagrama de relações

```text
Workspace (raiz)
├── declara ──> Pacote[]           (pnpm-workspace.yaml: packages/*, apps/*)
├── possui  ──> Configuração compartilhada
│                 ├── biome.json         ──aplica-se-a──> todos os arquivos
│                 ├── tsconfig.base.json ──herdada-por──> Pacote.tsconfig.json
│                 └── vitest.shared.ts   ──herdada-por──> Pacote.vitest.config.ts
└── expõe   ──> Portão de qualidade[]    ──executa-sobre──> Pacote[]

Pacote(apps/cli) ──depende-de(workspace:*)──> Pacote(packages/core)
                 └── consome apenas via ──> Pacote.exports
```
