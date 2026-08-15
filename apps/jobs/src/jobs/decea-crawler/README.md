# Rotina `decea-crawler`

Coleta da API AISWEB do DECEA todos os aeródromos do tipo `AD`, enriquece cada um com coordenadas
e pistas, coleta as suas cartas IFR e arquiva os PDFs correspondentes num bucket compatível com S3.

Documentação do host, configuração e códigos de saída: [`apps/jobs/README.md`](../../../README.md).

---

## Utilização

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler [opções]
```

### Opções

| Opção | Padrão | Finalidade |
| ----- | ------ | ---------- |
| `--page-size <n>` | `100` | Itens por página do catálogo |
| `--concurrency <n>` | `4` | Aeródromos processados em simultâneo |
| `--max-attempts <n>` | `3` | Tentativas por aeródromo antes de o marcar como falho |
| `--skip-documents` | desligado | Coleta metadados sem descarregar os PDFs |
| `--only <ICAO,ICAO>` | — | Restringe a varredura aos ICAOs indicados, sem paginar |

Os padrões são os valores de produção. As opções existem para diagnóstico e para encurtar o ciclo
de verificação manual — não para afinar desempenho: subir `--concurrency` acima de 4 pressiona a
fonte e arrisca limitação de taxa.

### Receitas

```bash
# Varredura completa (o modo de produção)
pnpm --filter @open-nav-charts/jobs start decea-crawler

# Verificação rápida contra um aeródromo conhecido
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGL

# Só metadados: não toca no bucket, muito mais rápido (~10 min para o catálogo inteiro)
pnpm --filter @open-nav-charts/jobs start decea-crawler --skip-documents

# Investigar um conjunto específico, sem concorrência para a saída ficar legível
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGR,SBSP --concurrency 1
```

---

## O que faz, passo a passo

```text
1. countAirports()            total do catálogo → Math.ceil(total / page-size) páginas
2. para cada página:
     listAirportIcaos()       os ICAOs da página
     para cada ICAO (4 em simultâneo, envolvidos em RetryPolicy):
       ProcessAirport.execute()
