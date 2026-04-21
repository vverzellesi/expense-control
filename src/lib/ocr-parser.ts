import Tesseract from "tesseract.js";
import sharp from "sharp";
import { extractText, getDocumentProxy } from "unpdf";
import type { OCRResult } from "@/types";

/**
 * Error thrown when a PDF requires a password or when the provided password is incorrect.
 * - needsPassword=true: PDF is encrypted and no password was provided
 * - needsPassword=false: A password was provided but it was incorrect
 */
export class PdfPasswordError extends Error {
  constructor(public readonly needsPassword: boolean) {
    super(
      needsPassword
        ? "PDF protegido por senha"
        : "Senha incorreta para o PDF"
    );
    this.name = "PdfPasswordError";
  }
}

// Max width for OCR input. iPhone screenshots are ~1170×2532 and OCR cost
// scales with pixel count, pushing us past Vercel's 60s function timeout.
// 1200px is the sweet spot: big enough for Tesseract accuracy, small enough
// to finish in time.
const OCR_MAX_WIDTH_PX = 1200;

/**
 * Pre-process image for better OCR accuracy:
 * - Downscale to OCR_MAX_WIDTH_PX if wider (primary lever for serverless timeout)
 * - Convert to grayscale
 * - Normalise contrast
 * - Sharpen
 */
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let pipeline = image;
    if (metadata.width && metadata.width > OCR_MAX_WIDTH_PX) {
      pipeline = pipeline.resize(OCR_MAX_WIDTH_PX, undefined, { fit: "inside" });
    }

    return await pipeline.grayscale().normalise().sharpen().png().toBuffer();
  } catch {
    // If sharp processing fails, return original buffer
    return buffer;
  }
}

/**
 * Callback receiving real-time OCR progress from Tesseract.
 * `status` is the Tesseract phase (e.g., "loading language traineddata",
 * "recognizing text"); `progress` is a fraction 0..1 for the current phase.
 */
export type OcrProgressCallback = (update: { status: string; progress: number }) => void;

/**
 * Process an image file with OCR
 */
export async function processImageOCR(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<OCRResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Pre-process the image for better OCR accuracy
  const processedBuffer = await preprocessImage(buffer);

  const result = await Tesseract.recognize(processedBuffer, "por", {
    logger: onProgress
      ? (m) => onProgress({ status: m.status, progress: m.progress })
      : () => {},
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

/**
 * Process a buffer with OCR (for PDF pages)
 */
export async function processBufferOCR(
  buffer: Buffer,
  onProgress?: OcrProgressCallback
): Promise<OCRResult> {
  const processedBuffer = await preprocessImage(buffer);

  const result = await Tesseract.recognize(processedBuffer, "por", {
    logger: onProgress
      ? (m) => onProgress({ status: m.status, progress: m.progress })
      : () => {},
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

/**
 * Extract text from PDF using unpdf
 * Optionally accepts a password for encrypted PDFs
 */
async function extractPDFText(
  buffer: Buffer,
  password?: string
): Promise<OCRResult> {
  try {
    const uint8Array = new Uint8Array(buffer);
    // If password is provided, use getDocumentProxy to decrypt first,
    // then pass the proxy to extractText. Otherwise, pass raw data directly.
    const source = password
      ? await getDocumentProxy(uint8Array, { password })
      : uint8Array;
    const { text: pages } = await extractText(source);
    const text = pages.join("\n");

    return {
      text,
      confidence: text.trim().length > 0 ? 95 : 0,
    };
  } catch (error) {
    // Detect password-protected PDF errors from pdf.js (propagated through unpdf)
    if (error && typeof error === "object" && "name" in error) {
      const pdfError = error as { name: string; code?: number };
      if (pdfError.name === "PasswordException") {
        // code 1 = NEED_PASSWORD (no password provided)
        // code 2 = INCORRECT_PASSWORD (wrong password)
        throw new PdfPasswordError(pdfError.code !== 2);
      }
    }
    console.error("PDF text extraction failed:", error);
    throw new Error("Não foi possível extrair texto do PDF");
  }
}

/**
 * Process a PDF file
 * First tries text extraction, then falls back to OCR if needed
 */
export async function processPDFOCR(
  file: File,
  password?: string
): Promise<OCRResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // First try direct text extraction (faster and more accurate for digital PDFs)
  const textResult = await extractPDFText(buffer, password);

  // If we got meaningful text, return it
  if (textResult.text.trim().length > 50) {
    return textResult;
  }

  // For scanned PDFs, we would need canvas support
  throw new Error(
    "PDF parece ser uma imagem escaneada. Por favor, exporte como imagem (PNG/JPG) e tente novamente."
  );
}

/**
 * Process any supported file (image or PDF)
 * Password is only used for PDF files and ignored for images.
 * `onProgress` only fires for images (Tesseract OCR) — PDF text extraction
 * is synchronous-ish and doesn't provide meaningful intermediate progress.
 */
export async function processFile(
  file: File,
  password?: string,
  onProgress?: OcrProgressCallback
): Promise<OCRResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return processPDFOCR(file, password);
  }

  // Assume it's an image — password is ignored
  return processImageOCR(file, onProgress);
}

/**
 * Detecta se um buffer é um PDF criptografado.
 * Retorna false para buffers não-PDF (sem crash).
 * Retorna true se o PDF precisa de senha pra abrir.
 *
 * Usado pelo parse-pipeline como preflight antes de enviar o arquivo
 * para a IA — Gemini não aceita PDF com senha.
 */
export async function isPdfEncrypted(buffer: Buffer): Promise<boolean> {
  // Heurística rápida: não começa com %PDF- → não é PDF
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") return false;

  try {
    const uint8Array = new Uint8Array(buffer);
    await getDocumentProxy(uint8Array);
    return false; // abriu sem erro → não está criptografado
  } catch (error) {
    if (error && typeof error === "object" && "name" in error) {
      const pdfError = error as { name: string; code?: number };
      if (pdfError.name === "PasswordException") return true;
    }
    // Erros inesperados: assumir não-criptografado pra não bloquear AI
    return false;
  }
}
