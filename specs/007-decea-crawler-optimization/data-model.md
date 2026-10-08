# Data Model: Otimização do tempo de execução do coletor DECEA

**Feature**: [spec.md](./spec.md) · **Pesquisa**: [research.md](./research.md)

O modelo da feature 002 (`airport`, `airport_runway`, `airport_procedure`) é preservado. Esta
feature acrescenta **uma coluna** e **uma tabela**, ambas usadas apenas pela rotina de coleta —
nada novo é exposto pela API REST.

---

## Alterações persistidas (migração `0003`)

### `airport.runways_checked_at` e `airport.source_updated_on` — novas colunas

| Coluna | Tipo | Nulo | Significado |
|--------|------|------|-------------|
| `runways_checked_at` | `timestamptz` | sim | Momento da última coleta **bem-sucedida** do detalhamento (pistas) do aeródromo |
| `source_updated_on` | `text` | sim | `<dt>` do registro ROTAER visto nessa coleta (research R10) |

- Nula em todas as linhas logo após a migração: a primeira execução depois do deploy revalida
  todas as pistas (equivale a `--force`; ~4 min estimados, research R8).
- Gravada **na mesma transação** que o aeródromo quando há mudança de dados (FR-004); quando o
  detalhamento não muda nada, é atualizada por um `UPDATE` em lote (ver `markRunwaysChecked`).
- **Nunca** é gravada em caso de falha do detalhamento — é isso que mantém o aeródromo pendente.
- Não entra na entidade `Airport` do domínio: é estado da rotina, não dado aeronáutico, e a API
  serializa `Airport`.

### `source_sync_state` — nova tabela

Uma linha por fonte observada. Hoje existe uma única: `aisweb-ifr-charts`.

| Coluna | Tipo | Nulo | Significado |
|--------|------|------|-------------|
| `source` | `text` PK | não | Identificador da fonte (`aisweb-ifr-charts`) |
| `last_update` | `text` | sim | Valor normalizado de `lastupdate` (ex.: `2026-09-30 17:35:34`); `null` se ilegível |
| `airac_cycle` | `text` | sim | Valor normalizado de `emenda` (ex.: `2026-10-01`); `null` se ilegível |
| `observed_at` | `timestamptz` | não | Quando este par (`last_update`, `airac_cycle`) foi visto **pela primeira vez** |
| `updated_at` | `timestamptz` | não | Última vez que a linha foi confirmada por uma execução |

- `last_update` é guardado como texto normalizado (sem `{ts '…'}` e sem espaços): a fonte não
  informa fuso, e o valor só é usado para **igualdade**, nunca para aritmética de datas.
- `observed_at` só muda quando o par muda. Uma execução que observa o mesmo par atualiza apenas
  `updated_at`.

---

## Tipos novos (não persistidos)

### Do pacote `@open-nav-charts/aisweb-client`

```text
AirportCatalogEntry          — um item do catálogo em lote (research R3)
  icao, name, city, state, latitude, longitude     (mesmas regras de AirportDetails, sem pistas)
  updatedOn: string | null      — <dt> do registro ROTAER (research R10)

AirportCatalog
  total: number                 — rotaer/@total
  entries: AirportCatalogEntry[]
  rejected: string[]            — itens sem AeroCode ou name, descritos para o resumo

IfrChartCatalog                 — todas as cartas IFR (research R2)
  lastUpdate: string | null     — lastupdate normalizado
  airacCycle: string | null     — emenda normalizada
  charts: ChartSummary[]        — airportIcao preenchido por item a partir de <IcaoCode>
```

### Do pacote `@open-nav-charts/domain`

```text
AirportSnapshot                 — o que está persistido de um aeródromo
  airport: Airport              — com pistas
  procedures: AirportProcedure[]
  runwaysCheckedAt: Date | null
  sourceUpdatedOn: string | null

SourceSyncState
  source, lastUpdate, airacCycle, observedAt
```

### Da rotina (`apps/jobs`)

```text
AirportPlan                     — decisão da função pura de planejamento (research R4)
  icao
  entry, charts, snapshot
  runwaysReason: "requested" | "new" | "pending" | "source-updated" | "airac" | "age" | null
  writeReasons: ("cadastro" | "cartas" | "documentos")[]
  — sem runwaysReason e sem writeReasons, o aeródromo fica inalterado
```

---

## Regras de decisão

### Pistas pendentes (research R5)

```text
pendente(a) :=
     force
  ∨ a.icao ∈ only
  ∨ a.runwaysCheckedAt = null
  ∨ (entry.updatedOn ≠ null ∧ entry.updatedOn ≠ a.sourceUpdatedOn)
  ∨ a.runwaysCheckedAt < state.observedAt
  ∨ (a.runwaysCheckedAt < now − revalidationDays  ∧  a está entre os `revalidationBudget` mais antigos)
```

Somente a última cláusula é limitada pelo orçamento.

### Destino do aeródromo (research R4)

```text
para cada entrada e do catálogo:
  s := snapshot persistido de e.icao (pode não existir)
  c := cartas IFR de e.icao no lote (vazio se nenhuma)

  se pendente(s)                                → "refresh-runways"
  senão se s não existe                         → "refresh-runways"   (aeródromo novo exige pistas)
  senão se cadastro(e) ≠ cadastro(s)            → "write"
  senão se cartas(c) ≠ cartas(s)                → "write"
  senão se alguma carta de c sem chave no bucket → "write"            (com documentos ligados)
  senão                                          → "unchanged"
```

Depois do detalhamento, um `refresh-runways` vira `write` se pistas, cadastro ou cartas
diferirem; senão vira só a marcação de `runways_checked_at`.

### Igualdade

| Campo | Regra |
|-------|-------|
| `name`, `city`, `state` | Texto aparado; `null` ≡ ausente |
| `latitude`, `longitude` | Valor da fonte arredondado a 6 casas (`numeric(9,6)`) antes de comparar; meia coordenada ≡ nenhuma |
| `country` | Sempre `BR`; difere apenas em registro legado com `null` |
| Pistas | Mesmo conjunto de `ident` com o mesmo comprimento e largura, após a deduplicação do parser |
| Cartas | Mesmo conjunto de `id`; por `id`: `name`, `type`, `amendment`, `sourceUrl` iguais e `storageKey` igual ao que a gravação produziria |
| `archivedAt`, `createdAt`, `updatedAt` | **Ignorados** |

### `archived_at` preservado

`archived_at` passa a ser gravado apenas quando `storage_key` muda (de nulo para a chave, ou de
uma chave para outra) e preservado nas demais gravações. Hoje é sobrescrito com "agora" a cada
execução. A API já expõe o campo, que passa a significar o que o nome diz: quando o documento foi
arquivado.

---

## Transições de estado

```text
          observa par novo                     detalhamento OK
 state ───────────────────▶ observed_at = now   aeródromo ─────────────────▶ runways_checked_at = now
          mesmo par                                         detalhamento falha
       ─────────────────▶ só updated_at                    ─────────────────▶ (inalterado → segue pendente)
```

---

## Volume

| Conjunto | Linhas | Carga |
|----------|--------|-------|
| `airport` | ~4.491 | 1 consulta no início da execução |
| `airport_runway` | ~9.000 | 1 consulta |
| `airport_procedure` | ~1.807 | 1 consulta |
| Chaves no bucket | ~1.807 | ~2 requisições `ListObjectsV2` |

Tudo cabe com folga em memória (poucos MB) e é carregado uma vez por execução.
