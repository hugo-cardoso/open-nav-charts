/**
 * Todo texto visível da interface, em inglês (FR-024).
 *
 * Centralizar aqui torna a auditoria de idioma uma inspeção de dois arquivos
 * (este e `errors/error-messages.ts`) e prepara o terreno caso um seletor de
 * idioma entre no escopo. Nenhuma cadeia visível deve ser embutida em componente.
 *
 * Isto é exceção registrada ao Princípio VI da constituição, com escopo e prazo
 * definidos em specs/006-frontend-charts-spa/plan.md. Comentários e documentação
 * seguem em português do Brasil, como este.
 */

export const messages = {
  app: {
    name: "Open Nav Charts",
    tagline: "Aeronautical charts, searchable.",
    skipToContent: "Skip to main content",
  },

  nav: {
    home: "Home",
    search: "Search",
  },

  landing: {
    title: "Open Nav Charts",
    subtitle: "Find aerodromes and open their published instrument procedure charts.",
    description:
      "A public, read-only archive of aerodromes and the instrument procedures published for them. Search by ICAO code or name, review the procedures on file, and open the chart you need.",
    searchAction: "Search aerodromes",
    features: {
      searchTitle: "Search by code or name",
      searchBody: "Look up an aerodrome by its four-letter ICAO code or part of its name.",
      proceduresTitle: "Browse procedures",
      proceduresBody:
        "See the approach, departure and arrival procedures published for each aerodrome.",
      chartsTitle: "Open the chart",
      chartsBody: "Open the published chart document in a new tab, ready to read or print.",
    },
  },

  search: {
    title: "Search aerodromes",
    fieldLabel: "ICAO code",
    fieldPlaceholder: "e.g. SBGR",
    fieldDescription: "Type at least 2 letters to see matching aerodromes",
    minLengthHint: "Type at least 2 letters of the ICAO code.",
    stateLabel: "State",
    statePlaceholder: "Two letters",
    countryLabel: "Country",
    countryPlaceholder: "All countries",
    clearFilters: "Clear filters",
    resultsRegionLabel: "Search results",
    idleTitle: "Start a search",
    idleBody: "Enter an ICAO code or an aerodrome name to see matching aerodromes.",
    emptyTitle: "No aerodromes found",
    emptyBody: "Check the code or try a different name.",
    loadingLabel: "Searching aerodromes",
    resultCount: (total: number) => (total === 1 ? "1 aerodrome" : `${total} aerodromes`),
    pagePosition: (page: number, total: number) => `Page ${page} of ${total}`,
    previousPage: "Previous page",
    nextPage: "Next page",
  },

  airport: {
    backToSearch: "Back to search",
    runwaysTitle: "Runways",
    noRunways: "No runways on file for this aerodrome.",
    runwayLength: "Length",
    runwayWidth: "Width",
    meters: "m",
    coordinates: "Coordinates",
    loadingLabel: "Loading aerodrome",
    notFoundTitle: "Aerodrome not found",
    notFoundBody: "We couldn't find an aerodrome with that code.",
  },

  procedures: {
    title: "Procedures",
    typeLabel: "Procedure type",
    typePlaceholder: "All types",
    allTypes: "All types",
    groupsLabel: "Procedure groups",
    groups: {
      STAR: "STAR",
      IAC: "IAC",
      TAXI: "TAXI",
      SID: "SID",
      // Recolhe os tipos fora do agrupamento (hoje o AOC), para que nenhum
      // procedimento fique inalcançável.
      OTHER: "Other",
    },
    loadingLabel: "Loading procedures",
    emptyTitle: "No procedures published",
    emptyBody: "There are no procedures on file for this aerodrome.",
    emptyFilteredBody: "No procedures match that type.",
    // Aba do agrupamento sem nenhum procedimento neste aeródromo. As abas são
    // sempre exibidas, então a ausência precisa ser dita.
    emptyGroupTitle: "Nothing in this group",
    emptyGroupBody: "This aerodrome has no procedures of this kind on file.",
    amendment: (value: string) => `Amendment ${value}`,
    openChart: "Open chart",
    openChartFor: (name: string) => `Open chart for ${name}`,
    noChart: "Chart not available",
    countLabel: (total: number) => (total === 1 ? "1 procedure" : `${total} procedures`),
  },

  feedback: {
    retry: "Try again",
    errorTitle: "Something went wrong",
  },

  notFound: {
    title: "Page not found",
    body: "That address doesn't exist.",
    action: "Go to search",
  },

  documentTitle: {
    landing: "Open Nav Charts",
    search: "Search aerodromes · Open Nav Charts",
    airport: (icao: string) => `${icao} · Open Nav Charts`,
    notFound: "Page not found · Open Nav Charts",
  },
} as const;
