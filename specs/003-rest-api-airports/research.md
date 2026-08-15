# Research: API REST de Aeródromos e Cartas

**Feature**: `003-rest-api-airports` | **Data**: 2026-08-15

Decisões técnicas tomadas antes do desenho. Cada uma responde a uma incógnita do Technical
Context do [plan.md](./plan.md) ou a um requisito da [spec.md](./spec.md) que os pacotes
atuais ainda não atendem.

---

## R1 — Framework HTTP: Express 5

**Decisão**: Express 5.2 como framework do novo app `apps/api`.

**Rationale**: Pedido explicitamente pelo usuário. A versão 5 é a estável atual e resolve o
atrito que motivava wrappers na versão 4: rejeições de `Promise` em handlers `async` passam
automaticamente ao middleware de erro, o que dispensa um `asyncHandler` em cada rota e torna
o tratamento de erro uniforme exigido por FR-026 uma peça só. Roda em Node 22 e não conflita
com nenhuma restrição da constituição, que não fixa framework de backend.

**Alternativas consideradas**:

- **Fastify**: mais rápido em benchmarks sintéticos e com validação de schema embutida.
  Rejeitado por contrariar o pedido do usuário; o ganho de throughput é irrelevante diante
  de SC-005 (200 requisições simultâneas), cujo gargalo é o banco, não o roteador.
- **Express 4**: rejeitado por exigir wrapper manual de `async` em toda rota.

---

## R2 — Otimização do documento: redirect 302 para URL pré-assinada

**Decisão**: `GET /airports/:icao/procedures/:id/chart` responde **302 Found** com `Location`
apontando para uma URL pré-assinada (presigned URL) do bucket, válida por 5 minutos, gerada
a cada requisição. O pacote `@aws-sdk/s3-request-presigner` (mesma versão da linha
`@aws-sdk` já usada, 3.1111.0) assina a URL localmente, sem chamada de rede.

**Rationale**: Atende FR-019, FR-020 e SC-004. A assinatura é uma operação de CPU sobre a
chave e as credenciais — nenhum byte do PDF atravessa a aplicação, então servir uma carta de
10 MB custa o mesmo que servir uma de 100 KB. Como o SDK do S3 já é dependência do
`object-storage`, o presigner acrescenta apenas o módulo de assinatura.

Detalhes que decorrem da escolha:

- **302 e não 301**: o destino muda a cada requisição (assinatura nova), então o redirect
  não pode ser permanente. Acompanha `Cache-Control: no-store` (FR-024) para impedir que
  navegador ou proxy guardem um `Location` que vai expirar.
- **MinIO**: implementa SigV4 e valida URLs pré-assinadas como a AWS. Com
  `S3_FORCE_PATH_STYLE=true` a URL assinada sai no formato path-style, coerente com o
  ambiente local já descrito no `docker-compose.yml`.
- **Endpoint público**: em MinIO local, `S3_ENDPOINT` é acessível pelo cliente. Em produção
  o endpoint do bucket precisa ser alcançável de fora — se um dia deixar de ser, a
  configuração ganha um endpoint público separado, sem mudar o desenho.

**Alternativas consideradas**:

- **Proxy dos bytes (`stream` do S3 para a resposta)**: rejeitado. Cada carta pedida vira
  tráfego de entrada e de saída da aplicação, e com concorrência alta o consumo de memória
  e de banda cresce com o tamanho dos PDFs — exatamente o que SC-004 proíbe.
- **Bucket público com URL direta na listagem**: dispensaria o endpoint, mas expõe a
  estrutura interna de chaves (proibido por FR-017), remove qualquer ponto de controle
  (contagem, limitação de taxa, futura autorização) e torna o acervo inteiro enumerável.
- **CDN à frente do bucket**: melhor resposta para o consumidor final, mas acrescenta
  infraestrutura que o projeto ainda não tem. O redirect é compatível com essa evolução:
  troca-se o host assinado sem alterar o contrato da rota.

---

## R3 — Extensão de `ChartStorage` para URLs pré-assinadas

**Decisão**: acrescentar ao contrato `ChartStorage` (em `packages/object-storage`) o método
`presignGetUrl(key: string, expiresInSeconds: number): Promise<string>`, implementado em
`S3ChartStorage` via `getSignedUrl` do presigner e exposto por `createChartStorage`.

**Rationale**: O contrato atual — `buildKey`, `exists`, `put`, `delete` — foi desenhado para
a rotina de escrita e não tem nenhuma operação de leitura. Estender o contrato existente
mantém o SDK do S3 confinado ao pacote de armazenamento, como a documentação do próprio
`s3-client-factory.ts` estabelece ("o SDK do S3 não vaza para fora deste pacote"). A API
recebe a interface por injeção e nunca vê `@aws-sdk`.

