# Feature Specification: Coletor de aeroportos e cartas IFR do DECEA

**Feature Branch**: `feature/002-decea-crawler-job`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Crie uma aplicação nova no repositório, o propósito desta aplicação é ser uma coleção de rotinas a serem executadas via script. A primeira rotina é a de ser um crawler de uma API do governo (DECEA) [...] buscar todos os aeroportos do tipo 'AD', salvar em banco Postgres nome, icao, cidade, estado como entidade 'Airport', mais latitude, longitude e lista de pistas; para cada aeroporto buscar as cartas do tipo 'IFR' e salvar id, nome, tipo, emenda como entidade 'AirportProcedure'; baixar o PDF de cada carta e salvar em bucket S3 na estrutura `/:icao/:id`; reprocessar até 3 vezes em caso de falha; paginar de 100 em 100 e processar 4 aeroportos por vez; usar docker/docker-compose no ambiente local; considerar pacote reutilizável para a futura API REST."

## Visão Geral

Uma nova aplicação de rotinas executáveis por script passa a existir no monorepo. Sua primeira
rotina coleta, da fonte oficial de informação aeronáutica brasileira, o cadastro dos aeródromos
do tipo "AD" e as respectivas cartas de navegação por instrumentos (IFR), consolidando esses
dados em um banco relacional e os documentos PDF das cartas em um bucket de objetos compatível
com S3. O resultado é uma base local sempre atualizável que servirá, em uma etapa futura, a uma
API REST de consulta para o frontend.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coletar o cadastro de aeródromos (Priority: P1)

Como mantenedor da base, executo a rotina por linha de comando e, ao final, tenho no banco de
dados todos os aeródromos do tipo "AD" publicados pela fonte oficial, cada um com nome, código
ICAO, cidade, estado, latitude, longitude e a lista de suas pistas.

**Why this priority**: É o alicerce de todo o restante — cartas e documentos só existem
vinculados a um aeródromo. Sozinha, esta história já entrega um catálogo nacional de aeródromos
consultável, valor real e independente.

**Independent Test**: Executar a rotina com a coleta de cartas desabilitada (ou observar apenas o
estado da tabela de aeródromos) e verificar que a quantidade de aeródromos persistidos
corresponde ao total informado pela fonte, com os campos obrigatórios preenchidos.

**Acceptance Scenarios**:

1. **Given** um banco de dados vazio e a fonte oficial acessível, **When** a rotina é executada
   até o fim, **Then** cada aeródromo do tipo "AD" publicado pela fonte existe no banco com
   nome, ICAO, cidade, estado, latitude, longitude e lista de pistas.
2. **Given** um banco já populado por uma execução anterior, **When** a rotina é executada
   novamente e a fonte alterou o nome de um aeródromo, **Then** o registro existente é
   atualizado no lugar, sem criar duplicata do mesmo código ICAO.
3. **Given** a fonte oficial retornando mais de 100 aeródromos, **When** a rotina percorre o
   catálogo, **Then** todas as páginas são percorridas e nenhum aeródromo publicado fica de fora.
4. **Given** um aeródromo cujo detalhamento não informa cidade, estado ou coordenadas, **When**
   ele é processado, **Then** o aeródromo é persistido com os campos disponíveis e a ausência é
   registrada no relatório de execução, sem interromper a rotina.

---

### User Story 2 - Coletar as cartas IFR de cada aeródromo (Priority: P2)

Como mantenedor da base, ao executar a rotina, obtenho para cada aeródromo a lista de suas
cartas de navegação por instrumentos, cada uma persistida com identificador, nome, tipo e
emenda, vinculada ao aeródromo correspondente.

**Why this priority**: Agrega a camada de procedimentos sobre o catálogo da P1 e é o dado
central do produto, mas depende dos aeródromos já existirem. Entregue sozinha sobre a P1, já
permite consultar quais procedimentos cada aeródromo possui, mesmo sem os documentos.

**Independent Test**: Com o catálogo de aeródromos já populado, executar a rotina com o envio de
documentos desabilitado e verificar que cada aeródromo possui suas cartas IFR persistidas e
vinculadas.

