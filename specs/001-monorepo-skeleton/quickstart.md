# Quickstart / Validação: Esqueleto do Monorepo

**Feature**: `001-monorepo-skeleton` | **Date**: 2026-08-14

Guia de validação executável. Cada cenário abaixo prova um critério de sucesso da spec e pode
ser rodado por qualquer pessoa após a implementação.

## Pré-requisitos

- Node.js 22 disponível (`nvm use` lê o `.nvmrc` da raiz).
- Corepack habilitado (`corepack enable`) ou pnpm 9.9.0 instalado globalmente.
- Repositório clonado, nenhum `node_modules` presente.

## Setup

```bash
nvm use          # lê .nvmrc -> Node 22
pnpm install
```

**Esperado**: instalação conclui com sucesso; `pnpm ls -r --depth -1` lista a raiz,
`@open-nav-charts/core` e `@open-nav-charts/cli`. Nenhum passo manual adicional (SC-002).

---

## Cenário 1 — Workspace instalável e reconhecido

**Prova**: História 1 / SC-002

```bash
pnpm ls -r --depth -1
```

**Esperado**: os dois pacotes do workspace aparecem listados, cada um com seu nome escopado.

---

## Cenário 2 — Gerenciador não suportado é bloqueado

**Prova**: História 1, cenário 3 / FR-007

```bash
npm install; echo "exit=$?"
```

**Esperado**: falha com mensagem do `only-allow` indicando que o gerenciador correto é pnpm.
`exit` diferente de `0`. Nenhum `package-lock.json` criado.

> Se um `package-lock.json` for gerado apesar do bloqueio, remova-o — ele é ignorado pelo
> versionamento, mas não deve ficar na árvore de trabalho.

---

## Cenário 3 — Runtime divergente é sinalizado

**Prova**: História 1, cenário 2 / FR-006

```bash
nvm use 20 && pnpm install; echo "exit=$?"
nvm use          # volta para 22
```

**Esperado**: a instalação falha explicitamente por incompatibilidade de `engines.node`
(`engine-strict=true` no `.npmrc`), em vez de prosseguir com aviso.

---

## Cenário 4 — Portão de qualidade passa no estado inicial

**Prova**: História 2, cenário 1 / SC-005

```bash
pnpm lint; echo "exit=$?"
```

**Esperado**: `exit=0`, nenhuma violação reportada.

---

## Cenário 5 — Violação de estilo é detectada e corrigida

**Prova**: História 2, cenários 2 e 3 / SC-006

```bash
# introduz formatação divergente em um arquivo do core
printf 'export const x   =    1\n' >> packages/core/src/index.ts

pnpm lint; echo "exit=$?"      # deve falhar apontando arquivo e posição
pnpm lint:fix                  # corrige o que é automatizável
pnpm lint; echo "exit=$?"      # deve voltar a 0

git checkout -- packages/core/src/index.ts   # desfaz a alteração de teste
```

**Esperado**: a primeira execução falha identificando `packages/core/src/index.ts` e a
posição; após `lint:fix`, a verificação passa.

---

## Cenário 6 — Verificação de tipos cobre todos os pacotes

**Prova**: FR-015, FR-016

```bash
pnpm typecheck; echo "exit=$?"
```

**Esperado**: `exit=0`. Para provar a detecção, introduza temporariamente um erro de tipo em
`packages/core/src/index.ts` e confirme que o comando falha identificando o pacote.

---

## Cenário 7 — Suíte de testes agregada

**Prova**: História 3, cenários 1 e 2 / FR-017, FR-023

```bash
pnpm test; echo "exit=$?"
```

**Esperado**: `exit=0`, com resultado dos dois pacotes. Introduzindo um teste que falha em
qualquer pacote, o comando termina em falha indicando o pacote e o teste responsáveis.

---

## Cenário 8 — Execução isolada por pacote

**Prova**: História 3, cenário 3 / FR-018

```bash
pnpm --filter @open-nav-charts/core test
```

**Esperado**: apenas os testes de `packages/core` executam; nada de `apps/cli` aparece na
saída.

---

## Cenário 9 — Determinismo da suíte

**Prova**: SC-007 / FR de determinismo

```bash
pnpm test > /tmp/run1.txt 2>&1
pnpm test > /tmp/run2.txt 2>&1
diff <(grep -E 'Tests|Test Files' /tmp/run1.txt) <(grep -E 'Tests|Test Files' /tmp/run2.txt) && echo "determinístico"
```

**Esperado**: os totais de arquivos e testes são idênticos entre as duas execuções.

---

## Cenário 10 — Cobertura

**Prova**: FR-020

```bash
pnpm test:coverage
```

**Esperado**: relatório de cobertura gerado por pacote em `coverage/`, sem falha de threshold.

---

## Cenário 11 — Consumo entre pacotes resolve internamente

**Prova**: História 4, cenário 2 / FR-005

```bash
pnpm --filter @open-nav-charts/cli build
node apps/cli/dist/index.js
```

**Esperado**: a CLI executa e imprime um resultado produzido pela função de
`@open-nav-charts/core`, provando que a dependência `workspace:*` resolveu para o pacote
local. Nenhum download de versão publicada aparece no log de instalação.

---

## Cenário 12 — Pacote novo é coberto sem tocar na raiz

**Prova**: História 4 / SC-004

Siga o [contrato de estrutura de pacote](./contracts/package-structure.md) para criar
`packages/exemplo`, depois:

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status --porcelain -- package.json pnpm-workspace.yaml biome.json tsconfig.base.json vitest.shared.ts
```

**Esperado**: os três portões incluem o novo pacote, e o último comando não retorna nenhuma
linha — nenhum arquivo de configuração da raiz foi modificado.

---

## Cenário 13 — Portão agregado de pré-merge

**Prova**: FR-026, FR-027

```bash
pnpm check; echo "exit=$?"
```

**Esperado**: executa lint, typecheck e test em sequência; `exit=0` no estado inicial. Com uma
violação introduzida em qualquer um dos três, o comando aborta no primeiro portão que falhar e
propaga código de saída diferente de `0`.

---

## Cenário 14 — Nenhum artefato gerado é versionado

**Prova**: SC-008

```bash
pnpm install && pnpm build && pnpm test:coverage && pnpm lint
git status --porcelain
```

**Esperado**: `git status --porcelain` não lista `node_modules/`, `dist/`, `coverage/`,
`*.tsbuildinfo` nem qualquer cache de ferramenta.

---

## Critério de aceitação global

A feature está validada quando os 14 cenários acima passam em um clone limpo, e o percurso
completo (pré-requisitos → Cenário 13) é concluível em menos de 10 minutos por alguém que
nunca viu o repositório, usando apenas o `README.md` da raiz (SC-001).