3. resumo final
```

`DeceaCrawlerJob` cuida da **varredura** (paginação e concorrência); `ProcessAirport` cuida de **um
aeródromo**. Essa divisão é o que permite à política de tentativas envolver o caso de uso inteiro
sem que ele saiba que está a ser repetido.

### O aeródromo é a unidade atómica de repetição

Uma falha em qualquer etapa reexecuta o **aeródromo inteiro**, até 3 tentativas. É seguro porque
cada etapa é idempotente: upsert por ICAO, upsert por id de carta, upload por chave determinística.
Repetir não duplica.

### Ordem de gravação dentro de `ProcessAirport`

Base de dados e bucket não partilham transação, pelo que a ordem é escolhida para que qualquer
falha degrade para um estado inofensivo e autocorrigível:

1. **Arquivar** no bucket os documentos ainda não arquivados;
2. **Uma transação**: upsert do aeródromo, substituição das pistas, *diff* das cartas;
3. **Após o commit**: remover do bucket os objetos das cartas que saíram de vigência.

Falha entre 1 e 2 deixa um objeto órfão no bucket — a execução seguinte sobrescreve-o ou remove-o.
Falha em 3 deixa igualmente um órfão, também limpo depois. A ordem inversa (apagar antes do commit)
produziria o único estado realmente mau: um registo na base de dados a apontar para um documento
que já não existe.

---

## Classificação de erros

Determina o que consome as 3 tentativas e o que falha de imediato:

| Situação | Classe | Efeito |
| -------- | ------ | ------ |
| Timeout, DNS, conexão recusada | Retentável | Nova tentativa com *backoff* |
| HTTP 5xx, HTTP 429 | Retentável | Nova tentativa com *backoff* |
| `total` das cartas divergente da contagem de itens | Retentável | Resposta truncada; vale repetir |
| HTTP 4xx (exceto 429) | Definitivo | Aeródromo falho, sem repetir |
| XML malformado ou envelope vazio | Definitivo | Aeródromo falho, sem repetir |
| Campo obrigatório em falta (`AeroCode`, `name`, `id`/`nome`/`tipo` da carta) | Definitivo | Aeródromo falho |
| PDF inválido ou vazio | Definitivo | **A carta** falha; as restantes do aeródromo prosseguem |
| HTTP 401/403 | Abortivo | Encerra a execução inteira com código `3` |

Repetir um `400` só desperdiça tempo e agrava a limitação de taxa — por isso erros definitivos não
consomem tentativas. E 401/403 aborta tudo em vez de marcar 4441 aeródromos como falhos: com
credencial inválida todos falhariam igualmente, e insistir só gera ruído.

O *backoff* é exponencial com *jitter*. Sem o *jitter*, os 4 workers voltariam a bater na fonte em
sincronia após uma falha coletiva.

---

## O que é persistido

| Tabela | Conteúdo | Chave |
| ------ | -------- | ----- |
| `airport` | ICAO, nome, cidade, UF, latitude, longitude | `icao` |
| `airport_runway` | Designação da pista, comprimento e largura em metros | `(airport_icao, ident)` único |
| `airport_procedure` | Id, nome, tipo, emenda, URL de origem, chave no bucket | `id` |

No bucket, um objeto por carta em `<ICAO>/<id da carta>.pdf`, com `Content-Type: application/pdf`.
A chave é derivável, nunca aleatória — é isso que torna o upload idempotente e permite verificar a
existência antes de descarregar.

**Campos opcionais em falta** (cidade, UF, coordenadas) não impedem a gravação: o aeródromo é
persistido com o que há e a ausência entra nos alertas do resumo. Já `name` em falta torna o
aeródromo falho — sem nome o registo não serve para nada.

Latitude e longitude são gravadas **juntas ou nenhuma**: meia coordenada é inútil.

Aeródromos **nunca são removidos** por esta rotina. A AISWEB não publica lista de aeródromos
extintos, e apagar por ausência arriscaria destruir dados após uma coleta parcial.

---

## Peculiaridades da fonte

Cada uma destas foi descoberta contra respostas reais e tem teste a cobri-la. O contrato completo
está em [`specs/002-decea-crawler-job/contracts/aisweb-api.md`](../../../../../specs/002-decea-crawler-job/contracts/aisweb-api.md).

**O filtro IFR é o parâmetro `especie=IFR`, e só ele.** A resposta não ecoa a espécie consultada, e
o mesmo tipo (`VAC`) existe tanto em IFR como em VFR — nenhum campo permite reclassificar
localmente. Não há refiltro local, e isso é deliberado: uma allow-list descartaria em silêncio
qualquer tipo novo que o DECEA publique.

**A defesa é observabilidade.** A rotina acumula a distribuição de tipos e alerta quando surge um
fora das 13 siglas conhecidas da espécie IFR. A carta é persistida na mesma — a fonte é a
autoridade; o alerta só avisa que a lista de referência envelheceu. Na coleta de 2026-08-15
apareceu `AGMC`, um 14.º tipo ainda por confirmar com o DECEA.

**A emenda da carta é o elemento `<amdt>`, não o atributo `emenda` do envelope.** O atributo é a
data AIRAC do conjunto, igual para todas as cartas; usá-lo gravaria o mesmo valor em todas.

**As coordenadas `<lat>`/`<lng>` já vêm em graus decimais com sinal.** Não há conversão no caminho
principal; `latRotaer`/`lngRotaer` (sexagesimais) servem apenas de recurso se o par decimal faltar.

**A fonte publica pistas repetidas.** Em `SNAO`, `SNCW`, `SSNG` e `SSWN` o mesmo `ident` aparece
duas vezes, uma delas com dimensões espúrias (`09/27` com 24 m e com 1295 m). Como
`(airport_icao, ident)` é único, o parser deduplica mantendo a de maior comprimento — a pista real.
Sem isso, a violação do índice derrubaria o aeródromo inteiro.

**Alguns aeródromos não têm detalhamento.** `SI5J` e `SJZ1` constam na listagem mas a fonte devolve
`<aisweb></aisweb>`. É tratado como falha definitiva: repetir não faz o dado aparecer.

**A paginação usa `Math.ceil`.** Truncar perderia a última página parcial — com 4441 aeródromos em
páginas de 100, seriam 44 páginas em vez de 45, deixando 41 registos para trás. A varredura também
termina em página vazia, o que protege contra um catálogo que mude durante a execução.

---

## Ficheiros

| Ficheiro | Responsabilidade |
| -------- | ---------------- |
| `decea-crawler-job.ts` | A varredura: paginação e limite de concorrência |
| `process-airport.ts` | Um aeródromo ponta a ponta — a unidade atómica de repetição |
| `chart-archiver.ts` | Verifica existência, descarrega, valida e envia o PDF ao bucket |
| `chart-type-audit.ts` | Acumula a distribuição de tipos e sinaliza os desconhecidos |
| `pagination.ts` | Cálculo de páginas e deslocamentos (funções puras) |
| `procedure-diff.ts` | *Diff* entre as cartas da fonte e as persistidas (função pura) |

---

## Desempenho observado

Medido a 2026-08-15, contra a AISWEB real, com os valores padrão:

| Modo | Duração | Resultado |
| ---- | ------- | --------- |
| `--skip-documents` | ~10 min | 4439 de 4441 aeródromos, 1743 cartas |
| Com documentos | Depende do que já está no bucket | Reexecução sobre bucket cheio é quase tão rápida quanto `--skip-documents` |

A taxa de falha observada foi de 0,045% — as duas únicas falhas são os aeródromos sem detalhamento
publicado. Descarregar os PDFs domina o tempo na primeira execução; nas seguintes, a verificação de
existência por chave evita quase todos os downloads.