**Acceptance Scenarios**:

1. **Given** um aeródromo persistido e a fonte publicando cartas para ele, **When** o aeródromo é
   processado, **Then** apenas as cartas da espécie IFR são persistidas, cada uma com
   identificador, nome, tipo e emenda, vinculadas àquele aeródromo.
2. **Given** um aeródromo sem nenhuma carta IFR publicada, **When** ele é processado, **Then** o
   aeródromo permanece persistido sem cartas associadas e a rotina segue para o próximo.
3. **Given** uma carta já persistida cuja emenda foi alterada na fonte, **When** a rotina é
   executada novamente, **Then** o registro existente é atualizado com a nova emenda, sem
   duplicação.
4. **Given** uma carta que deixou de ser publicada pela fonte, **When** a rotina é executada
   novamente, **Then** ela deixa de constar como carta vigente daquele aeródromo.

---

### User Story 3 - Arquivar o documento PDF de cada carta (Priority: P3)

Como mantenedor da base, quero que o documento PDF de cada carta IFR seja baixado e arquivado no
bucket de objetos sob o caminho `/<ICAO>/<identificador da carta>.pdf`, de modo que o documento
possa ser servido posteriormente sem depender da disponibilidade da fonte original.

**Why this priority**: Completa o produto, mas os metadados das histórias anteriores já têm valor
por si. É também a etapa mais custosa em tempo e tráfego, logo a última a ser garantida.

**Independent Test**: Com cartas já persistidas, executar a rotina e verificar no bucket a
existência de um objeto por carta, no caminho esperado, com conteúdo PDF íntegro e abrível.

**Acceptance Scenarios**:

1. **Given** uma carta IFR com documento disponível na fonte, **When** ela é processada,
   **Then** o PDF é arquivado no bucket em `/<ICAO>/<identificador da carta>.pdf` e é possível
   recuperá-lo íntegro.
2. **Given** um documento já arquivado em execução anterior e inalterado na fonte, **When** a
   rotina é executada novamente, **Then** o documento não é baixado de novo, evitando tráfego
   desnecessário.
3. **Given** uma carta cujo documento não pôde ser baixado após todas as tentativas, **When** o
   aeródromo é finalizado, **Then** a falha é registrada no relatório de execução e as demais
   cartas do mesmo aeródromo seguem sendo processadas.
4. **Given** uma carta que deixou de ser publicada pela fonte e cujo documento está arquivado,
   **When** a rotina é executada novamente, **Then** o documento é removido do bucket, restando
   nele apenas os documentos das cartas vigentes daquele aeródromo.

---

### User Story 4 - Executar a rotina de forma observável e reprodutível (Priority: P3)

Como mantenedor, executo a rotina por um comando único, acompanho o progresso enquanto ela roda e,
ao final, recebo um resumo do que foi coletado e do que falhou; no ambiente local, subo as
dependências (banco de dados e bucket) com um único comando, sem instalar serviços na máquina.

**Why this priority**: Não entrega dado novo, mas torna as demais histórias operáveis e
diagnosticáveis. Sem isso, uma execução de milhares de aeródromos vira uma caixa-preta.

**Independent Test**: Subir o ambiente local do zero em uma máquina sem banco nem bucket
instalados, executar a rotina e confirmar que ela roda até o fim exibindo progresso e um resumo
final.

**Acceptance Scenarios**:

1. **Given** uma máquina com apenas o runtime e o Docker disponíveis, **When** o ambiente local é
   iniciado pelo comando documentado, **Then** banco de dados e bucket sobem prontos para uso e a
   rotina consegue se conectar a ambos.
2. **Given** a rotina em execução, **When** aeródromos vão sendo processados, **Then** o progresso
   é exibido de forma contínua, permitindo identificar em que ponto do catálogo a execução está.
3. **Given** o término da execução, **When** o resumo é apresentado, **Then** ele informa quantos
   aeródromos e cartas foram processados com sucesso, quantos falharam e quais foram as falhas.
