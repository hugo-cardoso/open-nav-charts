# Feature Specification: Esqueleto do Monorepo

**Feature Branch**: `feature/001-monorepo-skeleton`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "crie o esqueleto do monorepo pnpm, considerando o biome e vitest também."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instalar o repositório e ter tudo pronto (Priority: P1)

Uma pessoa desenvolvedora clona o repositório pela primeira vez, executa um único comando de
instalação e obtém um workspace funcional: todos os pacotes reconhecidos, dependências
resolvidas e ferramentas de qualidade e teste disponíveis, sem precisar de passos manuais
descritos fora do repositório.

**Why this priority**: Sem a estrutura de workspace instalável, nenhuma outra capacidade do
repositório existe. É a fatia mínima que entrega valor: um monorepo que se instala.

**Independent Test**: Clonar o repositório em uma máquina limpa, executar o comando de
instalação e verificar que ele termina com sucesso, que os pacotes do workspace aparecem
listados e que nenhum passo manual adicional foi necessário.

**Acceptance Scenarios**:

1. **Given** um clone limpo do repositório, **When** a pessoa executa o comando de instalação, **Then** a instalação conclui com sucesso e todos os pacotes do workspace são reconhecidos.
2. **Given** uma máquina com versão de runtime diferente da exigida pelo projeto, **When** a pessoa executa a instalação, **Then** o repositório sinaliza a incompatibilidade de versão de forma explícita em vez de prosseguir silenciosamente.
3. **Given** o repositório instalado, **When** a pessoa tenta instalar usando um gerenciador de pacotes não suportado, **Then** a operação é bloqueada com mensagem indicando o gerenciador correto.

---

### User Story 2 - Verificar qualidade de código com um comando (Priority: P2)

Uma pessoa desenvolvedora quer saber, antes de abrir uma mudança, se o código está em
conformidade com as regras de estilo e lint do projeto. Ela executa um único comando na raiz
e recebe o veredito para todo o monorepo, com opção de corrigir automaticamente o que for
corrigível.

**Why this priority**: A verificação de qualidade é o portão que mantém a base consistente
desde o primeiro pacote; adiá-la significa acumular divergências que depois custam caro.

**Independent Test**: Introduzir deliberadamente uma violação de formatação e outra de lint em
um arquivo, executar o comando de verificação na raiz e confirmar que ambas são reportadas
com arquivo e linha, e que o comando de correção resolve as corrigíveis.

**Acceptance Scenarios**:

1. **Given** o repositório com código em conformidade, **When** a pessoa executa a verificação de qualidade na raiz, **Then** o comando termina com sucesso e sem violações reportadas.
2. **Given** um arquivo com formatação divergente da regra do projeto, **When** a pessoa executa a verificação, **Then** o comando falha e identifica o arquivo e a posição da violação.
3. **Given** violações automaticamente corrigíveis, **When** a pessoa executa o comando de correção, **Then** os arquivos são ajustados e a verificação subsequente passa.
4. **Given** um pacote recém-criado no workspace, **When** a verificação é executada na raiz, **Then** o novo pacote é incluído sem necessidade de configuração própria de qualidade.

---

### User Story 3 - Executar a suíte de testes do monorepo (Priority: P2)

Uma pessoa desenvolvedora executa um único comando na raiz e obtém o resultado dos testes de
todos os pacotes do workspace, além de poder executar os testes de um pacote isolado enquanto
trabalha nele.

**Why this priority**: Testes são um portão de qualidade não negociável do projeto; a
infraestrutura precisa existir antes que qualquer lógica seja escrita, para que o primeiro
código já nasça coberto.

**Independent Test**: Adicionar um teste trivial que passa e um que falha em um pacote,
executar a suíte na raiz e confirmar que o resultado agregado reflete ambos, e que executar
apenas o pacote produz o mesmo veredito para aquele escopo.

**Acceptance Scenarios**:

1. **Given** pacotes com testes no workspace, **When** a pessoa executa a suíte na raiz, **Then** os testes de todos os pacotes são executados e um resultado agregado é apresentado.
2. **Given** um teste que falha em qualquer pacote, **When** a suíte é executada na raiz, **Then** o comando termina em falha e indica o pacote e o teste responsáveis.
3. **Given** um pacote específico, **When** a pessoa executa os testes apenas desse pacote, **Then** somente os testes daquele pacote são executados.
4. **Given** a suíte de testes, **When** ela é executada duas vezes seguidas sem mudanças, **Then** o resultado é idêntico nas duas execuções.

---

### User Story 4 - Criar um novo pacote seguindo o padrão (Priority: P3)

