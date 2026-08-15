# Contrato: Estrutura de Pacote

**Feature**: `001-monorepo-skeleton`

Este contrato define o formato que todo pacote do workspace MUST seguir. Ele é a referência
para o fluxo "criar um novo pacote" (História 4) e a base do teste de estrutura que garante
SC-004.

## Layout de diretório

```text
<packages|apps>/<nome>/
├── package.json          # manifesto (formato abaixo)
├── tsconfig.json         # estende a base da raiz
├── vitest.config.ts      # merge da configuração compartilhada
├── src/
│   ├── index.ts          # entrypoint público — único alvo de `exports`
│   └── **/*.ts           # implementação
└── src/**/*.test.ts      # testes, colocados ao lado do código
```

- `dist/` é gerado por `build` e nunca versionado (FR-008).
- Nenhum arquivo fora de `src/` é importável por outro pacote.

## Formato do `package.json`

### Campos obrigatórios em todo pacote

| Campo | Valor | Requisito |
|-------|-------|-----------|
| `name` | `@open-nav-charts/<nome-do-diretório>` | FR-003 |
| `version` | `0.0.0` enquanto não houver publicação | — |
| `private` | `true` | — |
| `type` | `"module"` | — |
| `engines.node` | `"22.x"` | FR-006 |
| `scripts` | Ver [contrato de scripts](./scripts.md) | FR-018 |

### Campos de biblioteca (`packages/*`)

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"]
}
```

**Regra**: a superfície pública é exatamente o que está em `exports`. Não declarar
`"./*"` — um subpath curinga anularia a fronteira exigida pelo Princípio I.

### Campos de aplicação (`apps/*`)

Uma aplicação não é consumida por outros pacotes: MUST NOT declarar `exports`, `main` ou
`types`. Quando executável, declara `bin`.

## Consumo entre pacotes

Declaração da dependência:

```jsonc
{
  "dependencies": {
    "@open-nav-charts/core": "workspace:*"
  }
}
```

Uso no código:

```ts
// permitido — entrypoint público
import { algo } from "@open-nav-charts/core";

// proibido — atravessa a fronteira do workspace (Princípio I)
import { algo } from "../../packages/core/src/interno.js";
```

**Garantia**: `workspace:*` resolve para o pacote local; nenhuma versão publicada é baixada
(FR-005, cenário 2 da História 4).

## Formato do `tsconfig.json` do pacote

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

**Regra**: o pacote MUST NOT redefinir flags de strictness herdadas da base. Qualquer
afrouxamento exige justificativa registrada na revisão (Princípio II).

## Formato do `vitest.config.ts` do pacote

```ts
import { mergeConfig, defineConfig } from "vitest/config";
import shared from "../../vitest.shared.js";

export default mergeConfig(shared, defineConfig({
  // apenas o que for específico deste pacote
}));
```

**Regra**: um pacote sem necessidades específicas exporta a base sem sobrescritas. Duplicar
opções já presentes na base é violação de FR-021.

## Checklist de conformidade para pacote novo

Ao criar um pacote, ele está conforme quando:

1. O diretório está sob um glob de `pnpm-workspace.yaml` (`packages/*` ou `apps/*`).
2. `name` deriva do nome do diretório com o escopo `@open-nav-charts/`.
3. `engines.node` é `22.x` e `type` é `module`.
4. Os scripts obrigatórios do contrato de scripts estão declarados.
5. `tsconfig.json` estende a base da raiz sem afrouxar strictness.
6. `vitest.config.ts` faz merge da base compartilhada.
7. Dependências internas usam `workspace:*`.
8. Nenhum arquivo da raiz precisou ser alterado (SC-004).
