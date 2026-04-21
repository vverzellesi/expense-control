import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock prisma
vi.mock("@/lib/db", () => ({
  default: {
    settings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock categorizer
vi.mock("@/lib/categorizer", () => ({
  suggestCategory: vi.fn().mockResolvedValue(null),
  detectInstallment: vi.fn().mockReturnValue({
    isInstallment: false,
    currentInstallment: null,
    totalInstallments: null,
  }),
  detectRecurringTransaction: vi.fn().mockReturnValue({
    isRecurring: false,
    recurringName: null,
  }),
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn().mockReturnValue({ encrypted: "enc", iv: "iv" }),
  decrypt: vi.fn().mockReturnValue("savedpass"),
}));

// Mock parse-pipeline — o alvo do refactor
vi.mock("@/lib/parse-pipeline", () => ({
  parseFileForImport: vi.fn(),
}));

import { POST } from "@/app/api/ocr/route";
import prisma from "@/lib/db";
import { parseFileForImport } from "@/lib/parse-pipeline";

const mockPrisma = prisma as unknown as {
  settings: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  category: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};
const mockParsePipeline = vi.mocked(parseFileForImport);

function makeRequest(file: File, password?: string): NextRequest {
  const form = new FormData();
  form.append("file", file);
  if (password) form.append("password", password);

  return new NextRequest(new URL("http://localhost:3000/api/ocr"), {
    method: "POST",
    body: form,
  });
}

function makeFile(name: string, type: string = "application/pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("POST /api/ocr (pipeline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.settings.findUnique.mockResolvedValue(null);
    mockPrisma.category.findFirst.mockResolvedValue({
      id: "cat-default",
      name: "Outros",
    });
  });

  it("delega para parseFileForImport e propaga source/usedFallback/aiEnabled/aiAttempted quando AI sucesso", async () => {
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Nubank",
      transactions: [
        {
          date: new Date("2026-03-10"),
          description: "IFOOD",
          amount: -45,
          type: "EXPENSE",
          confidence: 1,
        },
      ],
      source: "ai",
      usedFallback: false,
      aiEnabled: true,
      aiAttempted: true,
      confidence: 1,
    });

    const response = await POST(makeRequest(makeFile("fatura.pdf")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.source).toBe("ai");
    expect(data.usedFallback).toBe(false);
    expect(data.aiEnabled).toBe(true);
    expect(data.aiAttempted).toBe(true);
    expect(data.fallbackReason).toBeUndefined();
    expect(data.transactions).toHaveLength(1);
    expect(data.origin).toBe("Nubank");
    // Contrato de sinal: despesa sai negativa.
    expect(data.transactions[0].amount).toBe(-45);
  });

  it("usedFallback=true + fallbackReason quando o pipeline caiu no regex", async () => {
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "C6",
      transactions: [
        {
          date: new Date("2026-03-11"),
          description: "PIX RECEBIDO",
          amount: 100,
          type: "INCOME",
          confidence: 0.85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: true,
      aiAttempted: true,
      fallbackReason: "ai_error",
      confidence: 0.85,
      rawText: "extrato mock",
    });

    const response = await POST(makeRequest(makeFile("extrato.pdf")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.source).toBe("regex");
    expect(data.usedFallback).toBe(true);
    expect(data.fallbackReason).toBe("ai_error");
    // Data leak fix: rawText NÃO deve vazar ao cliente.
    expect(data.rawText).toBeUndefined();
  });

  it("erro needs_password retorna 200 com needsPassword=true", async () => {
    mockParsePipeline.mockResolvedValue({
      kind: "error",
      error: "needs_password",
    });

    const response = await POST(makeRequest(makeFile("secret.pdf")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.needsPassword).toBe(true);
  });

  it("erro no_transactions_found retorna 400 SEM expor rawText (data leak fix)", async () => {
    mockParsePipeline.mockResolvedValue({
      kind: "error",
      error: "no_transactions_found",
      rawText: "dado financeiro bruto sensível",
    });

    const response = await POST(makeRequest(makeFile("nada.pdf")));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Nenhuma transação");
    // Contrato de segurança: OCR bruto NÃO vai pro cliente
    expect(data.rawText).toBeUndefined();
  });

  it("erro invalid_file retorna 400 com a message do pipeline", async () => {
    mockParsePipeline.mockResolvedValue({
      kind: "error",
      error: "invalid_file",
      message: "Arquivo excede 50 MB (limite da IA)",
    });

    const response = await POST(makeRequest(makeFile("huge.pdf")));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Arquivo excede 50 MB (limite da IA)");
  });

  it("faz retry com senha salva quando primeira chamada pede senha", async () => {
    mockPrisma.settings.findUnique.mockResolvedValue({
      value: JSON.stringify({ encrypted: "enc", iv: "iv" }),
    });
    mockParsePipeline
      .mockResolvedValueOnce({
        kind: "error",
        error: "needs_password",
      })
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Itaú",
        transactions: [
          {
            date: new Date("2026-03-05"),
            description: "BOLETO",
            amount: -99,
            type: "EXPENSE",
            confidence: 1,
          },
        ],
        source: "ai",
        usedFallback: false,
        aiEnabled: true,
        aiAttempted: true,
        confidence: 1,
      });

    const response = await POST(makeRequest(makeFile("locked.pdf")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.source).toBe("ai");
    // Pipeline foi chamado duas vezes: primeiro sem senha, depois com savedpass.
    expect(mockParsePipeline).toHaveBeenCalledTimes(2);
    expect(mockParsePipeline.mock.calls[1][0].password).toBe("savedpass");
  });

  it("rejeita extensão inválida com 400", async () => {
    const response = await POST(makeRequest(makeFile("malware.exe", "application/x-exe")));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Formato");
    expect(mockParsePipeline).not.toHaveBeenCalled();
  });
});
