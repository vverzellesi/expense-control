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

  it("ACCEPTANCE GATE: AI retorna documentType=desconhecido NÃO libera quota (chamada já foi cobrada) e cai no fallback", async () => {
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
    // Correct semantics: generateContent JÁ COBROU. Não liberar a quota.
    expect(aiQuota.release).not.toHaveBeenCalled();
  });

  it("ACCEPTANCE GATE: AI retorna 0 transações NÃO libera quota (chamada foi cobrada) e cai no fallback", async () => {
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
    // Correct semantics: generateContent JÁ COBROU. Não liberar a quota.
    expect(aiQuota.release).not.toHaveBeenCalled();
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

  it("STEP 2 falha (API error) NÃO libera quota (chamada iniciada é cobrada) e cai no fallback", async () => {
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
    // Correct semantics: generateContent foi iniciado. Gemini COBROU. Não liberar.
    expect(aiQuota.release).not.toHaveBeenCalled();
  });

  it("yearMonth é capturado UMA vez e reusado em reserve (evita race de virada de mês)", async () => {
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
    // Não libera — chamada foi iniciada e cobrada.
    expect(aiQuota.release).not.toHaveBeenCalled();
  });

  it("tryReserve lança (DB caiu) → fallback com fallbackReason='quota_error', NÃO 500", async () => {
    vi.mocked(aiQuota.tryReserve).mockRejectedValue(new Error("DB connection lost"));
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
    // Não tentou AI porque a reserva nem foi confirmada
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    // Não há release — nada foi reservado com sucesso
    expect(aiQuota.release).not.toHaveBeenCalled();
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

  describe("structured logging", () => {
    it("loga JSON line com source, fallbackReason, documentType, txCount, latencyMs, mimeType, quotaReserved", async () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        await parseFileForImport({
          buffer,
          mimeType: "application/pdf",
          filename: "fatura.pdf",
          userId,
        });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const rawLog = logSpy.mock.calls[0][0];
        expect(typeof rawLog).toBe("string");
        const logData = JSON.parse(rawLog as string);
        expect(logData).toMatchObject({
          source: "ai",
          documentType: "fatura_cartao",
          txCount: 1,
          mimeType: "application/pdf",
          quotaReserved: true,
        });
        expect(logData.fallbackReason).toBeUndefined();
        expect(typeof logData.latencyMs).toBe("number");
      } finally {
        logSpy.mockRestore();
      }
    });

    it("loga com fallbackReason quando cai no fallback", async () => {
      vi.mocked(aiQuota.tryReserve).mockResolvedValue(false);
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        await parseFileForImport({
          buffer,
          mimeType: "application/pdf",
          filename: "x.pdf",
          userId,
        });

        const logData = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(logData).toMatchObject({
          source: "regex",
          fallbackReason: "quota_exhausted",
          quotaReserved: false,
          txCount: 1,
        });
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe("structured fallback contract (aiEnabled + aiAttempted + fallbackReason)", () => {
    it("AI sucesso: aiEnabled=true, aiAttempted=true, fallbackReason=undefined, usedFallback=false", async () => {
      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "fatura.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("ai");
      expect(result.aiEnabled).toBe(true);
      expect(result.aiAttempted).toBe(true);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.usedFallback).toBe(false);
    });

    it("Sem GEMINI_API_KEY: aiEnabled=false, aiAttempted=false, fallbackReason='disabled'", async () => {
      vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue(null);
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.aiEnabled).toBe(false);
      expect(result.aiAttempted).toBe(false);
      expect(result.fallbackReason).toBe("disabled");
      // usedFallback é derivado (source !== "notif" && fallbackReason != null)
      expect(result.usedFallback).toBe(true);
    });

    it("Imagem sem AI key + não-notif: reusa OCR do STEP 1 no STEP 3 (não chama processFile)", async () => {
      // Regressão: sem este cache, imagem não-notif sem AI passava por 2 OCR
      // tesseract passes e estourava o timeout de 60s da Vercel.
      vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue(null);
      vi.mocked(ocrParser.processImageOCR).mockResolvedValue({
        text: "EXTRATO COMPLETO",
        confidence: 75,
      });
      vi.mocked(notifParser.parseNotificationText).mockReturnValue(null);
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "Itau",
        averageConfidence: 0.75,
        transactions: [
          { date: new Date(), description: "PIX", amount: -50, type: "EXPENSE", confidence: 0.75 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "image/png",
        filename: "extrato.png",
        userId,
      });

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("regex");
      expect(result.fallbackReason).toBe("disabled");
      // Chave do teste: processImageOCR chamado 1 vez, processFile NÃO chamado.
      expect(ocrParser.processImageOCR).toHaveBeenCalledTimes(1);
      expect(ocrParser.processFile).not.toHaveBeenCalled();
    });

    it("Quota esgotada: fallbackReason='quota_exhausted', aiEnabled=true, aiAttempted=false", async () => {
      vi.mocked(aiQuota.tryReserve).mockResolvedValue(false);
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.aiEnabled).toBe(true);
      expect(result.aiAttempted).toBe(false);
      expect(result.fallbackReason).toBe("quota_exhausted");
    });

    it("tryReserve erro de DB: fallbackReason='quota_error', aiEnabled=true, aiAttempted=false", async () => {
      vi.mocked(aiQuota.tryReserve).mockRejectedValue(new Error("DB down"));
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.fallbackReason).toBe("quota_error");
      expect(result.aiAttempted).toBe(false);
    });

    it("AI lança erro: fallbackReason='ai_error', aiAttempted=true", async () => {
      vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("API down"));
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.fallbackReason).toBe("ai_error");
      expect(result.aiAttempted).toBe(true);
    });

    it("Gate reprovado (documentType=desconhecido): fallbackReason='gate_rejected', aiAttempted=true", async () => {
      vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
        bank: "Desconhecido",
        documentType: "desconhecido",
        averageConfidence: 1,
        transactions: [
          { date: new Date(), description: "ruído", amount: -5, type: "EXPENSE", confidence: 1 },
        ],
      });
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.fallbackReason).toBe("gate_rejected");
      expect(result.aiAttempted).toBe(true);
    });

    it("PDF criptografado: fallbackReason='pdf_encrypted' (quando chega no fallback), aiAttempted=false", async () => {
      vi.mocked(ocrParser.isPdfEncrypted).mockResolvedValue(true);
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "locked.pdf",
        userId,
        password: "right-password",
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.fallbackReason).toBe("pdf_encrypted");
      expect(result.aiAttempted).toBe(false);
    });

    it("Gate: rejeita quando documentConfidence < 0.5 (fallbackReason='gate_rejected')", async () => {
      vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
        bank: "Nubank",
        documentType: "fatura_cartao", // documentType válido
        documentConfidence: 0.3,        // MAS confidence baixa → rejeita
        averageConfidence: 1,
        transactions: [
          { date: new Date(), description: "X", amount: -5, type: "EXPENSE", confidence: 1 },
        ],
      });
      vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
      vi.mocked(statementParser.parseStatementText).mockReturnValue({
        bank: "C6",
        averageConfidence: 0.85,
        transactions: [
          { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.fallbackReason).toBe("gate_rejected");
      expect(result.source).toBe("regex");
    });

    it("Gate: aceita quando documentConfidence ausente + documentType válido + 1+ transações (compat)", async () => {
      vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
        bank: "Nubank",
        documentType: "fatura_cartao",
        // documentConfidence ausente
        averageConfidence: 1,
        transactions: [
          { date: new Date(), description: "X", amount: -5, type: "EXPENSE", confidence: 1 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("ai");
      expect(result.fallbackReason).toBeUndefined();
    });

    it("Gate: aceita quando documentConfidence >= 0.5", async () => {
      vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
        bank: "Nubank",
        documentType: "fatura_cartao",
        documentConfidence: 0.7,
        averageConfidence: 1,
        transactions: [
          { date: new Date(), description: "X", amount: -5, type: "EXPENSE", confidence: 1 },
        ],
      });

      const result = await parseFileForImport({
        buffer,
        mimeType: "application/pdf",
        filename: "x.pdf",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("ai");
    });

    it("source=notif: fallbackReason=undefined, usedFallback=false (não é fallback mesmo com AI disponível)", async () => {
      vi.mocked(notifParser.parseNotificationText).mockReturnValue({
        bank: "Nubank",
        averageConfidence: 0.9,
        transactions: [
          { date: new Date(), description: "CPG IFOOD", amount: -25, type: "EXPENSE", confidence: 0.9 },
        ],
      });
      vi.mocked(ocrParser.processImageOCR).mockResolvedValue({ text: "Compra R$25", confidence: 80 });

      const result = await parseFileForImport({
        buffer,
        mimeType: "image/png",
        filename: "notif.png",
        userId,
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("notif");
      expect(result.fallbackReason).toBeUndefined();
      expect(result.usedFallback).toBe(false);
    });
  });
});
