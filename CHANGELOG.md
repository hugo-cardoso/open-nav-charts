# Changelog

Todas as alterações notáveis deste projeto são registradas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere
ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.6.0] - 2026-08-16

O acervo ganha uma interface própria: uma aplicação web que torna as cartas consultáveis por
pessoas, sem exigir o consumo direto da API.

### Adicionado

- **Aplicação web** (`apps/web`), em React com Mantine e Vite, servida como arquivos estáticos
  e consumindo apenas a API pública. Somente leitura: não cria nem altera dados do acervo.
- **Tela inicial** que apresenta o produto e o acervo disponível, e leva ao painel de busca em
  um acionamento. Não consulta a API, então fica completa mesmo em conexão lenta.
- **Busca por código ICAO com autocomplete**: a partir de duas letras, os aeródromos cujo
  código começa pelo termo são sugeridos com código, nome e localidade. Escolher uma sugestão
  abre diretamente a tela do aeródromo. A busca considera apenas o código — um termo que
  corresponda somente ao nome não produz sugestão.
- **Seletor de país** que restringe as sugestões, apresentando os países por nome em vez de
  código. O acervo hoje contém apenas aeródromos do Brasil.
- **Tela do aeródromo** com nome, código, localidade, coordenadas e pistas, além dos
  procedimentos publicados.
- **Procedimentos agrupados em abas** por natureza — chegada (STAR), aproximação (IAC e VAC),
  solo (ADC, AGMC e PDC) e saída (SID) —, cada uma distinguida por cor. Tipos fora desse
  agrupamento são recolhidos em um grupo adicional, para que nenhum procedimento fique
  inalcançável. As abas do agrupamento aparecem mesmo vazias, de modo que sua posição seja
  idêntica em todo aeródromo, e uma aba sem conteúdo informa a ausência ao ser aberta.
- **Abertura da carta em nova aba**, com o endereço assinado resolvido no momento do clique.
  Uma carta aberta muito depois de a lista carregar continua funcionando, e o painel já
  carregado permanece intacto. Procedimentos sem documento arquivado não oferecem abertura.
- **Estado de consulta no endereço**: país selecionado e aba ativa vivem na URL, então
  recarregar ou compartilhar o endereço restaura o mesmo conteúdo, e o "voltar" do navegador
  percorre os passos reais da consulta.

### Notas

- Os textos da interface são em inglês, por decisão de produto — o público-alvo lê cartas e
  fraseologia nesse idioma. É exceção registrada ao Princípio VI da constituição, com escopo
  restrito às cadeias visíveis ao usuário final; documentação, comentários e mensagens de
  commit permanecem em português do Brasil.
- Os procedimentos de um aeródromo são buscados uma única vez e mantidos em cache sem
  expiração: o acervo é publicado em ciclos AIRAC de 28 dias e não muda durante uma sessão,
  então trocar de aba ou voltar ao aeródromo não gera tráfego novo.
- Duas dependências estão deliberadamente abaixo da versão mais recente porque as atuais
  exigem uma versão de Node acima da fixada pelo projeto, o que falha a instalação:
  `react-router` permanece na 7.x e `jsdom` na 29.x.
- Nenhuma alteração na API foi necessária.

## [0.5.1] - 2026-08-15

A API passa a escutar na porta que a plataforma de hospedagem designa, e não em uma porta própria.

### Corrigido

- A verificação de saúde falhava na implantação enquanto o domínio público respondia normalmente.
  A configuração lia apenas `API_PORT`, então a API subia na porta padrão `3000`; o roteamento
  público descobre sozinho a porta em uso e por isso funcionava, mas a verificação de saúde bate
  em `PORT` — a variável que a plataforma injeta — onde não havia ninguém escutando. `PORT` passa
  a ser lida e tem precedência sobre `API_PORT`, que segue valendo para o ambiente local. Uma
  `PORT` malformada é recusada na inicialização, em vez de silenciosamente cair no valor de
  `API_PORT`.
- O servidor passa a se vincular explicitamente a `0.0.0.0`. O comportamento efetivo não muda
  — era o padrão que o Node já aplicava —, mas deixa de depender dele.

## [0.5.0] - 2026-08-15

O acervo passa a registrar o país de cada aeródromo, e a API agrupa os dados de localização em um
objeto próprio, em vez de espalhá-los pelo nível superior da resposta.

### Adicionado

- Coluna `country` na tabela `airport` (código ISO 3166-1 alpha-2, anulável), com índice próprio.
  A rotina `decea-crawler` grava `BR` a cada coleta, independentemente de cidade, unidade
  federativa e coordenadas estarem presentes — o DECEA cobre exclusivamente o Brasil, então o país
  é conhecido mesmo quando o resto falta. A migration `0002` retroalimenta o acervo já gravado, de
  modo que o filtro por país responde sem esperar uma coleta completa.
