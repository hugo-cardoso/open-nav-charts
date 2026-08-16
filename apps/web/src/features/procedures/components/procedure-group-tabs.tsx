import { Tabs, useMantineTheme } from "@mantine/core";
import type { ReactNode } from "react";
import { messages } from "../../../shared/i18n/messages.js";
import {
  GROUP_COLORS,
  type ProcedureGroup,
  type ProcedureGroupId,
} from "../domain/procedure-groups.js";
import classes from "./procedure-group-tabs.module.css";

export interface ProcedureGroupTabsProps {
  readonly groups: readonly ProcedureGroup[];
  readonly value: ProcedureGroupId;
  readonly onChange: (value: ProcedureGroupId) => void;
  readonly children: ReactNode;
}

/**
 * Abas que separam os procedimentos por grupo, cada uma com sua cor.
 *
 * O `Tabs` do Mantine já entrega a semântica de `tablist`/`tab`/`tabpanel` e a
 * navegação por setas do teclado — reimplementá-la com botões custaria os dois
 * (SC-007).
 */
export function ProcedureGroupTabs({ groups, value, onChange, children }: ProcedureGroupTabsProps) {
  const theme = useMantineTheme();

  /**
   * Resolve o nome da paleta para um valor concreto. A cor entra por variável
   * CSS porque a faixa é desenhada em `::after`, que não aceita prop de estilo.
   */
  const colorOf = (id: ProcedureGroupId): string =>
    theme.colors[GROUP_COLORS[id]]?.[5] ?? theme.colors.gray[5];

  return (
    <Tabs
      value={value}
      onChange={(next) => {
        // O Mantine tipa o valor como `string | null`; só repassamos o que é um
        // grupo existente, para não propagar um id inválido.
        const match = groups.find((group) => group.id === next);
        if (match !== undefined) {
          onChange(match.id);
        }
      }}
      keepMounted={false}
    >
      <Tabs.List className={classes.list} aria-label={messages.procedures.groupsLabel}>
        {groups.map((group) => (
          <Tabs.Tab
            key={group.id}
            value={group.id}
            className={classes.tab}
            // Marca a aba sem conteúdo para o CSS atenuá-la. Ela permanece
            // selecionável: desabilitá-la a tiraria da navegação por teclado e
            // esconderia a informação de que o grupo existe e está vazio.
            data-empty={group.procedures.length === 0 ? "true" : undefined}
            style={{ "--group-color": colorOf(group.id) } as React.CSSProperties}
          >
            {messages.procedures.groups[group.id]}
            <span className={classes.count}>{group.procedures.length}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {groups.map((group) => (
        <Tabs.Panel key={group.id} value={group.id} pt="md">
          {group.id === value ? children : null}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
