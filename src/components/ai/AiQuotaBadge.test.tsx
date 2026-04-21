import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiQuotaBadge } from "./AiQuotaBadge";

describe("<AiQuotaBadge />", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra loading inicial e depois o contador quando enabled=true", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, used: 2, remaining: 3, limit: 5, yearMonth: "2026-04" }),
    });

    render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(screen.getByText(/IA: 2\/5 usos/)).toBeInTheDocument();
    });
  });

  it("mostra estado esgotado (remaining = 0) com variant destructive", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, used: 5, remaining: 0, limit: 5, yearMonth: "2026-04" }),
    });

    render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(screen.getByText(/IA esgotada/i)).toBeInTheDocument();
    });
  });

  it("não renderiza nada quando endpoint retorna enabled=false (AI desabilitada)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    });

    const { container } = render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("não renderiza se fetch falhar", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"));

    const { container } = render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("não renderiza se o endpoint retornar 401/403/500", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });

    const { container } = render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
