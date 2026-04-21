import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do SDK oficial ANTES do import do módulo testado. O gemini-client
// instancia um GoogleGenAI com a chave — substituímos o construtor por um
// espião que captura os argumentos de generateContent.
const generateContentMock = vi.fn();

vi.mock("@google/genai", () => {
  class GoogleGenAI {
    models = { generateContent: generateContentMock };
    constructor(_: unknown) {}
  }
  // Reexporta Type e qualquer outra coisa que schema.ts use em runtime.
  const Type = {
    STRING: "STRING",
    NUMBER: "NUMBER",
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
  };
  return { GoogleGenAI, Type };
});

import { createGeminiClient } from "./gemini-client";

describe("GeminiClient (RealGeminiClient): multi-part", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    // Chave fake pra createGeminiClient() não retornar null.
    process.env.GEMINI_API_KEY = "test-key";
  });

  function stubValidResponse() {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        bank: "Nubank",
        documentType: "fatura_cartao",
        documentConfidence: 0.9,
        transactions: [
          { description: "PAG*IFOOD", amount: 45, date: "2026-03-15", type: "EXPENSE" },
        ],
      }),
    });
  }

  it("single-file (buffer, mimeType): envia 1 inlineData part (backward compat)", async () => {
    stubValidResponse();
    const client = createGeminiClient();
    expect(client).not.toBeNull();

    await client!.generateInvoiceStructured(Buffer.from("xxx"), "application/pdf");

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts).toHaveLength(1);
    expect(call.contents[0].parts[0].inlineData).toMatchObject({
      mimeType: "application/pdf",
    });
    expect(call.contents[0].parts[0].inlineData.data).toBe(
      Buffer.from("xxx").toString("base64")
    );
  });

  it("multi-part (array): envia N inlineData parts na MESMA request (consume 1 cota)", async () => {
    stubValidResponse();
    const client = createGeminiClient();
    expect(client).not.toBeNull();

    const parts = [
      { buffer: Buffer.from("img-1"), mimeType: "image/jpeg" },
      { buffer: Buffer.from("img-2"), mimeType: "image/jpeg" },
      { buffer: Buffer.from("img-3"), mimeType: "image/png" },
    ];

    await client!.generateInvoiceStructured(parts);

    // CHAVE: 1 chamada ao Gemini pro batch inteiro
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts).toHaveLength(3);
    expect(call.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
    expect(call.contents[0].parts[0].inlineData.data).toBe(
      Buffer.from("img-1").toString("base64")
    );
    expect(call.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(call.contents[0].parts[1].inlineData.data).toBe(
      Buffer.from("img-2").toString("base64")
    );
    expect(call.contents[0].parts[2].inlineData.mimeType).toBe("image/png");
    expect(call.contents[0].parts[2].inlineData.data).toBe(
      Buffer.from("img-3").toString("base64")
    );
  });

  it("multi-part mistura mimetypes (PDF + imagem): permite extensão natural", async () => {
    stubValidResponse();
    const client = createGeminiClient();
    expect(client).not.toBeNull();

    const parts = [
      { buffer: Buffer.from("pdf-content"), mimeType: "application/pdf" },
      { buffer: Buffer.from("jpg-content"), mimeType: "image/jpeg" },
    ];

    await client!.generateInvoiceStructured(parts);

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts).toHaveLength(2);
    expect(call.contents[0].parts[0].inlineData.mimeType).toBe("application/pdf");
    expect(call.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
  });

  it("array vazio: lança erro (contrato explícito)", async () => {
    stubValidResponse();
    const client = createGeminiClient();
    expect(client).not.toBeNull();

    await expect(client!.generateInvoiceStructured([])).rejects.toThrow(
      /parts array não pode estar vazio/
    );
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("createGeminiClient retorna null sem GEMINI_API_KEY", () => {
    delete process.env.GEMINI_API_KEY;
    expect(createGeminiClient()).toBeNull();
  });
});
