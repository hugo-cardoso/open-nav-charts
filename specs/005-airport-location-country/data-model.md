# Data Model: País do aeródromo e objeto `location` na API

**Feature**: 005-airport-location-country | **Date**: 2026-08-15

## 1. Persistência — tabela `airport`

Uma coluna nova e um índice novo. Nenhuma outra tabela é tocada; `airport_runway` e
`airport_procedure` seguem inalteradas.

| Coluna | Tipo | Nulável | Origem | Observação |
|--------|------|---------|--------|------------|
| `country` | `char(2)` | sim | crawler | **Nova.** Código ISO 3166-1 alpha-2, sempre em caixa alta |

Índice novo: `airport_country_idx` sobre `country`, espelhando `airport_state_idx`.

**Por que anulável**: FR-006. Registros gravados antes desta feature precisam permanecer
válidos. Um `NOT NULL` exigiria `DEFAULT 'BR'`, o que atribuiria nacionalidade brasileira a
qualquer registro futuro de outra procedência — exatamente o que o filtro por país existe
para deixar de assumir.

**Regras de gravação**:

- Sempre em caixa alta (FR-003). A garantia vem da origem única de escrita: `saveAirportWith`
  recebe o valor já normalizado da entidade, e o crawler o obtém de uma constante.
- Idempotente (FR-004): a coluna entra no `set` do `onConflictDoUpdate` existente, junto de
  `name`, `city`, `state` e coordenadas. Reprocessar reescreve o mesmo valor.
- A gravação do país independe de cidade, UF e coordenadas estarem presentes (FR-005): é um
  campo à parte no mesmo `INSERT`, sem condicional.

### Migration `0002`

Gerada por `drizzle-kit generate` a partir da mudança em `schema.ts` — arquivo SQL e entrada
em `meta/_journal.json`. Três passos, no formato da `0001`:

```sql
ALTER TABLE "airport" ADD COLUMN "country" char(2);--> statement-breakpoint
-- Backfill do acervo já gravado: nesta feature todo o acervo é brasileiro. Daí em
-- diante quem preenche é `saveAirportWith`, a cada coleta.
UPDATE "airport" SET "country" = 'BR' WHERE "country" IS NULL;--> statement-breakpoint
CREATE INDEX "airport_country_idx" ON "airport" USING btree ("country");
```

O `WHERE ... IS NULL` deixa o `UPDATE` reexecutável sem efeito colateral. Ver
[research.md](./research.md) R2.

## 2. Domínio — `packages/domain`

### Entidade `Airport`

Ganha um campo; permanece plana, sem objeto aninhado (research R6).

```text
Airport
├── icao: string                    (inalterado)
├── name: string                    (inalterado)
├── city: string | null             (inalterado)
├── state: string | null            (inalterado)
├── country: string | null          ← NOVO
├── latitude: number | null         (inalterado)
├── longitude: number | null        (inalterado)
└── runways: readonly AirportRunway[]
```

`AirportSummary` continua sendo `Omit<Airport, "runways">`, portanto herda `country` sem
nenhuma alteração própria — a listagem passa a devolver o país automaticamente.

### `AirportListQuery`

```text
AirportListQuery
├── page: number                    (inalterado)
├── pageSize: number                (inalterado)
├── state?: string | undefined      (inalterado)
├── country?: string | undefined    ← NOVO — duas letras maiúsculas quando presente
└── search?: string | undefined     (inalterado)
```

O contrato do tipo mantém a convenção já documentada ali: o valor chega **já validado e
normalizado** pela camada de entrada; o repositório confia no que recebe.

### `AirportRow` (mapper)

Ganha `country: string | null`, e `toAirportSummary` passa a copiá-lo para a entidade. Como
`toAirport` já é composto sobre `toAirportSummary`, a ficha detalhada herda o campo sem
alteração própria.

## 3. Apresentação — `apps/api`

### `AirportLocationResponse` (novo)

```text
AirportLocationResponse
├── city: string | null
├── state: string | null
├── country: string | null      ← código ISO alpha-2, sem tradução (FR-010)
├── latitude: number | null
└── longitude: number | null
```

### `AirportSummaryResponse` (reestruturado — breaking change)

```text
AirportSummaryResponse
├── icao: string
├── name: string
└── location: AirportLocationResponse    ← substitui city, state, latitude, longitude
```

`AirportDetailResponse` segue estendendo o resumo com `runways`, então ficha e listagem
compartilham o mesmo `location` por construção — é assim que FR-008 é satisfeito sem
duplicar código.

**Invariantes de serialização**:

- `location` está sempre presente, mesmo com todos os campos nulos (FR-012).
- Campo sem valor sai como `null` explícito, nunca omitido (FR-011) — a regra que
  `responses.ts` já aplica hoje.
- Nenhum campo interno de persistência entra em `location` (FR-013): `searchText` não existe
  nos tipos de resposta, então não há como vazar.

## 4. Fluxo do valor, ponta a ponta

```text
DECEA (fonte, sem informação de país)
   │
   │  BRAZIL_COUNTRY_CODE = "BR"   (constante em @open-nav-charts/aisweb-client)
   ▼
ProcessAirport.toAirport()      →  Airport { country: "BR", ... }
   │
   ▼
AirportSyncRepository → saveAirportWith()  →  INSERT ... ON CONFLICT DO UPDATE
   │                                            airport.country = 'BR'
   ▼
PostgreSQL: airport.country char(2)
   │
   ▼
toAirportSummary(row)           →  AirportSummary { country: "BR", ... }
   │
   ▼
toAirportSummaryResponse()      →  { icao, name, location: { country: "BR", ... } }
```

E, no sentido da consulta:

```text
GET /v1/airports?country=br
   │
   ▼
parseCountry("br")              →  "BR"   |  InvalidCountryError (INVALID_COUNTRY)
   │
   ▼
AirportService.list()           →  country: "BR"  (toUpperCase defensivo)
   │
   ▼
DrizzleAirportRepository.list() →  eq(airport.country, "BR")  AND  demais filtros
```

## 5. Transições de estado

O aeródromo não tem máquina de estados. O único ciclo de vida relevante é o do próprio campo:

| Estado | Quando | Efeito no filtro |
|--------|--------|------------------|
| `NULL` | Registro gravado antes da migration `0002` e ainda não alcançado pelo backfill | Não aparece em nenhum filtro de país (FR-022) |
| `'BR'` | Após a migration `0002` (backfill) ou após qualquer coleta | Aparece em `?country=BR` |

Como o backfill roda dentro da migration, na prática o estado `NULL` deixa de existir no
acervo assim que a migration é aplicada. O caminho permanece modelado porque a coluna segue
anulável e um registro de procedência desconhecida é possível no futuro.

## 6. Tabela de validação de entrada

Acréscimo a data-model §6 da feature 003, que documenta os demais parâmetros.

| Parâmetro | Regra | Normalização | Erro |
|-----------|-------|--------------|------|
| `country` | Exatamente 2 letras (`/^[A-Za-z]{2}$/`), após `trim` | `toUpperCase()` | `INVALID_COUNTRY` (400) |

Casos de recusa: vazio, só espaços, uma letra, três ou mais letras (`BRA`), nome por extenso
(`Brazil`), dígitos ou símbolos.

Caso **aceito** e sem correspondência: código bem formado porém não atribuído no ISO (`XX`)
— responde 200 com lista vazia e `total: 0` (FR-019, FR-021). A API não mantém a tabela de
códigos atribuídos.
