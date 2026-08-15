---
description: "Task list for feature implementation: sinalização de desfecho de rotina"
---

# Tasks: Sinalização de desfecho de rotina para agendador externo

**Input**: Design documents from `/specs/004-railway-exit-status/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/exit-codes.md, quickstart.md

**Tests**: Obrigatórios. Esta é uma mudança de comportamento; o Princípio IV da constituição exige um teste que **falha antes** da correção. As tarefas de teste abaixo não são opcionais.

**Organization**: Tarefas agrupadas por história de usuário. Observação de escopo: as três histórias editam os mesmos dois arquivos (`apps/jobs/src/runtime/exit-code.ts` e `exit-code.test.ts`), então há contenção de arquivo — as tarefas de implementação são majoritariamente **sequenciais**, não paralelas entre histórias.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivo distinto, sem dependência pendente)
- **[Story]**: A qual história a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo são relativos à raiz do repositório

## Path Conventions

Projeto único dentro do monorepo pnpm. A feature vive em `apps/jobs/`:

- Lógica: `apps/jobs/src/runtime/exit-code.ts`
- Teste: `apps/jobs/src/runtime/exit-code.test.ts`
- Documentação: `apps/jobs/README.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar linha de base verde antes de mudar comportamento

- [X] T001 Confirmar que a suíte atual de `apps/jobs` passa antes de qualquer alteração: `pnpm --filter @open-nav-charts/jobs test` (baseline verde, para que a próxima falha de teste seja causada pela mudança e não por ruído pré-existente)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: N/A — não há infraestrutura bloqueante. A lógica de mapeamento já existe em `runtime/exit-code.ts`; nenhuma entidade, migração ou serviço novo é necessário.

*(Nenhuma tarefa. Prosseguir direto para as histórias.)*

**Checkpoint**: Base pronta — implementação das histórias pode começar.

---

## Phase 3: User Story 1 - Execução saudável com falhas isoladas não polui o painel (Priority: P1) 🎯 MVP

**Goal**: Uma execução que rodou e persistiu dado encerra com código `0` (sucesso para o agendador), mesmo com falhas de itens individuais.

**Independent Test**: `exitCodeForReport(report, false)` com um relatório que contém ≥1 falha devolve `ExitCode.Success` (0). Verificável por unidade, sem rede nem Docker.

### Tests for User Story 1 ⚠️

> Escrever/ajustar o teste PRIMEIRO e confirmar que ele FALHA contra o código atual.

- [X] T002 [US1] Em `apps/jobs/src/runtime/exit-code.test.ts`, alterar o caso "devolve 1 quando houve ao menos uma falha definitiva" para esperar `ExitCode.Success` e renomeá-lo para refletir a nova regra (ex.: "devolve 0 mesmo com falhas de itens: a execução rodou"). Rodar `pnpm --filter @open-nav-charts/jobs test` e confirmar que ESTE teste falha contra o código atual.

### Implementation for User Story 1

- [X] T003 [US1] Em `apps/jobs/src/runtime/exit-code.ts`, alterar `exitCodeForReport` para devolver `ExitCode.Success` sempre que `interrupted === false`, removendo o ramo `report.hasFailures ? CompletedWithFailures : Success`. Manter a prioridade da interrupção (`interrupted → Interrupted`). Atualizar o comentário/JSDoc da função para descrever a nova regra.
- [X] T004 [US1] Rodar `pnpm --filter @open-nav-charts/jobs test` e confirmar que os casos de `exitCodeForReport` passam: relatório sem falhas → 0, relatório com falhas → 0, interrompido → 130, interrompido com falhas → 130.

**Checkpoint**: US1 funcional — o desfecho central (rodou com falhas de itens) agora sinaliza sucesso.

---

## Phase 4: User Story 2 - Execução que não arrancou continua sinalizada como falha (Priority: P1)

**Goal**: Configuração inválida, dependência indisponível, rotina inexistente e erro inesperado permanecem código ≠ 0 (falha para o agendador).

**Independent Test**: `exitCodeForError` devolve 2 para config/rotina inexistente, 3 para credencial/dependência, 1 para erro não classificado, 130 para abort — nenhum deles devolve 0.

### Tests for User Story 2 ⚠️

- [X] T005 [US2] Em `apps/jobs/src/runtime/exit-code.test.ts`, confirmar que os casos existentes de `exitCodeForError` (2 para `InvalidConfigurationError` e `UnknownJobError`; 3 para `AuthenticationSourceError` e `ECONNREFUSED`; 130 para `AbortError`) continuam válidos, e ajustar o caso "devolve 1 para erro não classificado" para referenciar a nova constante `ExitCode.UnexpectedError` (mesmo valor 1). Este ajuste depende do rename em T007 — deixar a asserção pelo valor `1` até o rename e trocar para a constante junto de T007.

### Implementation for User Story 2

- [X] T006 [US2] Nenhuma mudança de comportamento em `exitCodeForError` é necessária (os desfechos de ambiente já retornam 2/3 e o abort 130). Verificar por leitura que a alteração de US1 não afetou esse caminho e que nenhum caminho de exceção retorna `Success` (invariante INV-1/INV-2 de `contracts/exit-codes.md`).

**Checkpoint**: US1 + US2 — sucesso só quando rodou; toda falta de trabalho continua falha e distinta.

---

## Phase 5: User Story 3 - Desfechos de ambiente distinguíveis e saúde item-a-item no resumo (Priority: P2)

