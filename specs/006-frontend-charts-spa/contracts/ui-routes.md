# Contrato: rotas e estados de tela

**Feature**: `006-frontend-charts-spa` | **Data**: 2026-08-15

Contrato entre a aplicação e o navegador. As rotas são a interface pública da aplicação:
endereços compartilhados por usuários MUST continuar funcionando, então alterá-las é uma
quebra de contrato.

---

## Rotas

| Caminho | Tela | Requisitos | História |
|---------|------|-----------|----------|
| `/` | Tela inicial | FR-001 | 2 (P2) |
| `/search` | Painel de busca | FR-002, FR-006, FR-008, FR-009 | 1, 3 |
| `/airports/:icao` | Detalhe do aeródromo | FR-013, FR-014, FR-018 | 1, 3 |
| `*` | Endereço desconhecido | FR-005 | 4 |

### `/` — Tela inicial

Apresenta nome do produto, descrição do acervo e um acionamento visível para `/search`
(FR-001). Não emite nenhuma requisição à API — é o que permite cumprir SC-003 (visualmente
completa em menos de 3 s em 3G rápido).

### `/search` — Painel de busca

| Parâmetro | Padrão | Omitido quando |
|-----------|--------|----------------|
| `country` | ausente | nenhum país selecionado |

- O painel expõe **dois** controles: o campo de código ICAO e o seletor de país (FR-006,
  FR-008). Não há listagem de resultados nem paginação — a escolha de uma sugestão leva
  direto ao aeródromo (FR-009).
- O **termo digitado não vive na URL**: ele é um passo até o aeródromo, não um resultado a
  compartilhar. O país permanece na query string, que é o que uma consulta guardada precisa
  reter (FR-011).
- `/search` sem termo MUST orientar o usuário a digitar, não exibir lista vazia nem erro.
- O campo MUST aceitar apenas letras, até o comprimento de um código ICAO; dígitos e
  símbolos não chegam a virar consulta.
- Sugestões MUST ser consultadas a partir de duas letras, com atraso após a digitação para
  respeitar o limite de requisições da API.
- Um `country` malformado MUST ser tratado como ausente, sem quebrar a tela.

### `/airports/:icao` — Detalhe do aeródromo

| Segmento/Parâmetro | Observação |
|--------------------|-----------|
| `:icao` | 4 letras; normalizado para maiúsculas antes da requisição |
| `group` (query) | Aba de procedimentos ativa (FR-014); omitido quando nenhuma foi escolhida |

- Exibe os dados do aeródromo e a lista de procedimentos (FR-018, FR-013), carregados em
  requisições **paralelas e independentes** — a falha de uma não impede a exibição da outra.
- Um `:icao` fora do formato de 4 letras MUST ser tratado localmente como não encontrado, sem
  emitir requisição que a API recusaria com `400`.
- `AIRPORT_NOT_FOUND` MUST produzir a tela de "não encontrado" com caminho de volta à busca
  (FR-005), e não uma mensagem de erro genérica.
- Retornar à busca MUST preservar o país selecionado (FR-011).
- Os procedimentos MUST ser buscados **uma vez por aeródromo**, sem parâmetro de tipo: o
  recorte por grupo acontece em memória. A resposta MUST ser mantida em cache sem expiração
  — o acervo é publicado em ciclos AIRAC de 28 dias e não muda durante uma sessão —, de modo
  que trocar de aba ou voltar ao aeródromo não gere tráfego novo.
- Um `group` que não corresponda a nenhuma aba existente MUST cair em uma aba com conteúdo,
  sem quebrar a tela.
- Sem escolha explícita, a aba inicial MUST ser a primeira **com procedimentos**: um
  aeródromo sem chegadas não pode abrir em um painel vazio tendo cartas nas demais abas.

### `*` — Endereço desconhecido

Informa a situação e oferece caminho de volta ao painel de busca (FR-005).

---

## Ação de abrir a carta

Não é uma rota da aplicação. É um link para a API que abre em nova aba
(`contracts/api-client.md`, R6).

| Aspecto | Regra |
|---------|-------|
| Elemento | Link real (`<a>`), nunca um botão com handler de clique |
| Destino | `{VITE_API_BASE_URL}/v1/airports/{icao}/procedures/{id}/chart` |
| Alvo | Nova aba, com `rel="noopener noreferrer"` |
| Momento | URL montada no acionamento; nunca pré-carregada nem armazenada (FR-017) |
| Condição | Renderizado **apenas** quando `hasChart` é `true` (FR-015) |

