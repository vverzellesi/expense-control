import { describe, it, expect, vi, beforeEach } from "vitest";

// Sentinel object to represent a PDFDocumentProxy
const MOCK_PDF_PROXY = { numPages: 1 };

// Mock unpdf
vi.mock("unpdf", () => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(),
}));

// Mock tesseract.js
vi.mock("tesseract.js", () => ({
  default: { recognize: vi.fn() },
}));

// Mock sharp
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    grayscale: vi.fn().mockReturnThis(),
    normalise: vi.fn().mockReturnThis(),
    sharpen: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("processed")),
  })),
}));

import { extractText, getDocumentProxy } from "unpdf";
const mockExtractText = vi.mocked(extractText);
const mockGetDocumentProxy = vi.mocked(getDocumentProxy);

/**
 * Create a File-like object that supports arrayBuffer() in jsdom.
 */
function createMockFile(content: string, name: string, type: string): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (typeof file.arrayBuffer !== "function") {
    file.arrayBuffer = () =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }
  return file;
}

/** Default extractText mock return for successful text extraction */
function mockExtractTextSuccess(text: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockExtractText.mockResolvedValue({ text: [text], totalPages: 1 } as any);
}

describe("PdfPasswordError", () => {
  it("creates error with needsPassword=true", async () => {
    const { PdfPasswordError } = await import("./ocr-parser");
    const error = new PdfPasswordError(true);
    expect(error.needsPassword).toBe(true);
    expect(error.name).toBe("PdfPasswordError");
    expect(error.message).toBe("PDF protegido por senha");
  });

  it("creates error with needsPassword=false for wrong password", async () => {
    const { PdfPasswordError } = await import("./ocr-parser");
    const error = new PdfPasswordError(false);
    expect(error.needsPassword).toBe(false);
    expect(error.message).toBe("Senha incorreta para o PDF");
  });
});

describe("processFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset getDocumentProxy default
    mockGetDocumentProxy.mockResolvedValue(MOCK_PDF_PROXY as any);
  });

  it("extracts text from unprotected PDF", async () => {
    mockExtractTextSuccess(
      "Transaction 1\nTransaction 2\nMore text to exceed 50 chars limit for validation purposes"
    );

    const { processFile } = await import("./ocr-parser");
    const file = createMockFile("fake-pdf", "test.pdf", "application/pdf");
    const result = await processFile(file);

    expect(result.text).toContain("Transaction 1");
    expect(result.confidence).toBe(95);
    // Without password, extractText is called directly with Uint8Array (no getDocumentProxy)
    expect(mockExtractText).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(mockGetDocumentProxy).not.toHaveBeenCalled();
  });

  it("passes password via getDocumentProxy for PDFs", async () => {
    mockExtractTextSuccess(
      "Transaction data that is long enough to pass the fifty character minimum check"
    );

    const { processFile } = await import("./ocr-parser");
    const file = createMockFile("fake-pdf", "test.pdf", "application/pdf");
    await processFile(file, "mypassword");

    // Password is passed to getDocumentProxy, and the proxy is passed to extractText
    expect(mockGetDocumentProxy).toHaveBeenCalledWith(expect.any(Uint8Array), {
      password: "mypassword",
    });
    expect(mockExtractText).toHaveBeenCalledWith(MOCK_PDF_PROXY);
  });

  it("throws PdfPasswordError when PDF needs password", async () => {
    // When no password is provided, extractText is called directly and throws
    const passwordError = new Error("No password given");
    Object.assign(passwordError, { name: "PasswordException", code: 1 });
    mockExtractText.mockRejectedValue(passwordError);

    const { processFile, PdfPasswordError } = await import("./ocr-parser");
    const file = createMockFile("fake-pdf", "test.pdf", "application/pdf");

    await expect(processFile(file)).rejects.toThrow(PdfPasswordError);
    await expect(processFile(file)).rejects.toMatchObject({
      needsPassword: true,
    });
  });

  it("throws PdfPasswordError with needsPassword=false for wrong password", async () => {
    // When password is wrong, getDocumentProxy throws
    const passwordError = new Error("Incorrect password");
    Object.assign(passwordError, { name: "PasswordException", code: 2 });
    mockGetDocumentProxy.mockRejectedValue(passwordError);

    const { processFile, PdfPasswordError } = await import("./ocr-parser");
    const file = createMockFile("fake-pdf", "test.pdf", "application/pdf");

    await expect(processFile(file, "wrongpass")).rejects.toThrow(PdfPasswordError);
    await expect(processFile(file, "wrongpass")).rejects.toMatchObject({
      needsPassword: false,
    });
  });

  it("ignores password for image files", async () => {
    const Tesseract = (await import("tesseract.js")).default;
    vi.mocked(Tesseract.recognize).mockResolvedValue({
      data: { text: "some text", confidence: 80 },
    } as Awaited<ReturnType<typeof Tesseract.recognize>>);

    const { processFile } = await import("./ocr-parser");
    const file = createMockFile("fake-image", "test.png", "image/png");
    const result = await processFile(file, "password-ignored");

    expect(result.text).toBe("some text");
    expect(mockExtractText).not.toHaveBeenCalled();
    expect(mockGetDocumentProxy).not.toHaveBeenCalled();
  });
});
