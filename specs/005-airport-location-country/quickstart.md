# Quickstart — validação da feature 005

**Feature**: 005-airport-location-country | **Date**: 2026-08-15

Roteiro para verificar que a feature funciona ponta a ponta. Formato das respostas em
[contracts/airports.http.md](./contracts/airports.http.md); regras de dados em
[data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 22 (`.nvmrc`) e pnpm.
- PostgreSQL acessível, com `DATABASE_URL` no `.env` da raiz. As suítes de integração
  dependem dele; sem o banco, rode apenas os testes unitários.
- Dependências instaladas: `pnpm install`.

## 1. Aplicar a migration

```bash
# Após alterar packages/domain/src/drizzle/schema.ts:
pnpm --filter @open-nav-charts/domain migrate:generate   # gera 0002 + entrada no journal
# Acrescente o UPDATE de backfill ao SQL gerado (ver data-model.md §1)
pnpm --filter @open-nav-charts/domain migrate            # aplica
```

**Esperado**: a coluna `country char(2)` existe, o índice `airport_country_idx` existe, e
todo aeródromo já gravado tem `country = 'BR'`.

```sql
SELECT count(*) FILTER (WHERE country IS NULL) AS sem_pais,
       count(*) FILTER (WHERE country = 'BR')  AS br
FROM airport;
```

`sem_pais` deve ser `0` — é o backfill fazendo seu trabalho (research R2). Se for maior que
zero, o `UPDATE` não entrou no arquivo gerado.

Reaplicar a migration não deve causar erro nem alterar contagens: o `WHERE country IS NULL`
a torna reexecutável.

## 2. Verificar a gravação pelo crawler

```bash
pnpm --filter @open-nav-charts/jobs test        # unitários, incluindo process-airport
pnpm --filter @open-nav-charts/jobs test:integration
```

**Esperado**: o aeródromo processado é persistido com `country = 'BR'`, inclusive quando a
fonte não informa cidade, UF ou coordenadas (FR-005). Reprocessar o mesmo ICAO não altera o
valor nem duplica o registro (FR-004).

Verificação manual, se quiser exercitar contra a fonte real — atenção, faz rede:

```bash
pnpm --filter @open-nav-charts/jobs start
```

```sql
SELECT icao, city, state, country FROM airport ORDER BY icao LIMIT 5;
```

## 3. Verificar consulta e filtro no domínio

```bash
pnpm --filter @open-nav-charts/domain test
pnpm --filter @open-nav-charts/domain test:integration
```

**Esperado**, em `airport-list.integration.test.ts`:

- `country` filtra corretamente e o `total` reflete apenas o conjunto filtrado (FR-017);
- combinado com `state` e `search`, todos os critérios se aplicam juntos (FR-015);
- aeródromo com `country` nulo nunca aparece no resultado de um filtro de país (FR-022).

## 4. Verificar a API

```bash
pnpm --filter @open-nav-charts/api test
pnpm --filter @open-nav-charts/api test:integration
```

Ou manualmente, com o servidor no ar (`pnpm --filter @open-nav-charts/api start`):

```bash
# 200 — objeto location presente, campos planos ausentes
curl -s localhost:3000/v1/airports?pageSize=1 | jq '.items[0]'

# 200 — filtro por país, insensível a caixa (as duas respostas devem coincidir)
curl -s 'localhost:3000/v1/airports?country=BR&pageSize=1' | jq '.total'
curl -s 'localhost:3000/v1/airports?country=br&pageSize=1' | jq '.total'

# 200 — filtros combinados
curl -s 'localhost:3000/v1/airports?country=BR&state=RJ' | jq '.total'

# 200 com lista vazia — formato válido, sem correspondência
curl -s 'localhost:3000/v1/airports?country=PT' | jq '{total, items}'

# 400 INVALID_COUNTRY — nome por extenso e alpha-3 são recusados
curl -s 'localhost:3000/v1/airports?country=Brazil' | jq '.error'
curl -s 'localhost:3000/v1/airports?country=BRA'    | jq '.error'

# 200 — ficha com location + runways
curl -s localhost:3000/v1/airports/SBGL | jq '{icao, location, runways}'

# contrato publicado reflete a resposta real
curl -s localhost:3000/docs | jq '.endpoints[0].query, .endpoints[0].errors'
```

**Esperado**: `.items[0].city` responde `null` (a chave não existe mais no nível superior) e
`.items[0].location.city` traz o valor. `/docs` lista `country` na query e `INVALID_COUNTRY`
entre os erros.

## 5. Portões de qualidade

Obrigatórios antes do merge, pela constituição:

```bash
pnpm check          # lint + build + typecheck + testes unitários
pnpm test:integration
```

## Checklist de aceitação

| # | Verificação | Requisito |
|---|-------------|-----------|
| 1 | Coluna `country char(2)` e índice `airport_country_idx` existem | FR-001 |
| 2 | Backfill deixou zero aeródromos sem país | FR-002, SC-001 |
| 3 | Crawler grava `BR` em caixa alta, mesmo sem cidade/UF/coordenadas | FR-002, FR-003, FR-005 |
| 4 | Reprocessar não altera o valor nem duplica registro | FR-004 |
| 5 | `location` presente na listagem e na ficha, com o mesmo formato | FR-007, FR-008 |
| 6 | `city`/`state`/`latitude`/`longitude` ausentes do nível superior | FR-009 |
| 7 | País exposto como código, sem tradução | FR-010 |
| 8 | Campos nulos vêm como `null` explícito; `location` nunca ausente | FR-011, FR-012 |
| 9 | Filtro por país funciona e é insensível a caixa | FR-014, FR-016 |
| 10 | Filtro combina com UF e busca; `total` reflete o filtrado | FR-015, FR-017 |
| 11 | Valor malformado → 400 `INVALID_COUNTRY` | FR-018 |
| 12 | Código bem formado sem correspondência → 200 com lista vazia | FR-019, FR-021 |
| 13 | Aeródromo sem país não aparece em filtro de país | FR-022 |
| 14 | `/docs` descreve `location`, `country` e `INVALID_COUNTRY` | FR-023, FR-024 |
