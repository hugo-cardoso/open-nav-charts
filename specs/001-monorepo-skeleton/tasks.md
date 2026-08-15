---

description: "Task list for feature implementation"
---

# Tasks: Esqueleto do Monorepo

**Input**: Design documents from `/specs/001-monorepo-skeleton/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Tarefas de teste estão incluídas — não como TDD opcional, mas porque a spec exige a
infraestrutura de testes como parte do deliverable (FR-022 pede um teste de exemplo executável;
o Princípio IV da constituição torna Vitest não negociável).

**Organization**: Tarefas agrupadas por história de usuário, cada uma independentemente
implementável e testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode executar em paralelo (arquivos diferentes, sem dependências)
- **[Story]**: A que história pertence (US1, US2, US3, US4)
- Caminhos de arquivo exatos incluídos em cada descrição

## Path Conventions

Monorepo com duas categorias, conforme [plan.md](./plan.md):

- Configuração compartilhada e manifestos: raiz do repositório
- Bibliotecas: `packages/<nome>/src/`
- Aplicações: `apps/<nome>/src/`
- Testes colocados ao lado do código: `src/**/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fixar runtime, gerenciador de pacotes e a declaração do workspace — o mínimo para que
`pnpm install` funcione.

- [X] T001 Criar `.nvmrc` na raiz com o conteúdo `22` (FR-006, research D6)
- [X] T002 [P] Criar `.npmrc` na raiz com `engine-strict=true` (FR-006, research D6)
- [X] T003 Criar `package.json` na raiz: `private: true`, `type: "module"`, `packageManager: "pnpm@9.9.0"`, `engines.node: "22.x"`, e `scripts.preinstall: "npx only-allow pnpm"` (FR-007, research D6, data-model: Workspace)
- [X] T004 Criar `pnpm-workspace.yaml` na raiz declarando os globs `packages/*` e `apps/*` (FR-001, FR-002)
- [X] T005 Verificar que o `.gitignore` da raiz cobre a lista completa de artefatos de data-model.md (Workspace → Artefatos ignorados); ajustar apenas se faltar alguma entrada (FR-008)

**Checkpoint**: `pnpm install` roda na raiz sem erro (ainda sem pacotes).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A configuração compartilhada da raiz que todos os pacotes herdam. Sem isto, nenhum
pacote pode ser criado em conformidade com os contratos.

**⚠️ CRITICAL**: Nenhuma história pode começar antes desta fase estar completa.

- [X] T006 Adicionar as devDependencies à raiz via `pnpm add -D -w`: `typescript@^7.0.2`, `@biomejs/biome@^2.5.8`, `vitest@^4.1.10`, `@vitest/coverage-v8@^4.1.10`, `@types/node@^22` (research.md → Resumo das versões a fixar)
- [X] T007 [P] Criar `biome.json` na raiz: `linter.rules.recommended: true`, formatter ativo (indentação por espaço, largura 100), organização de imports ativa, `files.includes` a excluir `node_modules`, `dist`, `build`, `coverage` (FR-011, FR-013, research D9)
- [X] T008 [P] Criar `tsconfig.base.json` na raiz com flags estritas — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `module`/`moduleResolution` para ESM, `declaration: true` — sem `include` nem `files` (FR-014, research D2)
- [X] T009 [P] Criar `tsconfig.json` na raiz para o editor, estendendo `tsconfig.base.json` sem compilar os pacotes (research D2)
- [X] T010 [P] Criar `vitest.shared.ts` na raiz exportando a configuração base: ambiente `node`, `include: ["src/**/*.test.ts"]`, `passWithNoTests: true`, cobertura com provider `v8` (FR-021, research D4, research D5)

**Checkpoint**: Configuração compartilhada pronta — os pacotes podem agora ser criados herdando dela.

---

## Phase 3: User Story 1 - Instalar o repositório e ter tudo pronto (Priority: P1) 🎯 MVP

**Goal**: Um clone limpo instala-se com um único comando, os pacotes do workspace são
reconhecidos, e gerenciadores ou runtimes não suportados são rejeitados explicitamente.

**Independent Test**: Clonar em máquina limpa, executar `pnpm install`, confirmar sucesso e que
`pnpm ls -r --depth -1` lista os pacotes; confirmar que `npm install` é bloqueado.

### Implementation for User Story 1

