# Data Model: API REST de Aeródromos e Cartas

**Feature**: `003-rest-api-airports` | **Data**: 2026-08-15

Esta feature **não introduz entidades novas**. Ela lê o modelo que a rotina `decea-crawler`
já popula. O que muda é: novos **contratos de consulta** no pacote `domain`, um método novo
em `ChartStorage`, e uma **migração aditiva** para viabilizar a busca textual de FR-006.

---

## 1. Entidades existentes (reaproveitadas)

Definidas em `packages/domain/src/entities/index.ts`. Nenhum campo é alterado.

### Airport

| Campo | Tipo | Nulo | Origem |
|-------|------|------|--------|
| `icao` | `string` | não | `airport.icao` — `char(4)`, chave primária |
| `name` | `string` | não | `airport.name` |
| `city` | `string \| null` | sim | `airport.city` |
| `state` | `string \| null` | sim | `airport.state` — `char(2)`, indexado |
| `latitude` | `number \| null` | sim | `airport.latitude` — `numeric(9,6)` |
| `longitude` | `number \| null` | sim | `airport.longitude` — `numeric(9,6)` |
| `runways` | `readonly AirportRunway[]` | não (pode ser vazio) | `airport_runway` |

### AirportRunway

| Campo | Tipo | Nulo |
|-------|------|------|
| `ident` | `string` | não |
| `lengthMeters` | `number \| null` | sim |
| `widthMeters` | `number \| null` | sim |

Único por `(airport_icao, ident)`.

### AirportProcedure

| Campo | Tipo | Nulo | Observação |
|-------|------|------|------------|
| `id` | `string` | não | Chave primária; identificador da fonte |
| `airportIcao` | `string` | não | FK para `airport.icao`, `on delete cascade` |
| `name` | `string` | não | |
| `type` | `string` | não | Tipo da carta (IAC, SID, STAR, …) |
| `amendment` | `string \| null` | sim | |
| `sourceUrl` | `string \| null` | sim | **Não exposto** pela API |
| `storageKey` | `string \| null` | sim | **Não exposto** (FR-017); só decide disponibilidade |
| `archivedAt` | `Date \| null` | sim | **Não exposto** diretamente |

**Regra derivada**: um procedimento tem documento disponível quando
`storageKey !== null && archivedAt !== null`. É essa combinação que vira o booleano
`hasChart` na resposta (FR-014) e o que autoriza o redirect (FR-018).

---

## 2. Contratos novos no pacote `domain`

### AirportListQuery

Entrada da listagem paginada. Já normalizada pela camada de validação — o repositório confia
nos valores recebidos.

| Campo | Tipo | Restrição |
|-------|------|-----------|
| `page` | `number` | inteiro ≥ 1 |
| `pageSize` | `number` | inteiro entre 1 e 100 (FR-003) |
| `state` | `string \| undefined` | 2 letras maiúsculas quando presente (FR-005) |
| `search` | `string \| undefined` | termo já normalizado, não vazio (FR-006) |

### AirportPage

Saída da listagem.

| Campo | Tipo | Observação |
|-------|------|------------|
| `items` | `readonly AirportSummary[]` | **sem** pistas (FR-008) |
| `total` | `number` | total que atende ao critério, ignorando a paginação (FR-004) |

### AirportSummary

Projeção de `Airport` sem `runways`. Existe para que o tipo torne explícito, em tempo de
compilação, que a listagem não carrega pistas — em vez de devolver `Airport` com um array
vazio ambíguo.

```
AirportSummary = Omit<Airport, "runways">
```

### Extensão de `AirportRepository`

```
list(query: AirportListQuery): Promise<AirportPage>
```

`findByIcao`, `listByState` e `save` permanecem inalterados — `listByState` é usado pela
rotina existente e não deve ser removido nesta feature.

### Extensão de `AirportProcedureRepository`

```
findById(id: string): Promise<AirportProcedure | null>
```

Necessário para FR-021: verificar que o procedimento existe **e** a qual aeródromo pertence,
sem carregar todos os procedimentos do aeródromo. `listByAirport`, `saveAll` e `deleteByIds`
permanecem inalterados.

---

## 3. Extensão do pacote `object-storage`

### Extensão de `ChartStorage`

```
presignGetUrl(key: string, expiresInSeconds: number): Promise<string>
```

Gera uma URL de leitura assinada e temporária (FR-019, FR-020). A assinatura é local — não
há ida à rede. `buildKey`, `exists`, `put` e `delete` permanecem inalterados.

---

## 4. Migração de banco (aditiva)

Necessária para FR-006 (busca insensível a acentuação). A normalização é feita em
JavaScript, sem nenhuma extensão do PostgreSQL — justificativa em
[research.md R5](./research.md).

```sql
ALTER TABLE airport ADD COLUMN search_text text;

-- Preenche o acervo já existente. Passo único da migração: a normalização em SQL
-- espelha o que a função em JavaScript faz, e só corre aqui.
UPDATE airport SET search_text = translate(
  lower(icao || ' ' || name || ' ' || coalesce(city, '')),
  'áàâãäéèêëíìîïóòôõöúùûüçñ',
  'aaaaaeeeeiiiiooooouuuucn'
);

CREATE INDEX airport_search_text_idx
  ON airport (search_text text_pattern_ops);
```

### Preenchimento em produção

