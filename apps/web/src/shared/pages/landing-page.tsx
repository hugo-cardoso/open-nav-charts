import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../shared/hooks/use-document-title.js";
import { messages } from "../../shared/i18n/messages.js";
import classes from "./landing-page.module.css";

/**
 * Tela inicial (FR-001).
 *
 * Não emite nenhuma requisição à API: é isso que permite ficar visualmente
 * completa em menos de 3 s em 3G rápido (SC-003).
 */
export function LandingPage() {
  useDocumentTitle(messages.documentTitle.landing);

  const features = [
    {
      title: messages.landing.features.searchTitle,
      body: messages.landing.features.searchBody,
    },
    {
      title: messages.landing.features.proceduresTitle,
      body: messages.landing.features.proceduresBody,
    },
    {
      title: messages.landing.features.chartsTitle,
      body: messages.landing.features.chartsBody,
    },
  ];

  return (
    <Stack gap="xl" py="xl">
      <Stack gap="md" maw={640}>
        <Title order={1}>{messages.landing.title}</Title>
        <Text size="xl" c="dimmed">
          {messages.landing.subtitle}
        </Text>
        <Text>{messages.landing.description}</Text>
        <Group>
          <Button component={Link} to="/search" size="md">
            {messages.landing.searchAction}
          </Button>
        </Group>
      </Stack>

      <div className={classes.features}>
        {features.map((feature) => (
          <Card key={feature.title} withBorder padding="lg" radius="md">
            <Stack gap="xs">
              <Title order={2} size="h5">
                {feature.title}
              </Title>
              <Text size="sm" c="dimmed">
                {feature.body}
              </Text>
            </Stack>
          </Card>
        ))}
      </div>
    </Stack>
  );
}
