# Phase 0 — Research: Coletor de aeroportos e cartas IFR do DECEA

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-14

Este documento resolve as incógnitas técnicas levantadas no *Technical Context* do plano. Cada
item registra a decisão, o motivo e as alternativas descartadas.

## Fonte primária de evidência

A documentação pública da API AISWEB (portal DECEA e coleção Postman) não expõe o esquema das
respostas sem credenciais. A evidência mais confiável disponível é o projeto Python do próprio
autor, [`hugo-cardoso/onc-crawler-python`](https://github.com/hugo-cardoso/onc-crawler-python),
que já consumiu esses endpoints em produção. Os fontes foram lidos integralmente e são a base das
decisões R1–R4. Onde o projeto Python não cobre o requisito (campos `tipo`, `emenda` e `link`, que
ele não coletava), a decisão é explicitamente marcada como **a confirmar contra a API real** e
acompanhada de estratégia defensiva.

---

## R1. Contrato da API AISWEB — endpoints e parâmetros

**Decisão**: Um único endpoint base `https://aisweb.decea.mil.br/api/`, com a área selecionada por
query string, autenticado por `apiKey` + `apiPass`. Três chamadas compõem a rotina:

| Uso | Parâmetros | Retorno relevante |
|-----|-----------|-------------------|
| Listar aeródromos | `area=rotaer`, `type=AD`, `rowstart=<offset>`, `rowend=<tamanho>` | `<rotaer total="N">` com itens contendo `AeroCode` |
| Detalhar aeródromo | `area=rotaer`, `icaoCode=<ICAO>` | `AeroCode`, `name`, `city`, `uf`, `lat`, `lng`, `runways/runway[ident,length,width]` |
| Listar cartas | `area=cartas`, `icaoCode=<ICAO>`, `especie=IFR` | `<cartas total="N">` com `item[id, tipo, nome, amdt, link, ...]` |

**Rationale**: Confirmado linha a linha em `services/decea_api_service.py`. O atributo `total` do
elemento `rotaer` é a fonte do número de páginas — não há cursor nem `next`.

**Ponto de atenção herdado**: o projeto Python calcula as páginas com
`int(count / items_per_page)`, o que **descarta a última página parcial** (ex.: 4.550 aeródromos →
45 páginas, perdendo 50 registros). Esta implementação usa `Math.ceil` e adicionalmente encerra a
paginação quando uma página retorna vazia, satisfazendo o cenário 3 da História 1 e o edge case de
catálogo que muda durante a varredura.

**Alternativas consideradas**: Endpoint REST/JSON moderno — não existe; a AISWEB é XML-only.
Scraping do portal — mais frágil e sem contrato, descartado.

---

## R2. Campos das cartas e o filtro IFR — **confirmado contra resposta real**

**Status**: resolvido. O autor forneceu uma resposta real de `area=cartas` para SBGL (43 cartas) e
a semântica do filtro. Não há mais suposição neste item.

**Decisão**: Mapear os campos pelos nomes reais observados e aplicar o filtro IFR **exclusivamente
pelo parâmetro `especie=IFR` na origem**, sem refiltro local por tipo.

| Campo do domínio | Elemento XML | Observação |
|------------------|--------------|------------|
| `id` | `<id>` | UUID sem hífen no último grupo (ex.: `e0d1c9f2-6564-4465-8f57eb1708fa53f1`). Também presente como atributo `id` do `<item>` |
| `name` | `<nome>` | Envolto em `CDATA` |
| `type` | `<tipo>` | Sigla: `IAC`, `SID`, `STAR`, `VAC`, `ADC`, `AOC`, `PDC`… |
| `amendment` | `<amdt>` | **Não** `<emenda>` — ver abaixo |
| `source_url` | `<link>` | URL absoluta em `CDATA`, com `&amp;` a desescapar |

**Descoberta 1 — o campo de emenda é `<amdt>`, não `<emenda>`.** Existe um atributo `emenda` no
elemento `<cartas>` (ex.: `emenda="2026-08-06"`), mas ele é a **data da emenda AIRAC vigente do
conjunto**, não a emenda da carta individual. A emenda por carta está em `<amdt>` (ex.: `2601A1`,
`2512A1`). Usar o atributo do envelope gravaria o mesmo valor em todas as cartas, perdendo o dado
que o FR-012 pede.

**Descoberta 2 — o parâmetro de filtro é `especie`, não `tipo`.** A chamada correta é
`especie=IFR`. O parâmetro `tipo` seleciona a sigla da carta (`IAC`, `SID`…), que é outra dimensão.

**Descoberta 3 — o refiltro local por `tipo` é impossível, e a espécie IFR inclui 13 tipos.** A
espécie IFR compreende `ADC, AOC, ARC, ATCSMAC, GMC, IAC, LC, OTR, PATC, PDC, SID, STAR, VAC`. O
campo `<especie>` da resposta vale `Convencionais` em todos os itens — ou seja, **a resposta não
ecoa a espécie consultada**. Como um mesmo `tipo` (notadamente `VAC`) existe tanto na espécie IFR
quanto na VFR, nenhum campo da resposta permite reclassificar localmente. O parâmetro é a única
fonte da distinção.

**Consequência para o FR-011**: a garantia de "somente cartas IFR" passa a repousar inteiramente no
parâmetro enviado. Uma allow-list local de tipos foi **rejeitada**: além de não separar IFR de VFR
(ambas contêm `VAC`), ela descartaria silenciosamente qualquer tipo novo que o DECEA venha a
publicar dentro da espécie IFR — perda de dado por omissão, o pior modo de falha aqui.

Em vez disso, a defesa é **observabilidade**: o coletor registra a distribuição de `tipo` por
execução e alerta no relatório quando surgir um tipo fora dos 13 conhecidos. O dado é persistido
normalmente (a fonte é a autoridade); o alerta apenas avisa que a lista de referência envelheceu.

**Verificação de coerência**: os 7 tipos observados na amostra (`IAC`, `SID`, `STAR`, `ADC`, `AOC`,
`VAC`, `PDC`) estão todos entre os 13 da espécie IFR, e a amostra foi obtida com `especie=IFR` —
consistente com o filtro tendo sido honrado pela API.

**Alternativas consideradas**: Parser tolerante com nomes candidatos — não é mais necessário, os
nomes estão confirmados; mantê-lo seria complexidade sem incerteza a cobrir. Allow-list de tipos —
rejeitada acima. Confiar no parâmetro sem qualquer instrumentação — rejeitada, deixaria uma
eventual mudança de contrato da API invisível até alguém notar cartas VFR no banco.

---

## R3. Download do PDF da carta

**Decisão**: Usar o campo `link` da resposta como URL do documento, e recorrer à URL derivada do
identificador (`https://aisweb.decea.mil.br/download/?arquivo=<id>&apikey=<key>`) apenas como
fallback quando `link` vier ausente ou vazio. Validar que o conteúdo baixado começa com a
assinatura `%PDF-` e tem tamanho maior que zero antes de enviar ao bucket.

**Rationale**: A spec determina o uso do campo `link` (é o dado publicado pela fonte, e portanto o
mais correto). A URL derivada é o que o projeto Python usava e serve de rede de segurança. A
verificação de assinatura implementa FR-019 — um HTTP 200 devolvendo uma página de erro HTML é
falha, não sucesso, e sem essa checagem o bucket acumularia lixo silenciosamente.

**Alternativas consideradas**: Confiar no `Content-Type` do cabeçalho — insuficiente, servidores
mal configurados devolvem `text/html` para PDFs válidos e vice-versa.

---

## R4. Coordenadas e pistas do ROTAER — **confirmado contra resposta real**

**Status**: resolvido. Resposta real de `area=rotaer&icaoCode=SBGL` fornecida pelo autor.

**Decisão**: Consumir `<lat>` e `<lng>`, que **já vêm em graus decimais com sinal**, persistidos em
`numeric(9,6)`. Nenhum conversor sexagesimal é necessário no caminho principal.

```xml
<lat>-22.81</lat>
<lng>-43.250555555556</lng>
<latRotaer>22 48 36S</latRotaer>
<lngRotaer>043 15 02W</lngRotaer>
```

**Descoberta 1 — há dois pares de coordenadas.** `<lat>`/`<lng>` em decimal com sinal (negativo
para S e W) e `<latRotaer>`/`<lngRotaer>` em sexagesimal com sufixo hemisférico. Usamos o par
decimal: é diretamente persistível e não exige *parsing*. O par sexagesimal fica como fallback
apenas se o decimal vier ausente.

**Descoberta 2 — a precisão excede a coluna.** `-43.250555555556` tem 12 casas decimais;
`numeric(9,6)` guarda 6, arredondando para `-43.250556`. Isso equivale a ~0,1 m de erro no
equador — irrelevante para posicionar um aeródromo, e a coluna permanece adequada.

**Descoberta 3 — a estrutura de pistas é mais rica que o previsto.** `<runways count="2">` traz,
por `<runway>`: `<type>` (`RWY`), `<ident>` (`10/28`), `<surface>` (`CONC`, `ASPH`),
`<length>`, `<width>`, `<surface_c>` (PCN, ex.: `78/R/A/W/T`), além de `<lights>` e `<thr>`
(cabeceiras com suas luzes). O modelo desta feature persiste apenas `ident`, `length` e `width`,
conforme a spec; `surface` e `surface_c` são candidatos naturais a uma feature futura e ficam
registrados aqui para não se perderem.

**Descoberta 4 — `length` e `width` vêm em metros e como inteiros** (`4000`, `45`), confirmando o
tipo `integer` do modelo. Os elementos trazem um atributo `compl=""` que é ignorado.

**Nota**: `<name>` e `<city>` vêm em `CDATA` com acentuação (`Galeão - Antônio Carlos Jobim`), o
que exige leitura correta de UTF-8 e desembrulho de `CDATA` — o mesmo tratamento já necessário nos
campos das cartas.

**Alternativas consideradas**: Converter a partir de `latRotaer`/`lngRotaer` — desnecessário
tendo o decimal pronto, e adicionaria um parser sujeito a erro de sinal. PostGIS — mantida a
rejeição anterior; `numeric` continua suficiente.

---

## R5. Persistência — ORM e migrações

**Decisão**: **Drizzle ORM 0.45** com **drizzle-kit 0.31** para migrações SQL versionadas, sobre o
driver `pg` com pool criado pela aplicação e injetado no repositório.

**Rationale**: Três razões, em ordem de peso constitucional:
1. **Princípio III (injeção por construtor)**: Drizzle não gerencia o pool de conexões — a
   aplicação cria e injeta. Prisma embute o gerenciamento no cliente gerado, empurrando para
   singleton implícito, que o Princípio III proíbe.
2. **Princípio IV (testes determinísticos)**: o query builder do Drizzle é substituível por dublê
   tipado sem biblioteca auxiliar; mockar o cliente gerado do Prisma exige `prisma-mock` ou
   equivalente, adicionando dependência só para viabilizar teste.
3. **Princípio II (TypeScript como padrão)**: o esquema Drizzle é TypeScript, sem uma segunda
   linguagem de esquema (PSL) e sem etapa de geração de código no build.

`drizzle-kit generate` produz SQL versionado em `packages/domain/src/migrations/`, aplicado por um
comando dedicado — satisfaz FR-032 (esquema evoluído de forma versionada e reproduzível).

**Alternativas consideradas**: Prisma — ergonomia superior para quem começa, mas conflita com os
princípios III e IV como acima. SQL puro com `node-pg-migrate` — máximo controle, mas devolveria a
tipagem das linhas para `any`, violando o Princípio II na fronteira mais crítica. TypeORM —
padrão *active record* e decorators empurram estado global, além de manutenção estagnada.

---

## R6. Armazenamento de objetos — cliente e ambiente local

**Decisão**: `@aws-sdk/client-s3` v3, com `endpoint`, `region`, credenciais e nome do bucket vindos
do ambiente; `forcePathStyle` configurável por variável. Ambiente local com **MinIO** em contêiner.

**Rationale**: A documentação do Railway confirma que as Storage Buckets são totalmente compatíveis
com S3 (Put, Get, Delete, listagem, presigned URLs, multipart) e expõem exatamente
`BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT` (`https://storage.railway.app`) e
`REGION` (`auto`). Portanto o mesmo cliente serve local e produção, trocando só as variáveis —
que é o que a *Assumption* da spec previa.

Dois pontos de atenção levantados pela documentação do Railway, ambos tratados no design:
- **Estilo de URL**: buckets novos usam *virtual-hosted style*, mas buckets antigos exigem
  *path-style*; o MinIO local exige *path-style*. Por isso `forcePathStyle` é variável de
  ambiente, não constante.
- **Buckets públicos não são suportados**: o documento arquivado não terá URL pública direta. A
  futura API REST servirá os PDFs por presigned URL ou por proxy. Isso não afeta esta feature
  (que só grava), mas é registrado para não virar surpresa na feature da API.

**Alternativas consideradas**: `minio` client JS — funciona local, mas amarra a implementação a um
SDK não usado em produção. Sistema de arquivos local com adaptador — adiaria a descoberta de
problemas reais de S3 (path-style, credenciais) para a produção.

---

## R7. Concorrência, paginação e política de tentativas

**Decisão**: O aeródromo é a **unidade atômica de retry**. Um caso de uso `ProcessAirport` executa
detalhamento → cartas → documentos para um ICAO; falha em qualquer etapa reexecuta o caso de uso
inteiro, até **3 tentativas no total**, com *backoff* exponencial e *jitter*. A concorrência é
limitada a 4 por `p-limit`, aplicada **dentro de cada página** de 100 (`Math.ceil` para o total de
páginas).

**Rationale**: FR-021 fala em reprocessar "o processamento completo de um aeródromo", não etapas
isoladas — o retry no nível do caso de uso é a leitura literal e a mais simples. É seguro porque
cada etapa é idempotente (upsert por ICAO, upsert por id de carta, upload por chave determinística),
então repetir não duplica (FR-024). O *backoff* com *jitter* evita que 4 workers batam na fonte em
sincronia após uma falha coletiva, mitigando o edge case de limitação de taxa.

Erros são classificados em **retentáveis** (rede, timeout, 5xx, 429) e **definitivos** (4xx exceto
429, XML inválido, dado obrigatório ausente). Definitivos não consomem as 3 tentativas — repetir um
`400` só desperdiça tempo e agrava a limitação de taxa.

**Alternativas consideradas**: Retry por etapa — mais econômico em rede, mas multiplica os estados
parciais possíveis e torna a contabilidade do relatório ambígua; rejeitado por complexidade sem
ganho proporcional. `Promise.all` por página sem limite — violaria FR-023. Fila persistente
(BullMQ/Redis) — infraestrutura desproporcional para um lote sob demanda de execução única.

---

## R8. Vigência de cartas e limpeza do bucket

**Decisão**: Ao processar um aeródromo, calcular o *diff* entre as cartas vigentes na fonte e as
persistidas: inserir/atualizar as presentes, e remover do banco e do bucket as ausentes. A remoção
do objeto ocorre **após** o commit da transação do banco.

**Rationale**: Implementa FR-015 (vigência no banco) e FR-020 (remoção no bucket), confirmados pelo
autor. O projeto Python já fazia esse *diff* em `save_charts`, validando a abordagem. A ordem
importa: se o objeto fosse apagado antes do commit e a transação falhasse, o banco apontaria para
um documento inexistente. Na ordem escolhida, a falha inversa (commit ok, remoção falha) deixa
apenas um objeto órfão — inofensivo e corrigido na execução seguinte.

**Alternativas consideradas**: *Soft delete* com histórico de emendas — explicitamente fora de
escopo na spec. Varredura global do bucket ao final — cara e arriscada (uma falha parcial de coleta
poderia apagar documentos válidos em massa).

---

## R9. Estratégia de testes

**Decisão**: Duas camadas separadas por configuração:

- **Unitários** (`pnpm test`, padrão, sem rede nem Docker): política de retry, classificação de
  erros, cálculo de páginas, filtro IFR, *diff* de cartas, parsers de XML sobre fixtures, validação
  de assinatura PDF, montagem da chave do bucket. Todos os colaboradores de I/O são interfaces com
  dublês em memória.
- **Integração** (script dedicado, exige Docker): repositórios Drizzle contra PostgreSQL efêmero
  via `@testcontainers/postgresql`, e `ChartStorage` contra MinIO efêmero. Cobre os contratos entre
  pacotes exigidos pelo Princípio IV.

**Rationale**: O Princípio IV exige determinismo e proíbe rede real; manter integração fora do
`pnpm test` padrão preserva isso sem abrir mão de validar o SQL gerado e as chamadas S3 — que
dublês nunca validam. Fixtures de XML capturadas da API real são o que torna os parsers testáveis
sem rede.

**Alternativas consideradas**: Só unitários com dublês — deixaria migrações e SQL sem verificação
até a execução real. Banco compartilhado de desenvolvimento para testes — quebra o determinismo e
a independência de ordem exigidos pelo Princípio IV.

---

## R10. Configuração e segredos

**Decisão**: Todas as variáveis lidas na inicialização e validadas com um esquema Zod que falha
rápido, listando **todas** as variáveis ausentes de uma vez. `.env` fora do versionamento (já
coberto pelo `.gitignore`), com `.env.example` versionado e documentado.

Variáveis: `AISWEB_API_KEY`, `AISWEB_API_PASS`, `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`.

**Rationale**: FR-005 exige encerrar com mensagem que identifique exatamente o que falta, antes de
processar qualquer coisa. Reportar todas as ausências de uma vez evita o ciclo frustrante de
descobrir uma variável faltante por execução. Node 22 carrega `.env` nativamente via `--env-file`,
dispensando a dependência `dotenv`.

**Alternativas consideradas**: Ler variáveis sob demanda no ponto de uso — violaria FR-005 (falha
tardia, depois de processamento parcial) e espalharia `process.env` pelo código, ferindo o
Princípio III.

---

## Resumo das decisões

| # | Tema | Decisão |
|---|------|---------|
| R1 | API AISWEB | XML, endpoint único por `area`; paginação por `rowstart`/`rowend` com `Math.ceil` |
| R2 | Campos da carta | **Confirmado**: `id`, `nome`, `tipo`, `amdt`, `link`. Filtro só por `especie=IFR` na origem (13 tipos); sem refiltro local |
| R3 | Download do PDF | Campo `link`, fallback por id; validação da assinatura `%PDF-` |
| R4 | Coordenadas/pistas | **Confirmado**: `lat`/`lng` já em decimal com sinal; `length`/`width` inteiros em metros |
| R5 | Persistência | Drizzle ORM + drizzle-kit, pool `pg` injetado |
| R6 | Bucket | `@aws-sdk/client-s3`, MinIO local, Railway em produção, `forcePathStyle` configurável |
| R7 | Orquestração | Aeródromo como unidade atômica de retry; 3 tentativas; `p-limit` 4; páginas de 100 |
| R8 | Vigência | *Diff* por aeródromo; remoção no bucket após commit |
| R9 | Testes | Unitários sem I/O por padrão; integração com Testcontainers + MinIO à parte |
| R10 | Configuração | Zod na inicialização, falha rápida listando todas as ausências |

**Incógnitas remanescentes**: nenhuma. As duas confirmações que estavam pendentes (R2 e R4) foram
resolvidas contra respostas reais da API fornecidas pelo autor em 2026-08-15, e as amostras devem
ser versionadas como fixtures dos testes de parser.

**Correções de rumo decorrentes dessa confirmação**, todas já refletidas acima e nos contratos:

1. O campo de emenda é `<amdt>`; `<emenda>` existe apenas como atributo do envelope `<cartas>` e
   tem outro significado (data AIRAC do conjunto).
2. O parâmetro de filtro é `especie=IFR`, não `tipo=IFR`.
3. O refiltro local por `tipo` foi **removido do desenho**: é impossível, pois a resposta não ecoa
   a espécie e o tipo `VAC` pertence tanto à espécie IFR quanto à VFR. A garantia do FR-011 passa a
   depender do parâmetro, com alerta de observabilidade para tipos desconhecidos.
4. Não é necessário conversor de coordenadas sexagesimais no caminho principal.
