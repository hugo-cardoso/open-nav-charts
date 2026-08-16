import { Combobox, Group, Loader, Text, TextInput, useCombobox } from "@mantine/core";
import type { AirportSummary } from "../../../shared/api/types.js";
import { messages } from "../../../shared/i18n/messages.js";
import { formatLocation } from "./airport-location.js";

export interface IcaoAutocompleteProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (airport: AirportSummary) => void;
  readonly suggestions: readonly AirportSummary[];
  readonly isLoading: boolean;
  readonly isEnabled: boolean;
  readonly error?: string | undefined;
}

/**
 * Campo de busca por código ICAO com sugestões.
 *
 * Usa `Combobox` e não `Autocomplete`: o segundo trabalha com uma lista de
 * strings, e aqui cada opção precisa mostrar código, nome e localidade, além de
 * devolver o aeródromo inteiro na seleção — o `Combobox` permite montar a opção
 * livremente sem perder a semântica de `combobox`/`listbox`/`option` nem a
 * navegação por setas do teclado (SC-007).
 */
export function IcaoAutocomplete({
  value,
  onChange,
  onSelect,
  suggestions,
  isLoading,
  isEnabled,
  error,
}: IcaoAutocompleteProps) {
  const combobox = useCombobox({
    // O primeiro item já vem ativo: `Enter` seleciona sem precisar de seta.
    onDropdownOpen: () => combobox.selectFirstOption(),
  });

  const options = suggestions.map((airport) => {
    const location = formatLocation(airport.location);
    return (
      <Combobox.Option value={airport.icao} key={airport.icao}>
        <Group gap="sm" wrap="nowrap">
          <Text fw={700} size="sm" w={48}>
            {airport.icao}
          </Text>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" lineClamp={1}>
              {airport.name}
            </Text>
            {/* Localidade some por inteiro quando não há nenhuma parte (FR-023). */}
            {location === null ? null : (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {location}
              </Text>
            )}
          </div>
        </Group>
      </Combobox.Option>
    );
  });

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(icao) => {
        const airport = suggestions.find((item) => item.icao === icao);
        if (airport !== undefined) {
          onSelect(airport);
          combobox.closeDropdown();
        }
      }}
    >
      {/*
        `withExpandedAttribute` faz o Mantine manter `aria-expanded` no input
        conforme o dropdown abre e fecha; sem ele o atributo simplesmente não é
        emitido, e o leitor de tela não anuncia o estado da lista (SC-007).
      */}
      <Combobox.Target withAriaAttributes withExpandedAttribute>
        <TextInput
          label={messages.search.fieldLabel}
          description={messages.search.fieldDescription}
          placeholder={messages.search.fieldPlaceholder}
          value={value}
          error={error}
          size="md"
          autoComplete="off"
          // `role` explícito: o `Combobox.Target` liga o campo ao dropdown e
          // cuida de `aria-expanded`, mas não marca o input como combobox.
          role="combobox"
          // Maiúsculas na exibição sem alterar o valor: o ICAO é sempre em caixa
          // alta, e converter no `onChange` atrapalharia a digitação.
          styles={{ input: { textTransform: "uppercase" } }}
          rightSection={isLoading ? <Loader size="xs" /> : null}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              combobox.closeDropdown();
            }
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={!isEnabled}>
        <Combobox.Options>
          {options.length > 0 ? (
            options
          ) : isLoading ? (
            <Combobox.Empty>{messages.search.loadingLabel}</Combobox.Empty>
          ) : (
            <Combobox.Empty>{messages.search.emptyTitle}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
