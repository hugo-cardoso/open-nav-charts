# Feature Specification: API REST de Aeródromos e Cartas

**Feature Branch**: `feature/003-rest-api-airports`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Crie uma API Rest utilizando Express com o objetivo inicial de listar os aeroportos `/airports` (paginada), obter um aeroporto `/airports/:icao`, obter os procedimentos de um aeroporto `/airports/:icao/procedures` e obter a carta/documento pdf de um procedimento `/airports/:icao/procedures/:id/chart`. O endpoint que retorna o documento deve ter alguma otimização para não sobrecarregar o servidor, talvez redirecionando para a url do bucket ou algo do tipo, aceito sugestões."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar o catálogo de aeródromos (Priority: P1)

Quem constrói uma aplicação de navegação aérea precisa descobrir quais aeródromos existem
no acervo antes de qualquer outra coisa. O consumidor pede a lista, recebe uma página de
aeródromos com identificação e localização, e navega pelas páginas seguintes até percorrer
o acervo inteiro. Também consegue restringir a busca a uma unidade federativa ou procurar
por parte do nome ou da cidade quando já sabe o que quer.

**Why this priority**: É a porta de entrada do acervo. Sem descobrir aeródromos, nenhum
outro endpoint tem como ser alcançado — todos dependem de um ICAO conhecido. Entregue
sozinha, esta história já permite construir uma tela de busca de aeródromos.

**Independent Test**: Pode ser testada isoladamente pedindo a lista com o acervo populado
e percorrendo todas as páginas, verificando que cada aeródromo aparece exatamente uma vez
e que os filtros reduzem o conjunto de forma coerente.

**Acceptance Scenarios**:

1. **Given** o acervo contém mais aeródromos do que cabem em uma página, **When** o
   consumidor pede a primeira página sem informar parâmetros, **Then** recebe a quantidade
   padrão de itens, o total de registros existentes e a indicação de que há página seguinte.
2. **Given** o consumidor está na última página, **When** pede a página seguinte, **Then**
   recebe uma lista vazia e a indicação de que não há mais páginas, sem erro.
3. **Given** o consumidor informa um filtro por unidade federativa, **When** pede a lista,
   **Then** recebe apenas aeródromos daquela unidade federativa, com a paginação aplicada
   sobre o conjunto filtrado.
4. **Given** o consumidor informa um termo de busca textual, **When** pede a lista, **Then**
   recebe apenas aeródromos cujo nome, cidade ou código ICAO correspondam ao termo,
   independentemente de maiúsculas, minúsculas ou acentuação.
5. **Given** o consumidor informa um tamanho de página acima do máximo permitido, **When**
   pede a lista, **Then** a requisição é rejeitada com erro de validação indicando o limite.
6. **Given** o acervo está vazio, **When** o consumidor pede a lista, **Then** recebe uma
   coleção vazia com total zero, e não um erro.

---

### User Story 2 - Obter os detalhes de um aeródromo (Priority: P1)

Tendo um código ICAO em mãos, o consumidor pede os dados completos daquele aeródromo —
nome, cidade, unidade federativa, coordenadas e as pistas com suas dimensões — para
apresentar uma ficha ou posicionar o aeródromo em um mapa.

**Why this priority**: É a informação mínima para exibir um aeródromo e o único caminho
para obter as pistas, que a listagem não carrega. Junto com a listagem, forma o par
navegar–detalhar que sustenta qualquer cliente.

**Independent Test**: Pode ser testada isoladamente pedindo um ICAO conhecido do acervo e
conferindo que todos os campos do aeródromo e a coleção de pistas vêm preenchidos.

**Acceptance Scenarios**:

1. **Given** o aeródromo existe no acervo, **When** o consumidor pede os detalhes pelo
   código ICAO, **Then** recebe seus dados de identificação, localização e a lista de pistas.
2. **Given** o aeródromo existe mas não tem pistas registradas, **When** o consumidor pede
   os detalhes, **Then** recebe o aeródromo com uma coleção de pistas vazia, e não um erro.