Consequência para a API: ela depende de `@open-nav-charts/object-storage`, o que contraria a
frase do README de que "`domain` é o único pacote que a futura API REST vai consumir". Essa
previsão foi feita antes de existir o requisito de redirecionamento; a alternativa seria
duplicar a lógica de assinatura na API, o que é pior. **O README deve ser corrigido nesta
feature.**

**Alternativas consideradas**:

- **Interface nova e separada (`ChartUrlSigner`) no mesmo pacote**: evitaria que a rotina de
  coleta enxergasse um método que não usa. Rejeitado por criar duas abstrações sobre o mesmo
  recurso; um método a mais na interface é mais simples que um segundo contrato paralelo.
- **A API montar o cliente S3 diretamente**: rejeitado — espalha o SDK por dois pacotes e
  quebra o encapsulamento já estabelecido.

---

## R4 — Listagem paginada, filtro e busca no repositório

**Decisão**: acrescentar a `AirportRepository` o método
`list(query: AirportListQuery): Promise<AirportPage>`, com `AirportListQuery` cobrindo
`page`, `pageSize`, `state` e `search`, e `AirportPage` devolvendo `items` e `total`.
Implementado em `DrizzleAirportRepository` com `limit`/`offset`, ordenação por `icao` e uma
contagem em consulta separada.

**Rationale**: FR-001 a FR-008 não são atendíveis pelos métodos atuais (`findByIcao`,
`listByState`). A ordenação por `icao` — chave primária, portanto única e total — satisfaz
FR-007 e SC-008: percorrer as páginas não repete nem omite registros, o que uma ordenação
por nome (não único) não garantiria.

A listagem **não carrega pistas** (FR-008), o que a torna uma única consulta a `airport`,
sem o segundo `select` e o agrupamento em memória que `listByState` faz. `listByState`
permanece intocado — é usado pela rotina existente.

**Alternativas consideradas**:

- **Paginação por cursor (keyset)**: mais eficiente em offsets grandes e imune a
  deslocamento por escrita concorrente. Rejeitada pelo volume: o acervo do DECEA tem ordem
  de milhares de aeródromos, então o maior offset possível é pequeno e o `total` que o
  consumidor de catálogo espera (FR-004) sairia de graça. Registrado como evolução caso o
  acervo cresça de ordem.
- **`COUNT(*) OVER ()` na mesma consulta**: uma ida ao banco em vez de duas. Rejeitado por
  fazer o Postgres calcular o total em cada linha da página e por complicar o mapeamento; o
  ganho é irrelevante nesta escala.

---

## R5 — Busca textual insensível a acentuação

**Decisão**: normalização feita **inteiramente em JavaScript**, sem nenhuma extensão do
PostgreSQL. A migração acrescenta uma coluna comum `search_text` em `airport`, que o próprio
pacote `domain` preenche ao gravar com a concatenação de `icao`, `name` e `city` já
normalizada. A consulta aplica a **mesma** função de normalização ao termo de busca e compara
com `LIKE '%termo%'`.

A normalização é uma função pura, compartilhada entre escrita e leitura:

```ts
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
```

**Rationale**: FR-006 exige insensibilidade a maiúsculas **e** a acentuação. Sem
normalização, `LIKE '%sao%'` não encontra "São Paulo" — e nomes de cidades brasileiras são
cheios de acentos, então a busca falharia justamente nos casos mais comuns, contra um usuário
que digita sem acento em campo de busca.

Fazer isso em JavaScript em vez de no banco elimina a única parte frágil do plano: não há
`CREATE EXTENSION` (que pode ser negado em PostgreSQL gerenciado), não há coluna gerada e não
há o wrapper `immutable_unaccent` que a coluna gerada exigiria — `unaccent` não é declarada
`IMMUTABLE` pelo PostgreSQL, então uma coluna gerada sobre ela não compila sem esse
contorno. `normalize("NFD")` é do próprio ECMAScript, cobre todos os diacríticos latinos e
não acrescenta dependência alguma.

**Consequência**: como a coluna não é mais gerada pelo banco, alguém precisa preenchê-la ao
gravar. Isso fica dentro de `saveAirportWith`, em `packages/domain` — a mesma função que a
rotina `decea-crawler` já chama. **A rotina de coleta não muda**: ela continua chamando
`save`/`syncAirport` e a coluna é preenchida por baixo. Um teste de integração garante que
gravar um aeródromo acentuado o torna encontrável pelo termo sem acento.

**Reindexação do acervo existente**: a migração preenche `search_text` das linhas já gravadas
com um `UPDATE` que faz a normalização em SQL — `lower()` mais um `translate()` com o mapa
de caracteres acentuados usados em português. É um passo único da migração, não código de
produção; a partir daí toda escrita passa pela função em JavaScript.

