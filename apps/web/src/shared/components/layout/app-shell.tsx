import { Anchor, Box, Burger, Container, Drawer, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { messages } from "../../../shared/i18n/messages.js";
import classes from "./app-shell.module.css";

/**
 * Casca comum a todas as telas. A navegação vira gaveta em telas estreitas para
 * que nada seja cortado nem force rolagem horizontal em 320 px (FR-025).
 */

interface NavigationLinkProps {
  readonly to: string;
  readonly label: string;
  readonly active: boolean;
  readonly onNavigate?: () => void;
}

function NavigationLink({ to, label, active, onNavigate }: NavigationLinkProps) {
  return (
    <Anchor
      component={Link}
      to={to}
      onClick={onNavigate}
      c={active ? "blue" : "dimmed"}
      fw={active ? 600 : 400}
      underline="never"
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Anchor>
  );
}

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();

  const links = [
    { to: "/", label: messages.nav.home },
    { to: "/search", label: messages.nav.search },
  ];

  const isActive = (to: string): boolean =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <Box mih="100vh" display="flex" style={{ flexDirection: "column" }}>
      {/* Primeiro elemento focável: permite pular a navegação pelo teclado (SC-007). */}
      <Anchor href="#main-content" className={classes.skipLink}>
        {messages.app.skipToContent}
      </Anchor>

      <Box component="header" py="md" className={classes.header}>
        <Container size="lg">
          <Group justify="space-between" wrap="nowrap">
            <Anchor component={Link} to="/" underline="never" c="inherit">
              <Text fw={700} size="lg">
                {messages.app.name}
              </Text>
            </Anchor>

            <Group gap="lg" visibleFrom="sm" component="nav">
              {links.map((link) => (
                <NavigationLink key={link.to} {...link} active={isActive(link.to)} />
              ))}
            </Group>

            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={messages.nav.search}
            />
          </Group>
        </Container>
      </Box>

      <Drawer opened={opened} onClose={close} size="xs" position="right" hiddenFrom="sm">
        <Stack component="nav" gap="md">
          {links.map((link) => (
            <NavigationLink key={link.to} {...link} active={isActive(link.to)} onNavigate={close} />
          ))}
        </Stack>
      </Drawer>

      <Box component="main" id="main-content" flex={1} py="xl">
        <Container size="lg">{children}</Container>
      </Box>
    </Box>
  );
}
