import Tesseract from "tesseract.js";
import sharp from "sharp";
import { extractText } from "unpdf";
import type { OCRResult } from "@/types";

/**
 * Pre-process image for better OCR accuracy
 * - Converts to grayscale
 * - Increases contrast
 * - Applies sharpening
 */
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .grayscale()
      .normalise()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    // If sharp processing fails, return original buffer
    return buffer;
  }
}

/**
 * Process an image file with OCR
 */
export async function processImageOCR(file: File): Promise<OCRResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Pre-process the image for better OCR accuracy
  const processedBuffer = await preprocessImage(buffer);

  const result = await Tesseract.recognize(processedBuffer, "por", {
    logger: () => {},
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

/**
 * Process a buffer with OCR (for PDF pages)
 */
async function processBufferOCR(buffer: Buffer): Promise<OCRResult> {
  const processedBuffer = await preprocessImage(buffer);

  const result = await Tesseract.recognize(processedBuffer, "por", {
    logger: () => {},
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

/**
 * Extract text from PDF using unpdf
 */
async function extractPDFText(buffer: Buffer): Promise<OCRResult> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const { text: pages } = await extractText(uint8Array);
    const text = pages.join("\n");

    return {
      text,
      confidence: text.trim().length > 0 ? 95 : 0,
    };
  } catch (error) {
    console.error("PDF text extraction failed:", error);
    throw new Error("Nao foi possivel extrair texto do PDF");
  }
}

/**
 * Process a PDF file
 * First tries text extraction, then falls back to OCR if needed
 */
export async function processPDFOCR(file: File): Promise<OCRResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // First try direct text extraction (faster and more accurate for digital PDFs)
  const textResult = await extractPDFText(buffer);

  // If we got meaningful text, return it
  if (textResult.text.trim().length > 50) {
    return textResult;
  }

  // For scanned PDFs, we would need canvas support
  // For now, return an error message if text extraction didn't work
  throw new Error(
    "PDF parece ser uma imagem escaneada. Por favor, exporte como imagem (PNG/JPG) e tente novamente."
  );
}

/**
 * Process any supported file (image or PDF)
 */
export async function processFile(file: File): Promise<OCRResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return processPDFOCR(file);
  }

  // Assume it's an image
  return processImageOCR(file);
}
