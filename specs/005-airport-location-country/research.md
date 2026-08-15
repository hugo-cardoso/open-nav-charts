# Research: País do aeródromo e objeto `location` na API

**Feature**: 005-airport-location-country | **Date**: 2026-08-15

Nenhum item de NEEDS CLARIFICATION restou do Technical Context — as três decisões abertas
foram fechadas em `/speckit-clarify`. O que segue são as decisões técnicas que a
implementação exige, cada uma tomada contra o código que já existe no repositório.

---

## R1 — Tipo da coluna `country`

**Decision**: `char("country", { length: 2 })`, anulável, sem valor padrão no esquema.

**Rationale**: Espelha exatamente `state`, que já é `char(2)` anulável na mesma tabela
(`packages/domain/src/drizzle/schema.ts:19`). O código ISO alpha-2 tem largura fixa, que é
precisamente o caso de uso de `char`. Manter a coluna anulável é exigência de FR-006: os
registros gravados antes desta feature precisam permanecer válidos, e um `NOT NULL` exigiria
`DEFAULT`, o que gravaria `BR` em registros cuja procedência o acervo não conhece.

**Alternatives considered**:
- `text` com `CHECK (country ~ '^[A-Z]{2}$')` — a restrição no banco duplicaria a validação
  que já existe na fronteira de entrada, e divergiria de como `state` é tratado hoje.
- `NOT NULL DEFAULT 'BR'` — assume que todo registro futuro é brasileiro, exatamente o que
  o filtro por país existe para deixar de assumir.
- Enum do Postgres — cada país novo viraria uma migration; contraria a preparação para
  múltiplas fontes.

---

## R2 — Backfill do acervo existente

**Decision**: `UPDATE "airport" SET "country" = 'BR' WHERE "country" IS NULL;` dentro da
própria migration `0002`, imediatamente após o `ADD COLUMN`.

**Rationale**: A migration `0001` já estabeleceu esse padrão no repositório — ela acrescenta
`search_text` e preenche o acervo no mesmo arquivo, com um comentário explicando que dali em
diante quem preenche é `saveAirportWith`. Seguir o mesmo formato mantém a coerência e
resolve um problema real: sem o backfill, todo aeródromo já gravado ficaria invisível ao
filtro `country` até a próxima execução completa do crawler, que é agendada e demorada.
Como nesta feature o acervo é integralmente brasileiro, `BR` é o valor correto para toda
linha existente. O `WHERE ... IS NULL` torna o comando reexecutável sem efeito colateral.

**Alternatives considered**:
- Não fazer backfill e aguardar o crawler — SC-001 (100% dos aeródromos com país após a
  coleta) continuaria satisfeito, mas o intervalo até lá deixaria o filtro respondendo vazio
  para um acervo cheio, que é a pior experiência possível para a estreia do recurso.
- Comando de migração dedicado em `apps/jobs` — mais código e mais um passo de operação para
  um `UPDATE` de uma linha.

**Nota de execução**: o arquivo SQL e a entrada em `meta/_journal.json` devem ser gerados por
`drizzle-kit generate`, nunca escritos à mão — o journal carrega um timestamp e um hash que
o gerador controla. O `UPDATE` de backfill é acrescentado ao arquivo gerado, entre os
`--> statement-breakpoint`, como foi feito na `0001`.

---

## R3 — Onde o valor `BR` é definido

**Decision**: Uma constante exportada pelo pacote `@open-nav-charts/aisweb-client`, junto ao
cliente da fonte, consumida por `process-airport.ts`. Nome: `BRAZIL_COUNTRY_CODE`.

**Rationale**: O valor é uma propriedade da *fonte*, não do domínio nem da API: é `BR`
porque o DECEA cobre exclusivamente o Brasil. Colocá-lo junto ao cliente AISWEB deixa
explícito que outra fonte traria outro código, e evita que o domínio — que deve permanecer
agnóstico quanto à procedência — carregue uma constante brasileira. `process-airport.ts` já
importa tipos desse pacote, então não há aresta de dependência nova.

**Alternatives considered**:
- Literal `"BR"` embutido em `process-airport.ts` — funciona, mas espalha o valor sem
  nomeá-lo e não deixa registrado *por que* é `BR`.
- Constante no `packages/domain` — colocaria um fato sobre uma fonte específica dentro do
  domínio compartilhado.
- Variável de ambiente — configurabilidade sem demanda; o crawler é do DECEA por construção.

---

## R4 — Filtro `country` na consulta

**Decision**: Mais um `SQL` no array `filters` de `DrizzleAirportRepository.list`, via
`eq(airport.country, query.country)`, com índice `airport_country_idx` em `country`.

