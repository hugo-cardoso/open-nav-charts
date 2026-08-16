import { describe, expect, it } from "vitest";
import { messages } from "../../shared/i18n/messages.js";
import { NotFoundPage } from "../../shared/pages/not-found-page.js";
import { render, screen } from "../../shared/testing/render.js";

describe("NotFoundPage", () => {
  it("informa que o endereço não existe", () => {
    render(<NotFoundPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.notFound.title);
    expect(screen.getByText(messages.notFound.body)).toBeInTheDocument();
  });

  /** FR-005: nunca deixar o usuário sem saída. */
  it("oferece caminho de volta à busca", () => {
    render(<NotFoundPage />);

    expect(screen.getByRole("link", { name: messages.notFound.action })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  it("define o título do documento", () => {
    render(<NotFoundPage />);

    expect(document.title).toBe(messages.documentTitle.notFound);
  });
});
