import { GoogleGenAI } from "@google/genai";
import { AI_INVOICE_SCHEMA, type AiInvoiceOutput } from "./schema";
import { SYSTEM_PROMPT } from "./prompt";

const MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 30_000; // budget apertado — endpoint tem 60s e fallback roda depois

export interface GeminiClient {
  generateInvoiceStructured(
    buffer: Buffer,
    mimeType: string
  ): Promise<AiInvoiceOutput>;
}

class RealGeminiClient implements GeminiClient {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateInvoiceStructured(
    buffer: Buffer,
    mimeType: string
  ): Promise<AiInvoiceOutput> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: AI_INVOICE_SCHEMA,
          abortSignal: controller.signal,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini retornou resposta vazia");
      }

      const output = JSON.parse(text);
      if (!output || !Array.isArray(output.transactions)) {
        throw new Error("Gemini retornou JSON com estrutura inválida");
      }
      return output as AiInvoiceOutput;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createGeminiClient(): GeminiClient | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new RealGeminiClient(apiKey);
}
