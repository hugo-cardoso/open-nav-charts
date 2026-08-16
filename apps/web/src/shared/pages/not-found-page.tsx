import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../shared/hooks/use-document-title.js";
import { messages } from "../../shared/i18n/messages.js";

/** Endereço desconhecido, sempre com caminho de volta à busca (FR-005). */
export function NotFoundPage() {
  useDocumentTitle(messages.documentTitle.notFound);

  return (
    <Center py="xl">
      <Stack align="center" gap="md" maw={420}>
        <Title order={1} size="h2" ta="center">
          {messages.notFound.title}
        </Title>
        <Text c="dimmed" ta="center">
          {messages.notFound.body}
        </Text>
        <Button component={Link} to="/search">
          {messages.notFound.action}
        </Button>
      </Stack>
    </Center>
  );
}