- [X] T011 [P] [US1] Criar `packages/core/package.json` conforme o contrato de estrutura de pacote: nome `@open-nav-charts/core`, `private: true`, `type: "module"`, `engines.node: "22.x"`, `exports`/`main`/`types` apontando para `dist`, `files: ["dist"]` (FR-003, FR-006, contracts/package-structure.md)
- [X] T012 [P] [US1] Criar `apps/cli/package.json` conforme o contrato: nome `@open-nav-charts/cli`, `private: true`, `type: "module"`, `engines.node: "22.x"`, sem `exports`/`main`/`types`, com `dependencies: { "@open-nav-charts/core": "workspace:*" }` (FR-005, contracts/package-structure.md)
- [X] T013 [P] [US1] Criar `packages/core/src/index.ts` com uma função pura mínima e exportada, sem dependências de runtime (FR-004, research D7)
- [X] T014 [US1] Criar `apps/cli/src/index.ts` que importa a função de `@open-nav-charts/core` pelo nome do pacote e imprime o resultado (FR-005, research D7; depende de T013)
- [X] T015 [US1] Executar `pnpm install` na raiz e confirmar que os dois pacotes são reconhecidos por `pnpm ls -r --depth -1` (quickstart cenário 1)
- [X] T016 [US1] Validar o bloqueio de gerenciador não suportado: `npm install` falha com mensagem do `only-allow` e não gera `package-lock.json` na árvore (quickstart cenário 2)
- [X] T017 [US1] Validar a rejeição de runtime divergente: com Node 20 ativo, `pnpm install` falha por `engines.node` em vez de avisar (quickstart cenário 3)

**Checkpoint**: O monorepo instala-se num comando e rejeita ambientes não conformes. MVP entregue.

---

## Phase 4: User Story 2 - Verificar qualidade de código com um comando (Priority: P2)

**Goal**: Um comando único na raiz emite veredito de lint e formatação para todo o monorepo,
com variante que aplica as correções automatizáveis.

**Independent Test**: Introduzir uma violação de formatação e uma de lint, executar a verificação
na raiz e confirmar que ambas são reportadas com arquivo e linha; confirmar que o comando de
correção as resolve.

### Implementation for User Story 2

- [X] T018 [US2] Adicionar ao `package.json` da raiz os scripts `lint` (`biome ci .`), `lint:fix` (`biome check --write .`) e `format` (`biome format --write .`), conforme contracts/scripts.md (FR-009, FR-010, FR-012)
- [X] T019 [US2] Executar `pnpm lint` e resolver todas as violações no código existente até o comando sair com código `0` (SC-005, quickstart cenário 4)
- [X] T020 [US2] Validar detecção e correção: introduzir formatação divergente em `packages/core/src/index.ts`, confirmar que `pnpm lint` falha identificando arquivo e posição, que `pnpm lint:fix` corrige, e reverter a alteração (SC-006, quickstart cenário 5)

**Checkpoint**: O portão de qualidade cobre o monorepo inteiro a partir de um único `biome.json`.

---

## Phase 5: User Story 3 - Executar a suíte de testes do monorepo (Priority: P2)

**Goal**: Um comando único na raiz roda os testes de todos os pacotes com resultado agregado,
e cada pacote é executável isoladamente.

**Independent Test**: Adicionar um teste que passa e um que falha, executar a suíte na raiz e
confirmar que o resultado agregado reflete ambos; executar apenas um pacote e obter o veredito
desse escopo.

### Implementation for User Story 3

- [X] T021 [P] [US3] Criar `packages/core/tsconfig.json` estendendo `../../tsconfig.base.json`, com `rootDir: "./src"`, `outDir: "./dist"` e `include: ["src/**/*.ts"]` (FR-014, contracts/package-structure.md)
- [X] T022 [P] [US3] Criar `apps/cli/tsconfig.json` com o mesmo formato de T021 (FR-014, contracts/package-structure.md)
- [X] T023 [P] [US3] Criar `packages/core/vitest.config.ts` fazendo merge de `../../vitest.shared.js` sem duplicar opções da base (FR-021, contracts/package-structure.md)
- [X] T024 [P] [US3] Criar `apps/cli/vitest.config.ts` com o mesmo formato de T023 (FR-021, contracts/package-structure.md)
- [X] T025 [P] [US3] Criar `packages/core/src/index.test.ts` cobrindo a função exportada, sem rede, relógio não controlado ou dependência de ordem (FR-022, Princípio IV)
- [X] T026 [P] [US3] Criar `apps/cli/src/index.test.ts` cobrindo o consumo de `@open-nav-charts/core` pela CLI (FR-022)
- [X] T027 [US3] Adicionar a cada `package.json` de pacote os scripts obrigatórios `typecheck`, `test`, `test:watch`, `test:coverage`, e `build` onde há `dist` a produzir, conforme contracts/scripts.md (FR-015, FR-018, research D5)
- [X] T028 [US3] Adicionar ao `package.json` da raiz os scripts `typecheck`, `test`, `test:watch`, `test:coverage` e `build` delegando via `pnpm -r`, conforme contracts/scripts.md (FR-015, FR-017, FR-019, FR-020, research D1)
- [X] T029 [US3] Executar `pnpm typecheck` e confirmar código de saída `0` em todos os pacotes (FR-016, quickstart cenário 6)
- [X] T030 [US3] Executar `pnpm test` e confirmar resultado agregado dos dois pacotes com código de saída `0` (FR-017, quickstart cenário 7)
- [X] T031 [US3] Validar execução isolada: `pnpm --filter @open-nav-charts/core test` roda apenas os testes de `packages/core` (FR-018, quickstart cenário 8)
- [X] T032 [US3] Validar determinismo: duas execuções consecutivas de `pnpm test` produzem totais idênticos de arquivos e testes (SC-007, quickstart cenário 9)
- [X] T033 [US3] Executar `pnpm test:coverage` e confirmar que o relatório é gerado por pacote sem falha de threshold (FR-020, quickstart cenário 10)

