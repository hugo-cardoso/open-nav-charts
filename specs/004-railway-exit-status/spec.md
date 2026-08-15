# Feature Specification: Sinalização de desfecho de rotina para agendador externo

**Feature Branch**: `feature/004-railway-exit-status`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "vamos especificar essa mudança" — tornar o desfecho de uma rotina legível por um agendador externo que interpreta o resultado de forma binária (sucesso/falha), de modo que uma execução que *rodou e coletou dado* não seja reportada como falha só por conter falhas de itens individuais, enquanto execuções que *não arrancaram* por causa de ambiente continuem sinalizadas como falha.

## Contexto e Problema

O host de rotinas (`apps/jobs`) comunica o desfecho de cada execução por meio do código de saída do processo, com cinco significados distintos:

| Desfecho | Rodou? | Coletou dado? | Significado |
| --- | --- | --- | --- |
| Concluída sem falhas | sim | sim | Execução limpa |
| Concluída com falhas | sim | sim (parcial) | Rodou e persistiu dado, mas alguns itens falharam definitivamente |
| Configuração inválida | não | não | Não arrancou: variável de ambiente ausente/inválida |
| Dependência indisponível | não | não | Não arrancou: credencial rejeitada ou banco/bucket fora do ar |
| Interrompida | parcial | parcial | Encerrada por sinal do operador |

Um agendador externo que dispara a rotina periodicamente interpreta o desfecho de forma **binária**: ou a execução foi um sucesso, ou foi uma falha. Ele não distingue os cinco significados acima — enxerga apenas "terminou bem" contra "terminou mal".

O problema observado: a rotina de coleta varre milhares de itens de uma fonte externa, e ter *alguns* itens que falham definitivamente é o resultado **normal e saudável** de uma execução (a própria documentação exemplifica uma varredura com falhas isoladas entre milhares de sucessos). Nesse desfecho a rotina rodou e persistiu dado — mas o agendador, ao ver o sinal de "concluída com falhas", reporta a execução inteira como falha. Na prática, **quase toda execução é marcada como falha** pelo agendador, poluindo o painel operacional e escondendo as falhas que de fato importam (as execuções que não arrancaram).

A causa é uma colisão de granularidade: a rotina tem cinco desfechos, o agendador entende dois. A correção é decidir, de forma explícita e testável, **qual desfecho da rotina o agendador deve enxergar como falha** — reservando esse sinal para os casos em que nada foi feito e a causa é de ambiente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execução saudável com falhas isoladas não polui o painel (Priority: P1)

Como operador que acompanha a rotina por um painel de agendamento, quando a varredura roda e persiste dado — ainda que alguns itens individuais falhem definitivamente, como é o normal de uma coleta de milhares de itens — quero que o painel a apresente como execução bem-sucedida, para que eu só veja "vermelho" quando algo de fato exigir a minha atenção.

**Why this priority**: É o motivo da mudança. Sem isto, o sinal de falha perde valor por excesso de falsos positivos, e o operador para de confiar no painel. Entregar só esta história já resolve o problema central.

**Independent Test**: Dispara-se a rotina num cenário em que ela conclui a varredura com pelo menos uma falha de item mas com dado persistido, e verifica-se que o desfecho comunicado ao agendador é "sucesso".

**Acceptance Scenarios**:

1. **Given** uma execução que percorre todos os itens e persiste dado, **When** um ou mais itens falham definitivamente mas a varredura chega ao fim, **Then** o desfecho comunicado ao agendador externo é "sucesso".
2. **Given** uma execução que percorre todos os itens sem nenhuma falha, **When** a varredura chega ao fim, **Then** o desfecho comunicado ao agendador externo é "sucesso".
3. **Given** qualquer execução considerada "sucesso" pelo agendador, **When** ela termina, **Then** o resumo detalhado — incluindo a lista de itens que falharam — continua disponível na saída para inspeção manual.

---

### User Story 2 - Execução que não arrancou continua sinalizada como falha (Priority: P1)

Como operador, quando a rotina não chega a coletar nada porque o ambiente está quebrado — configuração ausente/inválida, credencial da fonte rejeitada, ou banco/bucket inacessível — quero que o painel a apresente como falha, para que eu seja alertado exatamente nos casos em que preciso corrigir o ambiente.

**Why this priority**: É a contraparte inseparável da História 1. Suprimir o falso positivo não pode apagar o sinal verdadeiro; sem esta garantia, a mudança trocaria ruído por cegueira. As duas juntas formam o comportamento correto.

**Independent Test**: Dispara-se a rotina com uma variável de ambiente obrigatória ausente (e, separadamente, com uma dependência indisponível) e verifica-se que o desfecho comunicado ao agendador é "falha" em cada caso.

**Acceptance Scenarios**:

