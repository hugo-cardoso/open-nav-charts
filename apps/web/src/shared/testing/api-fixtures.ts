import type {
  AirportDetail,
  AirportSummary,
  CollectionResponse,
  PageResponse,
  Procedure,
} from "../../shared/api/types.js";

/**
 * Respostas de exemplo fiéis ao contrato da API. Servem de rede de proteção
 * contra a duplicação de tipos registrada em contracts/api-client.md: se a forma
 * das respostas divergir, os testes que usam estas fixtures falham.
 */

export const completeAirport: AirportSummary = {
  icao: "SBGL",
  name: "Rio de Janeiro / Galeão",
  location: {
    city: "Rio de Janeiro",
    state: "RJ",
    country: "BR",
    latitude: -22.809999,
    longitude: -43.250556,
  },
};

/** Todos os campos de localidade nulos: exercita FR-023. */
export const airportWithoutLocation: AirportSummary = {
  icao: "SBXX",
  name: "Unnamed Aerodrome",
  location: {
    city: null,
    state: null,
    country: null,
    latitude: null,
    longitude: null,
  },
};

/** Apenas uma coordenada: não deve ser exibida (data-model §3). */
export const airportWithPartialCoordinates: AirportSummary = {
  icao: "SBYY",
  name: "Partial Coordinates Aerodrome",
  location: {
    city: "Somewhere",
    state: null,
    country: null,
    latitude: -10.5,
    longitude: null,
  },
};

export const completeAirportDetail: AirportDetail = {
  ...completeAirport,
  runways: [
    { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
    { ident: "15/33", lengthMeters: 3180, widthMeters: null },
  ],
};

export const airportDetailWithoutRunways: AirportDetail = {
  ...airportWithoutLocation,
  runways: [],
};

export const procedureWithChart: Procedure = {
  id: "12345",
  name: "IAC ILS RWY 10",
  type: "IAC",
  amendment: "3",
  hasChart: true,
};

export const procedureWithoutChart: Procedure = {
  id: "12346",
  name: "SID DEKON 1A",
  type: "SID",
  amendment: null,
  hasChart: false,
};

export const airportPage: PageResponse<AirportSummary> = {
  items: [completeAirport, airportWithoutLocation],
  page: 1,
  pageSize: 20,
  total: 2,
  hasNext: false,
};

export const airportPageWithNext: PageResponse<AirportSummary> = {
  items: [completeAirport],
  page: 1,
  pageSize: 1,
  total: 3,
  hasNext: true,
};

/** Página além do fim: `200` com lista vazia, nunca `404`. */
export const emptyAirportPage: PageResponse<AirportSummary> = {
  items: [],
  page: 99,
  pageSize: 20,
  total: 2,
  hasNext: false,
};

export const procedureCollection: CollectionResponse<Procedure> = {
  items: [procedureWithChart, procedureWithoutChart],
  total: 2,
};

export const emptyProcedureCollection: CollectionResponse<Procedure> = {
  items: [],
  total: 0,
};

/** Envelope de erro da API, com `message` em português como na origem. */
export function errorBody(code: string, message = "Mensagem em português da API.") {
  return { error: { code, message } };
}