**Checkpoint**: Os três portões — qualidade, tipos e testes — funcionam na raiz e por pacote.

---

## Phase 6: User Story 4 - Criar um novo pacote seguindo o padrão (Priority: P3)

**Goal**: Um pacote novo, criado a partir do padrão de referência, é reconhecido pelo workspace
e coberto pelos três portões sem qualquer alteração na configuração da raiz.

**Independent Test**: Criar um pacote seguindo o contrato de estrutura, executar instalação e os
três portões na raiz, e confirmar que o pacote é incluído em todos e que nenhum arquivo de
configuração da raiz foi modificado.

### Implementation for User Story 4

- [X] T034 [US4] Compilar e executar a CLI (`pnpm --filter @open-nav-charts/cli build` seguido de `node apps/cli/dist/index.js`) para provar que a dependência `workspace:*` resolve para o pacote local e não para uma versão publicada (FR-005, quickstart cenário 11)
- [X] T035 [US4] Documentar no `README.md` da raiz o procedimento de criação de pacote novo, remetendo para o checklist de conformidade de contracts/package-structure.md (FR-025)
- [X] T036 [US4] Validar SC-004 criando um pacote temporário `packages/exemplo` conforme o contrato, rodando `pnpm install` e os três portões, confirmando com `git status --porcelain` que nenhum arquivo de configuração da raiz mudou; remover o pacote temporário no fim (SC-004, quickstart cenário 12)

**Checkpoint**: O esqueleto é extensível — a topologia de herança raiz→pacote está provada.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Portão agregado, documentação e validação final ponta a ponta.

- [X] T037 Adicionar ao `package.json` da raiz o script `check` encadeando `pnpm lint && pnpm typecheck && pnpm test`, abortando na primeira falha (FR-026, FR-027, research D10)
- [X] T038 Escrever o `README.md` da raiz cobrindo instalação, verificação de qualidade, verificação de tipos, execução de testes e criação de pacote, de modo que alguém que nunca viu o repositório complete o percurso em menos de 10 minutos (FR-025, SC-001)
- [X] T039 Validar o portão agregado: `pnpm check` sai com `0` no estado inicial e, com uma violação introduzida em cada um dos três portões, aborta no primeiro que falha propagando código de saída diferente de `0` (FR-026, FR-027, quickstart cenário 13)
- [X] T040 Validar SC-008: após `pnpm install`, `pnpm build`, `pnpm test:coverage` e `pnpm lint`, o comando `git status --porcelain` não lista `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo` nem caches de ferramentas (FR-008, quickstart cenário 14)
- [X] T041 Percorrer o [quickstart.md](./quickstart.md) completo num clone limpo, confirmando os 14 cenários

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA todas as histórias
- **US1 (Phase 3)**: Depende do Foundational
- **US2 (Phase 4)**: Depende do Foundational; na prática precisa de US1 para ter código a ser verificado
- **US3 (Phase 5)**: Depende do Foundational; precisa dos pacotes de US1
- **US4 (Phase 6)**: Depende de US1 e US3 — valida a topologia que estas estabelecem
- **Polish (Phase 7)**: Depende de US2 e US3, cujos scripts o agregador `check` encadeia

### Nota sobre independência das histórias

Ao contrário de features de produto, estas histórias não são plenamente paralelizáveis: US2,
US3 e US4 verificam propriedades de artefatos que US1 cria. A independência aqui é de
**validação**, não de implementação — cada história tem um teste independente que não depende
dos testes das outras. US2 e US3 são o par genuinamente paralelizável (ver abaixo).

### Within Each User Story