1. **Given** uma variável de ambiente obrigatória ausente ou inválida, **When** a rotina é disparada, **Then** ela encerra sem coletar nada e o desfecho comunicado ao agendador é "falha".
2. **Given** a credencial da fonte externa rejeitada, ou o banco/bucket inacessível, **When** a rotina é disparada, **Then** ela encerra sem coletar nada e o desfecho comunicado ao agendador é "falha".
3. **Given** um nome de rotina inexistente, **When** a rotina é disparada, **Then** o desfecho comunicado ao agendador é "falha".

---

### User Story 3 - Desfechos de ambiente continuam distinguíveis, e a saúde item-a-item sobrevive no resumo (Priority: P2)

Como mantenedor que automatiza a rotina, quando o novo comportamento padrão passa a tratar "concluída com falhas" como sucesso, quero que (a) os desfechos de ambiente — "configuração inválida" e "dependência indisponível" — continuem distinguíveis entre si por um sinal detalhado, e (b) a informação de quais itens falharam permaneça recuperável na saída de resumo, para que a fusão de "sucesso" com "concluída com falhas" no sinal binário não apague dado operacional relevante.

**Why this priority**: A decisão adotada (novo padrão) colapsa deliberadamente "concluída sem falhas" e "concluída com falhas" no mesmo sinal de sucesso — inclusive no código de saída. Isso é intencional, mas não pode arrastar consigo as distinções que ainda importam: os dois desfechos de ambiente, que exigem correções diferentes, e a lista de itens falhos, que orienta a investigação. Secundária porque o problema imediato é o painel binário; esta história garante que a solução não crie um novo ponto cego.

**Independent Test**: Verifica-se que "configuração inválida" e "dependência indisponível" produzem sinais detalhados distintos entre si, e que uma execução "concluída com falhas" — agora sucesso no binário — ainda lista no resumo os itens que falharam.

**Acceptance Scenarios**:

1. **Given** os desfechos "configuração inválida" e "dependência indisponível", **When** cada um ocorre, **Then** ambos são falha no sinal binário mas permanecem distinguíveis um do outro por um sinal detalhado exposto pela rotina.
2. **Given** uma execução "concluída com falhas", agora sucesso no sinal binário, **When** ela termina, **Then** o resumo ainda identifica quais itens falharam, preservando a informação que o código de saída deixou de carregar.
3. **Given** o novo comportamento padrão, **When** a rotina é executada em qualquer ambiente, **Then** o mapeamento é idêntico em todos — não há ambiente em que "concluída com falhas" volte a ser falha, por ser padrão e não configurável.

---

### Edge Cases

- **Execução interrompida pelo operador (sinal de encerramento)**: a rotina encerra de forma limpa após um sinal de parada, sem completar a varredura. Assumção adotada (ver Assumptions): o desfecho de interrupção é comunicado ao agendador como **falha**, por não representar uma varredura concluída; permanece distinguível dos demais desfechos pelo sinal detalhado.
- **Todos os itens falham, mas a varredura chegou ao fim**: continua sendo "rodou e tentou persistir", logo é comunicado como **sucesso** ao agendador — o resumo evidencia a totalidade de falhas para inspeção. O objetivo é não reportar falha *de execução* quando a execução ocorreu; a saúde item-a-item é responsabilidade do resumo e de futuros alertas, não do sinal binário.
- **Agendador dispara a rotina como serviço permanente (sempre de pé) em vez de tarefa agendada**: fora do escopo desta mudança. O sinal de desfecho pressupõe um processo que executa e termina; um agendador que trate o término do processo como falha (independente do código) é um erro de configuração do ambiente, não algo que esta feature corrige.
- **Nova execução dispara enquanto a anterior ainda roda**: fora do escopo; a sobreposição é responsabilidade do agendador. As gravações são idempotentes, então uma reexecução refaz o pendente com segurança.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O host de rotinas MUST comunicar, ao encerrar, um desfecho que um agendador externo binário interprete como **sucesso** sempre que a rotina tiver executado a varredura e persistido dado, independentemente de haver falhas de itens individuais.
- **FR-002**: O host de rotinas MUST comunicar, ao encerrar, um desfecho que um agendador externo binário interprete como **falha** sempre que a rotina não tiver arrancado por causa de ambiente — configuração ausente/inválida, credencial da fonte rejeitada, dependência (banco/bucket) indisponível, ou nome de rotina inexistente.
- **FR-003**: A regra de mapeamento entre o desfecho interno da rotina e o sinal binário sucesso/falha MUST ser genérica ao host, aplicando-se a qualquer rotina registrada sem exigir tratamento específico por rotina.
- **FR-004**: Com o novo comportamento padrão, "concluída sem falhas" e "concluída com falhas" MUST produzir o **mesmo** sinal de sucesso, inclusive no código de saída — a distinção entre ambos MUST passar a viver no resumo (a lista de itens falhos), não mais no código de saída. Em contrapartida, o host MUST preservar no código de saída detalhado a distinção entre os desfechos de ambiente ("configuração inválida" vs "dependência indisponível") e o desfecho de "interrupção", por exigirem ações operacionais diferentes.
- **FR-004a**: A adoção do novo padrão MUST ser tratada como alteração do contrato de código de saída hoje documentado (colapso de "concluída com falhas" em sucesso) e MUST ser registrada na documentação do host como mudança de comportamento, para que consumidores que hoje leem "concluída com falhas" como não-sucesso sejam avisados.
- **FR-005**: O resumo final da execução — incluindo a lista de itens que falharam e os alertas — MUST continuar sendo emitido em qualquer desfecho, inclusive nas execuções que o agendador enxerga como sucesso, para que a saúde item-a-item permaneça inspecionável.
- **FR-006**: O comportamento MUST ser determinístico e testável: para cada desfecho de execução, o sinal binário resultante MUST ser verificável por teste automatizado sem depender de rede real, do relógio do sistema ou de um agendador real.
- **FR-007**: O tratamento do desfecho de **interrupção** por sinal do operador MUST ser definido explicitamente quanto ao sinal binário que produz, e esse tratamento MUST ser coberto por teste. (Assumção corrente: interrupção → falha; ver Assumptions.)
- **FR-008**: A documentação do host MUST descrever o mapeamento desfecho-interno → sinal-binário como **comportamento padrão** (sem configuração para ativá-lo ou desativá-lo), para que um operador entenda o que o agendador verá sem ler o código.