3. **Given** o código ICAO não existe no acervo, **When** o consumidor pede os detalhes,
   **Then** recebe uma resposta de recurso não encontrado.
4. **Given** o consumidor informa um código fora do formato de quatro letras, **When** pede
   os detalhes, **Then** recebe erro de validação, distinguível de recurso não encontrado.
5. **Given** o consumidor informa o código ICAO em minúsculas, **When** pede os detalhes,
   **Then** recebe o mesmo aeródromo que receberia com o código em maiúsculas.

---

### User Story 3 - Listar os procedimentos de um aeródromo (Priority: P2)

Com o aeródromo escolhido, o consumidor pede a relação de procedimentos publicados para
ele — nome, tipo, emenda e se há documento disponível — para montar a lista de cartas que
o piloto vai consultar.

**Why this priority**: É o que dá propósito ao acervo, mas depende de um aeródromo já
identificado pelas histórias anteriores. Entregue sozinha, permite exibir o índice de
cartas de um aeródromo mesmo antes de os documentos estarem acessíveis.

**Independent Test**: Pode ser testada isoladamente pedindo os procedimentos de um ICAO
conhecido e verificando que a relação corresponde ao que está registrado no acervo, com o
indicador de disponibilidade de documento correto para cada item.

**Acceptance Scenarios**:

1. **Given** o aeródromo tem procedimentos registrados, **When** o consumidor pede a
   relação, **Then** recebe todos eles com identificador, nome, tipo, emenda e a indicação
   de se o documento está disponível.
2. **Given** o aeródromo existe mas não tem procedimentos, **When** o consumidor pede a
   relação, **Then** recebe uma coleção vazia, e não uma resposta de não encontrado.
3. **Given** o código ICAO não existe no acervo, **When** o consumidor pede a relação,
   **Then** recebe uma resposta de recurso não encontrado.
4. **Given** o consumidor informa um filtro por tipo de procedimento, **When** pede a
   relação, **Then** recebe apenas os procedimentos daquele tipo.

---

### User Story 4 - Abrir o documento PDF de um procedimento (Priority: P2)

O consumidor tem o identificador de um procedimento e quer abrir a carta em PDF. Ele pede
o documento e é encaminhado diretamente ao arquivo, sem que a aplicação intermedeie o
tráfego dos bytes.

**Why this priority**: É a entrega final de valor — a carta em si. Fica depois da listagem
de procedimentos porque depende do identificador que ela fornece, e porque a relação de
cartas já tem utilidade própria mesmo sem o documento aberto.

**Independent Test**: Pode ser testada isoladamente pedindo o documento de um procedimento
arquivado conhecido e confirmando que o consumidor chega ao PDF por um endereço temporário,
sem que o volume de dados atravesse a aplicação.

**Acceptance Scenarios**:

1. **Given** o procedimento tem documento arquivado, **When** o consumidor pede a carta,
   **Then** é encaminhado a um endereço temporário de acesso direto ao documento, sem que
   o conteúdo do arquivo passe pela aplicação.
2. **Given** o consumidor segue o endereço recebido, **When** o faz dentro do prazo de
   validade, **Then** obtém o PDF do procedimento.
3. **Given** o endereço temporário expirou, **When** o consumidor tenta usá-lo novamente,
   **Then** o acesso é negado e ele precisa pedir a carta de novo à aplicação.
4. **Given** o procedimento existe mas nunca teve o documento arquivado, **When** o
   consumidor pede a carta, **Then** recebe uma resposta de recurso não encontrado que
   distingue "procedimento sem documento" de "procedimento inexistente".
5. **Given** o identificador do procedimento não pertence ao aeródromo informado no
   caminho, **When** o consumidor pede a carta, **Then** recebe uma resposta de recurso não
   encontrado, e não o documento de outro aeródromo.
6. **Given** o documento consta como arquivado no acervo mas não está mais no repositório
   de arquivos, **When** o consumidor pede a carta, **Then** recebe uma resposta de erro
   compreensível, e o incidente fica registrado para investigação.