4. **Given** uma configuração obrigatória ausente (credencial da fonte, banco ou bucket),
   **When** a rotina é iniciada, **Then** ela encerra imediatamente com mensagem que identifica
   exatamente qual configuração falta, sem processar nada parcialmente.

---

### Edge Cases

- **Falha intermitente em uma etapa do aeródromo**: quando qualquer etapa do processamento de um
  aeródromo falha, o aeródromo inteiro é reprocessado, até 3 tentativas no total; persistindo a
  falha, ele é marcado como falho no relatório e a execução continua nos demais.
- **Fonte indisponível ou instável durante a execução**: falhas de rede ou respostas de erro da
  fonte são tratadas como falha da tentativa corrente, não como fim da execução.
- **Fonte limitando a taxa de requisições**: com 4 aeródromos processados simultaneamente, a
  rotina não deve ultrapassar limites de uso da fonte a ponto de inviabilizar a coleta.
- **Catálogo cujo total muda durante a paginação**: aeródromos publicados ou removidos entre uma
  página e outra não podem causar perda de páginas nem laço infinito.
- **Aeródromo sem nenhuma pista informada**: é persistido com lista de pistas vazia.
- **Documento PDF corrompido, vazio ou que não é um PDF**: é tratado como falha de download da
  carta, não como sucesso.
- **Resposta da fonte com campos ausentes ou malformados**: campos obrigatórios ausentes tornam o
  aeródromo falho; campos opcionais ausentes são registrados como vazios.
- **Duas execuções simultâneas da mesma rotina**: não devem corromper os dados persistidos.
- **Execução interrompida no meio**: uma nova execução deve poder ser feita do início sem
  duplicar dados nem exigir limpeza manual.

## Requirements *(mandatory)*

### Funcionais — Aplicação de rotinas

- **FR-001**: O repositório MUST conter uma nova aplicação cujo propósito é hospedar rotinas
  operacionais executáveis por script, com a coleta de dados do DECEA como primeira rotina.
- **FR-002**: Cada rotina MUST ser executável isoladamente por um comando de linha de comando,
  sem exigir a execução das demais.
- **FR-003**: A aplicação MUST permitir a adição de novas rotinas sem alterar o comportamento das
  rotinas já existentes.
- **FR-004**: Toda configuração sensível ou dependente de ambiente (credenciais da fonte, acesso
  ao banco e ao bucket) MUST ser fornecida por ambiente, nunca fixada no código versionado.
- **FR-005**: A rotina MUST validar a presença de todas as configurações obrigatórias antes de
  iniciar qualquer coleta e MUST encerrar com erro descritivo caso alguma falte.

### Funcionais — Coleta de aeródromos

- **FR-006**: A rotina MUST obter, da fonte oficial, a lista completa de aeródromos do tipo "AD".
- **FR-007**: A rotina MUST percorrer o catálogo de forma paginada, em páginas de 100 itens, até
  esgotar o total publicado.
- **FR-008**: A rotina MUST obter, para cada aeródromo, o detalhamento que contém suas
  coordenadas geográficas e suas pistas.
- **FR-009**: O sistema MUST persistir cada aeródromo com nome, código ICAO, cidade, estado,
  latitude, longitude e lista de pistas.
- **FR-010**: O código ICAO MUST identificar unicamente um aeródromo; reexecuções MUST atualizar
  o registro existente em vez de criar duplicata.

### Funcionais — Coleta de cartas

- **FR-011**: A rotina MUST obter, para cada aeródromo, somente as cartas da espécie IFR,
  solicitando-as já filtradas à fonte.
- **FR-012**: A rotina MUST registrar no relatório um alerta quando uma carta vier com um tipo
  fora do conjunto conhecido da espécie IFR, sem descartá-la — a fonte é a autoridade sobre quais
  tipos compõem a espécie.
- **FR-013**: O sistema MUST persistir cada carta com identificador, nome, tipo e emenda,
  vinculada ao aeródromo a que pertence.
