# Feature Specification: Otimização do tempo de execução do coletor DECEA

**Feature Branch**: `feature/007-decea-crawler-optimization`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "analise o crawler decea em busca de oportunidades de otimizações na execução. O mesmo tem demorado em média 7min e 30s para uma execução completa. Gostaria de reduzir para no máximo 5 minutos. Se possível verificar na API da DECEA se ela fornece a data da última atualização dos dados/cartas para dar um bypass no aeródromo."

## Visão Geral

A rotina `decea-crawler` (feature 002) percorre hoje os ~4.491 aeródromos publicados pela fonte
oficial e, para **cada um**, refaz todo o trabalho: consulta o detalhamento, consulta as cartas,
confere no bucket a existência de cada documento e regrava o aeródromo no banco — mesmo quando
nada mudou desde a execução anterior. Uma varredura completa leva em média **7 min 30 s**.

O objetivo é que a varredura completa termine em **no máximo 5 minutos**, sem perder nenhuma
garantia de correção que a rotina já oferece (dados completos, documentos íntegros, idempotência,
resumo fiel ao que aconteceu).

### Diagnóstico (base para o planejamento)

Levantado a partir do código atual e de sondagens à fonte real em 2026-10-08:

1. **O custo está no volume de aeródromos, não nos documentos.** Há ~4.491 aeródromos e apenas
   ~1.807 cartas IFR, concentradas em 247 aeródromos; a imensa maioria não tem carta nenhuma. O
   que pesa é o custo fixo por aeródromo — duas consultas à fonte, conferência no bucket e uma
   transação no banco —, multiplicado por milhares.
2. **Etapas independentes rodam em sequência.** O detalhamento e a lista de cartas de um mesmo
   aeródromo são consultados um após o outro; a verificação de existência dos documentos no
   bucket também é feita carta a carta, em série.
3. **Há uma barreira entre páginas.** A página seguinte do catálogo só começa a ser processada
   quando o aeródromo mais lento da página atual termina.
4. **Toda execução regrava tudo.** Mesmo sem nenhuma mudança na fonte, cada aeródromo gera uma
   transação de escrita completa no banco.
5. **A fonte publica um indicador de atualização — mas ele é global, não por aeródromo.** O
   envelope da lista de cartas traz a data/hora da última atualização (`lastupdate`) e a data do
   ciclo AIRAC vigente (`emenda`). Sondado ao vivo, o valor é **o mesmo para todos os
   aeródromos** (ex.: `2026-09-30 17:35:34` em `SBGL`, `SBSP`, `SDCO` e na consulta sem
   aeródromo) — indica quando o conjunto IFR inteiro mudou, não qual aeródromo mudou. **Corrigido
   na implementação (2026-10-08):** a listagem do catálogo e o detalhamento trazem, por
   aeródromo, um campo `dt` que é a data da última alteração do registro ROTAER — igual nas duas
   consultas e variando por aeródromo (707 com `2018-07-19`, a carga inicial). As primeiras
   amostras caíram todas em "hoje" e levaram à leitura errada de que seria a data da consulta.
   Ele é o indicador por aeródromo que dispara a revalidação das pistas.
6. **A fonte permite consultas em lote.** Sondado ao vivo: (a) a lista de cartas IFR sem
   aeródromo informado devolve **todas as 1.807 cartas numa única resposta**, cada uma
   identificando seu aeródromo; (b) a listagem do catálogo aceita uma página grande o bastante
   para trazer **os 4.491 aeródromos numa única resposta**, já com nome, cidade, UF e
   coordenadas — idênticos aos do detalhamento. **Só as pistas** exigem o detalhamento
   individual. Consequência: o que hoje são ~9.000 consultas por execução pode virar 2 consultas
   em lote mais o detalhamento apenas dos aeródromos cujas pistas precisam ser revalidadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pular aeródromos sem alteração na fonte (Priority: P1)

Como mantenedor da base, executo a varredura completa habitual e a rotina reconhece quais
aeródromos não mudaram desde a última coleta — comparando o que a fonte publica com o que já está
na base e usando o indicador global de atualização para decidir quando revalidar as pistas. Para
esses, ela não refaz o trabalho caro (detalhamento, conferência de documentos, regravação), e a
execução termina em até 5 minutos.

**Why this priority**: É a alavanca de maior ganho. Entre duas execuções a imensa maioria dos
aeródromos não muda; deixar de reprocessá-los é o que torna a meta de 5 minutos alcançável com
folga e reduz a carga sobre a fonte.

