# Contract: Códigos de saída do host de rotinas

A superfície externa da CLI `open-nav-charts-jobs` relevante para esta feature é o **código de saída** do processo — o único canal que um agendador automatizado consome sem ler texto. Este contrato define o mapeamento após a mudança (Opção B).

## Tabela de códigos (novo contrato)

| Código | Significado | O agendador vê | Ação típica do operador |
|--------|-------------|----------------|-------------------------|
| `0` | Concluída — a rotina rodou e persistiu dado, **com ou sem** falhas de itens individuais | sucesso | Nada. Conferir a seção "Falhas" do resumo se quiser inspecionar itens problemáticos |
| `1` | Erro inesperado não tratado | falha | Investigar o log; é um caminho não previsto (bug) |
| `2` | Não arrancou: configuração ausente/inválida, ou rotina inexistente | falha | Corrigir o `.env`; conferir o nome no `--help` |
| `3` | Não arrancou: credencial da fonte rejeitada (401/403) ou dependência (banco/bucket) indisponível | falha | Validar credenciais, banco e bucket |
| `130` | Interrompida pelo operador (`Ctrl+C` / `SIGTERM`) | falha | Reexecutar; as gravações são idempotentes |

## Mudança em relação ao contrato anterior

- **Antes**: `1` significava "concluída, mas com pelo menos uma falha definitiva" (execução **com** dado coletado). Uma varredura com qualquer item falho encerrava com `1`.
- **Agora**: esse desfecho encerra com `0`. O valor `1` passa a significar exclusivamente **erro inesperado não tratado**.
- **Motivo**: um agendador binário lê `1` como falha, e ter alguns itens falhos é o resultado normal de uma varredura de milhares de itens — o que fazia quase toda execução saudável ser marcada como falha. Ver `spec.md` (FR-004a) e `research.md` (Decisão 2).

## Invariantes garantidas

- **INV-1**: `0` é retornado somente quando a execução rodou até produzir um relatório (nunca a partir de uma exceção).
- **INV-2**: Todo desfecho que representa "não fez o trabalho" (config, dependência, erro inesperado, interrupção) retorna código ≠ `0`.
- **INV-3**: `2`, `3` e `130` permanecem distintos entre si no código de saída — a projeção binária os iguala em "falha", mas o valor detalhado continua distinguível para quem o lê.
- **INV-4**: A seção "Falhas" do resumo é emitida em qualquer desfecho, inclusive em `0`, preservando a lista de itens falhos.

## Verificação

O contrato é verificável sem rede e sem Docker por testes unitários sobre `exitCodeForReport` / `exitCodeForError` (ver `quickstart.md`). Cada linha da tabela corresponde a pelo menos um caso de teste.
