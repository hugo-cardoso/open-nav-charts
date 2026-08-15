# Feature Specification: País do aeródromo e objeto `location` na API

**Feature Branch**: `feature/005-airport-location-country`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "@apps/jobs/src/jobs/decea-crawler/ deve salvar o país no banco também `country` com o valor "Brazil", a estrutura de resposta da @apps/api/ deve retornar um objeto `location`, com as informações do local do aeroporto (city, state, country, lat, long e etc). Em @apps/api/ deve ser possível filtrar os aeroportos por país também."

## Clarifications

### Session 2026-08-15

- Q: Cidade, UF, latitude e longitude devem sair do nível superior da resposta ou permanecer duplicados junto ao objeto `location` por compatibilidade? → A: Sair do nível superior; o objeto `location` passa a ser a única forma de acessá-los. A quebra de contrato é aceita.
- Q: O país deve ser gravado como nome textual ("Brazil") ou como código padronizado ISO 3166-1? → A: Código ISO 3166-1.
- Q: Qual formato de código ISO 3166-1 o acervo deve gravar para o país? → A: `alpha-2` — duas letras maiúsculas, ex.: `BR`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consumidor identifica o país de cada aeródromo (Priority: P1)

Quem consome o acervo hoje recebe cidade, UF e coordenadas, mas não sabe a que país o
aeródromo pertence. Como o acervo é alimentado por uma fonte brasileira, o país é conhecido,
porém nunca foi registrado nem publicado. O consumidor precisa que todo aeródromo do acervo
traga o país explicitamente, em código ISO 3166-1 alpha-2, para poder integrá-lo a bases
internacionais sem inferir a nacionalidade a partir do prefixo do código ICAO e sem casar
nomes de país por texto livre.

**Why this priority**: Sem o país registrado no acervo, nada mais desta feature existe —
nem a exibição na resposta, nem o filtro. É a base sobre a qual as outras duas histórias
se apoiam, e sozinha já entrega valor: a informação passa a existir e a ser mantida a cada
coleta.

**Independent Test**: Executar a rotina de coleta para um aeródromo qualquer e verificar
que o registro persistido passa a conter o país `BR`, sem alteração nos demais campos já
coletados.

**Acceptance Scenarios**:

1. **Given** um aeródromo ainda não presente no acervo, **When** a rotina de coleta o
   processa, **Then** o registro gravado contém o país `BR`.
2. **Given** um aeródromo já presente no acervo, gravado antes desta feature e portanto sem
   país, **When** a rotina de coleta o processa novamente, **Then** o registro passa a
   conter o país `BR` e os demais campos permanecem consistentes com a fonte.
3. **Given** um aeródromo cuja fonte não informa cidade, UF ou coordenadas, **When** a
   rotina de coleta o processa, **Then** o país `BR` é gravado mesmo assim, e a ausência
   dos demais campos continua sendo apenas registrada como aviso, sem interromper a rotina.
4. **Given** a rotina de coleta executada duas vezes seguidas sobre o mesmo aeródromo,
   **When** a segunda execução termina, **Then** o país gravado é o mesmo da primeira e
   nenhum registro é duplicado.

---

### User Story 2 - Consumidor recebe os dados de localização agrupados (Priority: P2)

O consumidor da API lê hoje cidade, UF, latitude e longitude como campos soltos no mesmo
nível do código ICAO e do nome. Com a chegada do país, esse conjunto cresce e fica difícil
de distinguir do restante da ficha. O consumidor precisa que todos os dados de localização
venham agrupados em um objeto `location`, para tratá-los como uma unidade — copiar, exibir
em um bloco de endereço ou alimentar um mapa — sem selecionar campo a campo.

**Why this priority**: É a forma como o dado do país chega a quem consome, e melhora a
legibilidade do contrato. Depende da História 1 para ter o país a exibir, mas o agrupamento
em si já entrega valor mesmo com os campos atuais.

**Independent Test**: Consultar a listagem paginada e a ficha de um aeródromo e verificar
que ambas trazem um objeto `location` com cidade, UF, país, latitude e longitude, e que
esses campos não aparecem mais soltos no nível superior.

