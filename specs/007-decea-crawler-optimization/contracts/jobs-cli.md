# Contrato exposto — CLI da rotina `decea-crawler`, adendo da feature 007

Complementa [`specs/002-decea-crawler-job/contracts/jobs-cli.md`](../../002-decea-crawler-job/contracts/jobs-cli.md).
Os códigos de saída da feature 004 não mudam.

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler [opções]
```

## Opções

| Opção | Padrão | Situação | Finalidade |
|-------|--------|----------|------------|
| `--page-size <n>` | **`5000`** (era `100`) | alterada | Itens por página do catálogo; o padrão cobre o catálogo inteiro numa página |
| `--concurrency <n>` | `4` | significado precisado | Aeródromos processados em simultâneo ⇒ requisições simultâneas à fonte |
| `--max-attempts <n>` | `3` | inalterada | Tentativas por aeródromo e por consulta em lote |
| `--skip-documents` | desligado | inalterada | Coleta metadados sem baixar PDFs nem listar o bucket |
| `--only <ICAO,ICAO>` | — | comportamento ajustado | Restringe a gravação aos ICAOs dados; **sempre** revalida as pistas deles. As consultas em lote continuam sendo feitas (~12 s) |
| `--force` | desligado | **nova** | Ignora o atalho: revalida todas as pistas e grava todos os aeródromos |
| `--revalidation-days <n>` | `7` | **nova** | Idade a partir da qual as pistas de um aeródromo vencem (FR-007) |
| `--revalidation-budget <n>` | `1000` | **nova** | Máximo de aeródromos revalidados **por idade** numa execução (research R5) |

Valores inteiros menores que 1 são rejeitados com o código de saída de configuração inválida.

## Resumo final

```text
Resumo
  Duração total            : 58s
  Fonte                    : lastupdate 2026-09-30 17:35:34 · AIRAC 2026-10-01 (observado em 2026-09-30)
  Aeródromos no catálogo   : 4491
    gravados               : 3
    inalterados            : 4486
    falhos                 : 2
  Pistas revalidadas       : 1002 (pendentes: 2 · idade: 1000)
  Revalidações adiadas     : 7
  Cartas persistidas       : 12
  Cartas fora do catálogo  : 63
  Documentos arquivados    : 1
  Documentos já existentes : 11
  Documentos removidos     : 0

  Tempo por etapa (soma das linhas de trabalho):
    catálogo               : 6,4s
    cartas                 : 4,8s
    pistas                 : 3m21s
    documentos             : 0,9s
    banco                  : 2,1s
```

- `gravados + inalterados + falhos = aeródromos no catálogo` (restrito aos de `--only` quando
  informado). Aeródromo com pistas revalidadas sem mudança conta como **inalterado**.
- Execução interrompida acrescenta `não iniciados`, para a conta continuar fechando.
- Motivos da revalidação: `pedidos`, `novos`, `pendentes`, `ROTAER`, `AIRAC`, `idade`; só os
  presentes aparecem. `Revalidações adiadas` (vencidos por idade fora do orçamento) só aparece se
  houver.
- Cartas, documentos e falhas de item (PDF inválido, ICAO de `--only` fora do catálogo) aparecem na
  lista de falhas, mas não somam aeródromos falhos.
- Etapas paralelas somam o tempo de cada linha de trabalho — por isso a soma pode exceder a
  duração total. A meta (SC-001) é verificada pela **duração total**.
- As seções de falhas e alertas da feature 002 permanecem.
