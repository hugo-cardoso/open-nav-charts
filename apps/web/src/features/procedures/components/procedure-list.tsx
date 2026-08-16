import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import type { CollectionResponse, Procedure } from "../../../shared/api/types.js";
import {
  EmptyState,
  FailureState,
  LoadingState,
} from "../../../shared/components/feedback/request-state.js";
import type { ApiFailure } from "../../../shared/errors/error-messages.js";
import { messages } from "../../../shared/i18n/messages.js";
import {
  GROUP_COLORS,
  groupProcedures,
  type ProcedureGroupId,
} from "../domain/procedure-groups.js";
import { ChartLink } from "./chart-link.js";
import { ProcedureGroupTabs } from "./procedure-group-tabs.js";

interface ProcedureItemProps {
  readonly icao: string;
  readonly procedure: Procedure;
  readonly groupId: ProcedureGroupId;
}

function ProcedureItem({ icao, procedure, groupId }: ProcedureItemProps) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" wrap="wrap">
            {/* O tipo exato continua visível: a aba agrupa, não substitui. */}
            <Badge variant="light" color={GROUP_COLORS[groupId]}>
              {procedure.type}
            </Badge>
            <Text fw={600}>{procedure.name}</Text>
          </Group>
          {/* Emenda só aparece quando existe (FR-023). */}
          {procedure.amendment === null ? null : (
            <Text size="sm" c="dimmed">
              {messages.procedures.amendment(procedure.amendment)}
            </Text>
          )}
        </Stack>
        <ChartLink icao={icao} procedure={procedure} />
      </Group>
    </Card>
  );
}

export interface ProcedureListProps {
  readonly icao: string;
  readonly data: CollectionResponse<Procedure> | undefined;
  readonly failure: ApiFailure | null;
  readonly isLoading: boolean;
  readonly activeGroup: ProcedureGroupId | null;
  readonly onGroupChange: (group: ProcedureGroupId) => void;
  readonly onRetry: () => void;
}

export function ProcedureList({
  icao,
  data,
  failure,
  isLoading,
  activeGroup,
  onGroupChange,
  onRetry,
}: ProcedureListProps) {
  const groups = useMemo(() => groupProcedures(data?.items ?? []), [data]);

  if (failure !== null) {
    return <FailureState failure={failure} onRetry={onRetry} />;
  }

  if (isLoading) {
    return <LoadingState label={messages.procedures.loadingLabel} />;
  }

  /**
   * As abas do agrupamento existem mesmo vazias, então `groups` nunca fica
   * vazio — a ausência total de procedimentos precisa ser verificada nos dados,
   * não na contagem de grupos.
   */
  if (data === undefined || data.items.length === 0) {
    return (
      <EmptyState title={messages.procedures.emptyTitle} body={messages.procedures.emptyBody} />
    );
  }

  /**
   * Um grupo vindo da URL pode não existir na lista (o caso hoje é `OTHER`, que
   * só aparece quando há tipo imprevisto).
   *
   * Sem escolha explícita, a aba padrão é a primeira **com procedimentos**, e
   * não simplesmente a primeira: um aeródromo sem STAR abriria num painel vazio
   * mesmo tendo dezenas de cartas nas outras abas.
   */
  const selected =
    groups.find((group) => group.id === activeGroup)?.id ??
    groups.find((group) => group.procedures.length > 0)?.id ??
    groups[0]?.id;
  if (selected === undefined) {
    return (
      <EmptyState title={messages.procedures.emptyTitle} body={messages.procedures.emptyBody} />
    );
  }

  const current = groups.find((group) => group.id === selected);

  return (
    <ProcedureGroupTabs groups={groups} value={selected} onChange={onGroupChange}>
      {current === undefined || current.procedures.length === 0 ? (
        // A aba existe mas este aeródromo não publica nada nela: dizer isso é o
        // que impede um painel em branco sem explicação (SC-006).
        <EmptyState
          title={messages.procedures.emptyGroupTitle}
          body={messages.procedures.emptyGroupBody}
        />
      ) : (
        <Stack gap="sm">
          {current.procedures.map((procedure) => (
            <ProcedureItem
              key={procedure.id}
              icao={icao}
              procedure={procedure}
              groupId={selected}
            />
          ))}
        </Stack>
      )}
    </ProcedureGroupTabs>
  );
}
