# Research: Sinalização de desfecho de rotina para agendador externo

Não havia `NEEDS CLARIFICATION` remanescente na spec (a Questão 1 foi resolvida na Opção B). Este documento registra as decisões de design que orientam a implementação.

## Decisão 1 — Onde interceptar o mapeamento

- **Decisão**: alterar apenas `apps/jobs/src/runtime/exit-code.ts`. O código de saída já é derivado ali por duas funções puras (`exitCodeForReport`, `exitCodeForError`), consumidas por `main.ts`. Não introduzir flag, wrapper de shell, nem variável de ambiente.
- **Rationale**: o mapeamento desfecho→código já é um ponto único e testável. A Opção B tornou o comportamento padrão, então uma flag seria complexidade sem uso (viola a preferência da constituição pela alternativa mais simples). Um wrapper de shell no start command do Railway resolveria o sintoma fora do código, escondendo a regra e deixando-a sem teste — rejeitado.
- **Alternativas consideradas**:
  - *Flag/env opt-in* (`--soft-fail`): descartada com a Opção B; adicionaria ramo condicional e um caminho de configuração a documentar e testar.
  - *Adapter no start command* (`... || [ $? -le 1 ]`): resolve só no deploy, não é testável por Vitest, e diverge o comportamento entre ambientes — contra FR-003/FR-006.

## Decisão 2 — O código `1` é sobrecarregado e precisa ser desmembrado

- **Decisão**: `exitCodeForReport` deixa de retornar `CompletedWithFailures`; passa a retornar `Success` (0) sempre que `interrupted === false`, independentemente de `report.hasFailures`. O valor `1` permanece apenas em `exitCodeForError` como fallback de **erro inesperado não tratado**, e a constante é renomeada de `CompletedWithFailures` para `UnexpectedError` para não mentir sobre o que sinaliza.
- **Rationale**: hoje `1` significa duas coisas — "rodou com falhas de itens" (relatório) e "erro não classificado" (fallback de `exitCodeForError`, ex.: um `throw` inesperado). A Opção B só quer colapsar o **primeiro** em sucesso; um erro inesperado é "não completou" e MUST continuar falha para o agendador (não-zero). Separar os dois preserva o sinal verdadeiro (Decisão da spec: sucesso = "rodou e persistiu"; falha = "não fez o trabalho").
- **Consequência**: a tabela de códigos passa a ser `0` rodou (com ou sem falhas de itens) · `1` erro inesperado · `2` config/rotina inexistente · `3` dependência · `130` interrompida. Cinco valores distintos continuam possíveis; o que mudou foi o significado de `0` e de `1`.
- **Alternativas consideradas**:
  - *Mapear cegamente `1 → 0`*: erraria ao transformar um crash inesperado em "sucesso", escondendo falhas reais. Rejeitado.
  - *Manter o nome `CompletedWithFailures` para o valor `1`*: deixaria uma constante com nome enganoso (nenhum "completed with failures" retorna mais esse código). Contra o valor de clareza da constituição.

## Decisão 3 — Interrupção continua falha

- **Decisão**: manter `Interrupted = 130` e o desfecho de interrupção como não-zero (falha para o agendador). Sem mudança na priorização de interrupção sobre falhas em `exitCodeForReport`.
- **Rationale**: uma execução interrompida por sinal não concluiu a varredura; para o agendador, "cortada no meio" não é sucesso. As gravações são idempotentes, então a reexecução refaz o pendente — o `130` sinaliza corretamente que aquele disparo não terminou. Registrado na spec como assunção (FR-007) sujeita a revisão futura, mas fixado assim nesta entrega.
- **Alternativas consideradas**: tratar interrupção como sucesso — rejeitado por mascarar disparos incompletos; um redeploy do agendador que mate a rotina apareceria como run bem-sucedido, escondendo que nada terminou.

## Decisão 4 — A informação de falhas de itens vive no resumo, não no código

- **Decisão**: não alterar `run-report.ts`. A seção "Falhas" de `RunReport.format` já lista os itens falhos e já é emitida em todos os desfechos (inclusive sucesso). É essa a fonte que preserva a saúde item-a-item após o colapso de `1` em `0` (FR-004, FR-005, US3 AS2).
- **Rationale**: separar "o processo rodou" (código de saída) de "quais itens tiveram problema" (resumo) é exatamente a distinção de granularidade que a feature quer. O resumo é o canal de granularidade fina; o código de saída é o canal binário do agendador.

## Contexto externo — comportamento do agendador

- Um agendador baseado em código de saída de processo (o modelo do cron do Railway e de agendadores equivalentes) interpreta o término do processo de forma binária: código `0` = execução bem-sucedida; qualquer código ≠ `0` = execução falha/crashed. Não há nível intermediário. É essa premissa que a spec assume e que a Decisão 2 atende: o único desfecho "saudável frequente" da coleta (rodou com algumas falhas de itens) deixa de cair no balde de falha.
