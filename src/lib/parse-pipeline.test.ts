import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/rate-limit/ai-quota");
vi.mock("@/lib/ai-parser/gemini-client");
vi.mock("@/lib/ai-parser/invoice-parser");
// Preserva PdfPasswordError (classe real) e mocka apenas funções.
vi.mock("@/lib/ocr-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr-parser")>();
  return {
    ...actual,
    processFile: vi.fn(),
    processImageOCR: vi.fn(),
    processBufferOCR: vi.fn(),
    isPdfEncrypted: vi.fn(),
  };
});
vi.mock("@/lib/statement-parser");
vi.mock("@/lib/notification-parser");

import { parseFileForImport } from "./parse-pipeline";
import * as aiQuota from "@/lib/rate-limit/ai-quota";
import * as geminiClientMod from "@/lib/ai-parser/gemini-client";
import * as invoiceParser from "@/lib/ai-parser/invoice-parser";
import * as ocrParser from "@/lib/ocr-parser";
import * as statementParser from "@/lib/statement-parser";
import * as notifParser from "@/lib/notification-parser";

const userId = "u1";
const buffer = Buffer.from("fake");

function validAiResult() {
  return {
    bank: "Nubank",
    documentType: "fatura_cartao" as const,
    averageConfidence: 1,
    transactions: [
      {
        date: new Date("2026-03-10"),
        description: "PAG*IFOOD",
        amount: -45,
        type: "EXPENSE" as const,
        confidence: 1,
      },
    ],
  };
}

describe("parseFileForImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiQuota.currentYearMonth).mockReturnValue("2026-04");
    vi.mocked(aiQuota.tryReserve).mockResolvedValue(true);
    vi.mocked(aiQuota.release).mockResolvedValue(undefined);
    vi.mocked(notifParser.parseNotificationText).mockReturnValue(null);
    vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue({
      generateInvoiceStructured: vi.fn(),
    });
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue(validAiResult());
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(ocrParser.processImageOCR).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(ocrParser.isPdfEncrypted).mockResolvedValue(false);
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "",
      averageConfidence: 0,
      transactions: [],
    });
  });

  it("PREFLIGHT: PDF encriptado pula AI e vai direto STEP 3 (legacy trata senha)", async () => {
    vi.mocked(ocrParser.isPdfEncrypted).mockResolvedValue(true);
    const { PdfPasswordError } = await import("@/lib/ocr-parser");
    vi.mocked(ocrParser.processFile).mockRejectedValue(new PdfPasswordError(true));

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "secret.pdf",
      userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("needs_password");
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 1: notification-parser match retorna source=notif sem chamar AI", async () => {
    vi.mocked(notifParser.parseNotificationText).mockReturnValue({
      bank: "Nubank",
      averageConfidence: 0.9,
      transactions: [
        {
          date: new Date(),
          description: "CPG IFOOD",
          amount: -25,
          type: "EXPENSE",
          confidence: 0.9,
        },
      ],
    });
    vi.mocked(ocrParser.processImageOCR).mockResolvedValue({
      text: "Compra aprovada R$25",
      confidence: 80,
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "image/png",
      filename: "notif.png",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("notif");
      expect(result.usedFallback).toBe(false);
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 2: AI success + documentType válido retorna source=ai com quota RESERVADA e NÃO liberada", async () => {
    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "fatura.pdf",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("ai");
      expect(result.usedFallback).toBe(false);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalledWith(userId, "2026-04");
    expect(aiQuota.release).not.toHaveBeenCalled();
  });

  it("ACCEPTANCE GATE: AI retorna documentType=desconhecido libera quota e cai no fallback", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Desconhecido",
      documentType: "desconhecido",
      averageConfidence: 1,
      transactions: [
        {
          date: new Date(),
          description: "ruído",
          amount: -5,
          type: "EXPENSE",
          confidence: 1,
        },
      ],
    });
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        {
          date: new Date(),
          description: "PIX",
          amount: 100,
          type: "INCOME",
          confidence: 0.85,
        },
      ],
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalled();
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("ACCEPTANCE GATE: AI retorna 0 transações libera quota e cai no fallback", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Nubank",
      documentType: "fatura_cartao",
      averageConfidence: 1,
      transactions: [],
    });
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "",
      averageConfidence: 0,
      transactions: [],
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("no_transactions_found");
    }
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("STEP 2 skip: sem GEMINI_API_KEY cai em fallback sem reservar", async () => {
    vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue(null);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        {
          date: new Date(),
          description: "PIX",
          amount: 100,
          type: "INCOME",
          confidence: 0.85,
        },
      ],
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 2 skip: tryReserve retorna false (quota esgotada) cai no fallback", async () => {
    vi.mocked(aiQuota.tryReserve).mockResolvedValue(false);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        {
          date: new Date(),
          description: "PIX",
          amount: 100,
          type: "INCOME",
          confidence: 0.85,
        },
      ],
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.release).not.toHaveBeenCalled(); // não reservou, não precisa liberar
  });

  it("STEP 2 falha (API error) libera quota e cai no fallback", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("API down"));
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        {
          date: new Date(),
          description: "PIX",
          amount: 100,
          type: "INCOME",
          confidence: 0.85,
        },
      ],
    });

    const result = await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalled();
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("yearMonth é capturado UMA vez e reusado em reserve + release (evita race de virada de mês)", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("falha"));
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "",
      averageConfidence: 0,
      transactions: [],
    });

    await parseFileForImport({
      buffer,
      mimeType: "application/pdf",
      filename: "x.pdf",
      userId,
    });

    expect(aiQuota.currentYearMonth).toHaveBeenCalledTimes(1);
    expect(aiQuota.tryReserve).toHaveBeenCalledWith(userId, "2026-04");
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("arquivo > 50MB retorna invalid_file sem chamar AI", async () => {
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024);

    const result = await parseFileForImport({
      buffer: bigBuffer,
      mimeType: "application/pdf",
      filename: "huge.pdf",
      userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("invalid_file");
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("mime inválido retorna invalid_file", async () => {
    const result = await parseFileForImport({
      buffer,
      mimeType: "application/x-exe",
      filename: "malware.exe",
      userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("invalid_file");
    }
  });
});
