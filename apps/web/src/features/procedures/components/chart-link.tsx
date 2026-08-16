import { Button, Text } from "@mantine/core";
import type { Procedure } from "../../../shared/api/types.js";
import { environment } from "../../../shared/config/environment.js";
import { messages } from "../../../shared/i18n/messages.js";
import { buildChartUrl } from "../api/procedures.js";

export interface ChartLinkProps {
  readonly icao: string;
  readonly procedure: Procedure;
}

/**
 * Acesso à carta de um procedimento.
 *
 * É um link real (`<a>`), nunca um botão com handler: assim o navegador oferece
 * seus próprios recursos (abrir em nova janela, copiar endereço) e o fluxo
 * permanece operável por teclado (SC-007).
 *
 * A URL é montada aqui, na renderização do link, mas **nenhuma requisição parte
 * daqui** — o destino é a rota de redirect da API, e a URL assinada só é gerada
 * quando o navegador de fato navega, no clique. É isso que faz uma carta aberta
 * muito depois de a lista carregar continuar funcionando (FR-016, FR-017).
 *
 * Quando não há documento, exibimos texto e não um controle desabilitado, que
 * seria ambíguo sobre o que está indisponível (FR-015).
 */
export function ChartLink({ icao, procedure }: ChartLinkProps) {
  if (!procedure.hasChart) {
    return (
      <Text size="sm" c="dimmed">
        {messages.procedures.noChart}
      </Text>
    );
  }

  return (
    <Button
      component="a"
      href={buildChartUrl(environment.apiBaseUrl, icao, procedure.id)}
      target="_blank"
      rel="noopener noreferrer"
      variant="light"
      size="sm"
      aria-label={messages.procedures.openChartFor(procedure.name)}
    >
      {messages.procedures.openChart}
    </Button>
  );
}
