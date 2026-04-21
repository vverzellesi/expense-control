import { GoogleGenAI } from "@google/genai";
import { AI_INVOICE_SCHEMA, type AiInvoiceOutput } from "./schema";
import { SYSTEM_PROMPT } from "./prompt";

const MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 30_000; // budget apertado — endpoint tem 60s e fallback roda depois

/**
 * Part única anexada ao prompt. Suporta PDF ou imagem (qualquer mimetype
 * aceito pelo Gemini inline). Múltiplas parts no mesmo prompt são enviadas
 * como UM ÚNICO documento lógico — ver SYSTEM_PROMPT para a semântica.
 */
export interface GeminiInvoicePart {
  buffer: Buffer;
  mimeType: string;
}

export interface GeminiClient {
  /**
   * Chama o Gemini com 1..N parts em uma única request, consumindo UMA quota.
   *
   * Retrocompat: aceita também a forma single-file `(buffer, mimeType)`.
   * A versão array é usada quando o usuário envia múltiplas imagens de um
   * mesmo documento (ex: 3 prints de fatura de cartão) — o modelo trata
   * todas como páginas/imagens contínuas do MESMO documento.
   */
  generateInvoiceStructured(
    buffer: Buffer,
    mimeType: string
  ): Promise<AiInvoiceOutput>;
  generateInvoiceStructured(
    parts: GeminiInvoicePart[]
  ): Promise<AiInvoiceOutput>;
}

function normalizeParts(
  bufferOrParts: Buffer | GeminiInvoicePart[],
  mimeType?: string
): GeminiInvoicePart[] {
  if (Array.isArray(bufferOrParts)) {
    if (bufferOrParts.length === 0) {
      throw new Error("generateInvoiceStructured: parts array não pode estar vazio");
    }
    return bufferOrParts;
  }
  if (typeof mimeType !== "string") {
    throw new Error("generateInvoiceStructured: mimeType obrigatório quando buffer é single");
  }
  return [{ buffer: bufferOrParts, mimeType }];
}

class RealGeminiClient implements GeminiClient {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  generateInvoiceStructured(
    buffer: Buffer,
    mimeType: string
  ): Promise<AiInvoiceOutput>;
  generateInvoiceStructured(
    parts: GeminiInvoicePart[]
  ): Promise<AiInvoiceOutput>;
  async generateInvoiceStructured(
    bufferOrParts: Buffer | GeminiInvoicePart[],
    mimeType?: string
  ): Promise<AiInvoiceOutput> {
    const parts = normalizeParts(bufferOrParts, mimeType);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.ai.models.generateContent({
        model: MODEL,
        // `contents` carrega APENAS o input do usuário (o(s) arquivo(s)).
        // As instruções do sistema vão em `config.systemInstruction`,
        // que é o campo canônico da API — colocá-las em parts[0].text
        // mistura as regras com o conteúdo do usuário e é menos robusto
        // contra prompt injection.
        //
        // Multi-part: quando o usuário envia múltiplas imagens do MESMO
        // documento (ex: várias páginas de fatura), mandamos todas como
        // parts na MESMA request. Isso consome UMA quota e o modelo
        // trata como documento contínuo (ver SYSTEM_PROMPT).
        contents: [
          {
            role: "user",
            parts: parts.map((p) => ({
              inlineData: {
                mimeType: p.mimeType,
                data: p.buffer.toString("base64"),
              },
            })),
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
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
