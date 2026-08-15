import { Router } from "express";
import {
  parseCountry,
  parseIcao,
  parsePagination,
  parseSearch,
  parseState,
} from "../http/validation.js";
import {
  toAirportDetailResponse,
  toAirportSummaryResponse,
  toPageResponse,
} from "../presentation/responses.js";
import type { AirportService } from "../services/airport-service.js";

export interface AirportsRouterOptions {
  readonly service: AirportService;
}

/**
 * Traduz HTTP em chamada de serviço e de volta. Sem regra de negócio: valida,
 * delega e serializa. Express 5 encaminha rejeição de `Promise` ao middleware
 * de erro sozinho, então não há wrapper de `async` aqui (research R1).
 */
export function createAirportsRouter(options: AirportsRouterOptions): Router {
  const router = Router();

  router.get("/airports", async (request, response) => {
    // Toda validação antes de tocar o acervo (FR-027).
    const { page, pageSize } = parsePagination(request.query);
    const state = parseState(request.query.state);
    const country = parseCountry(request.query.country);
    const search = parseSearch(request.query.search);

    const result = await options.service.list({ page, pageSize, state, country, search });

    response.json(
      toPageResponse(result.items.map(toAirportSummaryResponse), page, pageSize, result.total),
    );
  });

  router.get("/airports/:icao", async (request, response) => {
    const icao = parseIcao(request.params.icao);

    response.json(toAirportDetailResponse(await options.service.findByIcao(icao)));
  });

  return router;
}