A coluna é comum, não gerada — quem grava precisa preenchê-la. Isso fica dentro de
`saveAirportWith`, em `packages/domain/src/drizzle/airport-repository.ts`, que é a função
por onde **toda** escrita de aeródromo já passa, tanto `DrizzleAirportRepository.save`
quanto `DrizzleAirportSyncRepository.syncAirport`.

**A rotina `decea-crawler` não muda.** Ela continua chamando os mesmos métodos; a coluna é
preenchida por baixo. Escrita e leitura usam a mesma função pura:

```ts
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
```

Ela vive junto dos mappers (`packages/domain/src/drizzle/mappers.ts`), que já são o lugar
das transformações puras sem colaboradores.

**Invariante a proteger com teste**: a normalização em SQL da migração e a normalização em
JavaScript precisam concordar. Se divergirem, aeródromos gravados antes e depois da migração
respondem de forma diferente à mesma busca. Um teste de integração cobre isso: grava um
aeródromo acentuado, busca pelo termo sem acento, espera encontrá-lo.

**Propriedades**:

- **Aditiva**: nenhuma coluna existente é alterada ou removida.
- **Retroativa**: o `UPDATE` cobre as linhas já gravadas pela rotina de coleta.
- **Sem extensão**: não exige `CREATE EXTENSION`, portanto não depende de privilégio elevado
  no banco nem de suporte do provedor gerenciado.

**Limite conhecido do índice**: `text_pattern_ops` acelera busca por prefixo (`termo%`), não
o curinga à esquerda (`%termo%`) que a busca usa. Na escala do acervo — milhares de linhas,
coluna curta — a varredura sequencial responde dentro de SC-002. Ver o ponto de verificação
em [research.md R5](./research.md).

A coluna **não** entra na entidade `Airport` — é detalhe de persistência a serviço da busca,
nunca serializado.

---

## 5. Modelos de resposta da API

Definidos em `apps/api`, separados das entidades de domínio. Essa separação é o que garante
FR-017: `storageKey` e `sourceUrl` não têm como vazar, porque não existem no tipo de resposta.

### AirportSummaryResponse

```json
{
  "icao": "SBGL",
  "name": "Rio de Janeiro / Galeão",
  "city": "Rio de Janeiro",
  "state": "RJ",
  "latitude": -22.809999,
  "longitude": -43.250556
}
```

### AirportDetailResponse

Os campos acima, acrescidos de:

```json
{
  "runways": [
    { "ident": "10/28", "lengthMeters": 4000, "widthMeters": 45 }
  ]
}
```

### ProcedureResponse

```json
{
  "id": "12345",
  "name": "IAC ILS RWY 10",
  "type": "IAC",
  "amendment": "3",
  "hasChart": true
}
```

`hasChart` é derivado (seção 1); `storageKey`, `sourceUrl` e `archivedAt` não aparecem.

### PageResponse\<T\>

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "hasNext": false
}
```

`hasNext` é derivado de `page * pageSize < total` (FR-004).

### ErrorResponse

```json
{
  "error": {
    "code": "AIRPORT_NOT_FOUND",
    "message": "Aeródromo SBXX não encontrado."
  }
}
```

Estrutura única para toda falha (FR-026, SC-007). Nunca contém rastreamento de pilha,
consulta SQL ou nome de recurso de infraestrutura (FR-035, SC-009).

---

## 6. Regras de validação

| Entrada | Regra | Violação |
|---------|-------|----------|
| `:icao` | 4 letras, insensível a caixa, normalizado para maiúsculas (FR-011, FR-012) | `400 INVALID_ICAO` |
| `:id` | não vazio, sem caracteres de controle | `400 INVALID_PROCEDURE_ID` |
| `page` | inteiro ≥ 1, padrão `1` | `400 INVALID_PAGINATION` |
| `pageSize` | inteiro entre 1 e 100, padrão `20` (FR-002, FR-003) | `400 INVALID_PAGINATION` |
| `state` | 2 letras, insensível a caixa (FR-005) | `400 INVALID_STATE` |
| `search` | 1 a 100 caracteres após aparar espaços | `400 INVALID_SEARCH` |
| `type` | não vazio, insensível a caixa (FR-015) | `400 INVALID_PROCEDURE_TYPE` |

Toda validação ocorre **antes** de qualquer acesso ao acervo (FR-027).

---

## 7. Fluxo de decisão do documento

Ordem de verificação em `GET /airports/:icao/procedures/:id/chart`. A ordem importa: é ela
que produz as distinções de erro exigidas por FR-021 e FR-022.

1. `:icao` e `:id` válidos? Não → `400`.
2. Procedimento existe? Não → `404 PROCEDURE_NOT_FOUND`.
3. `procedure.airportIcao` é igual ao `:icao` do caminho? Não → `404 PROCEDURE_NOT_FOUND`
   (FR-021 — nunca devolver o documento de outro aeródromo, e nunca revelar que o
   procedimento existe sob outro ICAO).
4. Tem documento (`storageKey` e `archivedAt` preenchidos)? Não → `404 CHART_NOT_AVAILABLE`
   (FR-022 — código distinto do anterior).
5. Assina a URL com validade de 5 minutos → `302` com `Location` e `Cache-Control: no-store`
   (FR-019, FR-020, FR-024).
6. Falha na assinatura → `502 CHART_STORAGE_UNAVAILABLE`, com o erro registrado no log
   (FR-023).
