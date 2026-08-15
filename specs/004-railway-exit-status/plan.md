# Implementation Plan: Sinalização de desfecho de rotina para agendador externo

**Branch**: `feature/004-railway-exit-status` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-railway-exit-status/spec.md`

## Summary

Tornar o **código de saída** do host de rotinas (`apps/jobs`) legível por um agendador externo binário (sucesso/falha), de modo que uma execução que rodou e persistiu dado — mesmo com falhas de itens individuais — encerre com sucesso, enquanto execuções que não arrancaram por ambiente permaneçam falha.

Abordagem técnica: a lógica de mapeamento já está isolada em `runtime/exit-code.ts` (funções puras `exitCodeForReport` e `exitCodeForError`). A mudança é cirúrgica ali:

1. `exitCodeForReport` deixa de derivar o código de `report.hasFailures` — passa a devolver `Success` sempre que a execução não foi interrompida. "Concluída com falhas" colapsa em `0` (Opção B da spec, FR-004).
2. O código `1`, hoje sobrecarregado (relatório-com-falhas **e** erro não classificado em `exitCodeForError`), deixa de significar "concluída com falhas" e passa a significar exclusivamente **erro inesperado não tratado** — continua não-zero, logo continua falha para o agendador, mas com nome honesto.
3. Documentar a nova tabela de códigos no README do `jobs` como comportamento padrão (FR-008, FR-004a), sinalizando a mudança de contrato.

A informação de "quais itens falharam" **não se perde**: já vive no resumo (`RunReport.format`, seção "Falhas"), que continua sendo emitido em todos os desfechos (FR-005). Nenhuma mudança em `run-report.ts`, `main.ts` ou na lógica de coleta.

## Technical Context

**Language/Version**: TypeScript (modo `strict`), Node.js 22

**Primary Dependencies**: Nenhuma nova. Área afetada é `apps/jobs/src/runtime/` (funções puras) e a doc do pacote.

**Storage**: N/A — a mudança não toca banco nem bucket.

**Testing**: Vitest (unitário). O caso central é `apps/jobs/src/runtime/exit-code.test.ts`, sem rede nem Docker.

**Target Platform**: Processo CLI efêmero, disparado por agendador externo (ex.: cron do Railway) que interpreta o término do processo como sucesso (código `0`) ou falha (código ≠ `0`).

**Project Type**: CLI dentro de monorepo pnpm (`apps/jobs`).

**Performance Goals**: N/A — desfecho de processo, sem impacto de desempenho.

**Constraints**: A distinção entre desfechos de ambiente (`2` config, `3` dependência) e interrupção (`130`) MUST sobreviver no código de saída; só o par sucesso/concluída-com-falhas colapsa.

**Scale/Scope**: ~1 arquivo de lógica, 1 arquivo de teste, 1 arquivo de documentação. Sem migração de dados.

## Constitution Check

*GATE: revisto antes da Fase 0 e após a Fase 1.*

| Princípio | Situação | Observação |
|-----------|----------|------------|
| I. Monorepo pnpm / Node 22 | ✅ | Mudança interna a `apps/jobs`; sem novo pacote, sem alteração de workspace ou de runtime. |
| II. TypeScript strict | ✅ | Edição em TS strict; sem `any`; sem afrouxar flags. |
| III. OO no backend / DI | ✅ | `exit-code.ts` são funções puras já existentes; nenhum estado global novo, nenhuma dependência por caminho relativo cruzando workspace. O padrão vigente é preservado. |
| IV. Vitest (não negociável) | ✅ | Correção de comportamento acompanhada de teste que falha antes: `exit-code.test.ts` passa a esperar `0` para relatório-com-falhas, mais um teste para o erro inesperado (`1`). Determinístico, sem I/O. |
| V. Biome | ✅ | `pnpm lint` no portão de pré-merge. |
| Fluxo/GitFlow | ✅ | Branch `feature/004-railway-exit-status` originada de `develop`, com destino `develop`. Commits em Conventional Commits pt-BR. |

**Resultado**: sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/004-railway-exit-status/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões de design
├── data-model.md        # Fase 1 — a tabela de mapeamento desfecho → código → sinal binário
├── quickstart.md        # Fase 1 — como validar (unitário + verificação manual de $?)
├── contracts/
│   └── exit-codes.md    # Fase 1 — o contrato de códigos de saída (superfície externa da CLI)
└── checklists/
    └── requirements.md  # Já existente (da fase de spec)
```

### Source Code (repository root)

```text
apps/jobs/
├── src/
│   └── runtime/
│       ├── exit-code.ts        # ALTERADO: exitCodeForReport deixa de olhar hasFailures;
│       │                       #           renomeia CompletedWithFailures → UnexpectedError
│       └── exit-code.test.ts   # ALTERADO: expectativas do novo mapeamento
└── README.md                   # ALTERADO: tabela de códigos + nota de mudança de contrato
```

**Structure Decision**: A feature vive inteiramente em `apps/jobs`, no módulo `runtime/` onde o mapeamento desfecho→código já está isolado. Nenhum outro pacote do workspace é tocado. Não há frontend nem serviço envolvido, então a estrutura de projeto único (a CLI existente) basta; nenhuma opção de web/mobile se aplica.

## Complexity Tracking

> Sem violações de constituição. Nada a justificar.