---

### User Story 5 - Operar e monitorar a API (Priority: P3)

Quem opera o serviço precisa saber se ele está no ar e apto a responder, e precisa que um
consumidor mal-comportado não derrube o serviço para os demais.

**Why this priority**: Não entrega valor ao consumidor final, mas é o que permite publicar
a API com segurança. Fica por último porque as histórias anteriores são demonstráveis em
ambiente local sem ela.

**Independent Test**: Pode ser testada isoladamente consultando o indicador de saúde com
as dependências disponíveis e novamente com elas indisponíveis, e disparando requisições
acima do limite permitido.

**Acceptance Scenarios**:

1. **Given** a aplicação está no ar e alcança suas dependências, **When** o operador
   consulta o indicador de saúde, **Then** recebe confirmação de que o serviço está apto.
2. **Given** o repositório de dados está indisponível, **When** o operador consulta o
   indicador de saúde, **Then** recebe indicação de indisponibilidade, distinguindo o
   serviço no ar da dependência quebrada.
3. **Given** um consumidor excede o limite de requisições permitido, **When** faz a
   requisição seguinte, **Then** ela é recusada com indicação de excesso e de quando poderá
   tentar novamente.
4. **Given** uma requisição qualquer é processada, **When** o operador inspeciona os
   registros, **Then** encontra a rota, o resultado e a duração, sem dados sensíveis.

---

### Edge Cases

- **Página além do fim**: pedir uma página muito além do total retorna coleção vazia com o
  total correto, nunca erro.
- **Parâmetros de paginação inválidos**: valores não numéricos, negativos ou zero são
  rejeitados com erro de validação que nomeia o parâmetro ofensor.
- **ICAO com formato válido mas inexistente**: tratado como recurso não encontrado, não
  como erro de validação.
- **Identificador de procedimento com caracteres inesperados**: rejeitado na validação
  antes de qualquer consulta ao acervo.
- **Coordenadas ausentes**: aeródromos sem latitude ou longitude registradas são
  retornados normalmente, com os campos vazios explicitamente.
- **Rotina de coleta em execução**: leituras concorrentes com a coleta retornam o estado
  já confirmado no acervo, sem falhar nem devolver registros parciais.
- **Documento removido do repositório durante a validade do endereço temporário**: o
  consumidor recebe a falha do repositório de arquivos ao seguir o endereço; a aplicação
  não tem como reverter isso depois de encaminhar.
- **Acervo vazio**: todos os endpoints de coleção respondem com coleções vazias.

## Requirements *(mandatory)*

### Functional Requirements

#### Listagem de aeródromos

- **FR-001**: O sistema MUST expor um endpoint de leitura que retorne os aeródromos do
  acervo de forma paginada.
- **FR-002**: O sistema MUST aceitar parâmetros de página e de tamanho de página, aplicando
  o tamanho padrão de 20 itens quando omitido.
- **FR-003**: O sistema MUST limitar o tamanho de página a 100 itens e MUST rejeitar
  pedidos acima desse limite com erro de validação.
- **FR-004**: O sistema MUST retornar, junto de cada página, o total de registros que
  atendem ao critério e a indicação de existência de página seguinte.
- **FR-005**: O sistema MUST permitir filtrar a listagem por unidade federativa.
- **FR-006**: O sistema MUST permitir buscar por termo textual que corresponda ao código
  ICAO, ao nome ou à cidade do aeródromo, de forma insensível a maiúsculas e acentuação.
- **FR-007**: O sistema MUST retornar os aeródromos em ordem estável e previsível, de modo
  que percorrer todas as páginas não repita nem omita registros.
- **FR-008**: O sistema MUST omitir as pistas da listagem, reservando-as ao detalhe do
  aeródromo.

#### Detalhe do aeródromo

- **FR-009**: O sistema MUST expor um endpoint que retorne um aeródromo identificado pelo
  seu código ICAO.