**Acceptance Scenarios**:

1. **Given** um aeródromo com cidade, UF, país e coordenadas conhecidos, **When** o
   consumidor consulta a ficha do aeródromo, **Then** a resposta traz um objeto `location`
   contendo cidade, UF, país, latitude e longitude, e nenhum desses campos aparece
   duplicado no nível superior da resposta.
2. **Given** um aeródromo com cidade, UF, país e coordenadas conhecidos, **When** o
   consumidor consulta a listagem paginada, **Then** cada item da lista traz o mesmo objeto
   `location`, com o mesmo formato da ficha.
3. **Given** um aeródromo sem cidade, sem UF e sem coordenadas, **When** o consumidor o
   consulta, **Then** o objeto `location` está presente e cada campo ausente vem como nulo
   explícito, nunca omitido.
4. **Given** um aeródromo do acervo, **When** o consumidor consulta o documento de contrato
   publicado pela API, **Then** a estrutura descrita ali corresponde à resposta real,
   incluindo o objeto `location` e o campo de país.

---

### User Story 3 - Consumidor filtra o catálogo por país (Priority: P3)

O consumidor que integra o acervo a uma base multinacional precisa recortar o catálogo por
país, do mesmo modo que já recorta por UF, para carregar apenas o subconjunto que lhe
interessa sem paginar o acervo inteiro e descartar o resto do lado dele.

**Why this priority**: É a menos crítica das três: enquanto o acervo tiver um único país,
o filtro devolve tudo. Ele existe para que o contrato já esteja pronto quando outra fonte
for adicionada, e para uniformizar o recorte com o filtro de UF existente.

**Independent Test**: Consultar a listagem informando um código de país e verificar que o
total e os itens correspondem exatamente aos aeródromos daquele país; repetir com um código
sem aeródromos e verificar que a lista vem vazia.

**Acceptance Scenarios**:

1. **Given** um acervo com aeródromos do país `BR`, **When** o consumidor lista os
   aeródromos filtrando pelo país `BR`, **Then** todos os itens retornados pertencem a esse
   país e o total reflete apenas eles.
2. **Given** o mesmo acervo, **When** o consumidor filtra por um código de país válido mas
   sem aeródromos no acervo (por exemplo `PT`), **Then** a resposta é bem-sucedida, com
   lista vazia e total zero.
3. **Given** o mesmo acervo, **When** o consumidor combina o filtro de país com os filtros
   de UF e de busca textual já existentes, **Then** apenas os aeródromos que satisfazem
   todos os critérios simultaneamente são retornados.
4. **Given** o mesmo acervo, **When** o consumidor informa o código do país em caixa baixa
   (`br`), **Then** o resultado é o mesmo de quando informa a caixa exata (`BR`).
5. **Given** o mesmo acervo, **When** o consumidor informa um valor de país que não é um
   código de duas letras (por exemplo `Brazil` ou `BRA`), **Then** a resposta é uma recusa
   explícita com código de erro estável, no mesmo envelope de erro das demais recusas de
   parâmetro.

---

### Edge Cases

- Aeródromos gravados antes desta feature ficam sem país até serem processados novamente
  pela rotina de coleta. Nesse intervalo, a resposta traz o país nulo dentro de `location`
  e esses registros não aparecem em nenhum filtro de país.
- Filtro de país informado vazio, só com espaços, com número diferente de duas letras, ou
  contendo dígitos: recusado com erro de parâmetro, nunca tratado como "sem filtro".
- Código de duas letras bem formado mas não atribuído no padrão ISO 3166-1 (por exemplo
  `XX`): aceito pela validação de formato e tratado como "sem correspondência", devolvendo
  lista vazia. A API não mantém a tabela de códigos válidos.
- Consumidores existentes que leem `city`, `state`, `latitude` e `longitude` no nível
  superior da resposta deixam de encontrá-los: esta é uma quebra de contrato deliberada,
  confirmada em Clarifications e descrita em Assumptions.
- Aeródromo com coordenada parcial na fonte (apenas latitude ou apenas longitude): o
  comportamento atual é preservado — nenhuma das duas é gravada e um aviso é registrado —
  e o país continua sendo gravado normalmente.
