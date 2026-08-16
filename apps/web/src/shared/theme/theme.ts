import { createTheme, type MantineBreakpointsValues } from "@mantine/core";

/**
 * Pontos de quebra em `em` para acompanharem o tamanho de fonte do usuário.
 * Centralizá-los aqui é o que impede larguras literais espalhadas pelos
 * componentes (contracts/ui-routes.md §"Responsividade").
 */
export const breakpoints: MantineBreakpointsValues = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em",
};

/** Consultas de mídia derivadas dos pontos de quebra, para uso com `useMediaQuery`. */
export const mediaQuery = {
  smallerThanSm: `(max-width: ${breakpoints.sm})`,
} as const;

export const theme = createTheme({
  primaryColor: "blue",
  breakpoints,
  // O acervo é denso em texto; a altura de linha maior facilita a leitura em
  // listas longas de procedimentos.
  lineHeights: {
    md: "1.6",
  },
  components: {
    // Alvos de toque confortáveis em telas pequenas (FR-026).
    Button: {
      defaultProps: {
        size: "md",
      },
    },
  },
});