- Filtro `country` em `GET /v1/airports`: recorta o catálogo por código de duas letras, insensível
  a caixa, combinável com `state`, `search` e a paginação. O `total` reflete o conjunto filtrado.
  A validação é de formato apenas: um código bem formado porém não atribuído no padrão ISO (`XX`)
  responde 200 com lista vazia, e não erro — a API não mantém a tabela de códigos atribuídos.
  Aeródromo sem país registrado nunca entra no resultado de um filtro de país.
- Erro `INVALID_COUNTRY` (400) para `country` que não seja exatamente duas letras.

### Alterado

- **BREAKING** — `city`, `state`, `latitude` e `longitude` **deixam de existir no nível superior**
  das respostas de aeródromo. Passam a viver dentro do objeto `location`, junto do novo campo
  `country`. Afeta `GET /v1/airports` (cada item de `items`) e `GET /v1/airports/:icao`; as rotas
  de procedimentos e de carta não mudam.
  - **Impacto**: `airport.city` vira `airport.location.city`, e assim para `state`, `latitude` e
    `longitude`. `icao`, `name` e `runways` permanecem onde estavam.
  - `location` está **sempre presente**, ainda que todos os seus campos sejam nulos, e campo sem
    valor continua saindo como `null` explícito — o consumidor nunca precisa checar a existência
    da chave.
  - O país é exposto como código, sem tradução para nome por extenso.
- Contrato publicado em `GET /docs` atualizado: `query.country`, `INVALID_COUNTRY` entre os erros
  da listagem, o novo formato de `location` na ficha do aeródromo e um passo do roteiro rápido
  exercitando o filtro por país.

## [0.4.0] - 2026-08-15

A rotina passa a sinalizar seu desfecho de forma que um agendador externo entenda: só falha o que
exige intervenção no ambiente.

### Alterado

- **BREAKING** — Código de saída da CLI `open-nav-charts-jobs`: uma execução concluída **com
  falhas de itens** agora sai com `0` (sucesso), e não mais com `1`. O código `1` passa a
  significar exclusivamente **erro inesperado**. A motivação é o painel do agendador (Railway),
  que só distingue sucesso de falha: uma carta indisponível na fonte marcava a rotina inteira como
  falha, escondendo os problemas que realmente exigem ação. Os itens que falharam continuam
  visíveis no resumo final e nos logs.
  - **Impacto**: quem lê o código de saída para detectar "houve alguma falha de item" precisa
    passar a ler o resumo da execução. A tabela completa está em `apps/jobs/README.md`.
  - Os demais códigos não mudam: `2` configuração ou rotina inexistente, `3` dependência
    indisponível, `130` interrompida por sinal.
- A constituição do projeto passa a exigir português do Brasil em toda comunicação escrita
  (comentários, documentação, mensagens de commit, PRs e specs), mantendo o código em inglês.
  Acrescenta também duas regras de commit: mensagem de linha única, sem corpo nem rodapés, e
  proibição de atribuir autoria ou coautoria a modelos de IA.
- Resíduos de português europeu revisados na documentação e em comentários de código. A passagem
  da 0.2.1 não cobria as specs em `specs/` nem os textos escritos depois dela: "artefactos" vira
  "artefatos", "registo" vira "registro", "corre/correm" viram "roda/rodam", "está a ser repetido"
  vira "está sendo repetido" e "deteção" vira "detecção". Nenhuma mudança de comportamento.

## [0.3.0] - 2026-08-15

A primeira interface de leitura do acervo: uma API REST que publica em HTTP o catálogo de
aeródromos e as cartas IFR que a rotina `decea-crawler` já coletava.

### Adicionado

- `@open-nav-charts/api` (`apps/api`): API REST somente leitura sobre o acervo, em Express 5.
  Seis endpoints — catálogo paginado com filtro por unidade federativa e busca textual
  (`GET /v1/airports`), detalhe do aeródromo com pistas (`GET /v1/airports/:icao`), relação de
  procedimentos (`GET /v1/airports/:icao/procedures`), acesso ao PDF da carta
  (`GET /v1/airports/:icao/procedures/:id/chart`), indicador de saúde (`GET /health`) e o
  contrato publicado (`GET /docs`). Nenhuma rota de escrita e nenhuma autenticação.
- A rota da carta **não transporta o documento**: responde `302` para uma URL pré-assinada do
  bucket, válida por 5 minutos e gerada a cada requisição. A assinatura é local, então o custo
  de servir uma carta independe do tamanho do PDF.
- Busca insensível a maiúsculas **e a acentuação**: "galeao", "Galeao" e "GALEÃO" encontram
  "Galeão". A normalização é feita em JavaScript e gravada na coluna `search_text`, sem exigir
  extensão do PostgreSQL nem privilégio de `CREATE EXTENSION`.
