import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseFileWithAi } from "./invoice-parser";
import type { GeminiClient } from "./gemini-client";
import type { AiInvoiceOutput } from "./schema";

function loadFixture(name: string): AiInvoiceOutput {
  const path = resolve(__dirname, `../../../tests/fixtures/ai-parser/${name}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function mockClient(response: AiInvoiceOutput): GeminiClient {
  return {
    generateInvoiceStructured: vi.fn().mockResolvedValue(response),
  };
}

describe("parseFileWithAi", () => {
  const buffer = Buffer.from("fake-pdf-bytes");

  it("extrai transações de fatura Nubank e NORMALIZA sinal (EXPENSE → negativo)", async () => {
    const client = mockClient(loadFixture("nubank-fatura-sample-response.json"));
    const result = await parseFileWithAi(buffer, "application/pdf", client);

    expect(result.bank).toBe("Nubank");
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({
      description: "PAG*IFOOD",
      amount: -45.9, // EXPENSE → negativo (conforme contrato statement-parser)
      type: "EXPENSE",
    });
    expect(result.transactions[0].date).toBeInstanceOf(Date);
    // Todas as EXPENSE devem ser negativas
    const expenses = result.transactions.filter((t) => t.type === "EXPENSE");
    expect(expenses.every((t) => t.amount < 0)).toBe(true);
  });

  it("INCOME preserva sinal positivo", async () => {
    const client = mockClient(loadFixture("itau-extrato-sample-response.json"));
    const result = await parseFileWithAi(buffer, "application/pdf", client);

    const incomes = result.transactions.filter((t) => t.type === "INCOME");
    expect(incomes).toHaveLength(1);
    expect(incomes[0].amount).toBe(1500); // positivo
    expect(incomes[0].amount > 0).toBe(true);

    const expenses = result.transactions.filter((t) => t.type === "EXPENSE");
    expect(expenses.every((t) => t.amount < 0)).toBe(true);
  });

  it("retorna array vazio quando Gemini diz documentType=desconhecido", async () => {
    const client = mockClient(loadFixture("empty-response.json"));
    const result = await parseFileWithAi(buffer, "image/png", client);

    expect(result.transactions).toHaveLength(0);
    expect(result.bank).toBe("Desconhecido");
    expect(result.documentType).toBe("desconhecido");
  });

  it("descarta entradas inválidas (amount<=0, data inválida, description vazia)", async () => {
    const client = mockClient(loadFixture("malformed-ai-response.json"));
    const result = await parseFileWithAi(buffer, "application/pdf", client);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("ITEM VÁLIDO");
    expect(result.transactions[0].amount).toBe(-50); // EXPENSE → negativo
  });

  it("expõe documentType no retorno (pra gate de acceptance)", async () => {
    const client = mockClient(loadFixture("nubank-fatura-sample-response.json"));
    const result = await parseFileWithAi(buffer, "application/pdf", client);
    expect(result.documentType).toBe("fatura_cartao");
  });

  it("calcula averageConfidence = 1.0 para path AI", async () => {
    const client = mockClient(loadFixture("nubank-fatura-sample-response.json"));
    const result = await parseFileWithAi(buffer, "application/pdf", client);
    expect(result.averageConfidence).toBe(1);
  });

  it("propaga erro se o cliente Gemini falhar", async () => {
    const client: GeminiClient = {
      generateInvoiceStructured: vi.fn().mockRejectedValue(new Error("API down")),
    };
    await expect(
      parseFileWithAi(buffer, "application/pdf", client)
    ).rejects.toThrow("API down");
  });

  it("chama o cliente com buffer e mimeType corretos", async () => {
    const client = mockClient(loadFixture("empty-response.json"));
    await parseFileWithAi(buffer, "image/jpeg", client);
    expect(client.generateInvoiceStructured).toHaveBeenCalledWith(buffer, "image/jpeg");
  });
});
