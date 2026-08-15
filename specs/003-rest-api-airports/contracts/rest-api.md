# Contrato HTTP: API REST de Aeródromos e Cartas

**Feature**: `003-rest-api-airports` | **Data**: 2026-08-15

Contrato dos endpoints expostos por `@open-nav-charts/api`. Todas as rotas são de leitura —
nenhum método além de `GET` é aceito (FR-025).

**Prefixo**: `/v1` — versionar desde a primeira publicação evita ter de quebrar clientes
depois para introduzir versionamento.

**Formato**: `application/json; charset=utf-8`, exceto a rota de carta, que responde `302`
sem corpo.

---

## Convenções

### Estrutura de erro (FR-026)

Toda falha, em qualquer rota, responde com o mesmo envelope:

```json
{
  "error": {
    "code": "AIRPORT_NOT_FOUND",
    "message": "Aeródromo SBXX não encontrado."
  }
}
```

`code` é estável e legível por máquina; `message` é texto em português do Brasil destinado a
humanos. Nenhuma resposta de erro contém rastreamento de pilha, SQL ou nome de recurso de
infraestrutura (FR-035).

### Códigos de erro

| Código | Status | Quando |
|--------|--------|--------|
| `INVALID_ICAO` | 400 | `:icao` fora do formato de 4 letras |
| `INVALID_PROCEDURE_ID` | 400 | `:id` vazio ou com caracteres de controle |
| `INVALID_PAGINATION` | 400 | `page`/`pageSize` não inteiros, fora de faixa ou acima de 100 |
| `INVALID_STATE` | 400 | `state` fora do formato de 2 letras |
| `INVALID_SEARCH` | 400 | `search` vazio ou acima de 100 caracteres |
| `INVALID_PROCEDURE_TYPE` | 400 | `type` vazio |
| `AIRPORT_NOT_FOUND` | 404 | ICAO válido, inexistente no acervo |
| `PROCEDURE_NOT_FOUND` | 404 | Procedimento inexistente **ou** pertencente a outro aeródromo |
| `CHART_NOT_AVAILABLE` | 404 | Procedimento existe, sem documento arquivado |
| `ROUTE_NOT_FOUND` | 404 | Rota inexistente |
| `METHOD_NOT_ALLOWED` | 405 | Método diferente de `GET` |
| `RATE_LIMITED` | 429 | Limite de requisições excedido |
| `CHART_STORAGE_UNAVAILABLE` | 502 | Falha ao assinar a URL do documento |
| `SERVICE_UNAVAILABLE` | 503 | Dependência indisponível |
| `INTERNAL_ERROR` | 500 | Qualquer falha não prevista |

### Cabeçalhos comuns

| Cabeçalho | Aplicação |
|-----------|-----------|
| `Access-Control-Allow-Origin: *` | Todas — leitura pública (FR-028) |
| `RateLimit-*` | Todas — janela e saldo do limite (FR-030) |
| `Retry-After` | Apenas em `429` |
| `Cache-Control: no-store` | Apenas na rota de carta (FR-024) |

---

## `GET /v1/airports`

Catálogo paginado de aeródromos (História 1).

### Parâmetros de consulta

| Nome | Tipo | Padrão | Restrição |
|------|------|--------|-----------|
| `page` | inteiro | `1` | ≥ 1 |
| `pageSize` | inteiro | `20` | 1 a 100 (FR-003) |
| `state` | string | — | 2 letras, insensível a caixa (FR-005) |
| `search` | string | — | 1 a 100 caracteres; casa ICAO, nome ou cidade, insensível a caixa e a acentuação (FR-006) |

### `200 OK`

```json
{
  "items": [
    {
      "icao": "SBGL",
      "name": "Rio de Janeiro / Galeão",
      "city": "Rio de Janeiro",
      "state": "RJ",
      "latitude": -22.809999,
      "longitude": -43.250556
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "hasNext": false
}
```

**Garantias**:

- Ordenação por `icao` ascendente — estável e total, então percorrer todas as páginas
  devolve cada aeródromo exatamente uma vez (FR-007, SC-008).
- `total` reflete o conjunto filtrado, não o acervo inteiro (FR-004).
- `runways` **não** é incluído (FR-008) — use o detalhe.
- Página além do fim devolve `items: []` com o `total` correto e `200`, não `404`.
- Acervo vazio devolve `items: []` e `total: 0`, não erro.

### Erros

`400 INVALID_PAGINATION` · `400 INVALID_STATE` · `400 INVALID_SEARCH`

---

## `GET /v1/airports/:icao`

Detalhe de um aeródromo, com pistas (História 2).

### Parâmetro de caminho

| Nome | Restrição |
|------|-----------|
| `icao` | 4 letras; aceito em qualquer caixa e normalizado para maiúsculas (FR-011) |

### `200 OK`

```json
{
  "icao": "SBGL",
  "name": "Rio de Janeiro / Galeão",
  "city": "Rio de Janeiro",
  "state": "RJ",
  "latitude": -22.809999,
  "longitude": -43.250556,
  "runways": [
    { "ident": "10/28", "lengthMeters": 4000, "widthMeters": 45 },
    { "ident": "15/33", "lengthMeters": 3180, "widthMeters": 47 }
  ]
}
```

