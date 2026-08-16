import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CollectionResponse, Procedure } from "../../../shared/api/types.js";
import { messages } from "../../../shared/i18n/messages.js";
import {
  emptyProcedureCollection,
  procedureCollection,
  procedureWithChart,
  procedureWithoutChart,
} from "../../../shared/testing/api-fixtures.js";
import { render, screen } from "../../../shared/testing/render.js";
import { ProcedureList } from "./procedure-list.js";

const baseProps = {
  icao: "SBGL",
  failure: null,
  isLoading: false,
  activeGroup: null,
  onGroupChange: vi.fn(),
  onRetry: vi.fn(),
};

function procedure(type: string, id = type, name = `${type} procedure`): Procedure {
  return { id, name, type, amendment: null, hasChart: true };
}

function collection(...items: Procedure[]): CollectionResponse<Procedure> {
  return { items, total: items.length };
}

describe("ProcedureList — conteúdo", () => {
  it("lista nome e tipo dos procedimentos da aba ativa", () => {
    render(<ProcedureList {...baseProps} data={procedureCollection} />);

    // As fixtures trazem um IAC e um SID; a primeira aba (IAC) é a exibida.
    expect(screen.getByText(procedureWithChart.name)).toBeInTheDocument();
    // O tipo exato aparece no item, não só no rótulo da aba: a consulta é
    // restrita ao painel para não casar com a aba de mesmo nome.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent(procedureWithChart.type);
  });

  it("exibe a emenda apenas quando existe", () => {
    render(<ProcedureList {...baseProps} data={procedureCollection} />);

    expect(screen.getByText(messages.procedures.amendment("3"))).toBeInTheDocument();
    expect(screen.queryByText(/Amendment null/)).not.toBeInTheDocument();
  });

  /** FR-015: só procedimentos com documento oferecem abertura. */
  it("oferece abertura apenas para procedimentos com carta", () => {
    render(
      <ProcedureList
        {...baseProps}
        data={collection(procedureWithChart, { ...procedureWithoutChart, type: "IAC" })}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText(messages.procedures.noChart)).toBeInTheDocument();
  });

  it("mostra o estado de carregamento", () => {
    render(<ProcedureList {...baseProps} data={undefined} isLoading />);

    expect(screen.getByRole("status")).toHaveTextContent(messages.procedures.loadingLabel);
  });

  it("informa quando não há procedimentos publicados", () => {
    render(<ProcedureList {...baseProps} data={emptyProcedureCollection} />);

    expect(screen.getByText(messages.procedures.emptyTitle)).toBeInTheDocument();
  });

  it("mostra a falha em inglês com ação de nova tentativa quando repetível", () => {
    render(
      <ProcedureList
        {...baseProps}
        data={undefined}
        failure={{ code: "SERVICE_UNAVAILABLE", status: 503, retryable: true }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The service is temporarily unavailable.");
    expect(screen.getByRole("button", { name: messages.feedback.retry })).toBeInTheDocument();
  });
});

describe("ProcedureList — abas por grupo", () => {
  const mixed = collection(
    procedure("STAR"),
    procedure("IAC"),
    procedure("VAC"),
    procedure("ADC"),
    procedure("SID"),
  );

  it("apresenta uma aba por grupo presente", () => {
    render(<ProcedureList {...baseProps} data={mixed} />);

    for (const label of ["STAR", "IAC", "TAXI", "SID"]) {
      expect(screen.getByRole("tab", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  /** A ordem precisa ser estável entre aeródromos. */
  it("mantém a ordem canônica das abas", () => {
    render(<ProcedureList {...baseProps} data={mixed} />);

    const rotulos = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""));
    expect(rotulos).toEqual(["STAR", "IAC", "TAXI", "SID"]);
  });

  /**
   * As abas do agrupamento aparecem sempre, ainda que vazias: a posição de cada
   * uma fica idêntica em todo aeródromo.
   */
  it("exibe todas as abas do agrupamento mesmo sem procedimentos do tipo", () => {
    render(<ProcedureList {...baseProps} data={collection(procedure("STAR"))} />);

    for (const label of ["STAR", "IAC", "TAXI", "SID"]) {
      expect(screen.getByRole("tab", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("marca a aba vazia para a interface poder atenuá-la", () => {
    render(<ProcedureList {...baseProps} data={collection(procedure("STAR"))} />);

    expect(screen.getByRole("tab", { name: /SID/ })).toHaveAttribute("data-empty", "true");
    expect(screen.getByRole("tab", { name: /STAR/ })).not.toHaveAttribute("data-empty");
  });

  /**
   * A aba ativa é controlada pelo pai (vem da URL), então o teste seleciona o
   * grupo vazio diretamente em vez de clicar — o clique só emitiria `onChange`.
   */
  it("informa a ausência numa aba vazia, em vez de painel em branco", () => {
    render(<ProcedureList {...baseProps} data={collection(procedure("STAR"))} activeGroup="SID" />);

    expect(screen.getByText(messages.procedures.emptyGroupTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.procedures.emptyGroupBody)).toBeInTheDocument();
  });

  /**
   * Sem isto, um aeródromo sem STAR abriria num painel vazio mesmo tendo
   * dezenas de cartas nas outras abas.
   */
  it("abre na primeira aba com procedimentos, não na primeira aba", () => {
    render(<ProcedureList {...baseProps} data={collection(procedure("SID"))} />);

    expect(screen.getByRole("tab", { name: /SID/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("SID procedure")).toBeInTheDocument();
  });

  it("mostra a contagem de cada grupo na aba", () => {
    render(
      <ProcedureList
        {...baseProps}
        data={collection(procedure("IAC", "a"), procedure("VAC", "b"), procedure("STAR"))}
      />,
    );

    expect(screen.getByRole("tab", { name: /IAC/ })).toHaveTextContent("2");
  });

  it("exibe apenas os procedimentos do grupo ativo", () => {
    render(<ProcedureList {...baseProps} data={mixed} activeGroup="TAXI" />);

    expect(screen.getByText("ADC procedure")).toBeInTheDocument();
    expect(screen.queryByText("STAR procedure")).not.toBeInTheDocument();
  });

  /** VAC e IAC compartilham a mesma aba. */
  it("reúne IAC e VAC na mesma aba", () => {
    render(<ProcedureList {...baseProps} data={mixed} activeGroup="IAC" />);

    expect(screen.getByText("IAC procedure")).toBeInTheDocument();
    expect(screen.getByText("VAC procedure")).toBeInTheDocument();
  });

  it("informa a troca de aba", async () => {
    const onGroupChange = vi.fn();
    render(<ProcedureList {...baseProps} data={mixed} onGroupChange={onGroupChange} />);

    await userEvent.click(screen.getByRole("tab", { name: /SID/ }));

    expect(onGroupChange).toHaveBeenCalledWith("SID");
  });

  it("cai na primeira aba com conteúdo quando nenhuma foi escolhida", () => {
    render(<ProcedureList {...baseProps} data={mixed} activeGroup={null} />);

    expect(screen.getByRole("tab", { name: /STAR/ })).toHaveAttribute("aria-selected", "true");
  });

  /**
   * Um endereço compartilhado pode trazer um grupo que este aeródromo não tem.
   * Cair na primeira aba evita um painel vazio sem explicação.
   */
  it("respeita o grupo da URL mesmo que a aba esteja vazia", () => {
    render(<ProcedureList {...baseProps} data={collection(procedure("STAR"))} activeGroup="SID" />);

    // A aba existe agora, então o endereço compartilhado é honrado.
    expect(screen.getByRole("tab", { name: /SID/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(messages.procedures.emptyGroupTitle)).toBeInTheDocument();
  });

  /** `OTHER` só existe quando há tipo imprevisto; sem ela, cai na aba com conteúdo. */
  it("cai numa aba existente quando o grupo da URL não está na lista", () => {
    render(
      <ProcedureList {...baseProps} data={collection(procedure("STAR"))} activeGroup="OTHER" />,
    );

    expect(screen.getByRole("tab", { name: /STAR/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("STAR procedure")).toBeInTheDocument();
  });

  /**
   * `AOC` existe no acervo mas não consta do agrupamento pedido. Sem a aba de
   * recuo, esses procedimentos ficariam inalcançáveis pela interface.
   */
  it("torna alcançáveis os tipos fora do agrupamento", () => {
    render(
      <ProcedureList
        {...baseProps}
        data={collection(procedure("STAR"), procedure("AOC"))}
        activeGroup="OTHER"
      />,
    );

    expect(
      screen.getByRole("tab", { name: new RegExp(messages.procedures.groups.OTHER) }),
    ).toBeInTheDocument();
    expect(screen.getByText("AOC procedure")).toBeInTheDocument();
  });

  /** SC-007: as abas precisam ser operáveis por teclado. */
  it("expõe as abas com semântica de tablist", () => {
    render(<ProcedureList {...baseProps} data={mixed} />);

    expect(
      screen.getByRole("tablist", { name: messages.procedures.groupsLabel }),
    ).toBeInTheDocument();
  });
});