**Goal**: (a) `2` e `3` seguem distintos no código de saída; (b) a constante `1` deixa de mentir ("concluída com falhas") e passa a se chamar `UnexpectedError`; (c) o resumo continua listando os itens falhos mesmo quando o processo sai `0`.

**Independent Test**: `ExitCode.UnexpectedError === 1` e distinto de `InvalidConfiguration`/`DependencyUnavailable`; `RunReport.format` inclui a seção "Falhas" quando há falhas registradas, independentemente do código de saída.

### Tests for User Story 3 ⚠️

- [X] T007 [US3] Em `apps/jobs/src/runtime/exit-code.test.ts`, atualizar todas as referências de `ExitCode.CompletedWithFailures` para `ExitCode.UnexpectedError` (o caso de erro não classificado de T005 incluído). Confirmar que a suíte reflete a tabela de `contracts/exit-codes.md`.
- [X] T008 [P] [US3] Em `apps/jobs/src/runtime/run-report.test.ts`, garantir que existe (ou adicionar) uma asserção de que `RunReport.format` lista os itens falhos na seção "Falhas" quando há falhas registradas — a prova de que a informação sobrevive ao colapso de `1` em `0` (US3 AS2, FR-005). Arquivo distinto de `exit-code.test.ts`, logo paralelizável.

### Implementation for User Story 3

- [X] T009 [US3] Em `apps/jobs/src/runtime/exit-code.ts`, renomear a constante `ExitCode.CompletedWithFailures` para `ExitCode.UnexpectedError` (manter valor `1`), atualizar o `exitCodeForError` para retornar `ExitCode.UnexpectedError` no fallback, e ajustar o comentário do bloco `ExitCode` para descrever `1` como "erro inesperado não tratado". Confirmar via `pnpm --filter @open-nav-charts/jobs typecheck` que não há referências órfãs à constante antiga em nenhum pacote.

**Checkpoint**: Todas as histórias funcionais; contrato de código de saída honesto e coberto por teste.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação e portões de qualidade

- [X] T010 [P] Atualizar `apps/jobs/README.md`: substituir a tabela "Códigos de saída" pela nova (de `contracts/exit-codes.md`) — `0` passa a cobrir "concluída com ou sem falhas de itens", `1` vira "erro inesperado" — e acrescentar uma nota curta de **mudança de contrato** avisando que "concluída com falhas" deixou de ser `1` (FR-004a, FR-008). Ajustar também a menção a `Ctrl+C`/`130` se necessário.
- [X] T011 Rodar o portão completo do pacote: `pnpm --filter @open-nav-charts/jobs test`, depois `pnpm lint` e `pnpm typecheck` a partir da raiz. Todos MUST passar.
- [X] T012 Executar a validação manual de `quickstart.md` (verificação de `$?`) se houver ambiente com Docker + `.env` disponível; caso contrário, registrar que a cobertura ficou na camada unitária determinística.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa imediatamente.
- **Foundational (Phase 2)**: vazia.
- **User Stories (Phase 3–5)**: dependem do baseline verde (T001). US1 → US2 → US3 são majoritariamente **sequenciais** por contenção dos mesmos arquivos (`exit-code.ts`, `exit-code.test.ts`).
- **Polish (Phase 6)**: depende de US1–US3 completas.

### User Story Dependencies

- **US1 (P1)**: núcleo da mudança; base para as demais.
- **US2 (P1)**: verificação; depende de US1 estar aplicada para confirmar que o caminho de exceção não regrediu.
- **US3 (P2)**: rename da constante e prova do resumo; T007 (teste) depende do rename T009; T005 (US2) deixa a asserção pelo valor `1` até T007/T009 trocarem para a constante.

### Within Each User Story

- Teste que falha primeiro → implementação → confirmação verde.

### Parallel Opportunities

- Paralelismo é limitado: US1–US3 e seus testes tocam `exit-code.ts` / `exit-code.test.ts`.
- Tarefas realmente paralelas ([P]): **T008** (arquivo `run-report.test.ts`, distinto) e **T010** (`README.md`, distinto). Ambas independem da edição de `exit-code.ts` e podem correr enquanto essa parte é feita.

---

## Parallel Example

```bash
# Enquanto a edição de exit-code.ts (US1–US3) é feita, estas correm em paralelo:
Task: "T008 — asserção de 'Falhas' em run-report.test.ts"
Task: "T010 — nova tabela de códigos em apps/jobs/README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 (baseline verde).
2. T002 (teste falha) → T003 (mudança) → T004 (verde).
3. **PARAR e VALIDAR**: o desfecho "rodou com falhas de itens" agora sai `0`. Já resolve o problema central do painel.

### Incremental Delivery

1. US1 → o painel para de marcar execuções saudáveis como falha (MVP entregável).
2. US2 → confirma que faltas de ambiente seguem vermelhas.
3. US3 → limpa o nome da constante e prova que o resumo preserva as falhas.
4. Polish → documentação e portões.

Tudo é uma edição coesa e pequena; a divisão por história serve à rastreabilidade e à ordem teste-antes-de-código, não a paralelismo de time.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente (aqui: T008 e T010).
- Verificar que cada teste falha antes de implementar (Princípio IV).
- Commits em Conventional Commits pt-BR, escopo `jobs`; commitar após cada grupo lógico.
- Nenhuma dependência nova, nenhuma mudança em banco/bucket, nenhuma alteração em `main.ts` ou na lógica de coleta.
