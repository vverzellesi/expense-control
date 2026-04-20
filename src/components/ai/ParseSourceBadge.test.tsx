import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParseSourceBadge } from "./ParseSourceBadge";

describe("<ParseSourceBadge />", () => {
  it("renderiza 'Extraído com IA' quando source='ai'", () => {
    render(<ParseSourceBadge source="ai" usedFallback={false} />);
    expect(screen.getByText(/Extraído com IA/i)).toBeInTheDocument();
  });

  it("renderiza aviso amarelo quando usedFallback=true", () => {
    render(<ParseSourceBadge source="regex" usedFallback={true} />);
    expect(
      screen.getByText(/Usando parser tradicional/i)
    ).toBeInTheDocument();
  });

  it("não renderiza nada quando source='notif'", () => {
    const { container } = render(
      <ParseSourceBadge source="notif" usedFallback={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada quando source='regex' e usedFallback=false (não tem AI config)", () => {
    const { container } = render(
      <ParseSourceBadge source="regex" usedFallback={false} />
    );
    expect(container.firstChild).toBeNull();
  });
});
