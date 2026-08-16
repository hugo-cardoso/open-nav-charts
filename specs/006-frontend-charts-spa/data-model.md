# Data Model: Aplicação web de consulta a cartas

**Feature**: `006-frontend-charts-spa` | **Data**: 2026-08-15

A aplicação não possui banco de dados nem persistência. Este documento descreve os modelos
que existem em memória: o que chega da API, o que a tela consome e como o estado de consulta
é representado. A fonte da verdade dos campos é o código da API
(`apps/api/src/presentation/responses.ts`), não o contrato escrito da feature 003, que está
desatualizado quanto ao agrupamento de `location` (R7).

---

## 1. Modelos recebidos da API

Espelham exatamente o JSON das respostas. Campos ausentes chegam como `null` **explícito**,
nunca omitidos — garantia da API que permite distinguir "sem valor" de "campo removido".

### `AirportLocation`

| Campo | Tipo | Nulo? | Observação |
|-------|------|-------|-----------|
| `city` | `string` | sim | |
| `state` | `string` | sim | Duas letras quando presente |
| `country` | `string` | sim | ISO 3166-1 alpha-2, sem nome por extenso |
| `latitude` | `number` | sim | Grau decimal |
| `longitude` | `number` | sim | Grau decimal |

O objeto `location` está **sempre presente**, ainda que todos os campos internos sejam
nulos. O consumidor nunca precisa checar a existência da chave.

### `AirportSummary` — item de `GET /v1/airports`

| Campo | Tipo | Nulo? |
|-------|------|-------|
| `icao` | `string` | não |
| `name` | `string` | não |
| `location` | `AirportLocation` | não |

Não contém `runways`. Para pistas, é preciso o detalhe.

### `AirportDetail` — `GET /v1/airports/:icao`

Estende `AirportSummary` com:

| Campo | Tipo | Nulo? |
|-------|------|-------|
| `runways` | `Runway[]` | não (pode ser vazio) |

### `Runway`

| Campo | Tipo | Nulo? |
|-------|------|-------|
| `ident` | `string` | não |
| `lengthMeters` | `number` | sim |
| `widthMeters` | `number` | sim |

### `Procedure` — item de `GET /v1/airports/:icao/procedures`

| Campo | Tipo | Nulo? | Observação |
|-------|------|-------|-----------|
| `id` | `string` | não | Opaco; usado na rota da carta |
| `name` | `string` | não | |
| `type` | `string` | não | Maiúsculas, ex.: `IAC`, `SID`, `STAR` |
| `amendment` | `string` | sim | |
| `hasChart` | `boolean` | não | **Decide a oferta de abertura (FR-015)** |

`hasChart` é calculado pela API e já significa "documento realmente arquivado". A aplicação
MUST tratá-lo como a única condição para oferecer a abertura; não deve inferir
disponibilidade por nenhum outro campo.

### Envelopes de coleção

`PageResponse<T>` — usado na busca de aeródromos:

| Campo | Tipo | Observação |
|-------|------|-----------|
| `items` | `T[]` | |
| `page` | `number` | Base 1 |
| `pageSize` | `number` | |
| `total` | `number` | Do conjunto **filtrado**, não do acervo |
| `hasNext` | `boolean` | Calculado pela API; usar em vez de recalcular |

`CollectionResponse<T>` — usado nos procedimentos, sem paginação:

| Campo | Tipo |
|-------|------|
| `items` | `T[]` |
| `total` | `number` |

### `ApiErrorBody`

```json
{ "error": { "code": "AIRPORT_NOT_FOUND", "message": "Aeródromo SBXX não encontrado." } }
```

`code` pertence a uma lista fechada e estável, em inglês. `message` é **texto em português**
e MUST NOT ser exibido (FR-024, R7).

---

## 2. Modelos internos da aplicação

### `ApiFailure`

Falha normalizada, produzida pelo cliente de API para qualquer erro — de resposta da API, de
rede ou de resposta malformada.

| Campo | Tipo | Observação |
|-------|------|-----------|
| `code` | `ErrorCode \| "NETWORK_ERROR" \| "UNEXPECTED_RESPONSE"` | Os dois últimos são criados pelo cliente, pois não vêm da API |
| `status` | `number \| null` | `null` quando a requisição não chegou a completar |
| `retryable` | `boolean` | Orienta a oferta de nova tentativa (FR-020) |