- Filtro de país que casaria com registros de país nulo: nunca os inclui; ausência de país
  não é interpretada como pertencimento a nenhum país.

## Requirements *(mandatory)*

### Functional Requirements

#### Coleta e persistência

- **FR-001**: O acervo MUST registrar o país de cada aeródromo como um dado próprio,
  distinto de cidade e de UF, no formato de código ISO 3166-1 alpha-2 — duas letras
  maiúsculas.
- **FR-002**: A rotina de coleta do DECEA MUST gravar o país `BR` para todo aeródromo que
  processar, já que a fonte cobre exclusivamente o território brasileiro.
- **FR-003**: O código de país MUST ser gravado sempre em caixa alta, para que a comparação
  no acervo não dependa de normalização em tempo de consulta.
- **FR-004**: A gravação do país MUST ser idempotente: reprocessar o mesmo aeródromo não
  altera o valor já gravado nem duplica o registro.
- **FR-005**: A ausência de cidade, UF ou coordenadas na fonte MUST NOT impedir a gravação
  do país, e MUST continuar sendo apenas registrada como aviso na execução.
- **FR-006**: O país MUST ser tratado como opcional na estrutura do acervo, para que os
  registros anteriores a esta feature permaneçam válidos até serem reprocessados.

#### Resposta da API

- **FR-007**: A ficha do aeródromo MUST expor os dados de localização agrupados em um único
  objeto `location`, contendo cidade, UF, país, latitude e longitude.
- **FR-008**: A listagem paginada de aeródromos MUST expor o mesmo objeto `location`, com
  formato idêntico ao da ficha, em cada item.
- **FR-009**: Cidade, UF, latitude e longitude MUST NOT continuar sendo expostos como
  campos soltos no nível superior da resposta; a única forma de acessá-los passa a ser o
  objeto `location`.
- **FR-010**: O país MUST ser exposto na resposta como o mesmo código ISO 3166-1 alpha-2
  gravado no acervo, sem tradução para nome por extenso.
- **FR-011**: Todo campo de `location` sem valor conhecido MUST ser retornado como nulo
  explícito, nunca omitido da resposta.
- **FR-012**: O objeto `location` MUST estar sempre presente na resposta, mesmo quando
  todos os seus campos forem nulos.
- **FR-013**: O agrupamento MUST NOT expor nenhum dado que já não fosse público, e em
  particular MUST NOT incluir campos internos de persistência.

#### Filtro por país

- **FR-014**: A listagem de aeródromos MUST aceitar um filtro por país, informado como
  código ISO 3166-1 alpha-2 e aplicado sobre o conjunto completo do acervo antes da
  paginação.
- **FR-015**: O filtro por país MUST ser combinável com os filtros de UF e de busca textual
  já existentes, aplicando todos os critérios simultaneamente.
- **FR-016**: O filtro por país MUST ser insensível a caixa: `br` e `BR` produzem o mesmo
  resultado.
- **FR-017**: O total retornado na listagem MUST refletir o conjunto filtrado, não o acervo
  inteiro.
- **FR-018**: Um valor de país que não seja composto exatamente por duas letras MUST ser
  recusado com um código de erro estável e próprio, no mesmo envelope de erro usado pelos
  demais parâmetros, e MUST NOT ser silenciosamente ignorado.
- **FR-019**: A validação do filtro MUST ser de formato apenas; a API MUST NOT manter nem
  consultar a tabela de códigos ISO atribuídos, de modo que um código bem formado porém
  inexistente é tratado como ausência de correspondência, não como erro.
- **FR-020**: A validação do filtro MUST ocorrer antes de qualquer consulta ao acervo.
- **FR-021**: Um filtro de país sem correspondência no acervo MUST resultar em resposta
  bem-sucedida com lista vazia e total zero, nunca em erro.
- **FR-022**: Aeródromos sem país registrado MUST NOT ser incluídos no resultado de nenhum
  filtro de país.

#### Documentação do contrato

