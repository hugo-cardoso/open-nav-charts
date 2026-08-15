# Contrato consumido — API AISWEB (DECEA)

**Tipo**: dependência externa. Este contrato descreve o que a rotina **espera** da fonte; não é
implementado por nós.

**Base**: `https://aisweb.decea.mil.br/api/`
**Autenticação**: query string `apiKey` + `apiPass` em toda chamada
**Formato**: XML (`text/xml`) em todas as respostas
**Encapsulamento**: apenas `packages/aisweb-client` conhece este contrato. Nenhum outro pacote
importa XML, nomes de campo da AISWEB ou credenciais da fonte.

> **Status de verificação**: **todas as operações confirmadas contra respostas reais da API**
> (amostras de `SBGL` fornecidas pelo autor em 2026-08-15). Os nomes de elemento e formatos abaixo
> são observados, não presumidos. Ver [research.md](../research.md) R2 e R4.

---

## Operação 1 — Listar aeródromos (paginado)

```http
GET /api/?apiKey={key}&apiPass={pass}&area=rotaer&type=AD&rowstart={offset}&rowend={size}
```

| Parâmetro | Valor | Observação |
|-----------|-------|------------|
| `area` | `rotaer` | |
| `type` | `AD` | Filtra aeródromos (FR-006) |
| `rowstart` | `(página - 1) * 100` | Deslocamento, base 0 |
| `rowend` | `100` | Tamanho da página (FR-007) |

**Resposta esperada**

```xml
<aisweb>
  <rotaer total="4550">
    <item><AeroCode>SBGR</AeroCode>…</item>
    <item><AeroCode>SBSP</AeroCode>…</item>
  </rotaer>
</aisweb>
```

**Contrato de uso**
- `rotaer/@total` é a contagem global; o número de páginas é `Math.ceil(total / 100)`.
- Só `AeroCode` é consumido daqui; os demais campos vêm da operação 2.
- Página vazia encerra a paginação, mesmo que `total` sugira mais — protege contra catálogo que
  muda durante a varredura e contra laço infinito.

---

## Operação 2 — Detalhar aeródromo

```http
GET /api/?apiKey={key}&apiPass={pass}&area=rotaer&icaoCode={ICAO}
```

**Resposta esperada** (trecho relevante da resposta real de `SBGL`)

```xml
<aisweb>
  <AeroCode>SBGL</AeroCode>
  <name><![CDATA[Galeão - Antônio Carlos Jobim]]></name>
  <city><![CDATA[Rio de Janeiro]]></city>
  <uf>RJ</uf>
  <lat>-22.81</lat>
  <lng>-43.250555555556</lng>
  <latRotaer>22 48 36S</latRotaer>
  <lngRotaer>043 15 02W</lngRotaer>
  <type>AD</type>
  <runways count="2">
    <runway compl="">
      <type>RWY</type>
      <ident>10/28</ident>
      <surface compl="">CONC</surface>
      <length compl="">4000</length>
      <width compl="">45</width>
      <surface_c compl="">78/R/A/W/T</surface_c>
      <thr compl=""><ident>10</ident>…</thr>
    </runway>
  </runways>
</aisweb>
```

| Elemento | Domínio | Obrigatório | Formato observado |
|----------|---------|-------------|-------------------|
| `AeroCode` | `Airport.icao` | sim | 4 letras maiúsculas |
| `name` | `Airport.name` | sim | `CDATA`, acentuado |
| `city` | `Airport.city` | não | `CDATA`, acentuado |
| `uf` | `Airport.state` | não | 2 letras maiúsculas |
| `lat` / `lng` | `Airport.latitude` / `longitude` | não | **Graus decimais com sinal** (S e W negativos) |
| `runways/runway/ident` | `AirportRunway.ident` | sim, se houver pista | Ex.: `10/28` |
| `runways/runway/length` \| `width` | `AirportRunway.length_m` \| `width_m` | não | Inteiro, em metros |

**Campos presentes na resposta e deliberadamente não persistidos nesta feature**: `latRotaer` e
`lngRotaer` (mesmas coordenadas em sexagesimal), `surface` e `surface_c` (tipo de piso e PCN),
`altM`/`altFt`, `lights`, `thr`, `services`, `rmk`. São candidatos a features futuras; registrados
aqui para que a informação não se perca.