- **FR-010**: O sistema MUST incluir no detalhe as pistas do aeródromo com identificação e
  dimensões, retornando coleção vazia quando não houver pistas registradas.
- **FR-011**: O sistema MUST tratar o código ICAO de forma insensível a maiúsculas e
  minúsculas.
- **FR-012**: O sistema MUST validar o formato do código ICAO antes de consultar o acervo e
  MUST distinguir erro de formato de recurso inexistente.

#### Procedimentos do aeródromo

- **FR-013**: O sistema MUST expor um endpoint que retorne os procedimentos de um aeródromo
  identificado pelo código ICAO.
- **FR-014**: O sistema MUST incluir, para cada procedimento, seu identificador, nome, tipo,
  emenda e a indicação de se o documento está disponível para consulta.
- **FR-015**: O sistema MUST permitir filtrar os procedimentos por tipo.
- **FR-016**: O sistema MUST responder com recurso não encontrado quando o aeródromo não
  existir, e com coleção vazia quando existir sem procedimentos.
- **FR-017**: O sistema MUST NOT expor a localização interna do arquivo no repositório de
  documentos.

#### Documento do procedimento

- **FR-018**: O sistema MUST expor um endpoint que dê acesso ao documento PDF de um
  procedimento.
- **FR-019**: O sistema MUST encaminhar o consumidor a um endereço de acesso direto ao
  repositório de documentos em vez de transmitir o conteúdo do arquivo através da própria
  aplicação.
- **FR-020**: O endereço de acesso direto MUST ter validade limitada de 5 minutos e MUST
  ser gerado a cada requisição.
- **FR-021**: O sistema MUST confirmar que o procedimento pertence ao aeródromo informado
  no caminho antes de conceder acesso ao documento.
- **FR-022**: O sistema MUST responder com recurso não encontrado quando o procedimento não
  tiver documento arquivado, com mensagem que o distinga de procedimento inexistente.
- **FR-023**: O sistema MUST registrar a falha e responder com erro compreensível quando o
  documento constar no acervo mas não estiver acessível no repositório.
- **FR-024**: O sistema MUST instruir os consumidores a não armazenarem em cache o
  encaminhamento em si, dado que o endereço de destino expira.

#### Contrato geral e operação

- **FR-025**: O sistema MUST expor apenas operações de leitura; nenhuma rota de escrita faz
  parte desta entrega.
- **FR-026**: O sistema MUST responder em formato JSON com estrutura de erro uniforme,
  contendo código identificável por máquina e mensagem legível por humanos.
- **FR-027**: O sistema MUST validar todos os parâmetros de caminho e de consulta,
  rejeitando os inválidos antes de acessar o acervo.
- **FR-028**: O sistema MUST permitir consumo a partir de navegadores em outras origens.
- **FR-029**: O sistema MUST expor um indicador de saúde que reflita a disponibilidade das
  suas dependências.
- **FR-030**: O sistema MUST limitar a taxa de requisições por consumidor e MUST informar
  quando o limite for excedido.
- **FR-031**: O sistema MUST registrar cada requisição com rota, resultado e duração, sem
  incluir credenciais ou dados sensíveis.
- **FR-032**: O sistema MUST publicar a descrição do seu contrato de forma consultável pelos
  consumidores.
- **FR-033**: O sistema MUST encerrar de forma ordenada, concluindo as requisições em curso
  antes de terminar.
- **FR-034**: O sistema MUST falhar na inicialização, com mensagem que liste todas as
  configurações ausentes de uma vez, quando faltar configuração obrigatória.
- **FR-035**: O sistema MUST NOT expor detalhes internos — rastreamentos de pilha, consultas
  ou nomes de infraestrutura — nas respostas de erro.

### Key Entities

- **Aeródromo**: local identificado por um código ICAO de quatro letras. Possui nome,
  cidade, unidade federativa e coordenadas geográficas, que podem estar ausentes. Agrega
  pistas e procedimentos.