- Envelope de erro único em toda falha — `{ "error": { "code", "message" } }` — com código
  estável legível por máquina e mensagem em português do Brasil. Distingue casos que o
  consumidor precisa separar: formato de ICAO inválido (`400`) de ICAO inexistente (`404`), e
  procedimento sem documento (`CHART_NOT_AVAILABLE`) de procedimento de outro aeródromo
  (`PROCEDURE_NOT_FOUND`).
- Borda com `helmet`, CORS liberado para leitura pública e limitação de 120 requisições por
  minuto e por IP, com `Retry-After`. O `/health` fica isento, para que a verificação não seja
  bloqueada por tráfego de consumidores.
- Encerramento ordenado em `SIGTERM`/`SIGINT`: conclui as requisições em curso, com limite de
  10 segundos, e só então fecha o pool do banco e o cliente S3.
- `@open-nav-charts/domain`: listagem paginada com filtro e busca (`AirportRepository.list`),
  resolução de procedimento por id (`AirportProcedureRepository.findById`) e verificação de
  conectividade (`Database.ping`). Migração aditiva `0001` acrescenta a coluna `search_text`,
  com backfill do acervo existente.
- `@open-nav-charts/object-storage`: `presignGetUrl` no contrato `ChartStorage`. O SDK do S3
  continua confinado ao pacote — a API recebe a interface e nunca vê `@aws-sdk`.
- Variáveis `API_PORT` e `API_LOG_LEVEL`, ambas com padrão. As credenciais da AISWEB **não**
  são lidas pela API.

### Corrigido

- Uma conexão ociosa derrubada pelo servidor — o que o PostgreSQL faz ao reiniciar, com
  `terminating connection due to administrator command` — emitia um evento `error` não tratado
  no pool e matava o processo inteiro. Um serviço de longa duração precisa sobreviver a isso:
  agora o pool descarta a conexão quebrada, a saúde reporta `503 degraded` enquanto o banco
  está fora e volta sozinha a `200` quando ele retorna.

### Notas

- A rotina `decea-crawler` **não foi alterada**. A coluna `search_text` é preenchida por baixo,
  na mesma função por onde toda escrita de aeródromo já passava.
- Validado contra o acervo real a 2026-08-15: 4439 aeródromos e as 43 cartas de SBGL coletadas
  do DECEA. O redirect entregou o PDF de 791 KB sem que os bytes atravessassem a aplicação, e o
  bucket rejeita com `403` uma assinatura adulterada.
- Latência medida com 5000 aeródromos: p95 de 0,7 ms na primeira página e 2,0 ms na busca — três
  ordens de grandeza abaixo do alvo de 500 ms. A adoção de `pg_trgm`, prevista como contingência,
  não foi necessária.
- O limitador de taxa guarda o estado em memória, por processo. Com mais de uma instância o
  limite efetivo se multiplica; é aceito nesta entrega, que pressupõe instância única.

## [0.2.1] - 2026-08-15

### Alterado

- Toda a documentação, comentários de código e descrições de teste passam a usar português do
  Brasil. Parte do texto herdado da versão 0.1.0 estava em português europeu, e os textos escritos
  na 0.2.0 seguiram essa variante por consistência local. Nenhuma mudança de comportamento:
  apenas vocabulário e construções ("arquivo" no lugar de "ficheiro", "executar" no lugar de
  "correr", "gerenciador" no lugar de "gestor", "banco de dados" no lugar de "base de dados",
  entre outros).

## [0.2.0] - 2026-08-15

O primeiro código de produção do repositório: um host de rotinas operacionais e a rotina que
coleta o catálogo de aeródromos e cartas IFR do DECEA.

### Adicionado

- `@open-nav-charts/jobs` (`apps/jobs`): host de rotinas operacionais executáveis por linha de
  comando, com registro de rotinas, validação de configuração na inicialização, progresso contínuo,
  resumo final e códigos de saída distintos (`0` limpo, `1` com falhas, `2` configuração
  inválida, `3` dependência indisponível, `130` interrompido).
- Rotina `decea-crawler`: coleta da API AISWEB do DECEA todos os aeródromos do tipo `AD` com
  coordenadas e pistas, as cartas IFR correspondentes, e arquiva os PDFs em `<ICAO>/<id>.pdf` em um
  bucket compatível com S3. Pagina de 100, processa 4 aeródromos em simultâneo e repete cada
  aeródromo até 3 vezes em falha transitória. Reexecutar é idempotente.
- `@open-nav-charts/domain` (`packages/domain`): entidades `Airport`, `AirportRunway` e
  `AirportProcedure`, interfaces de repositório e persistência em PostgreSQL com Drizzle, com
  migrações SQL versionadas. É o pacote que a futura API REST vai consumir.
