# Specification Quality Checklist: Coletor de aeroportos e cartas IFR do DECEA

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validação — iteração 1

Correções aplicadas antes de marcar os itens acima:

- **Vazamento de implementação**: menções diretas a "Postgres", "S3", "Railway" e "docker-compose"
  foram removidas dos requisitos e dos critérios de sucesso, passando a "banco de dados
  relacional", "bucket de objetos", "ambiente local containerizado". As tecnologias concretas
  permanecem apenas em *Assumptions* e *Dependencies*, onde documentam a decisão já tomada pelo
  autor sem prescrever a solução no corpo normativo.
- **Ambiguidade**: "tentado 3 vezes" foi fixado como "até um total de 3 tentativas" (FR-019),
  eliminando a leitura alternativa de 1 tentativa + 3 repetições.
- **Testabilidade**: SC-001 a SC-007 receberam metas numéricas verificáveis; critérios
  originalmente qualitativos ("coleta confiável") foram substituídos por percentuais e prazos.
- **Escopo**: adicionada a seção *Out of Scope*, delimitando explicitamente a API REST, cartas
  VFR e agendamento em produção como fora desta feature.

### Decisões tomadas por padrão razoável (sem bloquear o autor)

Registradas em *Assumptions* em vez de virar `[NEEDS CLARIFICATION]`:

- Filtros "AD" e "IFR" aplicados na consulta à fonte quando suportado, senão localmente.
- Execução sob demanda; sem autenticação, por ser ferramenta operacional.

### Validação — iteração 2 (confirmações do autor, 2026-08-14)

O autor confirmou explicitamente as duas decisões que estavam pendentes. Elas saíram do terreno
de suposição e viraram requisitos normativos:

- **Extensão no nome do objeto**: promovida de *Assumption* para **FR-016** — o caminho passa a
  ser `/<código ICAO>/<identificador da carta>.pdf`. As demais menções ao caminho (História 3,
  SC-003) foram alinhadas.
- **Remoção do documento do bucket**: promovida de *Assumption* para o novo **FR-019**, que
  complementa FR-014 (vigência da carta no banco) cobrindo o bucket. Adicionado o cenário de
  aceite 4 na História 3 para torná-lo verificável.
- **Renumeração**: a inserção de FR-019 deslocou os requisitos seguintes; a faixa FR-001..FR-031
  permanece contígua e sem duplicatas.

### Validação — iteração 3 (respostas reais da API, 2026-08-15)

O autor forneceu respostas reais de `area=cartas` e `area=rotaer` (SBGL), além da semântica do
filtro. Três premissas da spec caíram e foram corrigidas:

- **"IFR é um tipo de carta" → IFR é uma *espécie***, que agrupa 13 tipos (`ADC, AOC, ARC,
  ATCSMAC, GMC, IAC, LC, OTR, PATC, PDC, SID, STAR, VAC`). FR-011, o cenário 1 da História 2,
  SC-003 e a *Assumption* correspondente foram reescritos. Note que `ADC`, `PDC` e `VAC` **são**
  cartas IFR — uma allow-list ingênua de `IAC/SID/STAR` teria descartado dado legítimo.
- **"filtrar localmente caso a fonte não suporte" → impossível.** A resposta não ecoa a espécie
  consultada (`<especie>` vale `Convencionais`), e o tipo `VAC` existe tanto em IFR quanto em VFR.
  Nenhum campo permite reclassificar. A garantia do FR-011 passa a depender do parâmetro
  `especie=IFR`, e o novo **FR-012** exige alertar sobre tipos desconhecidos sem descartá-los —
  preferindo dado a mais (visível) a dado a menos (silencioso).
- **Campo de emenda**: é o elemento `<amdt>` de cada carta, não `<emenda>`. O atributo `emenda` do
  envelope `<cartas>` é a data AIRAC do conjunto e gravá-lo preencheria todas as cartas com o
  mesmo valor.

**Renumeração**: a inserção do FR-012 deslocou os seguintes; a faixa FR-001..FR-032 permanece
contígua, sem duplicatas, e todas as citações nos demais artefatos foram reconferidas **por
significado**, não por aritmética.


### Validação — iteração 4 (premissas do projeto, 2026-08-15)

Duas decisões do autor, ambas fora do corpo da spec (são de implementação e de repositório, não de
requisito) e registradas no plano:

- **Orientação a objetos em `apps/jobs`** confirmada como premissa. Já era exigida pelo Princípio
  III da constituição e adotada implicitamente no plano; passou a ser explícita na nova seção
  "Desenho orientado a objetos" do `plan.md`, com 7 regras verificáveis, o grafo de colaboração
  das classes e o critério de verificação (se uma classe não é testável por injeção de construtor,
  é violação a corrigir, não a contornar com mock de módulo). A árvore de código do plano passou a
  nomear as classes (`class DeceaCrawlerJob implements Job`) em vez de apenas arquivos.
- **Remoção de `apps/cli` e `packages/core`**, pacotes de referência da feature 001. Verificado
  antes de remover que nenhum código de produção dependia deles (só `apps/cli` importava `core`, e
  ambos saíram juntos). `pnpm check` passa nos quatro portões com o workspace vazio. Atualizados
  `README.md` (estrutura e exemplos) e `CHANGELOG.md` (seção "Não publicado"). As referências em
  `specs/001-monorepo-skeleton/` foram preservadas: são registro histórico de uma feature
  concluída, não documentação do estado atual.
