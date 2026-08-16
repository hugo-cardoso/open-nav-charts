import { useQuery } from "@tanstack/react-query";
import { toFailure } from "../../../shared/api/client.js";
import type { AirportDetail } from "../../../shared/api/types.js";
import { environment } from "../../../shared/config/environment.js";
import { isValidIcao, normalizeIcao } from "../../../shared/domain/icao.js";
import type { ApiFailure } from "../../../shared/errors/error-messages.js";
import { getAirport } from "../api/airports.js";

export interface AirportDetailResult {
  readonly data: AirportDetail | undefined;
  readonly failure: ApiFailure | null;
  readonly isLoading: boolean;
  readonly refetch: () => void;
}

export function useAirportDetail(icao: string | undefined): AirportDetailResult {
  const enabled = isValidIcao(icao);
  const normalized = enabled ? normalizeIcao(icao) : "";

  const result = useQuery({
    queryKey: ["airport", normalized],
    queryFn: ({ signal }) => getAirport(normalized, { baseUrl: environment.apiBaseUrl, signal }),
    enabled,
  });

  return {
    data: result.data,
    failure: result.error === null ? null : toFailure(result.error),
    isLoading: enabled && result.isPending,
    refetch: () => {
      void result.refetch();
    },
  };
}
