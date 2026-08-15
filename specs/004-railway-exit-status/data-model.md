# Data Model: Sinalização de desfecho de rotina para agendador externo

A feature não introduz dados persistidos. O "modelo" aqui é o mapeamento entre três conceitos: o **desfecho interno** de uma execução, o **código de saída** do processo e o **sinal binário** que o agendador observa.

## Entidades

### Desfecho de execução (outcome)

O resultado interno de uma execução, determinado por `exitCodeForReport` (caminho de conclusão) ou `exitCodeForError` (caminho de exceção).

| Desfecho | Origem | Rodou? | Persistiu dado? |
|----------|--------|--------|-----------------|
| Concluída sem falhas | relatório sem falhas, não interrompido | sim | sim |
| Concluída com falhas de itens | relatório com ≥1 falha, não interrompido | sim | sim (parcial) |
| Erro inesperado | exceção não classificada | não completou | indefinido |
| Configuração inválida / rotina inexistente | `InvalidConfigurationError` / `UnknownJobError` | não | não |
| Dependência indisponível | credencial rejeitada, banco/bucket fora | não | não |
| Interrompida | sinal do operador (`AbortError` / flag `interrupted`) | parcial | parcial |

### Código de saída (exit code)

Projeção do desfecho num inteiro. Contrato completo em [`contracts/exit-codes.md`](./contracts/exit-codes.md).

| Constante | Valor | Desfecho que o produz |
|-----------|-------|-----------------------|
| `Success` | `0` | Concluída sem falhas **e** Concluída com falhas de itens |
| `UnexpectedError` | `1` | Erro inesperado (renomeada de `CompletedWithFailures`) |
| `InvalidConfiguration` | `2` | Configuração inválida / rotina inexistente |
| `DependencyUnavailable` | `3` | Dependência indisponível |
| `Interrupted` | `130` | Interrompida |

### Sinal binário (o que o agendador vê)

| Código de saída | Sinal binário |
|-----------------|---------------|
| `0` | sucesso |
| `1`, `2`, `3`, `130` | falha |

## Regra de mapeamento (a mudança)

```text
exitCodeForReport(report, interrupted):
    interrupted            → Interrupted (130)
    caso contrário         → Success (0)          ← ANTES: hasFailures ? 1 : 0

exitCodeForError(error):
    InvalidConfiguration
      | UnknownJob         → InvalidConfiguration (2)
    Aborted                → Interrupted (130)
    AuthSource
      | UnavailableDep     → DependencyUnavailable (3)
    caso contrário         → UnexpectedError (1)   ← mesmo valor, nome novo
```

**Invariante preservada**: `Success` só é emitido quando a execução de fato rodou (caminho de relatório, não de exceção). Nenhum caminho de exceção retorna `0`. A distinção entre `1`, `2` e `3` permanece no código de saída para consumidores que a leiam.

## Estado / transições

Não há máquina de estados nem transições persistidas. Cada execução produz exatamente um desfecho, projetado em exatamente um código de saída, no encerramento do processo.
