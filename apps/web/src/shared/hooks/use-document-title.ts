import { useEffect } from "react";

/**
 * Define o título do documento da tela atual. Sem isso, todas as entradas do
 * histórico do navegador teriam o mesmo rótulo, tornando ilegível a lista de
 * "voltar" (contracts/ui-routes.md §"Acessibilidade").
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
