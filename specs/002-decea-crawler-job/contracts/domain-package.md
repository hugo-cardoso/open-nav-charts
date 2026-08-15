# Contrato exposto — `@open-nav-charts/domain`

**Tipo**: API pública de pacote do workspace. Existe para satisfazer FR-031: a futura API REST
consome este pacote para expor aeródromos e cartas ao frontend, sem duplicar modelo nem acesso a
dados.

**Consumidores**: `apps/jobs` (escrita, esta feature) e a futura API REST (leitura).

**Regra constitucional aplicável**: consumidores importam **apenas** o entrypoint público. Nenhum
import relativo atravessa a fronteira do pacote (Princípio I); `any` não aparece nesta superfície
(Princípio II).

---

## Tipos de entidade

Tipos puros, sem dependência de ORM. É o que a API REST serializa.

```ts
export interface Airport {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly runways: readonly AirportRunway[];
}

export interface AirportRunway {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

export interface AirportProcedure {
  readonly id: string;
  readonly airportIcao: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  readonly sourceUrl: string | null;
  readonly storageKey: string | null;
  readonly archivedAt: Date | null;
}
```

Detalhamento de campos, nulidade e regras: [data-model.md](../data-model.md).

---

## Interfaces de repositório

Contratos que os consumidores recebem por injeção de construtor (Princípio III). As
implementações são classes (`DrizzleAirportRepository`, `DrizzleAirportSyncRepository`), nomeadas
apenas na raiz de composição da aplicação. Testes usam dublês em memória que implementam as mesmas
interfaces.

```ts
export interface AirportRepository {
  findByIcao(icao: string): Promise<Airport | null>;
  listByState(state: string): Promise<readonly Airport[]>;
  /** Upsert por ICAO; substitui as pistas integralmente. Idempotente. */
  save(airport: Airport): Promise<void>;
}

export interface AirportProcedureRepository {
  listByAirport(icao: string): Promise<readonly AirportProcedure[]>;
  /** Upsert por id. Idempotente. */
  saveAll(procedures: readonly AirportProcedure[]): Promise<void>;
  deleteByIds(ids: readonly string[]): Promise<void>;
}

/** Grava aeródromo, pistas e o diff de cartas em uma única transação (ver data-model). */
export interface AirportSyncRepository {
  syncAirport(input: {
    readonly airport: Airport;
    readonly procedures: readonly AirportProcedure[];
  }): Promise<{ readonly removedProcedureIds: readonly string[] }>;
}
```

`syncAirport` existe porque a atomicidade do agregado é uma garantia do domínio, não do chamador:
sem ela, `apps/jobs` teria de coordenar três repositórios em uma transação, o que exigiria vazar o
objeto de transação do Drizzle para fora do pacote. Devolver `removedProcedureIds` é o que permite
ao chamador apagar os objetos do bucket **após** o commit (FR-020).

`listByState` e `listByAirport` não são usados por esta feature — existem porque são as consultas
que a API REST fará, e defini-las agora evita que ela recrie acesso a dados por fora.

---

## Conexão e migrações

```ts
/** Cria o pool. O chamador é dono do ciclo de vida — sem singleton implícito. */
export function createDatabase(config: DatabaseConfig): Database;

export interface Database {
  readonly airports: AirportRepository;
  readonly procedures: AirportProcedureRepository;
  readonly sync: AirportSyncRepository;
  close(): Promise<void>;
}

/** Aplica as migrações pendentes. Idempotente. */
export function runMigrations(config: DatabaseConfig): Promise<void>;
```

O pool é criado e fechado pelo chamador, nunca por módulo — exigência direta do Princípio III
(sem estado global mutável nem singleton implícito) e o motivo técnico da escolha de Drizzle sobre
Prisma registrado em [research.md](../research.md) R5. `createDatabase` é uma fábrica, não um
singleton: chamá-la duas vezes produz dois pools independentes, e fechar um não afeta o outro.

---

## Contrato de `@open-nav-charts/object-storage`

Pacote irmão, consumido apenas por `apps/jobs`. Fora de `domain` porque a API REST precisa do
modelo de dados, não do bucket de escrita.

```ts
export interface ChartStorage {
  /** Chave determinística: `<ICAO>/<id>.pdf`. */
  buildKey(icao: string, procedureId: string): string;
  exists(key: string): Promise<boolean>;
  /** Rejeita conteúdo vazio ou que não comece com `%PDF-` (FR-019). */
  put(key: string, content: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}
```

---

## Contrato de `@open-nav-charts/aisweb-client`

```ts
export interface AisWebClient {
  countAirports(): Promise<number>;
  listAirportIcaos(offset: number, limit: number): Promise<readonly string[]>;
  fetchAirport(icao: string): Promise<AirportDetails>;
  fetchIfrCharts(icao: string): Promise<readonly ChartSummary[]>;
  downloadChart(chart: ChartSummary): Promise<Uint8Array>;
}
```

Erros são tipados em `RetryableSourceError` e `PermanentSourceError`, conforme a classificação em
[aisweb-api.md](./aisweb-api.md). Essa distinção é o que a política de tentativas consome para não
gastar retries em falhas definitivas.

---

## Estabilidade

| Mudança | Classificação |
|---------|---------------|
| Adicionar campo opcional a uma entidade | Compatível |
| Adicionar método a um repositório | Compatível |
| Tornar campo obrigatório, removê-lo ou renomeá-lo | **Quebra** — exige migração e Conventional Commit com `!` |
| Alterar assinatura de método existente | **Quebra** |

Enquanto a API REST não existir, `apps/jobs` é o único consumidor e mudanças quebráveis são
baratas. Após ela existir, valem as regras de breaking change da constituição.