- **FR-023**: O documento de contrato publicado pela API MUST descrever o objeto `location`
  e o novo parâmetro de filtro por país, de forma coerente com a resposta real, explicitando
  que o país é um código ISO 3166-1 alpha-2.
- **FR-024**: O documento de contrato MUST listar o código de erro do filtro de país entre
  os erros possíveis da listagem.

### Key Entities

- **Aeródromo**: unidade do acervo, identificada pelo código ICAO. Passa a ter, além de
  nome, cidade, UF e coordenadas, o país a que pertence, representado pelo código ISO
  3166-1 alpha-2 em caixa alta. O país é opcional no acervo e preenchido pela rotina de
  coleta.
- **Localização do aeródromo**: agrupamento conceitual dos atributos que situam o aeródromo
  no espaço — cidade, UF, país, latitude e longitude. Não é um registro independente: é a
  forma como esses atributos do aeródromo são apresentados a quem consome a API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após uma execução completa da rotina de coleta, 100% dos aeródromos do acervo
  têm país registrado, e 100% dos valores gravados são códigos de duas letras em caixa alta.
- **SC-002**: 100% das respostas de aeródromo — tanto ficha quanto listagem — trazem o
  objeto de localização presente, com todos os seus campos, incluindo os nulos.
- **SC-003**: Filtrar o catálogo por país retorna exclusivamente aeródromos daquele país,
  sem falsos positivos e sem omissões, verificável comparando o total filtrado com a
  contagem do acervo para o mesmo país.
- **SC-004**: Um consumidor consegue descobrir o objeto de localização e o filtro por país
  lendo apenas o documento de contrato publicado, sem precisar inspecionar uma resposta
  real.
- **SC-005**: A alteração não degrada o tempo de resposta da listagem: consultas com o novo
  filtro respondem na mesma faixa das consultas já filtradas por UF.
- **SC-006**: Nenhum campo que já não fosse público passa a ser exposto pela nova estrutura
  de resposta.

## Assumptions

- O valor do país é fixo, o código `BR`. A descrição original pedia o literal "Brazil", mas
  a decisão registrada em Clarifications adota o código ISO 3166-1 alpha-2 em seu lugar: o
  código é estável, livre de acentuação e de variação de idioma, e casa com o filtro de UF
  de duas letras já existente. A rotina de coleta não deriva o valor da fonte, porque o
  DECEA cobre exclusivamente o território brasileiro.
- A reestruturação da resposta é uma quebra de contrato confirmada em Clarifications:
  cidade, UF, latitude e longitude deixam de existir no nível superior. Como a API é
  pública e somente leitura, sem consumidores contratados conhecidos, opta-se pela
  estrutura limpa em vez de manter os campos duplicados nos dois níveis. A mudança MUST ser
  sinalizada como *breaking change* nos artefatos da feature — pela constituição, com `!`
  após o escopo do commit e a migração descrita no plano, já que rodapés são proibidos.
- O "e etc." da descrição é interpretado como o conjunto de dados de localização hoje
  existentes — cidade, UF, país, latitude e longitude. Nenhum atributo novo de localização
  (fuso horário, elevação, região) entra no escopo desta feature.
- A API valida apenas o formato do código de país (duas letras), sem manter a tabela de
  códigos ISO atribuídos. Embutir e versionar essa tabela custaria mais do que entrega:
  um código bem formado e inexistente já se comporta corretamente como conjunto vazio.
- O país permanece opcional no acervo mesmo depois desta feature, porque os registros
  anteriores só o recebem ao serem reprocessados. Torná-lo obrigatório exigiria uma
  migração de dados, que está fora do escopo.
- Registros anteriores a esta feature não são migrados por comando dedicado: eles ganham o
  país na próxima execução da rotina de coleta, que já é idempotente e reprocessa o acervo.
- O acervo permanece exclusivamente brasileiro nesta feature. O filtro por país é preparado
  para múltiplos países, mas nenhuma nova fonte de dados é adicionada aqui.
- A rotina de coleta e a API continuam sendo os únicos componentes afetados; o pacote de
  domínio compartilhado é ajustado apenas no que for necessário para sustentar os dois.
