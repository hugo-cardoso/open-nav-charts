import { Anchor, Button, Center, Stack, Text, Title } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router";
import { FailureState, LoadingState } from "../../../shared/components/feedback/request-state.js";
import { isValidIcao, normalizeIcao } from "../../../shared/domain/icao.js";
import { useDocumentTitle } from "../../../shared/hooks/use-document-title.js";
import { messages } from "../../../shared/i18n/messages.js";
import {
  PROCEDURE_GROUP_IDS,
  type ProcedureGroupId,
  ProcedureList,
  useProcedures,
} from "../../procedures/index.js";
import { AirportHeader } from "../components/airport-header.js";
import { useAirportDetail } from "../hooks/use-airport-detail.js";

/** Aeródromo inexistente ou ICAO malformado: mesma tela, com volta à busca (FR-005). */
function AirportNotFound() {
  return (
    <Center py="xl">
      <Stack align="center" gap="md" maw={420}>
        <Title order={1} size="h3" ta="center">
          {messages.airport.notFoundTitle}
        </Title>
        <Text c="dimmed" ta="center">
          {messages.airport.notFoundBody}
        </Text>
        <Button component={Link} to="/search">
          {messages.notFound.action}
        </Button>
      </Stack>
    </Center>
  );
}

export function AirportPage() {
  const { icao } = useParams<{ icao: string }>();
  const [params, setParams] = useSearchParams();

  // A aba ativa vive na URL para que o endereço continue compartilhável e o
  // "voltar" percorra as trocas de aba (FR-003, FR-004).
  const rawGroup = params.get("group")?.toUpperCase();
  const activeGroup = PROCEDURE_GROUP_IDS.find((id) => id === rawGroup) ?? null;

  useDocumentTitle(
    icao === undefined
      ? messages.documentTitle.notFound
      : messages.documentTitle.airport(icao.toUpperCase()),
  );

  // As duas consultas partem juntas e são independentes: a falha de uma não
  // impede a exibição da outra (data-model §4).
  const airport = useAirportDetail(icao);
  const procedures = useProcedures(icao);

  // ICAO fora do formato não chega a virar requisição que a API recusaria.
  if (!isValidIcao(icao)) {
    return <AirportNotFound />;
  }

  if (airport.failure?.code === "AIRPORT_NOT_FOUND") {
    return <AirportNotFound />;
  }

  // Fixa o valor normalizado depois da guarda: além de evitar repetir
  // `toUpperCase()`, dispensa o estreitamento de tipo sobreviver até o JSX.
  const normalizedIcao = normalizeIcao(icao);

  const setGroup = (value: ProcedureGroupId) => {
    const next = new URLSearchParams(params);
    next.set("group", value);
    // Trocar de aba entra no histórico: o "voltar" desfaz a troca.
    setParams(next, { replace: false });
  };

  return (
    <Stack gap="xl">
      <Anchor component={Link} to="/search" size="sm">
        ← {messages.airport.backToSearch}
      </Anchor>

      {airport.isLoading ? (
        <LoadingState label={messages.airport.loadingLabel} />
      ) : airport.failure !== null ? (
        <FailureState failure={airport.failure} onRetry={airport.refetch} />
      ) : airport.data === undefined ? null : (
        <AirportHeader airport={airport.data} />
      )}

      <Stack gap="md">
        <Title order={2} size="h3">
          {messages.procedures.title}
        </Title>

        {/* As abas agrupam os tipos; o recorte é em memória, sem nova requisição. */}
        <ProcedureList
          icao={normalizedIcao}
          data={procedures.data}
          failure={procedures.failure}
          isLoading={procedures.isLoading}
          activeGroup={activeGroup}
          onGroupChange={setGroup}
          onRetry={procedures.refetch}
        />
      </Stack>
    </Stack>
  );
}
