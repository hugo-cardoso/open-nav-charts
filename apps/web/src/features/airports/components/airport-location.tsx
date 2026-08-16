import { Text } from "@mantine/core";
import type { AirportLocation } from "../../../shared/api/types.js";

/**
 * Compõe cidade, estado e país omitindo as partes nulas (FR-023). Quando as três
 * faltam, o componente inteiro desaparece: renderizar um rótulo vazio ou a
 * palavra "null" seria pior do que não mostrar nada.
 */

export function formatLocation(location: AirportLocation): string | null {
  const parts = [location.city, location.state, location.country].filter(
    (part): part is string => part !== null && part.trim() !== "",
  );

  return parts.length === 0 ? null : parts.join(", ");
}

/**
 * Uma coordenada sozinha não localiza nada, então só exibimos o par completo
 * (data-model §3). Sem representação cartográfica nesta versão.
 */
export function formatCoordinates(location: AirportLocation): string | null {
  const { latitude, longitude } = location;
  if (latitude === null || longitude === null) {
    return null;
  }
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export interface AirportLocationTextProps {
  readonly location: AirportLocation;
  readonly size?: string;
  readonly c?: string;
}

export function AirportLocationText({
  location,
  size = "sm",
  c = "dimmed",
}: AirportLocationTextProps) {
  const formatted = formatLocation(location);

  if (formatted === null) {
    return null;
  }

  return (
    <Text size={size} c={c}>
      {formatted}
    </Text>
  );
}
