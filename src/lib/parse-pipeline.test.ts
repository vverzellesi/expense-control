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

import { parseFileForImport, parseFilesForImport } from "./parse-pipeline";
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
      generateInvoiceStructured: vi.fn() as never,
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

    it("Imagem grande com AI habilitada: pula STEP 1 pra não estourar timeout", async () => {
      // Regressão: imagem >500KB (típica de screenshot de extrato) fazia
      // STEP 1 tesseract (~20s) ANTES da AI (~30s), estourando 60s da Vercel.
      const bigBuffer = Buffer.alloc(600 * 1024, 0); // 600KB > NOTIF_FAST_PATH_MAX_BYTES
      vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue(validAiResult());

      const result = await parseFileForImport({
        buffer: bigBuffer,
        mimeType: "image/png",
        filename: "extrato-grande.png",
        userId,
      });

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("ai");
      // Chave: processImageOCR do STEP 1 foi pulado, AI rodou direto.
      expect(ocrParser.processImageOCR).not.toHaveBeenCalled();
      expect(invoiceParser.parseFileWithAi).toHaveBeenCalledTimes(1);
    });

    it("Imagem pequena com AI habilitada: mantém fast-path de STEP 1 (notif sem quota)", async () => {
      // Telegram/celular comprime notificações pra <500KB, então STEP 1
      // continua valendo pra não queimar quota em push notifications.
      const smallBuffer = Buffer.alloc(100 * 1024, 0); // 100KB
      vi.mocked(notifParser.parseNotificationText).mockReturnValue({
        bank: "Nubank",
        averageConfidence: 0.9,
        transactions: [
          { date: new Date(), description: "PIX", amount: -30, type: "EXPENSE", confidence: 0.9 },
        ],
      });
      vi.mocked(ocrParser.processImageOCR).mockResolvedValue({
        text: "Compra aprovada",
        confidence: 80,
      });

      const result = await parseFileForImport({
        buffer: smallBuffer,
        mimeType: "image/png",
        filename: "notif.png",
        userId,
      });

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.source).toBe("notif");
      expect(ocrParser.processImageOCR).toHaveBeenCalledTimes(1);
      expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
      expect(aiQuota.tryReserve).not.toHaveBeenCalled();
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

describe("parseFilesForImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiQuota.currentYearMonth).mockReturnValue("2026-04");
    vi.mocked(aiQuota.tryReserve).mockResolvedValue(true);
    vi.mocked(aiQuota.release).mockResolvedValue(undefined);
    vi.mocked(notifParser.parseNotificationText).mockReturnValue(null);
    vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue({
      generateInvoiceStructured: vi.fn() as never,
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

  it("N inputs com AI: chama Gemini 1x com array de parts (uma única quota)", async () => {
    const inputs = [1, 2, 3].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("ai");
    expect(result.usedFallback).toBe(false);
    // Chave: 1 reserva de quota pro batch inteiro
    expect(aiQuota.tryReserve).toHaveBeenCalledTimes(1);
    // Chave: 1 chamada ao Gemini com array de 3 parts
    expect(invoiceParser.parseFileWithAi).toHaveBeenCalledTimes(1);
    const firstArg = vi.mocked(invoiceParser.parseFileWithAi).mock.calls[0][0];
    expect(Array.isArray(firstArg)).toBe(true);
    expect(firstArg).toHaveLength(3);
  });

  it("AI falha: fallback roda loop imagem-por-imagem com OCR+regex (sem nova quota)", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("gemini 5xx"));
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO COMPLETO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("regex");
    expect(result.fallbackReason).toBe("ai_error");
    expect(result.usedFallback).toBe(true);
    // Transações agregadas dos 2 arquivos
    expect(result.transactions).toHaveLength(2);
    // Chave: 1 chamada à AI (que falhou), DEPOIS loop de OCR por arquivo
    expect(invoiceParser.parseFileWithAi).toHaveBeenCalledTimes(1);
    expect(ocrParser.processFile).toHaveBeenCalledTimes(2);
    // Quota reservada apenas 1x
    expect(aiQuota.tryReserve).toHaveBeenCalledTimes(1);
  });

  it("N=1 input: delega pra parseFileForImport (comportamento idêntico)", async () => {
    // Single input passa pela implementação single-file — mantém fast-path
    // incluindo STEP 1 notif, que o caminho multi pula.
    vi.mocked(notifParser.parseNotificationText).mockReturnValue({
      bank: "Nubank",
      averageConfidence: 0.9,
      transactions: [
        { date: new Date(), description: "CPG IFOOD", amount: -25, type: "EXPENSE", confidence: 0.9 },
      ],
    });
    vi.mocked(ocrParser.processImageOCR).mockResolvedValue({
      text: "Compra R$25",
      confidence: 80,
    });

    const result = await parseFilesForImport([
      {
        buffer: Buffer.from("single"),
        mimeType: "image/png",
        filename: "notif.png",
        userId,
      },
    ]);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Como foi N=1 e bateu com notif, resultado = fast-path (sem quota).
    expect(result.source).toBe("notif");
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
  });

  it("N inputs sem AI (GEMINI_API_KEY ausente): loop fallback direto, nenhuma quota", async () => {
    vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue(null);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("regex");
    expect(result.fallbackReason).toBe("disabled");
    expect(result.transactions).toHaveLength(2);
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
  });

  it("N inputs com quota esgotada: fallback sem chamar AI", async () => {
    vi.mocked(aiQuota.tryReserve).mockResolvedValue(false);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("regex");
    expect(result.fallbackReason).toBe("quota_exhausted");
    expect(aiQuota.tryReserve).toHaveBeenCalledTimes(1);
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
  });

  it("PDF encriptado entre os inputs: pula AI pro batch inteiro", async () => {
    vi.mocked(ocrParser.isPdfEncrypted).mockImplementation(async (buf: Buffer) => {
      return buf.toString() === "locked";
    });
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "",
      averageConfidence: 0,
      transactions: [],
    });

    const inputs = [
      { buffer: Buffer.from("normal"), mimeType: "application/pdf", filename: "a.pdf", userId },
      { buffer: Buffer.from("locked"), mimeType: "application/pdf", filename: "b.pdf", userId },
    ];

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("error");
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("N inputs com AI + gate reprovado: cai em fallback agregando por-arquivo", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Desconhecido",
      documentType: "desconhecido",
      averageConfidence: 1,
      transactions: [],
    });
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "Itau",
      averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 50, type: "INCOME", confidence: 0.85 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("regex");
    expect(result.fallbackReason).toBe("gate_rejected");
    expect(result.transactions).toHaveLength(2);
    // AI foi chamada 1x (falhou gate) mas não 2x
    expect(invoiceParser.parseFileWithAi).toHaveBeenCalledTimes(1);
  });

  it("input vazio: retorna invalid_file", async () => {
    const result = await parseFilesForImport([]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("invalid_file");
    }
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("mime inválido em QUALQUER input: invalid_file antes de reservar quota", async () => {
    const inputs = [
      { buffer: Buffer.from("ok"), mimeType: "image/jpeg", filename: "a.jpg", userId },
      { buffer: Buffer.from("bad"), mimeType: "application/x-exe", filename: "b.exe", userId },
    ];

    const result = await parseFilesForImport(inputs);
    expect(result.kind).toBe("error");
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
  });

  it("AI + gate rejeita quando documentConfidence < 0.6 no multi-part (threshold mais alto que single)", async () => {
    // Regressão P1: álbum com documentos heterogêneos tende a vir com
    // confidence entre 0.5 e 0.6 (modelo tem incerteza sobre a coesão).
    // Single-file aceita >= 0.5; multi-part usa >= 0.6 pra não mesclar
    // bancos/tipos distintos.
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Nubank",
      documentType: "fatura_cartao",
      documentConfidence: 0.55, // entre 0.5 e 0.6 — rejeitado no multi-part
      averageConfidence: 1,
      transactions: [
        { date: new Date(), description: "X", amount: 5, type: "EXPENSE", confidence: 1 },
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

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.fallbackReason).toBe("gate_rejected");
    expect(result.source).toBe("regex");
    // Fallback por-arquivo rodou e agregou
    expect(result.transactions).toHaveLength(2);
  });

  it("AI + gate aceita quando documentConfidence >= 0.6 no multi-part", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Nubank",
      documentType: "fatura_cartao",
      documentConfidence: 0.65,
      averageConfidence: 1,
      transactions: [
        { date: new Date(), description: "X", amount: 5, type: "EXPENSE", confidence: 1 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.source).toBe("ai");
    expect(result.fallbackReason).toBeUndefined();
  });

  it("fallback com TODOS inputs falhando por erro interno de OCR: retorna 'internal' (não 'no_transactions_found')", async () => {
    // Regressão P3: se o OCR/parser interno falhar em cada arquivo do batch,
    // a função antes retornava 'no_transactions_found' — falso negativo de
    // negócio que mascara problema de infra. Agora deve propagar 'internal'.
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("gemini down"));
    vi.mocked(ocrParser.processFile).mockRejectedValue(new Error("tesseract crashed"));

    const inputs = [1, 2, 3].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error).toBe("internal");
    // Mensagem carrega o erro real pro diagnóstico
    expect(result.message).toContain("tesseract");
  });

  it("fallback com parte dos inputs falhando mas um extraindo transações: success com as que deram certo", async () => {
    // Contraponto do teste acima: se AO MENOS UM input extrair transações,
    // não deve retornar 'internal' — o batch tem valor real, mesmo parcial.
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("gemini down"));
    let callCount = 0;
    vi.mocked(ocrParser.processFile).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("tesseract crashed");
      return { text: "EXTRATO BOM", confidence: 85 };
    });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6",
      averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const inputs = [1, 2].map((i) => ({
      buffer: Buffer.from(`img-${i}`),
      mimeType: "image/jpeg",
      filename: `img-${i}.jpg`,
      userId,
    }));

    const result = await parseFilesForImport(inputs);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 1 input falhou, 1 extraiu — agregou o que deu
    expect(result.transactions).toHaveLength(1);
  });
});
