import { Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { AirportSummary } from "../../../shared/api/types.js";
import { errorMessage } from "../../../shared/errors/error-messages.js";
import { useDocumentTitle } from "../../../shared/hooks/use-document-title.js";
import { messages } from "../../../shared/i18n/messages.js";
import { CountryFilter } from "../components/country-filter.js";
import { IcaoAutocomplete } from "../components/icao-autocomplete.js";
import {
  MIN_SUGGESTION_LENGTH,
  sanitizeIcaoInput,
  useIcaoSuggestions,
} from "../hooks/use-icao-suggestions.js";
import { useSearchQuery } from "../hooks/use-search-params.js";

/**
 * Painel de busca por código ICAO.
 *
 * O autocomplete é o próprio caminho até o aeródromo: escolher uma sugestão
 * navega direto para a tela dele, sem lista de resultados intermediária. Os
 * filtros de estado e país continuam restringindo as sugestões.
 */
export function SearchPage() {
  useDocumentTitle(messages.documentTitle.search);

  const navigate = useNavigate();
  const { query, setCriteria } = useSearchQuery();

  /**
   * O termo digitado vive em estado local, não na URL: ele é um passo até o
   * aeródromo, não um resultado a compartilhar. Filtros continuam na URL, que
   * é o que uma consulta guardada precisa reter.
   */
  const [term, setTerm] = useState("");

  const suggestions = useIcaoSuggestions({
    term,
    country: query.country,
  });

  const fieldError = (code: string): string | undefined =>
    suggestions.failure?.code === code ? errorMessage(code) : undefined;

  const handleSelect = (airport: AirportSummary) => {
    void navigate(`/airports/${airport.icao}`);
  };

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        {messages.search.title}
      </Title>

      <Stack gap="md">
        <IcaoAutocomplete
          value={term}
          onChange={(next) => setTerm(sanitizeIcaoInput(next))}
          onSelect={handleSelect}
          suggestions={suggestions.suggestions}
          isLoading={suggestions.isLoading}
          isEnabled={suggestions.isEnabled}
          error={fieldError("INVALID_SEARCH")}
        />

        <CountryFilter
          value={query.country ?? ""}
          onChange={(value) => setCriteria({ country: value === "" ? null : value })}
          error={fieldError("INVALID_COUNTRY")}
        />
      </Stack>

      {/*
        Orientação inicial fora do menu suspenso: com menos de duas letras o
        `Combobox` fica fechado, e sem isto a tela não diria o que fazer (FR-010).
      */}
      {term.length < MIN_SUGGESTION_LENGTH ? (
        <Text c="dimmed" size="sm">
          {messages.search.minLengthHint}
        </Text>
      ) : null}

      {/* Falhas que não pertencem a um campo aparecem abaixo dele (FR-020). */}
      {suggestions.failure !== null && fieldError(suggestions.failure.code) === undefined ? (
        <Text c="red" size="sm" role="alert">
          {errorMessage(suggestions.failure.code)}
        </Text>
      ) : null}
    </Stack>
  );
}
