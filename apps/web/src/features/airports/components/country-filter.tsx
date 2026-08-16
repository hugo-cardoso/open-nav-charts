import { Select } from "@mantine/core";
import { useMemo } from "react";
import { countryOptions } from "../../../shared/domain/countries.js";
import { messages } from "../../../shared/i18n/messages.js";

export interface CountryFilterProps {
  /** Código ISO alpha-2, ou string vazia quando nenhum país está selecionado. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
}

/**
 * Seletor de país que restringe as sugestões de ICAO.
 *
 * Lista fechada, não campo de texto: os códigos ISO alpha-2 não são
 * adivinháveis, e escolher "Brazil" é melhor do que lembrar que o código é "BR".
 */
export function CountryFilter({ value, onChange, error }: CountryFilterProps) {
  const data = useMemo(
    () => countryOptions().map((option) => ({ value: option.code, label: option.name })),
    [],
  );

  return (
    <Select
      label={messages.search.countryLabel}
      placeholder={messages.search.countryPlaceholder}
      data={data}
      // O `Select` trabalha com `null` para "nada escolhido"; a URL usa string
      // vazia. A conversão acontece aqui, nas duas direções.
      value={value === "" ? null : value}
      onChange={(next) => onChange(next ?? "")}
      error={error}
      clearable
      searchable
      w={{ base: "100%", xs: 220 }}
    />
  );
}