- **FR-014**: O identificador da carta MUST identificá-la unicamente; reexecuções MUST atualizar
  o registro existente em vez de criar duplicata.
- **FR-015**: Cartas que deixaram de ser publicadas pela fonte MUST deixar de constar como
  vigentes para aquele aeródromo em execuções subsequentes.

### Funcionais — Arquivamento de documentos

- **FR-016**: A rotina MUST baixar o documento PDF de cada carta IFR persistida.
- **FR-017**: O sistema MUST arquivar cada documento no bucket de objetos sob o caminho
  `/<código ICAO>/<identificador da carta>.pdf`, com a extensão `.pdf` no nome do objeto.
- **FR-018**: A rotina MUST evitar baixar novamente documentos já arquivados e inalterados.
- **FR-019**: O sistema MUST rejeitar como falha um download cujo conteúdo esteja vazio ou não
  seja um documento PDF válido.
- **FR-020**: Quando uma carta deixa de ser publicada pela fonte, o sistema MUST remover o
  documento correspondente do bucket, mantendo o bucket coerente com as cartas vigentes no banco.

### Funcionais — Resiliência e concorrência

- **FR-021**: O processamento completo de um aeródromo (detalhamento, cartas e documentos) MUST
  ser reexecutado em caso de falha em qualquer etapa, até um total de 3 tentativas.
- **FR-022**: A falha definitiva de um aeródromo MUST NOT interromper o processamento dos demais.
- **FR-023**: A rotina MUST processar no máximo 4 aeródromos simultaneamente.
- **FR-024**: A rotina MUST poder ser reexecutada do início a qualquer momento sem duplicar dados
  nem exigir limpeza manual do estado anterior.

### Funcionais — Observabilidade

- **FR-025**: A rotina MUST reportar progresso durante a execução, indicando o avanço no catálogo.
- **FR-026**: A rotina MUST apresentar, ao final, um resumo com totais de aeródromos e cartas
  processados com sucesso e com falha.
- **FR-027**: Cada falha definitiva MUST ser registrada de forma identificável (aeródromo ou
  carta afetada e motivo).
- **FR-028**: A rotina MUST encerrar com estado de saída distinto entre execução bem-sucedida e
  execução com falhas definitivas, permitindo automação futura.

### Funcionais — Ambiente e reuso

- **FR-029**: O repositório MUST fornecer um ambiente local containerizado que suba o banco de
  dados e o armazenamento de objetos com um único comando, sem instalação manual de serviços.
- **FR-030**: O repositório MUST documentar as configurações necessárias e o passo a passo para
  executar a rotina localmente.
- **FR-031**: O modelo de dados e o acesso à persistência de aeródromos e cartas MUST residir em
  um pacote reutilizável do monorepo, consumível pela futura API REST sem duplicação de código.
- **FR-032**: O esquema do banco de dados MUST ser criado e evoluído de forma versionada e
  reproduzível, sem passos manuais.

### Key Entities

- **Airport (Aeródromo)**: um aeródromo do tipo "AD" publicado pela fonte oficial. Atributos:
  código ICAO (identificador único), nome, cidade, estado, latitude, longitude. Possui uma lista
  de pistas e zero ou mais procedimentos.
- **AirportRunway (Pista)**: uma pista pertencente a um aeródromo. Atributos: identificação da pista e
  suas dimensões (comprimento e largura). Existe apenas no contexto de um aeródromo.
- **AirportProcedure (Carta/Procedimento)**: uma carta de navegação por instrumentos de um
  aeródromo. Atributos: identificador único, nome, tipo e emenda. Pertence a exatamente um
  aeródromo e possui um documento PDF correspondente arquivado no bucket.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao final de uma execução completa, 100% dos aeródromos do tipo "AD" publicados pela
  fonte no momento da coleta estão persistidos com nome, ICAO, cidade, estado e coordenadas —
  ressalvados apenas os casos em que a própria fonte não informa o dado.
- **SC-002**: Ao final de uma execução completa, ao menos 99% dos aeródromos são processados com
  sucesso; falhas definitivas ficam abaixo de 1% e todas aparecem identificadas no resumo.
