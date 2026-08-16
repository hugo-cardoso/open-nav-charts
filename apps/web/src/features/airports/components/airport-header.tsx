import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import type { AirportDetail } from "../../../shared/api/types.js";
import { messages } from "../../../shared/i18n/messages.js";
import { AirportLocationText, formatCoordinates } from "./airport-location.js";

/**
 * Cabeçalho do aeródromo com pistas (FR-018). Todo campo opcional some quando
 * nulo, individualmente — uma pista sem largura ainda é listada por seu
 * designador (FR-023).
 */

interface RunwayItemProps {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

function RunwayItem({ ident, lengthMeters, widthMeters }: RunwayItemProps) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="md" wrap="wrap">
        <Text fw={600}>{ident}</Text>
        {lengthMeters === null ? null : (
          <Text size="sm" c="dimmed">
            {messages.airport.runwayLength}: {lengthMeters} {messages.airport.meters}
          </Text>
        )}
        {widthMeters === null ? null : (
          <Text size="sm" c="dimmed">
            {messages.airport.runwayWidth}: {widthMeters} {messages.airport.meters}
          </Text>
        )}
      </Group>
    </Card>
  );
}

export interface AirportHeaderProps {
  readonly airport: AirportDetail;
}

export function AirportHeader({ airport }: AirportHeaderProps) {
  const coordinates = formatCoordinates(airport.location);

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Group gap="sm" wrap="wrap">
          <Title order={1} size="h2">
            {airport.icao}
          </Title>
          <Badge variant="light" size="lg">
            {airport.name}
          </Badge>
        </Group>
        <AirportLocationText location={airport.location} size="md" />
        {coordinates === null ? null : (
          <Text size="sm" c="dimmed">
            {messages.airport.coordinates}: {coordinates}
          </Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Title order={2} size="h4">
          {messages.airport.runwaysTitle}
        </Title>
        {airport.runways.length === 0 ? (
          <Text c="dimmed">{messages.airport.noRunways}</Text>
        ) : (
          <Stack gap="xs">
            {airport.runways.map((runway) => (
              <RunwayItem key={runway.ident} {...runway} />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