**Independent Test**: Executar a varredura completa duas vezes seguidas sobre uma base já
populada. Na segunda execução, o resumo informa quantos aeródromos ficaram inalterados, o estado
do banco e do bucket é idêntico ao da primeira execução e a duração cai para dentro da meta.

**Acceptance Scenarios**:

1. **Given** um aeródromo cujos dados publicados (cadastro e cartas) são iguais aos persistidos e
   cujas pistas não estão vencidas, **When** a varredura passa por ele, **Then** a rotina não
   consulta seu detalhamento, não regrava nada no banco e o contabiliza como "inalterado".
2. **Given** um aeródromo com qualquer diferença entre o publicado e o persistido (cadastro,
   carta incluída, alterada ou retirada), **When** a varredura passa por ele, **Then** ele é
   gravado com o estado da fonte, como hoje.
3. **Given** o indicador global de atualização ou o ciclo AIRAC publicados diferem dos
   registrados, **When** a varredura roda, **Then** as pistas de todos os aeródromos são
   revalidadas nessa execução.
4. **Given** um aeródromo que nunca teve as pistas coletadas com sucesso, ou cuja última
   tentativa falhou, **When** a varredura passa por ele, **Then** seu detalhamento é consultado,
   independentemente do indicador.
5. **Given** o mantenedor quer ignorar o atalho (por exemplo, após suspeita de inconsistência),
   **When** executa a rotina pedindo uma coleta forçada, **Then** todos os aeródromos são
   processados integralmente.

---

### User Story 2 - Processamento mais eficiente de cada aeródromo (Priority: P2)

Como mantenedor, quero que, mesmo quando muitos aeródromos precisam ser processados, o tempo gasto
seja o menor possível, eliminando consultas redundantes à fonte e esperas desnecessárias entre
etapas e entre páginas do catálogo.

**Why this priority**: Garante a meta mesmo nos cenários em que o atalho da história 1 ajuda
pouco — primeira execução, coleta forçada ou virada de ciclo AIRAC, quando todas as pistas são
revalidadas.

**Independent Test**: Executar a varredura completa em modo forçado sobre uma base populada e
comparar a duração com a linha de base de 7 min 30 s, verificando que o resultado (contagens de
aeródromos, pistas, cartas e documentos) é idêntico ao da versão atual.

**Acceptance Scenarios**:

1. **Given** uma varredura completa, **When** a rotina obtém o catálogo e as cartas, **Then** o
   faz por consultas em lote, e não uma consulta de cartas por aeródromo.
2. **Given** aeródromos por processar, **When** uma linha de trabalho fica livre, **Then** ela
   inicia o próximo aeródromo sem aguardar o término de um grupo inteiro.
3. **Given** a rotina conferindo quais documentos já estão arquivados, **When** há centenas de
   cartas, **Then** a conferência não é feita carta a carta em série.
4. **Given** a rotina rodando com as otimizações, **When** a execução termina, **Then** o número de
   requisições simultâneas à fonte nunca excedeu o limite já estabelecido (4), para não arriscar
   limitação de taxa.

---

### User Story 3 - Visibilidade sobre onde o tempo é gasto (Priority: P3)

Como mantenedor, quero que o resumo final mostre a duração total, quantos aeródromos foram
gravados, quantos ficaram inalterados, quantos tiveram as pistas revalidadas e o tempo acumulado
nas principais etapas, para confirmar a meta e identificar regressões futuras.

**Why this priority**: Sem medição não há como provar a meta nem perceber quando a fonte ou o
volume mudarem. É complementar às histórias 1 e 2.

**Independent Test**: Executar a rotina e verificar que o resumo apresenta os novos contadores e
tempos, e que a soma de "gravados" + "inalterados" + "falhos" corresponde ao total do catálogo.

**Acceptance Scenarios**:

1. **Given** uma execução concluída, **When** o mantenedor lê o resumo, **Then** vê a duração
   total, a contagem de aeródromos gravados, inalterados e falhos, quantos tiveram pistas
   revalidadas, e o tempo por etapa (catálogo, cartas, pistas, documentos, banco).
2. **Given** uma execução interrompida, **When** o resumo é emitido, **Then** os mesmos
   contadores refletem apenas o que de fato foi feito até a interrupção.

---

### Edge Cases

- **Documento ausente no bucket** (removido manualmente ou perdido) para uma carta que não mudou:
  a conferência dos documentos arquivados é feita contra o conteúdo real do bucket em toda
  execução, então o documento é baixado de novo.