**Contrato de uso**
- Ausência de `AeroCode` ou `name` → erro **definitivo** (não retentável): o aeródromo é marcado
  como falho sem consumir as 3 tentativas.
- **Envelope vazio** (`<aisweb></aisweb>`) → também definitivo. Observado na coleta real de
  2026-08-15: uma minoria de aeródromos (ex.: `SI5J`, `SJZ1`) consta na listagem da operação 1
  mas não tem detalhamento publicado. Repetir não faz o dado aparecer; o aeródromo entra no
  relatório de falhas e a varredura segue.
- `runways` ausente ou vazio → aeródromo válido com zero pistas.
- **Pista repetida**: observado em 2026-08-15 que a fonte publica o mesmo `ident` duas vezes no
  mesmo aeródromo (`SNAO`, `SNCW`, `SSNG`, `SSWN`), uma das ocorrências com dimensões espúrias —
  `09/27` aparece com 24 m e com 1295 m. Como `(airport_icao, ident)` é único no modelo, o
  parser deduplica mantendo a de **maior comprimento**, que é a pista real. Sem isso, a violação
  do índice derruba a transação do aeródromo inteiro.
- `lat`/`lng` são consumidas diretamente: **já vêm em graus decimais com sinal**, sem conversão.
  `latRotaer`/`lngRotaer` (sexagesimais) servem apenas de fallback se o par decimal faltar.
- A precisão da fonte (até 12 casas) é arredondada para as 6 casas de `numeric(9,6)` — ~0,1 m.
- `CDATA` e acentuação exigem leitura em UTF-8 e desembrulho antes de persistir.

---

## Operação 3 — Listar cartas do aeródromo

```http
GET /api/?apiKey={key}&apiPass={pass}&area=cartas&icaoCode={ICAO}&especie=IFR
```

> **`especie`, não `tipo`.** `especie` seleciona a categoria (`IFR`/`VFR`); `tipo` seleciona a
> sigla da carta (`IAC`, `SID`, …). Enviar `tipo=IFR` não filtra nada — `IFR` não é um tipo.

**Resposta esperada** (trecho real de `SBGL`, 43 cartas)

```xml
<aisweb>
  <cartas emenda="2026-08-06" lastupdate="{ts '2026-07-26 17:50:35'}" total="43">
    <item id="e0d1c9f2-6564-4465-8f57eb1708fa53f1">
      <id>e0d1c9f2-6564-4465-8f57eb1708fa53f1</id>
      <especie>Convencionais</especie>
      <tipo>IAC</tipo>
      <tipo_descr>Carta de aproximação por instrumentos</tipo_descr>
      <nome><![CDATA[RNP Y RWY 28]]></nome>
      <IcaoCode>SBGL</IcaoCode>
      <link><![CDATA[https://aisweb.decea.gov.br/download/?arquivo=e0d1…&amp;apikey=…]]></link>
      <amdt>2601A1</amdt>
      <use>Ostensivo</use>
    </item>
  </cartas>
</aisweb>
```

| Elemento | Domínio | Obrigatório | Formato observado |
|----------|---------|-------------|-------------------|
| `id` | `AirportProcedure.id` | sim | UUID (último grupo sem hífen). Repetido no atributo `id` do `<item>` |
| `nome` | `.name` | sim | `CDATA` |
| `tipo` | `.type` | sim | Sigla: `IAC`, `SID`, `STAR`, `VAC`, `ADC`, `AOC`, `PDC`… |
| `amdt` | `.amendment` | não | Ex.: `2601A1`, `2512A1` |
| `link` | `.source_url` | não | URL absoluta em `CDATA`, com `&amp;` a desescapar |

**Armadilha — o atributo `emenda` do envelope não é a emenda da carta.** `<cartas emenda="…">` é a
data da emenda AIRAC do conjunto (`2026-08-06`), igual para todas as cartas. A emenda por carta é
o elemento `<amdt>` de cada `<item>`. Gravar o atributo do envelope preencheria todas as cartas
com o mesmo valor e perderia o dado exigido pelo FR-013.

**Tipos da espécie IFR** (13, conforme o DECEA):

```text
ADC, AOC, ARC, ATCSMAC, GMC, IAC, LC, OTR, PATC, PDC, SID, STAR, VAC
```