- **SC-003**: 100% das cartas persistidas são da espécie IFR, e cada uma possui um documento PDF
  íntegro e recuperável no caminho `/<ICAO>/<identificador>.pdf`.
- **SC-004**: Uma segunda execução sobre uma base já populada e sem mudanças na fonte não altera a
  quantidade de aeródromos nem de cartas, e não rebaixa nenhum documento já arquivado.
- **SC-005**: Um mantenedor sem o ambiente montado consegue, seguindo apenas a documentação, subir
  as dependências e iniciar a rotina em menos de 10 minutos.
- **SC-006**: Falhas transitórias de rede em até 2 tentativas de um mesmo aeródromo não resultam
  em perda de dado, pois a terceira tentativa conclui o processamento.
- **SC-007**: Durante a execução, o mantenedor consegue identificar a qualquer momento em que
  ponto do catálogo a rotina está, sem inspecionar o banco de dados.

## Assumptions

- A fonte oficial de dados é a API pública AISWEB do DECEA, cujo acesso exige credenciais
  próprias, obtidas pelo mantenedor e fornecidas por ambiente.
- O tipo "AD" corresponde ao filtro de aeródromos do catálogo da fonte. "IFR" é uma **espécie** de
  carta (não um tipo): agrupa 13 tipos distintos, entre eles cartas de aproximação (IAC), saída
  (SID), chegada (STAR) e também cartas de aeródromo (ADC) e de estacionamento (PDC). O filtro é
  aplicado na consulta à fonte, que é o único ponto capaz de distinguir a espécie — a resposta não
  a informa, e o mesmo tipo pode pertencer às espécies IFR e VFR. Confirmado contra a API em
  2026-08-15.
- A estrutura `/:icao/:id` do bucket armazena um objeto por carta, com a extensão `.pdf` no nome
  do objeto — decisão confirmada pelo autor e normatizada em FR-017.
- O bucket de objetos é acessado por interface compatível com S3, o que permite usar um
  substituto local em contêiner durante o desenvolvimento e o bucket do provedor em produção,
  sem mudança de código.
- A rotina é executada sob demanda pelo mantenedor; agendamento automático e execução recorrente
  em produção estão fora do escopo desta feature.
- A API REST de consulta está fora do escopo desta feature; aqui apenas se garante que o modelo de
  dados e o acesso à persistência fiquem em um pacote reutilizável.
- Não há autenticação, autorização ou multiusuário nesta feature: a rotina é uma ferramenta
  operacional executada por quem tem acesso ao ambiente.
- O volume esperado é da ordem de alguns milhares de aeródromos e dezenas de milhares de cartas,
  compatível com uma execução de lote única.
- Coordenadas e dimensões de pista são persistidas conforme publicadas pela fonte; conversões de
  unidade ou de sistema de referência estão fora do escopo.
- A remoção do documento PDF de cartas que deixaram de ser publicadas mantém o bucket coerente
  com o banco — decisão confirmada pelo autor e normatizada em FR-020, junto ao requisito de
  vigência das cartas (FR-015).

## Dependencies

- Credenciais de acesso à API AISWEB do DECEA (chave e senha), obtidas pelo mantenedor.
- Disponibilidade da API AISWEB durante a execução da coleta.
- Um banco de dados relacional acessível (contêiner local em desenvolvimento).
- Um bucket de objetos compatível com S3 e suas credenciais de acesso.
- Docker disponível na máquina do mantenedor para subir o ambiente local.

## Out of Scope

- A API REST que exporá os aeródromos ao frontend.
- Qualquer interface gráfica ou visualização das cartas.
- Agendamento, orquestração ou execução recorrente automática da rotina em produção.
- Coleta de cartas VFR, NOTAM, METAR ou de qualquer outra área da fonte além das aqui descritas.
- Processamento, conversão ou extração de conteúdo dos documentos PDF.
- Retenção histórica de emendas anteriores de uma mesma carta.