`retryable` é `true` para `NETWORK_ERROR`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`,
`CHART_STORAGE_UNAVAILABLE` e `INTERNAL_ERROR`; `false` para os erros de validação e de
recurso inexistente, onde repetir a mesma requisição produziria o mesmo resultado.

### `SearchQuery` — o estado de consulta (entidade "Consulta" da spec)

Espelhado na URL, o que torna a consulta recarregável e compartilhável (FR-003, FR-011).

| Campo | Tipo | Padrão | Restrição da API |
|-------|------|--------|------------------|
| `search` | `string \| null` | `null` | 1 a 100 caracteres |
| `state` | `string \| null` | `null` | Exatamente 2 letras |
| `country` | `string \| null` | `null` | Exatamente 2 letras (ISO alpha-2) |
| `page` | `number` | `1` | Inteiro ≥ 1 |

Regras de derivação:

- Um campo em seu valor padrão MUST ser **omitido** da URL, para que o endereço de uma busca
  simples permaneça curto e legível.
- Alterar `search`, `state` ou `country` MUST redefinir `page` para `1` — manter a página
  anterior sob um novo filtro exibiria uma página vazia sem motivo aparente.
- Valores inválidos vindos da URL MUST ser tratados como ausentes, sem quebrar a tela: a
  aplicação sanea e segue, deixando a validação canônica para a API.

### `ProcedureFilter`

| Campo | Tipo | Padrão | Observação |
|-------|------|--------|-----------|
| `type` | `string \| null` | `null` | Normalizado para maiúsculas antes do envio |

Também espelhado na URL da tela do aeródromo.

### `RequestState`

Estado derivado que as telas consomem para atender FR-010 e FR-019. É uma união
discriminada, e não um conjunto de booleanos, porque os estados são mutuamente exclusivos —
o tipo impede a combinação impossível "carregando e com erro ao mesmo tempo".

| Estado | Quando | O que a tela mostra |
|--------|--------|---------------------|
| `idle` | Nenhum termo nem filtro informado | Convite a iniciar a busca |
| `loading` | Requisição em andamento | Indicador de progresso |
| `empty` | Resposta válida com `items` vazio | "Nenhum resultado", com sugestão de revisar o termo |
| `success` | Resposta válida com itens | Os resultados |
| `failure` | `ApiFailure` | Mensagem em inglês derivada de `code` + nova tentativa quando `retryable` |

---

## 3. Regras de apresentação

Decorrem de FR-023 (campos ausentes omitidos) e valem para toda a interface.

- **Localidade**: compor apenas as partes não nulas de `city`, `state` e `country`, unidas
  por vírgula. Se as três forem nulas, o elemento inteiro MUST ser omitido — nunca renderizar
  rótulo órfão, string vazia, `null` ou `undefined`.
- **Coordenadas**: exibidas somente quando `latitude` **e** `longitude` estiverem presentes;
  uma só coordenada não é informação útil. Sem representação cartográfica nesta versão.
- **Pistas**: `lengthMeters` e `widthMeters` nulos são omitidos individualmente; a pista
  ainda é listada por seu `ident`. Lista vazia produz aviso de ausência, não área em branco.
- **Emenda do procedimento**: exibida apenas quando não nula.
- **Procedimento sem carta**: `hasChart: false` MUST renderizar indicação explícita de
  indisponibilidade e MUST NOT renderizar um controle de abertura, nem desabilitado de forma
  ambígua (FR-015).

---

## 4. Fluxo dos dados entre as telas

```text
SearchQuery (URL)
   ↓
GET /v1/airports?search&state&country&page
   ↓
PageResponse<AirportSummary> → lista de resultados
   ↓ (seleção de um aeródromo → navegação para /airports/:icao)
GET /v1/airports/:icao          → AirportDetail (cabeçalho e pistas)
GET /v1/airports/:icao/procedures?type → CollectionResponse<Procedure>
   ↓ (acionamento em procedimento com hasChart: true)
navegação em nova aba → GET /v1/airports/:icao/procedures/:id/chart → 302 → documento
```

As duas requisições da tela do aeródromo são independentes e MUST ser disparadas em
paralelo; a falha de uma não impede a exibição da outra.

## 5. Cache e invalidação

- Respostas de busca e de detalhe são mantidas em cache de memória por chave derivada dos
  parâmetros, o que faz o retorno à lista (FR-011) e o "voltar" do navegador (FR-004) serem
  instantâneos e sem nova requisição.
- **A URL assinada da carta MUST NOT ser armazenada, cacheada ou pré-carregada em nenhuma
  hipótese.** Ela expira em 300 segundos (R6), e guardá-la produziria links quebrados
  exatamente no caso que FR-017 existe para evitar. A rota da carta é sempre uma navegação
  nova, montada no instante do clique.
- O cache é apenas de memória: recarregar a página o descarta por completo. Não há
  `localStorage` nem trabalho offline nesta versão.