> **Observado na coleta real de 2026-08-15**: a fonte publica também `AGMC` dentro da espécie
> IFR — um 14º tipo, ausente da lista acima. As cartas foram persistidas normalmente e o alerta
> do FR-012 as sinalizou, que é exatamente o comportamento desenhado: a fonte é a autoridade e a
> lista de referência apenas envelhece. Confirmar com o DECEA antes de a acrescentar às siglas
> conhecidas de `ChartTypeAudit`.

**Contrato de uso**
- `especie=IFR` é a **única** fonte da distinção IFR/VFR. A resposta **não ecoa** a espécie
  consultada: `<especie>` vale `Convencionais` em todos os itens, referindo-se a outra dimensão.
- Não há refiltro local por tipo, e isso é deliberado: o mesmo `tipo` (notadamente `VAC`) existe
  nas espécies IFR e VFR, então nenhum campo da resposta permite reclassificar. Uma allow-list de
  tipos, além de não separar as espécies, descartaria em silêncio qualquer tipo novo publicado
  pelo DECEA dentro da espécie IFR.
- **Instrumentação obrigatória**: o coletor acumula a distribuição de `tipo` e registra um alerta
  no relatório quando aparecer um tipo fora dos 13 acima. A carta é persistida normalmente — a
  fonte é a autoridade; o alerta apenas sinaliza que a lista de referência envelheceu.
- `cartas` ausente ou vazio → aeródromo válido com zero cartas.
- Carta sem `id`, `nome` ou `tipo` → erro definitivo para aquele aeródromo.
- `cartas/@total` serve de conferência: divergir do número de `<item>` recebidos indica resposta
  truncada e deve ser tratado como falha retentável.

---

## Operação 4 — Baixar o PDF da carta

```http
GET {link da carta}
```
Fallback quando `link` estiver ausente:
```http
GET https://aisweb.decea.mil.br/download/?arquivo={id}&apikey={key}
```

**Contrato de uso**
- O `<link>` já vem absoluto e com a `apikey` embutida; basta desescapar `&amp;` → `&`.
- Resposta aceita apenas se: status 2xx, corpo com tamanho > 0 e iniciando com `%PDF-` (FR-019).
- `Content-Type` é ignorado como critério — não é confiável nesta fonte.
- Qualquer outro resultado é falha de download da carta.

---

## Classificação de erros

Determina o que consome as 3 tentativas (FR-021) e o que falha de imediato.

| Situação | Classe | Efeito |
|----------|--------|--------|
| Timeout, DNS, conexão recusada | Retentável | Nova tentativa com *backoff* |
| HTTP 5xx | Retentável | Nova tentativa com *backoff* |
| HTTP 429 | Retentável | Nova tentativa com *backoff* maior |
| HTTP 401/403 | Definitivo | Aborta a rotina — credencial inválida afeta tudo |
| HTTP 4xx (demais) | Definitivo | Aeródromo falho, sem repetir |
| XML malformado | Definitivo | Aeródromo falho, sem repetir |
| Campo obrigatório ausente | Definitivo | Aeródromo falho, sem repetir |
| PDF inválido/vazio | Definitivo | Carta falha; demais cartas prosseguem |

401/403 aborta a execução inteira em vez de marcar aeródromos como falhos: com credencial inválida
todos os 4.550 falhariam igualmente, e insistir só gera ruído no relatório.

---

## Fixtures e verificação

Os nomes e formatos deste contrato foram observados em respostas reais (`SBGL`, 2026-08-15), não
presumidos. As amostras **devem** ser versionadas em
`packages/aisweb-client/src/parsers/__fixtures__/` e usadas pelos testes unitários dos parsers, que
rodam sem rede (Princípio IV).

Fixtures mínimas a versionar:

| Fixture | Cobre |
|---------|-------|
| `rotaer-list.xml` | Paginação, `rotaer/@total`, extração de `AeroCode` |
| `rotaer-sbgl.xml` | Coordenadas decimais, múltiplas pistas, `CDATA` acentuado |
| `rotaer-minimo.xml` | Aeródromo sem `city`/`uf`/`lat`/`lng` e sem pistas |
| `cartas-sbgl.xml` | Os 7 tipos observados, `amdt` por item vs. atributo `emenda` do envelope |
| `cartas-vazio.xml` | Aeródromo sem cartas |

Se um dia a API mudar um nome de elemento, o teste do parser correspondente quebra antes da
execução real — que é exatamente o ponto de manter as fixtures versionadas.