- `@open-nav-charts/aisweb-client` (`packages/aisweb-client`): único ponto que conhece o XML,
  as credenciais e os nomes de campo da AISWEB. Classifica os erros da fonte em retentáveis,
  definitivos e de autenticação.
- `@open-nav-charts/object-storage` (`packages/object-storage`): abstração do bucket S3 com
  chave determinística e validação da assinatura `%PDF-` antes de gravar.
- Ambiente local com `docker compose up -d`: PostgreSQL 17 e MinIO com o bucket já criado, e
  `.env.example` com as nove variáveis documentadas.
- `pnpm test:integration`: testes contra PostgreSQL e MinIO efêmeros via Testcontainers,
  isolados do `pnpm test`, que continua rodando sem rede e sem Docker.
- Documentação de utilização em `apps/jobs/README.md` (host, configuração, códigos de saída,
  como acrescentar uma rotina) e em `apps/jobs/src/jobs/decea-crawler/README.md` (opções da
  rotina, pipeline e peculiaridades da fonte).

### Removido

- Pacotes de referência `@open-nav-charts/core` (`packages/core`) e `@open-nav-charts/cli`
  (`apps/cli`). Existiam apenas para provar o esqueleto do monorepo ponta a ponta na versão
  0.1.0 e cumpriram esse propósito; nenhum código de produção dependia deles. Foram substituídos
  pelos pacotes do coletor do DECEA, listados acima.

### Notas

- Validado contra a AISWEB real a 2026-08-15: 4439 dos 4441 aeródromos publicados foram
  coletados (99,95%), em 45 páginas e cerca de 10 minutos com `--skip-documents`. As duas
  falhas são aeródromos que constam na listagem mas cujo detalhamento a fonte devolve vazio.
- A fonte publica o tipo de carta `AGMC`, ausente das 13 siglas conhecidas da espécie IFR. As
  cartas são persistidas na mesma e a rotina emite um alerta — a fonte é a autoridade. Convém
  confirmar a sigla com o DECEA.
- A fonte publica pistas repetidas em alguns aeródromos, uma das ocorrências com dimensões
  espúrias. O coletor deduplica mantendo a de maior comprimento; sem isso, o índice único
  `(airport_icao, ident)` derrubaria a gravação do aeródromo inteiro.
- Correr a rotina exige credenciais da AISWEB, pedidas no portal do DECEA, e um PostgreSQL e um
  bucket compatível com S3 — ambos sobem com `docker compose up -d`.

## [0.1.0] - 2026-08-14

Primeira versão: o esqueleto estrutural do monorepo. Não há ainda lógica de domínio de cartas
náuticas — esta versão entrega a base sobre a qual ela será construída.

### Adicionado

- Monorepo pnpm com workspaces em `packages/` (bibliotecas) e `apps/` (aplicações),
  Node.js 22 fixado em `.nvmrc` e `engines.node`, e pnpm como único gerenciador suportado.
- Configuração compartilhada na raiz, herdada por todos os pacotes: `biome.json` para lint e
  formatação, `tsconfig.base.json` com TypeScript em modo estrito, e `vitest.shared.ts` para
  testes. Um pacote novo fica coberto pelos três portões sem alterar a raiz.
- Comandos agregadores executáveis a partir da raiz — `lint`, `lint:fix`, `format`,
  `typecheck`, `test`, `test:watch`, `test:coverage`, `build` — e o portão de pré-merge
  `check`, que encadeia lint, build, tipos e testes, abortando na primeira falha.
- `@open-nav-charts/core`: biblioteca de referência com `formatCoordinate`, que formata
  coordenadas geográficas em graus decimais com hemisférios explícitos.
- `@open-nav-charts/cli`: aplicação de referência que consome o core via `workspace:*`,
  exercitando a fronteira entre pacotes do workspace.
- Documentação da feature em `specs/001-monorepo-skeleton/`: especificação, plano, pesquisa,
  modelo de dados, contratos e guia de validação com 14 cenários.
- `README.md` cobrindo instalação, comandos, estrutura e criação de novos pacotes.

### Alterado

- Constituição do projeto para 1.1.0: adota GitFlow como modelo de ramificação, fixando
  `main` e `develop` como permanentes e definindo os prefixos `feature/*`, `release/*` e
  `hotfix/*`.

### Notas

- O bloqueio a gerenciadores de pacotes não suportados funciona — `npm install` falha e não gera
  lockfile —, mas o npm quebra ao resolver o protocolo `workspace:*` antes de executar o
  hook `preinstall`, então a mensagem exibida é um erro interno do npm em vez da mensagem
  do `only-allow`.