Ser um link real é o que mantém o fluxo operável por teclado (SC-007) e preserva os recursos
nativos do navegador. Quando `hasChart` é `false`, a interface exibe indicação textual de
indisponibilidade — não um link desabilitado, que seria ambíguo.

---

## Estados de tela

Toda área que depende de dados MUST distinguir cinco estados (FR-010, FR-019, FR-020). A
regra que fecha SC-006: **nenhuma combinação pode resultar em área em branco sem explicação.**

| Estado | Condição | Conteúdo | Requisito |
|--------|----------|----------|-----------|
| `idle` | Consulta ainda não iniciada | Convite a buscar | FR-010 |
| `loading` | Requisição em andamento | Indicador de progresso | FR-019 |
| `empty` | Resposta válida, `items` vazio | "Nenhum resultado" + sugestão de revisar o termo | FR-010 |
| `success` | Resposta válida com itens | Os dados | — |
| `failure` | `ApiFailure` | Texto em inglês por `code` + nova tentativa se `retryable` | FR-020, FR-021 |

Ocorrências específicas:

- **Nenhum código correspondente** → `empty`, distinto de `idle` e de `failure`.
- **Aeródromo sem procedimentos** → `empty` na área de procedimentos, com o cabeçalho do
  aeródromo ainda visível e sem abas.
- **Grupo de procedimentos vazio** → a aba é exibida assim mesmo, sinalizada, e informa a
  ausência quando aberta.
- **Aeródromo sem pistas** → aviso de ausência, não área em branco.
- **Erro de validação de campo** → mensagem junto ao campo, preservando o texto digitado
  (FR-022, FR-021).

### Concorrência de respostas (FR-012)

Com digitação contínua, várias requisições podem estar em voo. A tela MUST exibir sempre o
resultado do termo **mais recente**, ainda que uma resposta anterior chegue depois. Isso é
obtido pelo cache por chave de parâmetros do React Query, que descarta respostas de chaves
que não são mais a ativa — não por comparação manual de ordem de chegada.

---

## Responsividade (FR-025, FR-026, SC-005)

Faixas verificadas obrigatoriamente: **320 px**, **768 px** e **1440 px**.

| Aspecto | Regra |
|---------|-------|
| Rolagem horizontal | MUST NOT ocorrer em nenhuma largura ≥ 320 px |
| Filtros | Empilhados em telas estreitas; alinhados em telas largas |
| Sugestões | Lista vertical, sem corte de conteúdo em telas estreitas |
| Abas de procedimento | Quebram em linhas conforme a largura, sem rolagem horizontal |
| Alvos de toque | Dimensionados para uso com o dedo em telas pequenas (FR-026) |
| Sobreposição | Nenhum elemento sobreposto ou cortado em qualquer faixa |

Os pontos de quebra vêm do tema do Mantine (`src/shared/theme/theme.ts`), não de valores
literais espalhados pelos componentes.

## Acessibilidade (SC-007)

Aplica-se integralmente às histórias P1 e P2.

- Todo fluxo operável por teclado, com ordem de foco seguindo a ordem visual.
- Foco sempre visível; o indicador padrão MUST NOT ser removido sem substituto de contraste
  equivalente.
- Campo de busca e filtros com rótulo associado — `placeholder` não é rótulo.
- O campo de código MUST expor semântica de `combobox`, anunciando a existência e o estado
  da lista de sugestões.
- As abas de procedimento MUST usar semântica de `tablist`, navegáveis pelas setas.
- Cada tela define um título de documento próprio, para que o histórico do navegador seja
  legível.
- Estrutura de cabeçalhos hierárquica e coerente em cada tela.

## Idioma

Todo texto visível MUST estar em **inglês** (FR-024), incluindo rótulos, ações, estados
vazios, mensagens de erro e títulos de documento.

As cadeias MUST residir em `src/shared/i18n/messages.ts` e em
`src/shared/errors/error-messages.ts`, nunca embutidas nos componentes — o que mantém uma auditoria de idioma possível por inspeção de
dois arquivos e prepara o terreno caso um seletor de idioma entre no escopo.

Isto é exceção registrada ao Princípio VI da constituição, com escopo e prazo definidos na
seção "Constitution Check" de [plan.md](../plan.md). Comentários de código, nomes de
identificadores e documentação permanecem como a constituição determina: código em inglês,
documentação em pt-BR.