- Manifestos de pacote antes do código-fonte
- Código-fonte antes dos testes que o cobrem
- Configuração antes dos scripts que a consomem
- Scripts antes das tarefas de validação que os executam

### Parallel Opportunities

- **Phase 1**: T002 em paralelo com T001
- **Phase 2**: T007, T008, T009 e T010 são arquivos distintos e independentes — todos em paralelo após T006
- **Phase 3**: T011, T012 e T013 em paralelo; T014 depende de T013
- **Phase 5**: T021–T026 são seis arquivos distintos, todos em paralelo
- **US2 × US3**: uma vez concluída a US1, as duas histórias tocam arquivos disjuntos (scripts de Biome vs. configuração de tipos e testes) e podem avançar em paralelo por pessoas diferentes

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Após T006 (instalação das devDependencies), os quatro arquivos de
# configuração compartilhada são independentes entre si:
Task: "Criar biome.json na raiz"
Task: "Criar tsconfig.base.json na raiz"
Task: "Criar tsconfig.json na raiz"
Task: "Criar vitest.shared.ts na raiz"
```

## Parallel Example: User Story 3

```bash
# Seis arquivos distintos, sem dependências entre si:
Task: "Criar packages/core/tsconfig.json"
Task: "Criar apps/cli/tsconfig.json"
Task: "Criar packages/core/vitest.config.ts"
Task: "Criar apps/cli/vitest.config.ts"
Task: "Criar packages/core/src/index.test.ts"
Task: "Criar apps/cli/src/index.test.ts"
```

---

## Desvios registrados na implementação

Duas coisas divergiram do plano durante a execução. Ambas foram resolvidas; ficam registradas
porque alteram o que os artefatos de design descrevem.

### 1. `check` inclui `build` antes de `typecheck`

O plano (research D10) definia `check` como `lint → typecheck → test`. Na prática, o
`typecheck` de `apps/cli` falha sem o `dist` de `packages/core`, porque o campo `types` do
core aponta para o compilado (research D3). O script final é
`lint → build → typecheck → test`; `pnpm -r build` respeita a ordem topológica do grafo, pelo
que o core é compilado antes da cli. A alternativa — apontar `types` para `src` — foi rejeitada
por esconder erros de build até ao deploy, exatamente o que D3 queria evitar.

### 2. Bloqueio de npm: o `preinstall` não é alcançado na raiz

FR-007 está satisfeito — `npm install` falha e nenhum `package-lock.json` é gerado — mas não
pelo mecanismo previsto. O npm rebenta ao resolver o protocolo `workspace:*` **antes** de
executar qualquer script `preinstall`, com um erro interno
(`Cannot read properties of null (reading 'edgesOut')`) em vez da mensagem do `only-allow`.
Verificado isoladamente, o `only-allow` funciona e emite a mensagem correta; num subdiretório o
npm dá `EUNSUPPORTEDPROTOCOL`, também claro. O hook foi mantido (e `only-allow` passou a
devDependency, removendo a dependência de rede do `npx`) porque cobre os casos em que é
alcançado. O cenário de aceitação 3 da História 1 pede uma mensagem a indicar o gerenciador correto:
a rejeição acontece, a mensagem específica não. Melhorá-la exigiria mecanismo externo ao npm
(por exemplo um git hook), fora do âmbito desta feature.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational (CRÍTICO — bloqueia tudo)
3. Phase 3: User Story 1
4. **PARAR e VALIDAR**: quickstart cenários 1–3
5. Neste ponto existe um monorepo instalável com dois pacotes que se consomem

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → monorepo instalável (MVP)
3. US2 → portão de qualidade ativo
4. US3 → portões de tipos e testes ativos
5. US4 → extensibilidade provada
6. Polish → agregador `check`, README e validação ponta a ponta

### Parallel Team Strategy

1. Setup + Foundational em conjunto
2. US1 por uma pessoa (é o pré-requisito prático das restantes)
3. Concluída a US1: pessoa A na US2 (Biome), pessoa B na US3 (tipos e testes) — arquivos disjuntos
4. US4 e Polish depois de ambas

---

## Notes

- Tarefas `[P]` = arquivos diferentes, sem dependências
- Cada tarefa de validação remete para o cenário correspondente do [quickstart.md](./quickstart.md)
- Commits em Conventional Commits com descrição em pt-BR, escopo a identificar o pacote afetado (constituição → Fluxo de Desenvolvimento)
- O `.gitignore` da raiz já existe e cobre a lista de FR-008; T005 é verificação, não reescrita
- Vite não é instalado nesta feature — decisão registrada em research.md (D7); entra com a feature de frontend
