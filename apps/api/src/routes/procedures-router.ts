import { Router } from "express";
import { parseIcao, parseProcedureId, parseProcedureType } from "../http/validation.js";
import {
  type CollectionResponse,
  type ProcedureResponse,
  toProcedureResponse,
} from "../presentation/responses.js";
import type { ChartService } from "../services/chart-service.js";
import type { ProcedureService } from "../services/procedure-service.js";

export interface ProceduresRouterOptions {
  readonly procedures: ProcedureService;
  readonly charts: ChartService;
}

export function createProceduresRouter(options: ProceduresRouterOptions): Router {
  const router = Router();

  router.get("/airports/:icao/procedures", async (request, response) => {
    const icao = parseIcao(request.params.icao);
    const type = parseProcedureType(request.query.type);

    const found = await options.procedures.listByAirport({ icao, type });

    // Não paginado: o número de cartas por aeródromo é da ordem de dezenas.
    const body: CollectionResponse<ProcedureResponse> = {
      items: found.map(toProcedureResponse),
      total: found.length,
    };
    response.json(body);
  });

  router.get("/airports/:icao/procedures/:id/chart", async (request, response) => {
    const icao = parseIcao(request.params.icao);
    const procedureId = parseProcedureId(request.params.id);

    const url = await options.charts.resolveChartUrl({ icao, procedureId });

    // 302 e não 301: o destino muda a cada requisição, e `no-store` impede que
    // navegador ou proxy guardem um `Location` que vai expirar (FR-024).
    // Nenhum byte do PDF atravessa a aplicação (FR-019, SC-004).
    response.setHeader("Cache-Control", "no-store");
    response.redirect(302, url);
  });

  return router;
}