Uma pessoa desenvolvedora precisa adicionar um novo pacote ao monorepo. Ela replica a
estrutura de um pacote existente, e o novo pacote passa a ser reconhecido pelo workspace e
coberto pelos comandos de qualidade, tipos e testes sem ajustes na configuração da raiz.

**Why this priority**: Amplia o valor do esqueleto ao torná-lo extensível, mas o repositório
já entrega valor com os pacotes iniciais mesmo sem esse fluxo documentado.

**Independent Test**: Criar um pacote novo copiando a estrutura de referência, executar
instalação, verificação de qualidade, verificação de tipos e testes na raiz, e confirmar que o
novo pacote é incluído em todos eles.

**Acceptance Scenarios**:

1. **Given** a estrutura de um pacote de referência, **When** a pessoa cria um novo pacote seguindo esse padrão, **Then** ele é reconhecido pelo workspace após a instalação.
2. **Given** um pacote novo que declara dependência de outro pacote do workspace, **When** a instalação é executada, **Then** a dependência é resolvida internamente ao repositório, sem baixar uma versão publicada.
3. **Given** um pacote novo, **When** os comandos de qualidade, tipos e testes são executados na raiz, **Then** o novo pacote é incluído em todos sem alteração da configuração raiz.

---

### Edge Cases

- O que acontece quando um pacote não declara script de teste? A execução agregada não pode ser interrompida nem reportar falso sucesso — a ausência deve ser tratada de forma previsível e visível.
- O que acontece quando um pacote não possui nenhum arquivo de teste? A suíte daquele pacote não pode falhar apenas por ausência de testes durante a fase de esqueleto.
- Como o repositório se comporta se um lockfile de gerenciador não suportado for adicionado? Ele deve ser ignorado pelo versionamento e a divergência de gerenciador sinalizada.
- Como o repositório se comporta quando dois pacotes declaram o mesmo nome? A instalação deve falhar com identificação do conflito, em vez de resolver arbitrariamente.
- O que acontece quando um pacote tenta importar arquivos internos de outro pacote por caminho relativo atravessando a fronteira do workspace? A violação deve ser detectável pelos portões de qualidade.
- Como a verificação de qualidade trata artefatos gerados (saídas de build, dependências instaladas, relatórios de cobertura)? Eles devem ser excluídos da análise e do versionamento.

## Requirements *(mandatory)*

### Functional Requirements

#### Estrutura do workspace

- **FR-001**: O repositório MUST declarar explicitamente, em um manifesto na raiz, quais diretórios contêm pacotes do workspace.
- **FR-002**: O repositório MUST organizar pacotes em duas categorias distintas: bibliotecas reutilizáveis e aplicações executáveis, cada uma em seu diretório de topo.
- **FR-003**: Cada pacote MUST possuir manifesto próprio com nome escopado seguindo um padrão único e consistente no repositório.
- **FR-004**: O repositório MUST conter ao menos um pacote de exemplo em cada categoria, servindo como referência estrutural para novos pacotes.
- **FR-005**: Dependências entre pacotes do próprio repositório MUST ser resolvidas internamente, sem consultar versões publicadas externamente.
- **FR-006**: O repositório MUST fixar a versão de runtime exigida em local que ferramentas de gerenciamento de versão reconheçam automaticamente e em cada manifesto de pacote.
- **FR-007**: O repositório MUST rejeitar a instalação por gerenciadores de pacotes não suportados.
- **FR-008**: O repositório MUST excluir do versionamento artefatos gerados: dependências instaladas, saídas de build, relatórios de cobertura, caches de ferramentas e lockfiles de gerenciadores não suportados.

#### Qualidade de código

- **FR-009**: O repositório MUST oferecer um comando único, executável na raiz, que verifique estilo e lint de todos os pacotes.
- **FR-010**: O repositório MUST oferecer um comando que aplique automaticamente as correções de estilo e lint que sejam seguras de automatizar.
- **FR-011**: A configuração de qualidade MUST residir em um único ponto na raiz, herdado por todos os pacotes, sem duplicação por pacote.
- **FR-012**: A verificação de qualidade MUST terminar em estado de falha quando qualquer violação for encontrada, adequando-se a uso em automação.
- **FR-013**: A verificação de qualidade MUST ignorar diretórios de artefatos gerados.

#### Tipagem

- **FR-014**: O repositório MUST oferecer uma configuração base de tipagem na raiz, com verificações estritas habilitadas, herdada por todos os pacotes.
- **FR-015**: O repositório MUST oferecer um comando único, executável na raiz, que verifique os tipos de todos os pacotes.
- **FR-016**: A verificação de tipos MUST terminar em falha quando qualquer erro de tipo for encontrado em qualquer pacote.

#### Testes

