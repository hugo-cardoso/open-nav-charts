/**
 * API pública da feature `airports`.
 *
 * O que não está exportado aqui é interno: a composição de rotas e outras
 * features MUST importar deste arquivo, nunca de caminhos internos. É essa regra
 * que mantém a fronteira visível e permite reorganizar o interior da feature sem
 * tocar em quem a consome.
 *
 * A superfície é só de telas: o vocabulário que `procedures` também usa (o código
 * ICAO) vive em `shared/domain`, então nenhuma feature depende desta.
 */

export { AirportPage } from "./pages/airport-page.js";
export { SearchPage } from "./pages/search-page.js";
