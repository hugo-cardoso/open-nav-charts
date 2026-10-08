# Quickstart — validação da feature 007

Roteiro para provar que a otimização cumpre a spec. Contratos e regras não são repetidos aqui:
ver [contracts/](./contracts/) e [data-model.md](./data-model.md).

## Pré-requisitos

- `.env` com `AISWEB_API_KEY`, `AISWEB_API_PASS`, `DATABASE_URL` e as variáveis do bucket.
- Postgres e bucket locais de pé (`docker compose up -d`), como na feature 002.
- A migração `0003` é aplicada automaticamente pela própria rotina antes da coleta.

## 1. Portões de qualidade

```bash
pnpm check && pnpm test:integration
```

Esperado: tudo verde, incluindo os testes novos dos parsers em lote, do planejador (função pura de
destino/pendência), de `listKeys` e dos repositórios novos.

## 2. Linha de base de equivalência (SC-004)

Sobre uma base **vazia**:

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler --force
```

Anotar do resumo: aeródromos gravados, falhos, cartas, documentos. Contar no banco:

```sql
select count(*) from airport;
select count(*) from airport_runway;
select count(*) from airport_procedure;
select count(*) from airport_procedure where storage_key is not null;
```

Esperado: ~4.489 aeródromos (4.491 − `SI5J`/`SJZ1`), 2 falhos, cartas IFR = total do lote menos as
dos ICAOs fora do catálogo; nenhuma linha com ICAO de fora do catálogo.

## 3. Regime estável (SC-001, SC-003)

Logo em seguida, sem nada mudar na fonte:

```bash
time pnpm --filter @open-nav-charts/jobs start decea-crawler
```

Esperado:
- **Duração total ≤ 5 min** (a estimativa é ~1 min; research R8).
- `inalterados` ≥ 95% do catálogo; `gravados` ≈ 0; pistas revalidadas ≈ 2 (os sem detalhamento).
- As contagens SQL do passo 2 **idênticas**.

## 4. Revalidação periódica distribuída (FR-007)

Simular o vencimento de todas as pistas:

```sql
update airport set runways_checked_at = now() - interval '8 days';
```

Rodar duas vezes. Esperado: cada execução revalida **no máximo 1.000** por idade, as de coleta mais
antiga primeiro, e a duração continua ≤ 5 min.

## 5. Virada de indicador (FR-003, R5)

Simular uma mudança de AIRAC:

```sql
update source_sync_state set airac_cycle = '2000-01-01' where source = 'aisweb-ifr-charts';
```

Rodar. Esperado: todas as pistas revalidadas, sem limite de orçamento; resumo mostra "AIRAC";
duração ≤ 7 min 30 s (SC-002) e, idealmente, ≤ 5 min. Interromper no meio (`Ctrl+C`) e rodar de
novo deve revalidar **apenas** os que faltaram.

## 6. Documento perdido (caso de borda)

Apagar um PDF qualquer do bucket e rodar. Esperado: o aeródromo correspondente aparece como
gravado, o documento volta ao bucket e nenhum outro é baixado.

## 7. Concorrência contra a fonte (FR-011)

Com `--concurrency 4`, o log de progresso não deve mostrar mais de 4 aeródromos em voo. Nenhum
HTTP 429 no resumo (SC-005).

## 8. Medição em produção

Depois do deploy, registrar no README da rotina (FR-015):

| Execução | Duração | Pistas revalidadas | Gravados |
|----------|---------|--------------------|----------|
| Primeira após o deploy (todas as pistas pendentes) | | | |
| Seguinte (regime estável) | | | |

## Capturar fixtures reais

Para os parsers em lote (contracts/aisweb-api.md), recortar respostas reais, sem credenciais:

```bash
curl -s "https://aisweb.decea.mil.br/api/?apiKey=$AISWEB_API_KEY&apiPass=$AISWEB_API_PASS&area=cartas&especie=IFR" \
  | head -c 20000 > /tmp/cartas-lote.xml   # depois recortar a mão e fechar as tags
```

Remover a `apikey` embutida nos `<link>` antes de versionar.