- **FR-017**: O repositório MUST oferecer um comando único, executável na raiz, que execute os testes de todos os pacotes e apresente resultado agregado.
- **FR-018**: Cada pacote MUST expor um script de teste próprio, permitindo execução isolada.
- **FR-019**: O repositório MUST oferecer um modo de execução de testes que reexecute automaticamente ao detectar mudanças em arquivos, para uso durante o desenvolvimento.
- **FR-020**: O repositório MUST oferecer um comando que produza relatório de cobertura de testes.
- **FR-021**: A configuração de testes MUST derivar de uma base compartilhada na raiz, permitindo que cada pacote sobrescreva apenas o que for específico.
- **FR-022**: O repositório MUST incluir ao menos um teste de exemplo executável, comprovando que a infraestrutura de testes funciona ponta a ponta.
- **FR-023**: A execução agregada de testes MUST terminar em falha quando qualquer teste de qualquer pacote falhar.

#### Fluxo e automação

- **FR-024**: Os comandos de instalação, qualidade, tipos e testes MUST estar declarados como scripts nomeados no manifesto da raiz, descobríveis sem consultar documentação externa.
- **FR-025**: O repositório MUST documentar, em arquivo na própria raiz, como instalar, verificar qualidade, verificar tipos, executar testes e criar um novo pacote.
- **FR-026**: O repositório MUST oferecer um comando agregador único que execute, em sequência, todos os portões de qualidade exigidos antes de um merge.
- **FR-027**: Todos os comandos de verificação MUST comunicar sucesso ou falha por código de saída, permitindo uso direto em automação de integração contínua.

### Key Entities

- **Workspace**: O repositório como unidade. Define quais diretórios contêm pacotes, a versão de runtime exigida, o gerenciador de pacotes suportado e os comandos agregadores.
- **Pacote**: Unidade versionável dentro do workspace, com nome escopado único, categoria (biblioteca ou aplicação), scripts próprios de teste e tipos, e dependências que podem apontar para outros pacotes do workspace.
- **Configuração compartilhada**: Conjunto de definições de qualidade, tipagem e testes que vive na raiz e é herdado pelos pacotes; ponto único de alteração para regras que valem no repositório inteiro.
- **Portão de qualidade**: Verificação executável (qualidade de código, tipos, testes) com veredito binário, que compõe o comando agregador de pré-merge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa que nunca viu o repositório consegue, seguindo apenas a documentação da raiz, deixar o projeto instalado e executar todos os portões de qualidade em menos de 10 minutos.
- **SC-002**: A instalação a partir de um clone limpo é feita com um único comando, sem nenhum passo manual adicional.
- **SC-003**: Cada um dos portões de qualidade — estilo/lint, tipos e testes — é executável na raiz por um único comando que cobre 100% dos pacotes do workspace.
- **SC-004**: Adicionar um novo pacote ao workspace não exige alteração alguma na configuração da raiz para que ele seja coberto pelos três portões.
- **SC-005**: Todos os portões de qualidade passam no estado inicial do repositório, sem violações pendentes nem verificações desabilitadas.
- **SC-006**: Uma violação de estilo, de tipo ou de teste introduzida em qualquer pacote é detectada pelo comando agregador em 100% das execuções.
- **SC-007**: Executar a suíte completa de testes duas vezes sem alterações produz resultados idênticos.
- **SC-008**: Nenhum artefato gerado (dependências, saídas de build, cobertura, caches) aparece no controle de versão após executar instalação, build, testes com cobertura e verificação de qualidade.

## Assumptions

- Esta feature entrega apenas o esqueleto estrutural: nenhuma lógica de domínio de cartas náuticas está no escopo. Os pacotes iniciais existem como referência estrutural e conterão apenas conteúdo mínimo para provar que a infraestrutura funciona.
- Configuração de integração contínua (arquivos de pipeline de um provedor específico) está fora do escopo; os comandos agregadores são preparados para uso em CI, mas a pipeline em si é feature separada.
- Configuração de git hooks e automação de commits fica fora do escopo desta feature; a conformidade com Conventional Commits continua sendo responsabilidade da pessoa e da revisão.
- Publicação de pacotes em registro externo, versionamento automatizado e geração de changelog ficam fora do escopo.
- A escolha concreta de ferramentas já está fixada pela constituição do projeto (gerenciador de pacotes com workspaces, linguagem tipada em modo estrito, ferramenta única de lint e formatação, framework único de testes, runtime Node.js 22) e não é decisão desta especificação.
- Os pacotes de exemplo são: uma biblioteca e uma aplicação. A aplicação de exemplo não precisa ter interface de usuário nesta feature — basta ser executável e testável.
- Pessoas desenvolvedoras usam ambientes de desenvolvimento com suporte a gerenciamento de versão de runtime; a fixação da versão é informativa e verificável, mas o repositório não instala o runtime por conta própria.
