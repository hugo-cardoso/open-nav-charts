// CommonJS porque o PostCSS carrega este arquivo fora da cadeia de módulos do
// Vite. Sem `postcss-preset-mantine` os mixins responsivos do Mantine não são
// processados, o que quebraria a responsividade exigida por FR-025.
module.exports = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};