### Key Entities *(include if feature involves data)*

- **Desfecho de execução (outcome)**: o resultado interno de uma execução da rotina, com os cinco significados descritos no Contexto. É o dado de entrada do mapeamento.
- **Sinal binário de desfecho**: a projeção do desfecho de execução em dois valores — sucesso ou falha — que é o que um agendador externo binário observa. É o dado de saída do mapeamento e o foco desta feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em execuções que concluem a varredura e persistem dado com falhas de itens dentro do padrão histórico da coleta, **100%** são reportadas como sucesso pelo agendador externo (hoje: essencialmente 0%).
- **SC-002**: Em execuções que não arrancam por causa de ambiente (configuração, credencial, dependência, rotina inexistente), **100%** são reportadas como falha pelo agendador externo.
- **SC-003**: O operador consegue distinguir "a rotina falhou ao rodar" de "a rotina rodou com itens problemáticos" olhando apenas o painel do agendador, sem abrir os logs — validado por revisão do painel após um ciclo de execuções reais.
- **SC-004**: Nenhuma informação operacional se perde na fusão: os desfechos de ambiente ("configuração inválida" vs "dependência indisponível") permanecem distinguíveis entre si, e toda execução "concluída com falhas" — agora sucesso no binário — ainda lista os itens falhos no resumo. Verificado por testes automatizados que cobrem os cinco desfechos e a projeção binária de cada um.

## Assumptions

- **Decisão de escopo (resolvida)**: o mapeamento binário é o **comportamento padrão** da rotina, não um modo ativável por configuração (Opção B). "Concluída com falhas" passa a ser sucesso para todos os ambientes e para todos os consumidores, colapsando com "concluída sem falhas" inclusive no código de saída. Aceita-se conscientemente que isto altera o contrato de código de saída hoje documentado; o custo é considerado menor que o de manter uma flag de comportamento (ver FR-004, FR-004a).
- **Modelo de execução**: a rotina é disparada como uma tarefa agendada que executa e termina (não como serviço permanente). O sinal de desfecho só faz sentido nesse modelo; manter a rotina "sempre de pé" está fora do escopo (decisão de arquitetura já discutida, resolvida a favor do modelo efêmero).
- **Sinal binário do agendador**: o agendador externo interpreta o término do processo como sucesso quando o desfecho indicado for o de "OK" e como falha caso contrário — comportamento padrão de agendadores baseados em código de saída de processo.
- **Interrupção → falha**: um encerramento por sinal do operador, por não representar uma varredura concluída, é mapeado para "falha" no sinal binário. Adotado como padrão razoável e sujeito a revisão; registrado em FR-007 como ponto a decidir e testar explicitamente.
- **"Persistiu dado" inclui o caso de zero itens coletados por ausência de trabalho**: se a varredura roda até o fim sem nada novo a persistir (fonte sem novidades), isso é sucesso, não falha — a rotina fez o seu trabalho.
- **Escopo restrito à sinalização de desfecho**: esta feature não altera a lógica de coleta, de repetição (retry), de idempotência das gravações, nem introduz novos desfechos; apenas define como os desfechos existentes se projetam no sinal binário.
- **Sem novas dependências**: a mudança é interna ao host de rotinas e à sua documentação; não requer serviços, bibliotecas de terceiros ou infraestrutura novos.
