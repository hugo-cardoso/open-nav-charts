# Contrato consumido — API AISWEB (DECEA), adendo da feature 007

**Tipo**: dependência externa. Complementa
[`specs/002-decea-crawler-job/contracts/aisweb-api.md`](../../002-decea-crawler-job/contracts/aisweb-api.md);
o que não é citado aqui continua valendo como lá.

> **Status de verificação**: todas as operações abaixo foram **sondadas ao vivo** em 2026-10-08
> com as credenciais de produção. Ver [research.md](../research.md) R1–R3.

---

## Operação 1 (alterada) — Catálogo de aeródromos em lote

```http
GET /api/?apiKey={key}&apiPass={pass}&area=rotaer&type=AD&rowstart={offset}&rowend={size}
```

Mesma operação de antes; muda o **uso**:

| | Feature 002 | Feature 007 |
|---|---|---|
| `rowend` (tamanho de página) | 100 | **5.000** — o catálogo inteiro numa resposta |
| Campos consumidos | só `AeroCode` | `AeroCode`, `name`, `city`, `uf`, `lat`, `lng`, `dt` |

**Item observado**

```xml
<rotaer pagesize="3" total="4491">
  <item ciad_id="7160">
    <id>4921c5c7-5b01-4c65-a222-1c640dbb0337</id>
    <type>AD</type>
    <AeroCode>SBCB</AeroCode>
    <ciad>RJ0003</ciad>
    <name><![CDATA[Cabo Frio]]></name>
    <city><![CDATA[Cabo Frio]]></city>
    <uf>RJ</uf>
    <lng>-42.071388888889</lng>
    <lat>-22.920833333333</lat>
    <dt>2026-10-08</dt>
  </item>
</rotaer>
```

**Contrato de uso**
- `name`, `city`, `uf`, `lat`, `lng` seguem as mesmas regras de obrigatoriedade e formato da
  operação 2 da feature 002 (coordenadas decimais com sinal; meia coordenada vale nenhuma).
- Item sem `AeroCode` ou `name` → o item é ignorado e registrado como alerta; não derruba o
  catálogo.
- `<dt>` (`AAAA-MM-DD`) é a **data da última alteração do registro ROTAER** do aeródromo — igual
  no detalhamento, varia por aeródromo. Vira `AirportCatalogEntry.updatedOn` e dispara a
  revalidação das pistas quando muda (research R10). Ausente → `null`, sem efeito.
- **Não há pistas** neste item; elas continuam vindo da operação 2.
- A paginação (`Math.ceil(total / rowend)`, encerramento em página vazia) é mantida, para o caso
  de o catálogo um dia ultrapassar o tamanho de página.

---

## Operação 2 (inalterada no formato) — Detalhar aeródromo

Usada agora **apenas para as pistas**, e só para os aeródromos pendentes (research R5). O nome,
cidade, UF e coordenadas da resposta continuam sendo lidos, mas os valores gravados vêm do catálogo
— são idênticos (conferido em `SBGL`).

- Envelope vazio (`SI5J`, `SJZ1`) segue sendo falha **definitiva**.
- Várias ICAOs numa mesma consulta (`icaoCode=SBGL,SBSP`) **não são suportadas** pela fonte.

---

## Operação 3 (alterada) — Todas as cartas IFR em lote

```http
GET /api/?apiKey={key}&apiPass={pass}&area=cartas&especie=IFR
```

Sem `icaoCode`. Substitui a consulta por aeródromo.

**Envelope observado**

```xml
<cartas emenda="     2026-10-01     " lastupdate="     {ts '2026-09-30 17:35:34'}     " total="     1807     ">
  <item id="…">
    <id>…</id>
    <tipo>IAC</tipo>
    <nome><![CDATA[RNP Y RWY 28]]></nome>
    <IcaoCode>SBGL</IcaoCode>
    <link><![CDATA[https://aisweb.decea.gov.br/download/?arquivo=…&amp;apikey=…]]></link>
    <amdt>2601A1</amdt>
  </item>
</cartas>
```

| Elemento | Uso | Observado |
|----------|-----|-----------|
| `cartas/@lastupdate` | `IfrChartCatalog.lastUpdate` | `{ts 'AAAA-MM-DD HH:MM:SS'}` com espaços em volta; **global** — igual em todas as consultas IFR |
| `cartas/@emenda` | `IfrChartCatalog.airacCycle` | `AAAA-MM-DD`, com espaços em volta; global |
| `cartas/@total` | Conferência de truncamento | Igual ao número de `<item>` (1.807) |
| `item/IcaoCode` | `ChartSummary.airportIcao` | **Obrigatório por item** nesta operação — é o único vínculo com o aeródromo |

**Contrato de uso**
- `rowstart`/`rowend` são ignorados pela fonte nesta operação — não enviar.
- `total` divergente da contagem de itens → **falha retentável**; persistindo, a execução é
  abortada **sem gravar nada** (uma lista truncada faria cartas parecerem retiradas).
- `lastupdate`: extrair o conteúdo de `{ts '…'}` e aparar. Formato diferente → `null` (tratado como
  mudança pela regra de R5). `emenda`: aparar; vazio → `null`.
- Item sem `IcaoCode` → erro definitivo da operação (não dá para atribuir a carta).
- **Cartas de ICAO fora do catálogo `AD`** (32 em 2026-10-08, ex.: `SBEN`, `SBWA`) são devolvidas
  pela fonte e **descartadas** pelo coletor, com a contagem no resumo.
- As demais regras da feature 002 continuam: `especie=IFR` é a única fonte da distinção IFR/VFR,
  sem refiltro local; `<amdt>` é a emenda da carta, não `@emenda`; auditoria de tipos.

---

## Operação 4 (alterada) — Baixar o PDF da carta

Só é chamada para cartas cuja chave **não** aparece na listagem do bucket.

- Os `<link>` apontam para `aisweb.decea.gov.br`, que em 2026-10-08 não resolvia em parte dos DNS
  públicos. **Em falha de rede** no link, o cliente recorre à URL derivada
  `https://aisweb.decea.mil.br/download/?arquivo={id}&apikey={key}` — o mesmo recurso que já valia
  para link ausente (research R11). Erro HTTP do link não troca de URL.

---

## Fixtures a versionar

Em `packages/aisweb-client/src/parsers/__fixtures__/`, recortadas de respostas reais:

| Fixture | Cobre |
|---------|-------|
| `rotaer-catalogo.xml` | Itens com `name`/`city`/`uf`/`lat`/`lng`, `<dt>` ignorado, `pagesize` e `total` |
| `cartas-lote.xml` | Atributos com espaços, `{ts '…'}`, itens de vários ICAOs (inclusive um fora do catálogo) |
| `cartas-lote-truncado.xml` | `total` maior que o número de itens |
| `cartas-lote-sem-icao.xml` | Item sem `IcaoCode` |
