# Contrato HTTP — feature 005

**Feature**: 005-airport-location-country | **Date**: 2026-08-15

Descreve o que muda na superfície pública da API. Exemplos concretos de requisição e
resposta em [airports.http.md](./airports.http.md).

## ⚠️ Breaking change

`city`, `state`, `latitude` e `longitude` **deixam de existir no nível superior** das
respostas de aeródromo. Passam a viver dentro do objeto `location`, junto do novo campo
`country`.

Afeta as duas rotas que serializam aeródromo:

- `GET /v1/airports` — cada item de `items`
- `GET /v1/airports/:icao`

`GET /v1/airports/:icao/procedures` e `GET /v1/airports/:icao/procedures/:id/chart` não são
afetadas.

### Migração do consumidor

| Antes | Depois |
|-------|--------|
| `airport.city` | `airport.location.city` |
| `airport.state` | `airport.location.state` |
| `airport.latitude` | `airport.location.latitude` |
| `airport.longitude` | `airport.location.longitude` |
| — | `airport.location.country` (novo) |

`icao`, `name` e `runways` permanecem onde estavam.

### Sinalização exigida pela constituição

O commit da API leva `!` após o escopo — por exemplo
`feat(api)!: agrupa localização do aeródromo em location`. Rodapés são proibidos pela
constituição, então `BREAKING CHANGE:` MUST NOT ser usado; esta seção e a descrição do PR
cumprem esse papel.

## 1. `GET /v1/airports`

### Parâmetro novo

| Nome | Tipo | Regra | Padrão |
|------|------|-------|--------|
| `country` | string | Exatamente 2 letras, insensível a caixa. Código ISO 3166-1 alpha-2 | ausente = sem filtro |

Combinável com `state`, `search`, `page` e `pageSize`; todos os critérios são aplicados
simultaneamente (FR-015). O `total` reflete o conjunto filtrado (FR-017).

A validação é de **formato apenas**. Um código bem formado mas não atribuído no padrão ISO
(`XX`) é aceito e responde 200 com lista vazia — a API não mantém a tabela de códigos
atribuídos (FR-019).

Aeródromos sem país registrado nunca entram no resultado de um filtro de país (FR-022).

### Erro novo

| Código | Status | Quando |
|--------|--------|--------|
| `INVALID_COUNTRY` | 400 | `country` não é composto exatamente por duas letras |

Mensagem: `O país deve ser um código de 2 letras (ISO 3166-1 alpha-2).`

Formato do envelope inalterado: `{ "error": { "code": ..., "message": ... } }`.

Erros possíveis na rota passam a ser: `INVALID_PAGINATION`, `INVALID_STATE`,
`INVALID_COUNTRY`, `INVALID_SEARCH`.

## 2. Objeto `location`

Presente em toda serialização de aeródromo, nas duas rotas, com o mesmo formato.

```json
{
  "city": "string | null",
  "state": "string | null",
  "country": "string | null",
  "latitude": "number | null",
  "longitude": "number | null"
}
```

Invariantes:

- **Sempre presente**, mesmo que todos os campos sejam nulos (FR-012).
- Campo sem valor é `null` explícito, nunca omitido (FR-011).
- `country` é o código ISO alpha-2 como gravado, sem tradução para nome por extenso
  (FR-010).
- Nenhum campo interno de persistência aparece aqui (FR-013).

## 3. Documento `/docs`

O contrato publicado em `GET /docs` é gerado a partir das mesmas constantes que a validação
usa, e MUST ser atualizado junto (FR-023, FR-024):

- `query.country` na entrada de `GET /v1/airports`
- `INVALID_COUNTRY` na lista `errors` da mesma entrada
- `response` de `GET /v1/airports/:icao` refletindo `location` no lugar dos campos planos
- Passo do `quickstart` exercitando o filtro por país

## 4. O que **não** muda

- Nenhuma rota nova, nenhuma rota removida.
- Nenhum método de escrita: a API segue somente leitura.
- Paginação, ordenação por ICAO ascendente e limites (`pageSize` máximo 100) inalterados.
- Limitação de taxa e isenção de `/health` inalteradas.
- Formato do envelope de erro inalterado.