**Rationale**: `list()` já monta os predicados em um array combinado com `and(...)`
(`airport-repository.ts:117-126`); acrescentar um terceiro é a extensão natural e mantém a
combinação com UF e busca (FR-015) sem nenhuma estrutura nova. O índice espelha
`airport_state_idx`, atendendo SC-005. A comparação é por igualdade exata porque o valor
chega já em caixa alta dos dois lados — gravado assim por FR-003 e normalizado na entrada
por FR-016 —, o que dispensa `lower()` e mantém o índice utilizável.

O `count()` da paginação usa o mesmo `where`, então FR-017 (total refletindo o conjunto
filtrado) já vem de graça pela estrutura existente.

**Alternatives considered**:
- `ilike` — desnecessário com os dois lados normalizados, e inutilizaria o índice B-tree.
- Método `listByCountry` separado — não permitiria a combinação com UF e busca exigida por
  FR-015.

---

## R5 — Normalização da entrada do filtro

**Decision**: `parseCountry` em `apps/api/src/http/validation.ts`, com um schema Zod idêntico
ao `stateSchema` (`/^[A-Za-z]{2}$/` com `trim` e `toUpperCase`), lançando
`InvalidCountryError` com o código `INVALID_COUNTRY`.

**Rationale**: `stateSchema` já resolve exatamente o mesmo problema — duas letras,
insensível a caixa, normalizado para maiúsculas — e a spec pede o mesmo comportamento
(FR-016, FR-018). Reaproveitar a forma mantém a coerência do contrato e a validação antes de
qualquer acesso ao acervo (FR-020), que é como o roteador já opera.

A validação é de formato apenas: `XX` é aceito e devolve lista vazia (FR-019). Isso é uma
decisão registrada, não um descuido — embutir a tabela ISO exigiria versioná-la e mantê-la,
e um código bem formado porém inexistente já se comporta corretamente como conjunto vazio.

**Alternatives considered**:
- Validar contra a lista ISO 3166-1 — ver acima; custo de manutenção sem ganho funcional.
- Reusar `parseState` para os dois parâmetros — a mensagem de erro e o código passariam a
  mentir sobre qual parâmetro foi recusado, quebrando a tabela de erros do contrato.

---

## R6 — Onde o objeto `location` é montado

**Decision**: Exclusivamente na camada de apresentação da API
(`apps/api/src/presentation/responses.ts`). A entidade `Airport` do domínio mantém `city`,
`state`, `country`, `latitude` e `longitude` como campos planos.

**Rationale**: `responses.ts` existe justamente para separar o formato de serialização das
entidades — seu comentário de cabeçalho já registra que é essa separação que impede campos
internos de vazarem. Agrupar no domínio faria o formato da resposta HTTP ditar a modelagem
do domínio, que também é consumido pelo crawler, onde `location` não significa nada.

Consequência prática: `toAirportSummaryResponse` passa a montar o objeto aninhado, e
`toAirportDetailResponse` continua estendendo o resumo com as pistas — ou seja, listagem e
ficha ganham o mesmo `location` por construção, o que é exatamente FR-008.

**Alternatives considered**:
- `AirportLocation` como objeto de valor no domínio — mais fiel a DDD, porém obrigaria o
  crawler e os mappers a montar e desmontar um objeto para gravar cinco colunas planas.
- Montar no roteador — espalharia a serialização por duas camadas e duplicaria a lógica
  entre listagem e ficha.

---

## R7 — Escopo da quebra de contrato

**Decision**: Remover `city`, `state`, `latitude` e `longitude` do nível superior das
respostas de aeródromo, sem período de convivência com os campos duplicados.

**Rationale**: Decisão do usuário registrada em Clarifications. A API é pública, somente
leitura e sem consumidores contratados conhecidos; manter os campos nos dois níveis criaria
uma ambiguidade permanente ("qual dos dois é o canônico?") em troca de uma compatibilidade
que ninguém pediu. O documento em `/docs` é versionado junto com o código, então o contrato
publicado nunca descreve um formato que a API não tem.

**Impacto a comunicar**: o commit da API leva `!` após o escopo; a migração do consumidor —
de `airport.city` para `airport.location.city`, e assim por diante — está descrita em
[contracts/README.md](./contracts/README.md).

**Alternatives considered**:
- Duplicar os campos nos dois níveis por uma versão — rejeitado pelo usuário.
- Versionar a rota (`/v2/airports`) — custo desproporcional para um acervo sem consumidores
  contratados, e deixaria duas superfícies para manter.