- **Pista**: faixa de pouso de um aeródromo, identificada por sua designação e caracterizada
  por comprimento e largura, ambos possivelmente desconhecidos. Existe apenas no contexto de
  um aeródromo.
- **Procedimento**: carta de navegação publicada para um aeródromo. Tem identificador
  próprio, nome, tipo e emenda, e pode ter — ou não — um documento PDF arquivado.
- **Documento**: arquivo PDF de um procedimento, guardado no repositório de documentos. Sua
  localização interna é detalhe de infraestrutura e não integra o contrato público.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um consumidor obtém a primeira página de aeródromos em menos de 1 segundo com
  o acervo completo carregado.
- **SC-002**: 95% das consultas de listagem, detalhe e procedimentos respondem em menos de
  500 milissegundos.
- **SC-003**: O consumidor chega ao PDF de uma carta em no máximo dois passos a partir do
  pedido, e o volume de dados do documento não atravessa a aplicação em nenhum deles.
- **SC-004**: O consumo de memória e de banda da aplicação ao servir documentos permanece
  independente do tamanho dos PDFs — servir uma carta de 10 MB custa o mesmo que servir
  uma de 100 KB.
- **SC-005**: A aplicação sustenta 200 requisições simultâneas de leitura sem erros e sem
  que o tempo de resposta ultrapasse o dobro do medido sem carga.
- **SC-006**: Um desenvolvedor que nunca viu a API consegue listar aeródromos e abrir a
  carta de um procedimento em menos de 10 minutos, usando apenas a descrição publicada do
  contrato.
- **SC-007**: 100% das respostas de erro seguem a mesma estrutura e trazem um código
  identificável por máquina.
- **SC-008**: Percorrer todas as páginas da listagem devolve cada aeródromo do acervo
  exatamente uma vez.
- **SC-009**: Nenhuma resposta de erro expõe rastreamento de pilha, consulta ao repositório
  de dados ou nome de recurso de infraestrutura.

## Assumptions

- **Acesso público sem autenticação**: o acervo é de dados aeronáuticos públicos, então a
  API é aberta nesta entrega. O controle de abuso fica a cargo da limitação de taxa
  (FR-030). Autenticação e autorização são escopo futuro.
- **Somente leitura**: a alimentação do acervo é responsabilidade exclusiva da rotina de
  coleta já existente (`decea-crawler`). A API não cria, altera nem remove registros.
- **Acervo já populado**: a API pressupõe que a rotina de coleta já rodou. Com o acervo
  vazio, os endpoints respondem coleções vazias em vez de erro.
- **Repositório de documentos com endereços temporários**: assume-se que o repositório de
  arquivos compatível com S3 já em uso suporta gerar endereços de acesso temporário
  assinados — é o que viabiliza FR-019 e FR-020.
- **Validade de 5 minutos**: prazo escolhido por ser longo o bastante para o consumidor
  abrir o PDF logo após receber o encaminhamento, e curto o bastante para que o endereço
  vazado tenha pouca utilidade.
- **Encaminhamento em vez de intermediação**: a alternativa de a aplicação transmitir os
  bytes foi descartada; ela transformaria cada carta pedida em tráfego e memória do
  servidor, contrariando SC-004.
- **Estratégia de paginação**: paginação por número de página e tamanho, com total de
  registros, por ser o que o consumo típico de catálogo espera. O volume do acervo — na
  ordem de milhares de aeródromos — não justifica paginação por cursor.
- **Reuso do pacote de domínio**: a API consome o pacote de domínio existente para acessar
  o acervo, conforme já antecipado na documentação do repositório. A listagem paginada e a
  geração de endereços temporários são capacidades novas que os contratos atuais ainda não
  oferecem e que esta feature exige.
- **Sem cache próprio**: nesta entrega não há camada de cache na aplicação. Os tempos de
  SC-001 e SC-002 devem ser alcançados por consultas indexadas ao repositório de dados.
- **Ambiente local**: a API roda contra a mesma infraestrutura local já descrita no
  repositório — repositório de dados e repositório de documentos subidos por contêiner.
