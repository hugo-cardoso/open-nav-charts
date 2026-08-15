# open-nav-charts-v2

Monorepo para cartas náuticas abertas.

## Requisitos

| Ferramenta | Versão | Como fixamos |
| ---------- | ------ | ------------ |
| Node.js    | 22     | `.nvmrc` e `engines.node` em cada pacote |
| pnpm       | 9.9.0  | campo `packageManager` (via Corepack) |

`pnpm` é o único gestor de pacotes suportado. `npm install` e `yarn install` são bloqueados, e
os respetivos lockfiles não são versionados.

## Instalação

```bash
nvm use          # lê o .nvmrc -> Node 22
corepack enable  # apenas na primeira vez
pnpm install
```

Um único comando basta — não há passos manuais adicionais. Se a versão de Node não for a 22,
a instalação falha explicitamente em vez de continuar com aviso.

## Comandos

Todos são executados a partir da raiz e cobrem todos os pacotes do workspace.

| Comando | O que faz |
| ------- | --------- |
| `pnpm check` | Portão completo de pré-merge: lint, build, tipos e testes, em sequência |
| `pnpm lint` | Verifica lint e formatação sem escrever ficheiros |
| `pnpm lint:fix` | Aplica as correções automatizáveis de lint e formatação |
| `pnpm format` | Aplica apenas formatação |
| `pnpm typecheck` | Verifica os tipos de todos os pacotes |
| `pnpm test` | Corre a suíte de todos os pacotes |
| `pnpm test:watch` | Reexecuta os testes ao detetar alterações |
| `pnpm test:coverage` | Corre os testes gerando relatório de cobertura |
| `pnpm build` | Compila todos os pacotes, por ordem de dependência |

Antes de abrir uma alteração, corra `pnpm check`. Ele aborta no primeiro portão que falhar.

### Trabalhar num pacote isolado

```bash
pnpm --filter @open-nav-charts/core test
pnpm --filter @open-nav-charts/core test:watch
pnpm --filter @open-nav-charts/cli build
```

## Estrutura

```text
packages/    Bibliotecas reutilizáveis
  core/      @open-nav-charts/core — lógica partilhada
apps/        Aplicações executáveis
  cli/       @open-nav-charts/cli — interface de linha de comandos
```

A configuração é herdada de cima para baixo, nunca lateralmente entre pacotes:

| Ficheiro na raiz | Responsabilidade |
| ---------------- | ---------------- |
| `biome.json` | Lint e formatação de toda a árvore |
| `tsconfig.base.json` | Flags de TypeScript, estendidas por cada pacote |
| `vitest.shared.ts` | Configuração base de testes |

Por isso um pacote novo fica coberto pelos três portões sem alterar nada na raiz.

## Criar um pacote novo

1. Crie o diretório em `packages/<nome>` (biblioteca) ou `apps/<nome>` (aplicação).
2. Copie a estrutura do pacote de referência mais próximo — `packages/core` ou `apps/cli`.
3. Dê-lhe o nome `@open-nav-charts/<nome>`, igual ao nome do diretório.
4. Faça o `tsconfig.json` estender `../../tsconfig.base.json` e o `vitest.config.ts` reexportar
   `../../vitest.shared.js`.
5. Declare os scripts obrigatórios: `build`, `typecheck`, `test`, `test:watch`, `test:coverage`.
6. Para depender de outro pacote do workspace, use o protocolo `workspace:*`.
7. Corra `pnpm install` e depois `pnpm check`.

O checklist completo de conformidade está em
[`specs/001-monorepo-skeleton/contracts/package-structure.md`](specs/001-monorepo-skeleton/contracts/package-structure.md).

### Fronteiras entre pacotes

Importe sempre pelo nome do pacote, nunca por caminho relativo que atravesse a fronteira do
workspace:

```ts
import { formatCoordinate } from "@open-nav-charts/core"; // correto
import { formatCoordinate } from "../../packages/core/src/index.js"; // proibido
```

A superfície pública de um pacote é exatamente o que está declarado no campo `exports`.

## Convenções

- **Commits**: Conventional Commits com descrição em português — `feat(core): adiciona projeção mercator`
- **Testes**: Vitest, ficheiros `*.test.ts` ao lado do código que cobrem
- **Estilo**: aplicado por Biome; não formate à mão contra a configuração

As regras completas estão na [constituição do projeto](.specify/memory/constitution.md).
