# Quickstart: validar a sinalização de desfecho

Guia para provar que a mudança funciona ponta a ponta. Detalhes do mapeamento em [`contracts/exit-codes.md`](./contracts/exit-codes.md).

## Pré-requisitos

- Node.js 22 e pnpm (ver README da raiz).
- Para os cenários manuais que rodam a coleta de verdade: `docker compose up -d` (PostgreSQL + MinIO) e um `.env` preenchido. Os cenários automatizados **não** exigem Docker nem rede.

## Validação automatizada (principal)

A garantia central é unitária, determinística, sem I/O:

```bash
pnpm --filter @open-nav-charts/jobs test
```

Esperado: a suíte de `runtime/exit-code.test.ts` passa com o novo mapeamento —

- relatório **sem** falhas → `0`
- relatório **com** falhas de itens → `0`  *(era `1`; é o coração da mudança)*
- interrupção → `130` (mesmo com falhas registradas)
- `InvalidConfigurationError` / rotina inexistente → `2`
- credencial rejeitada / dependência indisponível → `3`
- erro não classificado → `1` *(agora "erro inesperado", não "concluída com falhas")*

## Validação manual do código de saída (opcional)

Com ambiente de pé, confirmar o código real do processo lendo `$?`:

```bash
# Execução normal (mesmo que alguns aeródromos falhem): espera-se 0
node --env-file-if-exists=.env apps/jobs/dist/main.js decea-crawler --only SBGL
echo "exit=$?"      # → exit=0

# Configuração ausente: espera-se 2
env -u AISWEB_API_KEY node apps/jobs/dist/main.js decea-crawler
echo "exit=$?"      # → exit=2

# Rotina inexistente: espera-se 2
node apps/jobs/dist/main.js rotina-que-nao-existe
echo "exit=$?"      # → exit=2
```

Em qualquer execução que produza resumo, a seção **"Falhas"** deve continuar listando os itens problemáticos — a informação não se perde por o processo sair `0`.

## Validação no agendador (aceitação final)

Após o deploy num agendador que dispara a rotina como tarefa efêmera:

1. Disparar uma execução que conclui com falhas de itens dentro do padrão histórico da coleta → o painel do agendador deve marcá-la **sucesso** (SC-001).
2. Disparar com uma variável de ambiente obrigatória ausente → o painel deve marcá-la **falha** (SC-002).
3. O operador distingue "falhou ao rodar" de "rodou com itens problemáticos" olhando só o painel, sem abrir logs (SC-003).