**Índice**: `search_text text_pattern_ops`. Ele acelera prefixo (`termo%`), não o curinga à
esquerda (`%termo%`) usado aqui — para isso seria preciso `pg_trgm`, deliberadamente
descartada. Na escala do acervo (milhares de aeródromos) a varredura sequencial sobre uma
coluna curta responde bem dentro de SC-002. **Ponto de verificação**: medir o tempo da busca
com o acervo completo; se ultrapassar o previsto, a resposta é adotar `pg_trgm` ou passar a
busca a prefixo, não abandonar a normalização.

**Medição realizada** (2026-08-15, T062 — PostgreSQL 17 em contêiner, acervo sintético de
5000 aeródromos, p95 de 20 amostras):

| Consulta | p95 |
|----------|-----|
| Primeira página (`pageSize=20`) | 0,7 ms |
| Página 100 (offset 1980) | 0,8 ms |
| Filtro por unidade federativa | 0,7 ms |
| Busca `%termo%` sem acento | 2,0 ms |
| Busca por cidade acentuada | 2,2 ms |

A busca com curinga à esquerda custa cerca de três vezes a listagem simples, como previsto,
mas fica três ordens de grandeza abaixo de SC-002 (500 ms). **Conclusão**: `pg_trgm` não é
necessária; a decisão original se sustenta. O ponto de verificação está encerrado — reabri-lo
só faz sentido se o acervo crescer de ordem de grandeza.

**Alternativas consideradas**:

- **`unaccent` + `pg_trgm` + coluna gerada**: mais robusta e a única que indexa bem o curinga
  à esquerda. Rejeitada pelo custo de implantação desproporcional ao ganho: duas extensões,
  um wrapper `IMMUTABLE` e dependência de permissão de `CREATE EXTENSION`, tudo para uma
  tabela de poucos milhares de linhas.
- **`to_tsvector` / busca full-text**: casa palavras inteiras — "Guarul" não encontraria
  "Guarulhos". Rejeitada por não servir à busca incremental de catálogo.
- **Filtrar em memória**: quebra a paginação no banco e o custo cresce com o acervo.
- **Sem tratamento de acento**: rejeitado por descumprir FR-006.

---

## R6 — Validação de entrada: Zod

**Decisão**: Zod 4 para validar parâmetros de caminho e de consulta, em um middleware que
converte o `ZodError` no formato de erro uniforme de FR-026.

**Rationale**: Já é dependência de `apps/jobs` e do `aisweb-client`; reusar mantém uma única
biblioteca de validação no monorepo. Os parâmetros de consulta chegam sempre como string,
e o `coerce`/`transform` do Zod resolve a conversão para número junto com a validação de
limites (FR-002, FR-003) numa declaração só. O mesmo schema documenta o contrato.

**Alternativas consideradas**:

- **`express-validator`**: idiomático em Express, mas seria uma segunda biblioteca de
  validação no repositório sem ganho sobre o Zod.
- **Validação manual**: rejeitada por espalhar conversão e verificação de limites por todos
  os handlers.

---

## R7 — Estrutura em camadas e aderência ao Princípio III

**Decisão**: três camadas, todas em classes com dependências recebidas por construtor:

- **Rotas/controladores**: traduzem HTTP em chamadas de serviço e serviço em resposta HTTP.
  Não contêm regra alguma.
- **Serviços** (`AirportService`, `ProcedureService`, `ChartService`): a regra de negócio —
  normalização de ICAO, verificação de pertencimento do procedimento ao aeródromo (FR-021),
  distinção entre "sem documento" e "inexistente" (FR-022), decisão de assinar a URL.
- **Repositórios/armazenamento**: as interfaces já existentes em `domain` e
  `object-storage`, recebidas por injeção.

O grafo é montado por uma `CompositionRoot`, espelhando `apps/jobs/src/composition-root.ts`.

**Rationale**: O Princípio III exige orientação a objetos com injeção por construtor e
proíbe estado global. Com serviços recebendo interfaces, os testes unitários usam dublês em
memória — sem banco, sem rede, sem monkey-patching — o que satisfaz o Princípio IV
(determinismo). Concentrar a regra no serviço mantém o controlador trivial e permite testar
FR-021 e FR-022 sem levantar servidor HTTP.

**Alternativas consideradas**:

- **Handlers de rota acessando o repositório direto**: menos camadas, mas a regra de
  pertencimento e a distinção de erros ficariam presas ao HTTP, testáveis só de ponta a
  ponta. Rejeitado por contrariar o Princípio III.
- **Funções em vez de classes nos serviços**: proibido para backend pelo Princípio III.

---

## R8 — Formato de erro, logs e observabilidade

