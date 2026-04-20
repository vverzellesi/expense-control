import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParseSourceBadge } from "./ParseSourceBadge";

describe("<ParseSourceBadge />", () => {
  it("renderiza 'Extraído com IA' quando source='ai'", () => {
    render(<ParseSourceBadge source="ai" />);
    expect(screen.getByText(/Extraído com IA/i)).toBeInTheDocument();
  });

  it("não renderiza nada quando source='notif' (parser de notificação é silencioso)", () => {
    const { container } = render(<ParseSourceBadge source="notif" />);
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada quando fallbackReason='disabled' (AI não configurada)", () => {
    const { container } = render(
      <ParseSourceBadge source="regex" fallbackReason="disabled" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza 'IA esgotada este mês' quando fallbackReason='quota_exhausted'", () => {
    render(<ParseSourceBadge source="regex" fallbackReason="quota_exhausted" />);
    expect(screen.getByText(/IA esgotada este mês/i)).toBeInTheDocument();
  });

  it("renderiza 'IA indisponível — parser tradicional' quando fallbackReason='quota_error'", () => {
    render(<ParseSourceBadge source="regex" fallbackReason="quota_error" />);
    expect(screen.getByText(/IA indisponível/i)).toBeInTheDocument();
  });

  it("renderiza 'IA indisponível — parser tradicional' quando fallbackReason='ai_error'", () => {
    render(<ParseSourceBadge source="regex" fallbackReason="ai_error" />);
    expect(screen.getByText(/IA indisponível/i)).toBeInTheDocument();
  });

  it("renderiza 'IA não reconheceu o documento' quando fallbackReason='gate_rejected'", () => {
    render(<ParseSourceBadge source="regex" fallbackReason="gate_rejected" />);
    expect(screen.getByText(/não reconheceu o documento/i)).toBeInTheDocument();
  });

  it("renderiza aviso genérico 'parser tradicional' quando fallbackReason='pdf_encrypted'", () => {
    render(<ParseSourceBadge source="regex" fallbackReason="pdf_encrypted" />);
    expect(screen.getByText(/parser tradicional/i)).toBeInTheDocument();
  });

  it("não renderiza quando source='regex' sem fallbackReason (consistência defensiva)", () => {
    const { container } = render(<ParseSourceBadge source="regex" />);
    expect(container.firstChild).toBeNull();
  });
});