- **Indicador volta no tempo ou muda de formato** na fonte: qualquer valor diferente do registrado
  (inclusive mais antigo) é tratado como "mudou"; valor ilegível é tratado como mudança.
- **Falha ao revalidar as pistas de um aeródromo**: a pendência permanece, e a execução seguinte
  tenta de novo, mesmo que o indicador global não mude mais.
- **Execução interrompida durante uma virada AIRAC**: os aeródromos que não chegaram a ter as
  pistas revalidadas continuam pendentes na execução seguinte.
- **Cartas de aeródromos fora do catálogo "AD"**: a consulta em lote devolve cartas de 32
  aeródromos que não constam no catálogo (ex.: `SBEN`, `SBWA`…), que a rotina atual nunca coleta.
  Elas continuam fora da base, como hoje, e a quantidade é informada no resumo.
- **Aeródromos sem detalhamento publicado** (`SI5J`, `SJZ1`): constam no catálogo em lote, mas o
  detalhamento continua vazio; seguem tratados como falha definitiva e fora da base, como hoje.
- **Virada de ciclo AIRAC**: todas as pistas são revalidadas; a execução pode ser mais longa que
  em regime estável, mas não deve ser mais lenta que a linha de base atual.
- **Consulta em lote falha ou vem truncada**: sem o catálogo ou a lista completa de cartas, a
  rotina não pode decidir nada com segurança — a falha é repetida conforme a política de
  tentativas e, persistindo, a execução termina como falha sem alterar a base.
- **Execução restrita a ICAOs específicos** (`--only`): continua funcionando e sempre revalida as
  pistas dos ICAOs indicados.
- **Interrupção pelo operador**: o comportamento atual (não iniciar novos aeródromos, terminar os
  em curso) é preservado.
- **Base nova/vazia**: nenhum aeródromo tem pistas coletadas, todos são processados integralmente
  — equivale a uma coleta forçada.

## Requirements *(mandatory)*

### Functional Requirements

**Atalho por comparação e indicador de atualização**

- **FR-001**: A rotina MUST registrar o indicador global de atualização das cartas IFR e o ciclo
  AIRAC publicados pela fonte, junto com o momento em que cada novo valor foi observado.
- **FR-002**: A rotina MUST comparar, para cada aeródromo, os dados publicados pela fonte
  (cadastro e cartas) com os persistidos e MUST NOT regravar no banco aeródromos sem diferença.
- **FR-003**: A rotina MUST consultar o detalhamento (pistas) de um aeródromo somente quando: as
  pistas nunca foram coletadas com sucesso; a data do registro ROTAER do aeródromo (`dt`) mudou
  desde a última coleta delas; a última coleta delas é anterior à observação do
  indicador ou do ciclo AIRAC vigentes; a revalidação periódica do FR-007 está vencida; o
  aeródromo foi pedido explicitamente; ou a coleta é forçada.
- **FR-004**: O momento da última coleta bem-sucedida das pistas de um aeródromo MUST ser gravado
  na mesma unidade de gravação dos demais dados dele, e somente quando a coleta tiver sucesso.
- **FR-005**: A rotina MUST oferecer um modo de coleta forçada que ignora o atalho e processa todos
  os aeródromos integralmente.
- **FR-006**: Os dados cadastrais do aeródromo publicados no catálogo (nome, cidade, UF,
  coordenadas) MUST ser comparados e atualizados em toda execução, pois chegam sem custo na
  consulta em lote; as pistas, que exigem o detalhamento, seguem a política do FR-003 — buscadas
  de novo quando o indicador de atualização das cartas ou o ciclo AIRAC mudarem, além da
  revalidação do FR-007 e da coleta forçada do FR-005 (decisão de 2026-10-08).
- **FR-007**: A rotina MUST garantir que as pistas de todo aeródromo sejam revalidadas pelo menos
  uma vez a cada 7 dias, distribuindo essa revalidação entre execuções de modo que ela, sozinha,
  não leve uma execução em regime estável além da meta de duração.

**Eficiência do processamento**

- **FR-008**: A rotina MUST obter o catálogo de aeródromos e as cartas IFR por consultas em lote,
  sem uma consulta de cartas por aeródromo.
- **FR-009**: A rotina MUST manter sempre ocupadas as linhas de trabalho enquanto houver
  aeródromos por processar, sem barreira entre grupos.