**Decisão**: corpo de erro uniforme `{ "error": { "code": "...", "message": "..." } }`, com
`code` em `SCREAMING_SNAKE_CASE` estável e `message` em português do Brasil. Um middleware
de erro final converte exceções conhecidas em respostas e qualquer exceção não prevista em
`500` com corpo genérico, sem detalhe interno (FR-035). Logs em JSON estruturado emitidos
por um logger próprio e injetado, com rota, status e duração (FR-031).

**Rationale**: FR-026 e SC-007 exigem estrutura única com código legível por máquina; o
código estável permite ao cliente reagir programaticamente sem depender do texto. Concentrar
a conversão em um único middleware é o que garante que nenhuma rota vaze rastreamento de
pilha (FR-035, SC-009).

Logger próprio em vez de biblioteca: o volume de logs desta API é uma linha por requisição,
e `pino` traria uma dependência e um transporte para um problema que `JSON.stringify` sobre
`console` resolve — coerente com a cláusula de simplicidade da governança. A interface
injetada permite trocar por `pino` depois sem tocar nas rotas.

**Alternativas consideradas**:

- **RFC 7807 (`application/problem+json`)**: padrão formal, mas o consumidor previsto é um
  cliente próprio; o formato mais enxuto atende SC-007 com menos cerimônia.
- **`pino` + `pino-http`**: rejeitado nesta entrega pelo motivo acima. Registrado como
  evolução se o volume crescer.

---

## R9 — Limitação de taxa e segurança de borda

**Decisão**: `express-rate-limit` com limite por endereço IP, respondendo `429` com
`Retry-After`; `helmet` para cabeçalhos de segurança; `cors` liberado para leitura pública.

**Rationale**: FR-030 exige limitação de taxa, e a implementação correta envolve janelas
deslizantes e cabeçalhos padronizados que não compensam reescrever. `helmet` e `cors` são
uma linha cada e cobrem FR-028 e parte de FR-035. Como a API é pública e sem autenticação
(premissa da spec), a limitação por IP é o único controle de abuso disponível.

**Ressalva**: o armazenamento em memória do limitador é por processo. Com mais de uma
instância, o limite efetivo se multiplica. Aceitável nesta entrega (instância única);
migrar para armazenamento compartilhado é evolução conhecida.

**Alternativas consideradas**:

- **Limitação no proxy reverso**: mais correta em produção, mas depende de infraestrutura
  que o projeto ainda não define, e deixaria FR-030 sem cobertura verificável em teste.

---

## R10 — Indicador de saúde

**Decisão**: `GET /health` executa `SELECT 1` no banco e responde `200` com
`{ status: "ok" }` ou `503` com `{ status: "degraded", checks: {...} }`, distinguindo o
processo no ar da dependência quebrada.

**Rationale**: FR-029 e os cenários da História 5. O bucket **não** entra na verificação: a
API nunca lê o bucket (só assina URLs localmente), então sua indisponibilidade não impede a
API de responder — incluí-lo produziria alarme falso.

**Alternativas consideradas**:

- **Saúde estática (`200` fixo)**: rejeitada — não distingue os dois cenários exigidos.
- **Incluir o bucket com uma chamada real**: rejeitada pelo motivo acima e por acrescentar
  latência de rede a um endpoint que orquestradores chamam com frequência.

---

## R11 — Encerramento ordenado

**Decisão**: `server.close()` em `SIGTERM`/`SIGINT`, aguardando as requisições em curso, e só
então fechando o pool do banco e o cliente S3 pela `CompositionRoot.close()`. Um tempo
limite de 10 segundos força a saída se alguma conexão não encerrar.

**Rationale**: FR-033. O tempo limite existe porque `server.close()` espera indefinidamente
por conexões *keep-alive* ociosas, o que travaria a reimplantação.

---

## R12 — Estratégia de testes

**Decisão**: três níveis, seguindo o que `apps/jobs` já faz.

| Nível | Alvo | Ferramenta |
|-------|------|------------|
| Unitário | Serviços, validação, mapeamento para resposta | Vitest + dublês em memória |
| Contrato HTTP | Rotas, status, forma do corpo, erros | Vitest + `supertest` sobre a instância Express |
| Integração | Repositório novo contra Postgres real | Vitest + Testcontainers (`vitest.integration.config.ts`) |

**Rationale**: O Princípio IV exige Vitest, determinismo e testes de integração para
mudanças em APIs públicas de pacotes — o que a extensão de `AirportRepository` e de
`ChartStorage` é. `supertest` permite exercer a aplicação Express sem abrir porta,
mantendo os testes de contrato determinísticos e rápidos.

A assinatura de URL é testada verificando a **forma** da URL gerada (host, chave, parâmetros
de expiração), nunca acessando o bucket pela rede.