**Garantias**:

- Aeródromo sem pistas registradas devolve `runways: []`, não erro.
- Campos de localização ausentes vêm explicitamente como `null`, nunca omitidos.
- `sbgl` e `SBGL` devolvem o mesmo recurso.

### Erros

`400 INVALID_ICAO` (formato) · `404 AIRPORT_NOT_FOUND` (formato válido, inexistente) — a
distinção entre os dois é exigida por FR-012.

---

## `GET /v1/airports/:icao/procedures`

Relação de procedimentos de um aeródromo (História 3).

### Parâmetros

| Nome | Local | Restrição |
|------|-------|-----------|
| `icao` | caminho | 4 letras, insensível a caixa |
| `type` | consulta | opcional; insensível a caixa (FR-015) |

### `200 OK`

```json
{
  "items": [
    {
      "id": "12345",
      "name": "IAC ILS RWY 10",
      "type": "IAC",
      "amendment": "3",
      "hasChart": true
    },
    {
      "id": "12346",
      "name": "SID DEKON 1A",
      "type": "SID",
      "amendment": null,
      "hasChart": false
    }
  ],
  "total": 2
}
```

**Garantias**:

- `hasChart` é derivado de `storageKey` e `archivedAt` estarem ambos preenchidos. Os campos
  em si **não** são expostos (FR-017), nem `sourceUrl`.
- Aeródromo existente sem procedimentos devolve `items: []` e `200`, não `404` (FR-016).
- Não é paginado: o número de cartas por aeródromo é da ordem de dezenas.

### Erros

`400 INVALID_ICAO` · `400 INVALID_PROCEDURE_TYPE` · `404 AIRPORT_NOT_FOUND`

---

## `GET /v1/airports/:icao/procedures/:id/chart`

Acesso ao PDF da carta (História 4). **Não devolve o documento** — encaminha para ele.

### Parâmetros de caminho

| Nome | Restrição |
|------|-----------|
| `icao` | 4 letras, insensível a caixa |
| `id` | não vazio, sem caracteres de controle |

### `302 Found`

Sem corpo.

| Cabeçalho | Valor |
|-----------|-------|
| `Location` | URL pré-assinada do bucket, válida por 300 segundos |
| `Cache-Control` | `no-store` |

**Garantias**:

- O conteúdo do PDF **não** atravessa a aplicação (FR-019, SC-004).
- A URL é gerada a cada requisição e expira em 5 minutos (FR-020). Seguir uma URL expirada
  resulta em erro do próprio bucket — o consumidor precisa pedir a carta de novo.
- `302` e não `301`: o destino muda a cada requisição, então o redirect nunca é permanente.
- Procedimento pertencente a outro aeródromo responde `404 PROCEDURE_NOT_FOUND` — nunca o
  documento de outro aeródromo, e sem revelar que o procedimento existe sob outro ICAO
  (FR-021).

### Ordem de verificação

Definida em [data-model.md §7](../data-model.md). É ela que produz as distinções de erro
exigidas por FR-021 e FR-022.

### Erros

| Situação | Resposta |
|----------|----------|
| ICAO ou id malformado | `400 INVALID_ICAO` / `400 INVALID_PROCEDURE_ID` |
| Procedimento inexistente, ou de outro aeródromo | `404 PROCEDURE_NOT_FOUND` |
| Procedimento sem documento arquivado | `404 CHART_NOT_AVAILABLE` (FR-022) |
| Falha ao assinar a URL | `502 CHART_STORAGE_UNAVAILABLE`, com registro no log (FR-023) |

---

## `GET /health`

Indicador de saúde (História 5). **Sem** prefixo de versão — é rota operacional, não de
recurso, e orquestradores não devem depender da versão da API.

### `200 OK`

```json
{ "status": "ok", "checks": { "database": "ok" } }
```

### `503 Service Unavailable`

```json
{ "status": "degraded", "checks": { "database": "unavailable" } }
```

O bucket **não** é verificado: a API nunca lê objetos, só assina URLs localmente, então sua
indisponibilidade não impede a API de responder — incluí-lo produziria alarme falso
([research.md R10](../research.md)).

---

## `GET /docs`

Publica o contrato da API para consulta pelos consumidores (FR-032). Sem prefixo de versão.

**Conteúdo**: descrição legível dos endpoints, parâmetros, formatos de resposta e códigos de
erro — suficiente para um desenvolvedor listar aeródromos e abrir uma carta em menos de 10
minutos (SC-006).

---

## Limitação de taxa (FR-030)

Aplicada por endereço IP a todas as rotas de recurso.

| Aspecto | Valor |
|---------|-------|
| Janela | 1 minuto |
| Limite | 120 requisições por IP |
| Resposta ao exceder | `429 RATE_LIMITED` com `Retry-After` em segundos |

`/health` fica fora do limite, para que a verificação de saúde não seja bloqueada por tráfego
de consumidores.