- **FR-010**: A conferência de documentos já arquivados MUST ser feita de forma que seu custo não
  cresça carta a carta em série.
- **FR-011**: A rotina MUST NOT exceder o limite de concorrência contra a fonte já estabelecido
  (4 requisições simultâneas por padrão) nem reduzir a política de tentativas existente.

**Correção e observabilidade**

- **FR-012**: O resultado persistido (aeródromos, pistas, cartas e documentos) após uma execução
  otimizada MUST ser equivalente ao que a versão atual produziria para o mesmo estado da fonte,
  incluindo excluir as cartas de aeródromos fora do catálogo e os aeródromos sem detalhamento.
- **FR-013**: Todas as garantias da feature 002 MUST ser preservadas: idempotência, ordem de
  gravação bucket → banco → remoção de órfãos, tratamento de erros definitivos e retentáveis,
  interrupção controlada e códigos de saída.
- **FR-014**: O resumo final MUST apresentar a duração total, a contagem de aeródromos gravados,
  inalterados e falhos, quantos tiveram as pistas revalidadas, o indicador e o ciclo AIRAC
  observados, e o tempo acumulado nas etapas principais.
- **FR-015**: A documentação da rotina MUST registrar o indicador de atualização da fonte, seu
  significado observado, as consultas em lote e a nova medição de desempenho.

### Key Entities *(include if feature involves data)*

- **Estado de sincronização da fonte**: o indicador global de atualização das cartas IFR e o ciclo
  AIRAC vistos na fonte, com o momento em que cada valor foi observado. Um registro por fonte.
- **Revalidação das pistas do aeródromo**: o momento da última coleta bem-sucedida do
  detalhamento de um aeródromo e a data do registro ROTAER vista nela. É o que decide se ele
  precisa ser consultado individualmente.
- **Aeródromo / Carta (Procedimento) / Documento**: entidades já existentes da feature 002, sem
  alteração de significado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em regime estável (nenhuma ou poucas mudanças na fonte desde a última execução),
  uma varredura completa do catálogo, com documentos, termina em **no máximo 5 minutos** no
  ambiente de produção.
- **SC-002**: Uma varredura completa forçada (sem atalho) sobre uma base já populada não é mais
  lenta que a linha de base atual de 7 min 30 s, e idealmente fica abaixo dela.
- **SC-003**: Em duas execuções consecutivas sem mudança na fonte, pelo menos 95% dos aeródromos
  da segunda execução são contabilizados como inalterados.
- **SC-004**: Comparando uma execução otimizada com uma execução forçada sobre o mesmo estado da
  fonte, as contagens de aeródromos, pistas, cartas e documentos arquivados são idênticas (zero
  divergência).
- **SC-005**: A taxa de falhas por aeródromo não piora em relação à atual (0,045%), ou seja,
  nenhuma falha nova é introduzida pelas otimizações nem por limitação de taxa da fonte.
- **SC-006**: O resumo de 100% das execuções informa a duração e a divisão gravados /
  inalterados / falhos, permitindo verificar SC-001 sem ferramentas externas.

## Assumptions

- **Indicador global confirmado ao vivo** (2026-10-08): `lastupdate` e `emenda` são iguais em
  todos os aeródromos e na consulta sem aeródromo — refletem o conjunto IFR inteiro. Por isso o
  atalho por aeródromo é feito por **comparação de conteúdo**, e o indicador só decide quando
  revalidar as pistas de todos.
- As consultas em lote foram confirmadas ao vivo: catálogo inteiro em ~6,5 s e todas as cartas
  IFR em ~4,7 s, a partir de uma máquina local. Os dados cadastrais do catálogo em lote coincidem
  com os do detalhamento (verificado em `SBGL`).
- Uma mudança de pistas publicada fora de ciclo AIRAC e sem alteração no indicador das cartas
  pode levar até 7 dias para ser refletida na base (custo aceito em 2026-10-08 em troca do ganho
  de desempenho).
- A meta de 5 minutos é medida no ambiente de produção (Railway), com o volume atual de ~4.491
  aeródromos e ~1.807 cartas; um crescimento grande do catálogo exigiria nova avaliação.
- O limite de 4 requisições simultâneas contra a fonte é mantido por padrão; aumentar a
  concorrência não é uma das alavancas desta feature.
- A janela de 7 dias para revalidação obrigatória (FR-007) é um valor padrão razoável, ajustável
  por configuração.
- Não há mudança no comportamento observável pela API REST nem pelo frontend: os dados servidos
  continuam os mesmos.
