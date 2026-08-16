# Feature Specification: Aplicação web de consulta a cartas

**Feature Branch**: `feature/006-frontend-charts-spa`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Crie um app frontend SPA que faça o consumo da api. Este app deve ter uma tela inicial (LP), e um link para acessar o painel de busca. Neste painel deve ser possível buscar os aeroportos, procedimentos e abrir a carta do procedimento. Use o Mantine (https://mantine.dev/) para construção da interface. O código deve ser em inglês, porém os textos da interface devem ser em ingles. A aplicação precisa ser responsiva."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar um aeródromo e abrir a carta de um procedimento (Priority: P1)

Um piloto precisa da carta de aproximação de um aeródromo antes de um voo. Ele abre a
aplicação, vai ao painel de busca, digita as primeiras letras do código ICAO e reconhece o
aeródromo certo entre as sugestões que aparecem. Ao escolher a sugestão, a aplicação abre a
tela daquele aeródromo com os procedimentos publicados, agrupados por tipo. Ele identifica
o procedimento desejado e o abre — o documento da carta é apresentado para leitura.

**Why this priority**: É a razão de existir do produto. Sem este caminho completo, o
acervo permanece inacessível a quem não consome a API diretamente. Entregue sozinho, já
é um produto utilizável de ponta a ponta.

**Independent Test**: Pode ser testado integralmente partindo do painel de busca vazio,
digitando um código ICAO conhecido, escolhendo a sugestão correspondente, selecionando um
procedimento que possua documento e confirmando que a carta é aberta e legível.

**Acceptance Scenarios**:

1. **Given** o painel de busca sem termo digitado, **When** o usuário digita ao menos duas
   letras de um código ICAO do acervo, **Then** os aeródromos cujo código começa por essas
   letras aparecem como sugestões, cada uma com código, nome e localidade.
2. **Given** a lista de sugestões, **When** o usuário escolhe uma delas, **Then** a
   aplicação abre diretamente a tela daquele aeródromo, com seus procedimentos publicados
   agrupados por tipo.
3. **Given** a lista de procedimentos de um aeródromo, **When** o usuário abre um
   procedimento que possui documento disponível, **Then** a carta é apresentada em uma
   nova aba do navegador, sem sair do painel de busca já carregado.
4. **Given** um procedimento cujo documento não está disponível no acervo, **When** o
   usuário visualiza a lista de procedimentos, **Then** o procedimento é exibido com
   indicação clara de que a carta não está disponível e sua abertura não é oferecida.
5. **Given** um código sem correspondência no acervo, **When** a consulta é concluída,
   **Then** a aplicação informa que nenhum aeródromo foi encontrado, em vez de exibir uma
   área vazia sem explicação.

---

### User Story 2 - Conhecer o produto pela tela inicial (Priority: P2)

Uma pessoa que chega à aplicação pela primeira vez, sem saber o que ela faz, encontra uma
tela inicial que explica em poucas linhas qual acervo está disponível e a quem serve. A
partir dessa tela ela alcança o painel de busca com um único acionamento.

**Why this priority**: Dá contexto e credibilidade ao produto e é o ponto de entrada
público, mas quem já conhece a ferramenta pode ir direto ao painel. Depende da existência
do painel para ter destino, por isso vem depois da P1.

**Independent Test**: Pode ser testado abrindo o endereço raiz da aplicação, verificando
que a proposta do produto é compreensível sem conhecimento prévio e que o acionamento de
acesso leva ao painel de busca.

**Acceptance Scenarios**:

1. **Given** um visitante no endereço raiz da aplicação, **When** a tela inicial carrega,
   **Then** ele vê o nome do produto, uma descrição do acervo disponível e um acionamento
   visível para o painel de busca.
2. **Given** a tela inicial, **When** o visitante aciona o acesso ao painel, **Then** o
   painel de busca é exibido pronto para receber um termo.

---

### User Story 3 - Restringir a busca e percorrer os procedimentos (Priority: P3)

Um usuário que opera em um país específico o seleciona uma vez, e as sugestões de código
passam a considerar apenas aeródromos de lá. Já dentro de um aeródromo, ele percorre os
procedimentos por grupo — chegada, aproximação, solo, saída — em vez de rolar uma lista
única com dezenas de cartas de naturezas diferentes.

**Why this priority**: Melhora a leitura de acervos densos, mas a P1 já entrega o caminho
até a carta. É refinamento, não fundação.

**Independent Test**: Pode ser testado selecionando um país sem aeródromos no acervo e
confirmando que um código conhecido deixa de ser sugerido, e abrindo um aeródromo com
procedimentos de tipos distintos para percorrer suas abas.

**Acceptance Scenarios**:

1. **Given** um país selecionado, **When** o usuário digita um código de aeródromo de outro
   país, **Then** ele não aparece entre as sugestões.
2. **Given** nenhum país selecionado, **When** o usuário digita um código, **Then** as
   sugestões abrangem todo o acervo.
3. **Given** um aeródromo com procedimentos de tipos distintos, **When** o usuário escolhe
   um grupo, **Then** apenas os procedimentos daquele grupo são exibidos.
4. **Given** um aeródromo sem nenhum procedimento de um dos grupos, **When** a tela é
   exibida, **Then** o grupo aparece assim mesmo, sinalizado como vazio, e sua abertura
   informa a ausência em vez de exibir área em branco.

---

### User Story 4 - Retomar e compartilhar uma consulta (Priority: P3)

Um usuário que chegou à lista de procedimentos de um aeródromo copia o endereço da página
e o envia a um colega, que abre o link e vê exatamente o mesmo aeródromo. O mesmo usuário
aciona o botão "voltar" do navegador e retorna ao passo anterior da sua consulta.

**Why this priority**: Comportamento esperado de qualquer aplicação web; sua ausência é
percebida como defeito. Ainda assim, a consulta funciona sem ele.

**Independent Test**: Pode ser testado navegando até um aeródromo, recarregando a página
pelo endereço atual e confirmando que o mesmo conteúdo é restaurado.

**Acceptance Scenarios**:

1. **Given** a lista de procedimentos de um aeródromo, **When** a página é recarregada
   pelo endereço atual, **Then** o mesmo aeródromo e seus procedimentos são exibidos.
2. **Given** uma navegação de tela inicial → painel → aeródromo, **When** o usuário aciona
   "voltar", **Then** ele retorna ao passo imediatamente anterior.
3. **Given** um endereço que aponta para um aeródromo inexistente no acervo, **When** a
   página é aberta, **Then** a aplicação informa que o aeródromo não foi encontrado e
   oferece caminho de volta à busca.

---

### Edge Cases

- **Busca sem resultados**: mensagem explícita de "nenhum resultado", distinta do termo
  ainda curto demais para consultar e distinta de uma falha.
- **Grupo de procedimentos vazio**: a aba do grupo é exibida assim mesmo, sinalizada, e
  informa a ausência ao ser aberta — a posição das abas não muda entre aeródromos.
- **Aeródromo sem procedimentos**: o aeródromo existe mas nada foi publicado para ele; a
  aplicação informa a ausência em vez de exibir uma lista vazia.
- **Entrada fora do formato ICAO**: dígitos e símbolos não chegam a virar consulta; o campo
  aceita apenas letras, até o comprimento de um código.
- **Acervo indisponível**: quando a consulta ao acervo falha, a aplicação informa a falha
  e oferece nova tentativa, preservando o termo já digitado.
- **Documento de carta indisponível no momento da abertura**: o procedimento indicava
  documento disponível, mas a abertura falha; o usuário recebe aviso e a lista permanece
  utilizável.
- **Link de carta expirado**: o endereço do documento tem validade limitada; reabrir a
  carta a partir da aplicação produz um documento válido, sem exigir recarga da página.
- **Buscas em rápida sucessão**: digitação contínua não pode fazer um resultado antigo
  sobrescrever um mais recente na tela.
- **Dados incompletos do aeródromo**: cidade, estado, país ou coordenadas ausentes são
  omitidos com elegância, sem exibir espaços vazios rotulados nem textos como "null".
- **Telas estreitas**: em larguras a partir de 320 px, filtros, resultados e listas
  permanecem acessíveis sem rolagem horizontal.

## Requirements *(mandatory)*

### Functional Requirements

#### Navegação e estrutura

- **FR-001**: A aplicação MUST oferecer uma tela inicial pública que apresente o produto,
  descreva o acervo disponível e contenha um acionamento visível para o painel de busca.
- **FR-002**: A aplicação MUST oferecer um painel de busca alcançável a partir da tela
  inicial e diretamente por endereço próprio.
- **FR-003**: Cada estado significativo de consulta — painel de busca, aeródromo
  selecionado — MUST possuir endereço próprio, de modo que recarregar ou compartilhar o
  endereço restaure o mesmo conteúdo.
- **FR-004**: Os controles de histórico do navegador ("voltar" e "avançar") MUST percorrer
  os passos da consulta na ordem em que foram realizados.
- **FR-005**: Um endereço desconhecido MUST resultar em uma tela que informa a situação e
  oferece caminho de retorno ao painel de busca.

#### Busca de aeródromos

- **FR-006**: Usuários MUST poder localizar aeródromos pelo código ICAO, com sugestões
  apresentadas a partir de duas letras digitadas. Apenas o código é considerado: um termo
  que corresponda somente ao nome do aeródromo MUST NOT produzir sugestão.
- **FR-007**: Cada sugestão MUST exibir, no mínimo, o código ICAO, o nome do aeródromo e
  sua localidade, quando esta estiver disponível.
- **FR-008**: A aplicação MUST permitir restringir as sugestões a um país, escolhido em uma
  lista que apresenta os países por nome, não por código.
- **FR-009**: A escolha de uma sugestão MUST levar diretamente à tela do aeródromo
  correspondente, sem etapa intermediária de listagem.
- **FR-010**: A aplicação MUST distinguir visualmente três situações da área de sugestões:
  termo ainda curto demais para consultar, consulta em andamento e consulta sem
  correspondências.
- **FR-011**: A aplicação MUST preservar o país selecionado ao retornar da tela de um
  aeródromo para o painel de busca.
- **FR-012**: Quando o usuário digita continuamente, a aplicação MUST exibir sempre as
  sugestões correspondentes ao termo mais recente, ainda que consultas anteriores sejam
  concluídas depois.

#### Procedimentos e cartas

- **FR-013**: Ao selecionar um aeródromo, a aplicação MUST exibir seus procedimentos
  publicados, cada um identificado por nome e tipo.
- **FR-014**: A aplicação MUST agrupar os procedimentos de um aeródromo por natureza —
  chegada, aproximação, solo e saída — apresentando os grupos como abas distinguíveis por
  cor. Os grupos MUST ser exibidos mesmo quando vazios, para que sua posição seja idêntica
  em todo aeródromo, e uma aba vazia MUST informar a ausência ao ser aberta. Tipos que não
  pertençam a nenhum grupo previsto MUST ser recolhidos em um grupo adicional, exibido
  apenas quando houver algum.
- **FR-015**: A aplicação MUST indicar, para cada procedimento, se o documento da carta
  está disponível, e MUST NOT oferecer abertura para procedimentos sem documento.
- **FR-016**: Usuários MUST poder abrir o documento da carta de um procedimento que o
  possua; o documento é apresentado em uma nova aba do navegador, preservando intacto o
  painel de busca já carregado.
- **FR-017**: A abertura de uma carta MUST resolver o endereço do documento no momento do
  acionamento, de forma que reabrir a mesma carta após um intervalo prolongado continue
  funcionando sem recarregar a aplicação.
- **FR-018**: A aplicação MUST exibir os dados do aeródromo selecionado — nome, código
  ICAO, localidade e pistas, quando disponíveis — junto à lista de procedimentos.

#### Comunicação de estado e falhas

- **FR-019**: Toda espera por dados MUST ser sinalizada ao usuário enquanto durar.
- **FR-020**: Falhas de consulta ao acervo MUST produzir mensagem compreensível em
  linguagem de usuário, sem expor detalhes técnicos, e MUST oferecer nova tentativa.
- **FR-021**: Uma nova tentativa após falha MUST preservar o termo de busca e os filtros
  já informados pelo usuário.
- **FR-022**: Termos ou filtros recusados pelo acervo MUST produzir orientação de
  correção dirigida ao campo correspondente.
- **FR-023**: Campos ausentes nos dados de um aeródromo MUST ser omitidos da exibição, sem
  rótulos órfãos nem representações internas de valor vazio.

#### Apresentação

- **FR-024**: Todo texto visível ao usuário MUST estar em inglês.
- **FR-025**: A aplicação MUST ser utilizável em larguras de tela a partir de 320 px até
  monitores de mesa, sem rolagem horizontal do conteúdo e sem elementos sobrepostos.
- **FR-026**: Os acionamentos primários — buscar, selecionar aeródromo, abrir carta — MUST
  ser operáveis por toque em telas pequenas e por teclado em telas de mesa.
- **FR-027**: A aplicação MUST consumir exclusivamente a API pública de aeródromos e
  procedimentos do projeto, sem acesso direto ao acervo de dados ou ao repositório de
  documentos.

### Key Entities

- **Aeródromo**: local de pouso e decolagem identificado por um código ICAO de quatro
  letras. Possui nome, localidade (cidade, estado, país, coordenadas — todos podendo estar
  ausentes) e uma lista de pistas. É a unidade pela qual o usuário navega até as cartas.
- **Pista**: superfície de pouso de um aeródromo, identificada por um designador, com
  comprimento e largura que podem estar ausentes.
- **Procedimento**: rotina publicada de navegação associada a um aeródromo, identificada
  por nome e tipo, podendo ter uma emenda. Pode ou não ter um documento de carta
  disponível no acervo.
- **Carta**: documento que representa graficamente um procedimento. É obtida por um
  endereço de validade limitada, resolvido no momento da abertura.
- **Consulta**: termo de busca e filtros ativos que definem o conjunto de resultados
  exibido. É refletida no endereço da página para permitir retomada e compartilhamento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário que conhece o código ICAO alcança a carta desejada em no máximo
  três acionamentos a partir da tela inicial — acessar a busca, escolher a sugestão e abrir
  a carta.
- **SC-002**: 95% das consultas por código ICAO exibem as sugestões correspondentes em
  menos de 2 segundos em conexão de banda larga.
- **SC-003**: A tela inicial fica visualmente completa em menos de 3 segundos em uma
  conexão móvel de 3G rápido.
- **SC-004**: 90% dos usuários de primeira viagem, sem instrução prévia, concluem a tarefa
  de abrir uma carta a partir de um código ICAO fornecido.
- **SC-005**: Todos os fluxos permanecem completáveis em larguras de 320 px, 768 px e
  1440 px, sem rolagem horizontal e sem elementos inacessíveis.
- **SC-006**: Todo estado de espera, ausência de resultado e falha exibe uma mensagem
  específica da situação; nenhuma tela em branco sem explicação ocorre nos fluxos das
  histórias de usuário.
- **SC-007**: Os fluxos das histórias P1 e P2 são integralmente operáveis por teclado, com
  foco sempre visível.
- **SC-008**: Recarregar a página em qualquer estado de consulta das histórias de usuário
  restaura o mesmo conteúdo exibido antes da recarga.

## Assumptions

- **Acesso público**: o acervo é de consulta pública; a aplicação não possui cadastro,
  autenticação nem áreas restritas nesta versão.
- **Idioma da interface**: confirmado com o solicitante como inglês, apesar do Princípio VI
  da constituição fixar pt-BR — a exceção vale para textos do produto voltados ao público
  final, dado que o inglês é a língua de trabalho da aviação; documentação, comentários,
  specs e mensagens de commit permanecem em pt-BR. A exceção deve ser registrada no plano
  da feature conforme a seção "Governança" da constituição.
- **Sem multi-idioma**: não há seletor de idioma nem infraestrutura de tradução nesta
  versão; a interface é monolíngue.
- **Abertura da carta**: confirmado com o solicitante que a carta abre em nova aba,
  delegando leitura, zoom e impressão ao visualizador nativo do navegador; um visualizador
  embutido está fora do escopo desta versão.
- **API existente**: a aplicação depende da API REST de aeródromos e procedimentos já
  entregue na feature `003-rest-api-airports`, incluindo a busca textual, o filtro de país,
  a listagem de procedimentos e a resolução do endereço da carta. Nenhuma alteração na API
  é prevista por esta feature.
- **Sem rota de autocomplete**: a API não expõe endpoint dedicado a sugestões. A busca de
  aeródromos existente atende ao caso com uma requisição, e o recorte "apenas código ICAO"
  é feito na aplicação, já que a API casa código **e** nome no mesmo parâmetro. Um endpoint
  próprio só se justificaria para mudar o comportamento da consulta — busca por prefixo no
  acervo ou ranqueamento que priorize o código —, não para reduzir o tamanho da resposta.
- **Catálogo de países fixo**: a lista de países é declarada na aplicação, não derivada do
  acervo nem obtida da API. O acervo hoje contém apenas aeródromos do Brasil, então as
  demais opções não produzem resultado até que a coleta seja ampliada.
- **Sem filtro por unidade federativa**: a API aceita restringir por estado, mas a tela de
  busca não expõe esse filtro; apenas código ICAO e país são oferecidos.
- **Sem escrita**: a aplicação é exclusivamente de leitura; não cria nem altera dados do
  acervo.
- **Sem trabalho offline**: consulta ao acervo exige conexão; funcionamento offline e
  instalação como aplicativo estão fora do escopo.
- **Navegadores-alvo**: versões atuais dos navegadores de mercado, em desktop e móvel;
  navegadores sem suporte do fabricante estão fora do escopo.
- **Volume do acervo**: da ordem de milhares de aeródromos e dezenas de procedimentos por
  aeródromo, compatível com listagem paginada de aeródromos e listagem integral de
  procedimentos.
- **Sem mapa**: as coordenadas do aeródromo, quando presentes, são exibidas como dado
  textual; representação cartográfica está fora do escopo desta versão.
