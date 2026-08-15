# Exemplos de requisição e resposta — feature 005

**Feature**: 005-airport-location-country | **Date**: 2026-08-15

Contrato descrito em [README.md](./README.md). Os exemplos abaixo são a referência para os
testes de contrato e de integração.

---

## 1. Listagem com filtro por país

```http
GET /v1/airports?country=BR&pageSize=2
```

```json
{
  "items": [
    {
      "icao": "SBGL",
      "name": "Rio de Janeiro / Galeão - Antônio Carlos Jobim",
      "location": {
        "city": "Rio de Janeiro",
        "state": "RJ",
        "country": "BR",
        "latitude": -22.808889,
        "longitude": -43.243611
      }
    },
    {
      "icao": "SBSP",
      "name": "São Paulo / Congonhas",
      "location": {
        "city": "São Paulo",
        "state": "SP",
        "country": "BR",
        "latitude": -23.626111,
        "longitude": -46.656389
      }
    }
  ],
  "page": 1,
  "pageSize": 2,
  "total": 2,
  "hasNext": false
}
```

## 2. Filtro insensível a caixa

```http
GET /v1/airports?country=br
```

Resultado idêntico ao de `country=BR` (FR-016).

## 3. Filtros combinados

```http
GET /v1/airports?country=BR&state=RJ&search=galeao
```

Aplica os três critérios simultaneamente (FR-015). `total` reflete o conjunto filtrado.

## 4. Código válido em formato, sem correspondência

```http
GET /v1/airports?country=PT
```

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "hasNext": false
}
```

Status 200 — ausência de correspondência não é erro (FR-021). Mesma resposta para um código
bem formado porém não atribuído no ISO, como `XX` (FR-019).

## 5. Filtro inválido

```http
GET /v1/airports?country=Brazil
```

```json
{
  "error": {
    "code": "INVALID_COUNTRY",
    "message": "O país deve ser um código de 2 letras (ISO 3166-1 alpha-2)."
  }
}
```

Status 400. Mesma resposta para `BRA`, `B`, `""`, `"  "`, `B1` ou qualquer valor que não
seja exatamente duas letras (FR-018).

## 6. Ficha do aeródromo

```http
GET /v1/airports/SBGL
```

```json
{
  "icao": "SBGL",
  "name": "Rio de Janeiro / Galeão - Antônio Carlos Jobim",
  "location": {
    "city": "Rio de Janeiro",
    "state": "RJ",
    "country": "BR",
    "latitude": -22.808889,
    "longitude": -43.243611
  },
  "runways": [
    { "ident": "10/28", "lengthMeters": 4000, "widthMeters": 45 },
    { "ident": "15/33", "lengthMeters": 3180, "widthMeters": 47 }
  ]
}
```

`location` tem exatamente o mesmo formato da listagem; a ficha apenas acrescenta `runways`.

## 7. Aeródromo sem dados de localização

```http
GET /v1/airports/SBXX
```

```json
{
  "icao": "SBXX",
  "name": "Aeródromo sem detalhamento na fonte",
  "location": {
    "city": null,
    "state": null,
    "country": "BR",
    "latitude": null,
    "longitude": null
  },
  "runways": []
}
```

`location` está presente e cada campo ausente vem como `null` explícito, nunca omitido
(FR-011, FR-012). O país é gravado mesmo quando o resto falta (FR-005).

## 8. Registro anterior à migration, sem país

Cenário que o backfill da migration `0002` elimina na prática, mas que o contrato precisa
descrever porque a coluna é anulável:

```json
{
  "icao": "SBZZ",
  "name": "Aeródromo legado",
  "location": {
    "city": "Cidade",
    "state": "SP",
    "country": null,
    "latitude": null,
    "longitude": null
  },
  "runways": []
}
```

Este registro não aparece em `?country=BR` nem em nenhum outro filtro de país (FR-022).

---

## Contraexemplos — formato que a API **não** produz mais

```json
{
  "icao": "SBGL",
  "name": "...",
  "city": "Rio de Janeiro",
  "state": "RJ",
  "latitude": -22.808889,
  "longitude": -43.243611
}
```

Os campos planos no nível superior foram removidos (FR-009). Um teste que ainda os afirme
está desatualizado, não falhando por regressão.

```json
{
  "location": {
    "country": "Brazil"
  }
}
```

O país é o código ISO alpha-2, nunca o nome por extenso (FR-010).

```json
{
  "location": {
    "city": "Rio de Janeiro",
    "country": "BR"
  }
}
```

Campos nulos não podem ser omitidos: `location` traz sempre as cinco chaves (FR-011).
