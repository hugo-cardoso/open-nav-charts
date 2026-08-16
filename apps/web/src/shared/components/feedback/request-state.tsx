import { Alert, Button, Center, Group, Loader, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import type { ApiFailure } from "../../../shared/errors/error-messages.js";
import { errorMessage } from "../../../shared/errors/error-messages.js";
import { messages } from "../../../shared/i18n/messages.js";

/**
 * Os cinco estados de tela do contrato (contracts/ui-routes.md §"Estados de
 * tela"). Existirem como componentes próprios é o que garante SC-006: nenhuma
 * área fica em branco sem explicação, porque toda tela precisa escolher um deles.
 */

export interface LoadingStateProps {
  readonly label: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <Center py="xl">
      {/* `role="status"` faz o leitor de tela anunciar a espera (SC-007). */}
      <Group gap="sm" role="status" aria-live="polite">
        <Loader size="sm" aria-hidden="true" />
        <Text c="dimmed">{label}</Text>
      </Group>
    </Center>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

/** Usado tanto para `idle` quanto para `empty`: o que os distingue é o texto. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={420}>
        <Title order={3} size="h4" ta="center">
          {title}
        </Title>
        <Text c="dimmed" ta="center">
          {body}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}

export interface FailureStateProps {
  readonly failure: ApiFailure;
  readonly onRetry?: () => void;
}

/**
 * O texto vem de `code`; a `message` da API, que é em português, nunca chega
 * aqui (FR-024). A ação de nova tentativa só aparece quando repetir pode ter
 * resultado diferente — oferecê-la em erro de validação enganaria o usuário.
 */
export function FailureState({ failure, onRetry }: FailureStateProps) {
  return (
    <Alert color="red" title={messages.feedback.errorTitle} role="alert" my="md">
      <Stack align="flex-start" gap="sm">
        <Text>{errorMessage(failure.code)}</Text>
        {failure.retryable && onRetry !== undefined ? (
          <Button variant="light" color="red" size="sm" onClick={onRetry}>
            {messages.feedback.retry}
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}
