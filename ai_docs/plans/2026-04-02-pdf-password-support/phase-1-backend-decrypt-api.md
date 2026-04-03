# Phase 1: Backend — Decrypt + API com Senha

## Overview

Criar módulo de criptografia AES-256, adicionar detecção de PasswordException no ocr-parser, e modificar a API `/api/ocr` para aceitar senha e retornar `needsPassword` quando necessário. Ao final desta fase, a API consegue processar PDFs protegidos por senha quando a senha é fornecida explicitamente.

## Reference Docs for This Phase

- `src/lib/ocr-parser.ts` (full file) — Pipeline OCR atual a ser modificado
- `src/app/api/ocr/route.ts` (full file) — API route a ser modificada
- `src/lib/auth-utils.ts` (lines 76-114) — getAuthContext() pattern
- `src/app/api/settings/route.ts` (full file) — Padrão de uso do Settings model

## Changes Required

#### 1. Criar módulo de criptografia AES-256 -- DONE

- [x] Implementado `src/lib/crypto.ts` com encrypt/decrypt AES-256-CBC
- [x] 5 testes passando em `src/lib/crypto.test.ts`
- [x] Adicionado `PDF_ENCRYPTION_KEY` ao `.env.example`
- **Learning:** Implementação direta sem problemas. O módulo `crypto` nativo do Node.js funciona perfeitamente com AES-256-CBC e IV aleatório.

**File**: `src/lib/crypto.ts` (CREATE)
**Complexity**: Medium
**TDD**: YES
**Depends On**: none

**Pre-conditions**:
- [ ] Directory `src/lib/` exists
- [ ] Node.js `crypto` module available (built-in)

**Why**: Necessário para criptografar a senha do PDF antes de salvar no banco e decriptar ao usar. AES-256-CBC com IV aleatório garante que o mesmo texto gera ciphertexts diferentes.

**Acceptance Criteria**:
```gherkin
Given a plaintext string and a valid encryption key
When encrypt() is called
Then it returns an object with encrypted (hex string) and iv (hex string)
And the encrypted value is different from the plaintext

Given an encrypted string and its IV
When decrypt() is called with the correct key
Then it returns the original plaintext

Given an encrypted string and its IV
When decrypt() is called with a wrong key or corrupted data
Then it throws an error

Given PDF_ENCRYPTION_KEY is not set
When encrypt() or decrypt() is called
Then it throws an Error with message containing "PDF_ENCRYPTION_KEY"
```

**Implementation**:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getEncryptionKey(): Buffer {
  const key = process.env.PDF_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "PDF_ENCRYPTION_KEY environment variable is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex") };
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

**Test file**: `src/lib/crypto.test.ts` (CREATE)
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original env
const originalEnv = process.env.PDF_ENCRYPTION_KEY;

// Generate a valid 32-byte hex key for tests
const TEST_KEY = "a".repeat(64); // 32 bytes in hex

describe("crypto", () => {
  beforeEach(() => {
    process.env.PDF_ENCRYPTION_KEY = TEST_KEY;
    // Re-import to pick up env changes
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PDF_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.PDF_ENCRYPTION_KEY;
    }
  });

  it("encrypts and decrypts a string correctly", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = "12345678";
    const { encrypted, iv } = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(iv).toHaveLength(32); // 16 bytes = 32 hex chars

    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", async () => {
    const { encrypt } = await import("./crypto");
    const result1 = encrypt("same-text");
    const result2 = encrypt("same-text");

    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.iv).not.toBe(result2.iv);
  });

  it("throws when PDF_ENCRYPTION_KEY is not set", async () => {
    delete process.env.PDF_ENCRYPTION_KEY;
    const { encrypt } = await import("./crypto");

    expect(() => encrypt("test")).toThrow("PDF_ENCRYPTION_KEY");
  });

  it("handles UTF-8 characters correctly", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = "123.456.789-00 Ação!@#çÇ";
    const { encrypted, iv } = encrypt(plaintext);
    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on decryption with wrong key", async () => {
    const { encrypt } = await import("./crypto");
    const { encrypted, iv } = encrypt("secret");

    // Change key
    process.env.PDF_ENCRYPTION_KEY = "b".repeat(64);
    vi.resetModules();
    const { decrypt } = await import("./crypto");

    expect(() => decrypt(encrypted, iv)).toThrow();
  });
});
```

**Verification**: `npx vitest run src/lib/crypto.test.ts`

**Post-implementation**: Add to `.env.example`:
```
# PDF encryption key (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
PDF_ENCRYPTION_KEY=
```

**On Failure**:
- If "invalid key length": Ensure TEST_KEY is exactly 64 hex chars (32 bytes)
- If env not reset between tests: Check beforeEach/afterEach cleanup
- If import caching: Verify `vi.resetModules()` is called before dynamic import

---

#### 2. Adicionar detecção de PasswordException e suporte a senha no ocr-parser -- DONE

- [x] Adicionada classe `PdfPasswordError` com `needsPassword` flag
- [x] `extractPDFText` agora usa `getDocumentProxy` com password quando fornecida
- [x] `processFile` e `processPDFOCR` aceitam parâmetro opcional `password`
- [x] 7 testes passando em `src/lib/ocr-parser.test.ts`
- **Learning:** A API `extractText` do `unpdf` não aceita `password` diretamente nas options (só `mergePages`). A solução correta é usar `getDocumentProxy(data, { password })` para obter o proxy decriptado, e depois passar o proxy para `extractText(proxy)`. O plano previa passar password direto para extractText, mas a API real exige o approach via getDocumentProxy.
- **Learning:** jsdom `File` não implementa `arrayBuffer()`. Necessário polyfill nos testes com `FileReader`.

**File**: `src/lib/ocr-parser.ts` (MODIFY)
**Complexity**: Medium
**TDD**: YES
**Depends On**: none

**Load Before Implementing**:
1. `src/lib/ocr-parser.ts` (full file) — Código atual a ser modificado
2. `src/types/index.ts` — Verificar tipo OCRResult

**Pre-conditions**:
- [ ] `src/lib/ocr-parser.ts` exists with current implementation
- [ ] `unpdf` package installed

**Why**: O ocr-parser precisa detectar especificamente erros de senha (em vez de tratá-los como erros genéricos) e aceitar um parâmetro opcional de senha para decriptar o PDF antes da extração de texto.

**Acceptance Criteria**:
```gherkin
Given a password-protected PDF and no password provided
When processFile() is called
Then it throws a PdfPasswordError with needsPassword=true

Given a password-protected PDF and the correct password
When processFile() is called with the password
Then it returns an OCRResult with the extracted text

Given a password-protected PDF and an incorrect password
When processFile() is called with the wrong password
Then it throws a PdfPasswordError with needsPassword=false

Given a non-password-protected PDF
When processFile() is called with or without password
Then it returns an OCRResult normally (no regression)

Given an image file (PNG/JPG)
When processFile() is called with a password
Then the password is ignored and OCR processes normally
```

**Implementation**:

Add `PdfPasswordError` class and modify `extractPDFText`, `processPDFOCR`, and `processFile`:

```typescript
// Add at top of file, after imports:

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
```

Replace `extractPDFText` function (lines 65-79):
```typescript
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
    const options = password ? { password } : undefined;
    const { text: pages } = await extractText(uint8Array, options);
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
```

Replace `processPDFOCR` function (lines 85-102):
```typescript
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
```

Replace `processFile` function (lines 107-116):
```typescript
/**
 * Process any supported file (image or PDF)
 * Password is only used for PDF files and ignored for images
 */
export async function processFile(
  file: File,
  password?: string
): Promise<OCRResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return processPDFOCR(file, password);
  }

  // Assume it's an image — password is ignored
  return processImageOCR(file);
}
```

**Test file**: `src/lib/ocr-parser.test.ts` (CREATE)
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PdfPasswordError } from "./ocr-parser";

// Mock unpdf
vi.mock("unpdf", () => ({
  extractText: vi.fn(),
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

import { extractText } from "unpdf";
const mockExtractText = vi.mocked(extractText);

describe("PdfPasswordError", () => {
  it("creates error with needsPassword=true", () => {
    const error = new PdfPasswordError(true);
    expect(error.needsPassword).toBe(true);
    expect(error.name).toBe("PdfPasswordError");
    expect(error.message).toBe("PDF protegido por senha");
  });

  it("creates error with needsPassword=false for wrong password", () => {
    const error = new PdfPasswordError(false);
    expect(error.needsPassword).toBe(false);
    expect(error.message).toBe("Senha incorreta para o PDF");
  });
});

describe("processFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from unprotected PDF", async () => {
    mockExtractText.mockResolvedValue({
      text: ["Transaction 1\nTransaction 2\nMore text to exceed 50 chars limit for validation purposes"],
      totalPages: 1,
    } as ReturnType<typeof extractText> extends Promise<infer T> ? T : never);

    const { processFile } = await import("./ocr-parser");
    const file = new File(["fake-pdf"], "test.pdf", { type: "application/pdf" });
    const result = await processFile(file);

    expect(result.text).toContain("Transaction 1");
    expect(result.confidence).toBe(95);
    expect(mockExtractText).toHaveBeenCalledWith(expect.any(Uint8Array), undefined);
  });

  it("passes password to extractText for PDFs", async () => {
    mockExtractText.mockResolvedValue({
      text: ["Transaction data that is long enough to pass the fifty character minimum check"],
      totalPages: 1,
    } as ReturnType<typeof extractText> extends Promise<infer T> ? T : never);

    const { processFile } = await import("./ocr-parser");
    const file = new File(["fake-pdf"], "test.pdf", { type: "application/pdf" });
    await processFile(file, "mypassword");

    expect(mockExtractText).toHaveBeenCalledWith(expect.any(Uint8Array), {
      password: "mypassword",
    });
  });

  it("throws PdfPasswordError when PDF needs password", async () => {
    const passwordError = new Error("No password given");
    Object.assign(passwordError, { name: "PasswordException", code: 1 });
    mockExtractText.mockRejectedValue(passwordError);

    const { processFile } = await import("./ocr-parser");
    const file = new File(["fake-pdf"], "test.pdf", { type: "application/pdf" });

    await expect(processFile(file)).rejects.toThrow(PdfPasswordError);
    await expect(processFile(file)).rejects.toMatchObject({
      needsPassword: true,
    });
  });

  it("throws PdfPasswordError with needsPassword=false for wrong password", async () => {
    const passwordError = new Error("Incorrect password");
    Object.assign(passwordError, { name: "PasswordException", code: 2 });
    mockExtractText.mockRejectedValue(passwordError);

    const { processFile } = await import("./ocr-parser");
    const file = new File(["fake-pdf"], "test.pdf", { type: "application/pdf" });

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
    const file = new File(["fake-image"], "test.png", { type: "image/png" });
    const result = await processFile(file, "password-ignored");

    expect(result.text).toBe("some text");
    expect(mockExtractText).not.toHaveBeenCalled();
  });
});
```

**Verification**: `npx vitest run src/lib/ocr-parser.test.ts`

**On Failure**:
- If `extractText` does not accept second parameter: Check `unpdf` version. If ≥1.4, the parameter should work. If it doesn't, use `import { getDocument } from "unpdf/pdfjs"` and extract text manually with password support. See README Known Executor Risks.
- If `PasswordException` error format is different: Log the actual error object in the catch block and adjust the detection logic (check `error.message` for "password" as fallback)
- If mock types don't match: Adjust the `as` cast to match the actual return type from the installed `unpdf` version

---

#### 3. Modificar API /api/ocr para aceitar senha e retornar needsPassword -- DONE

- [x] API aceita `password` e `savePassword` via FormData
- [x] Retorna `{ needsPassword: true }` para PDFs protegidos sem senha
- [x] Tenta senha salva automaticamente antes de pedir ao usuário
- [x] Retorna `{ needsPassword: true, savedPasswordFailed: true }` quando senha salva falha
- [x] Salva senha criptografada no Settings quando `savePassword=true`
- [x] TypeScript compila sem erros novos
- **Learning:** O padrão de `key_userId` compound unique no Settings funciona bem para o upsert. Seguiu o padrão existente em `src/app/api/settings/route.ts`.

**File**: `src/app/api/ocr/route.ts` (MODIFY)
**Complexity**: High
**TDD**: NO (API route -- tested via integration in Phase 2; unit tests cover underlying functions)
**Depends On**: 1, 2

**Load Before Implementing**:
1. `src/app/api/ocr/route.ts` (full file) — Código atual
2. `src/lib/ocr-parser.ts` (full file) — processFile com novo param password
3. `src/lib/crypto.ts` (full file) — encrypt/decrypt
4. `src/app/api/settings/route.ts` (full file) — Padrão de uso do Settings model
5. `src/lib/auth-utils.ts` (lines 76-114) — getAuthContext pattern

**Pre-conditions**:
- [ ] Task 1 (crypto.ts) completed
- [ ] Task 2 (ocr-parser.ts password support) completed
- [ ] `PdfPasswordError` exported from ocr-parser

**Why**: O endpoint precisa aceitar senha no FormData, tentar senha salva automaticamente, retornar `needsPassword` quando o PDF é protegido, e salvar a senha quando solicitado. É o ponto central de integração entre crypto, ocr-parser e Settings.

**Acceptance Criteria**:
```gherkin
Given a password-protected PDF uploaded without password
And no saved password exists
When POST /api/ocr is called
Then response is { needsPassword: true } with status 200

Given a password-protected PDF uploaded without password
And a saved password exists that is correct
When POST /api/ocr is called
Then the saved password is used silently and transactions are returned

Given a password-protected PDF uploaded without password
And a saved password exists that is incorrect
When POST /api/ocr is called
Then response is { needsPassword: true, savedPasswordFailed: true } with status 200

Given a password-protected PDF uploaded with correct password
And savePassword=true
When POST /api/ocr is called
Then transactions are returned and password is saved encrypted in Settings

Given a password-protected PDF uploaded with incorrect password
When POST /api/ocr is called
Then response is { error: "Senha incorreta...", needsPassword: true } with status 200

Given a non-protected PDF uploaded with or without password
When POST /api/ocr is called
Then transactions are returned normally (no regression)
```

**Implementation**:

Replace the full POST function in `src/app/api/ocr/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { processFile, PdfPasswordError } from "@/lib/ocr-parser";
import { parseStatementText, suggestCategoryForStatement } from "@/lib/statement-parser";
import { parseNotificationText } from "@/lib/notification-parser";
import { suggestCategory, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { encrypt, decrypt } from "@/lib/crypto";
import type { ImportedTransaction } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PDF_PASSWORD_KEY = "pdfPassword";

async function getSavedPdfPassword(userId: string): Promise<string | null> {
  const setting = await prisma.settings.findUnique({
    where: { key_userId: { key: PDF_PASSWORD_KEY, userId } },
  });
  if (!setting?.value) return null;
  try {
    const { encrypted, iv } = JSON.parse(setting.value);
    return decrypt(encrypted, iv);
  } catch {
    return null;
  }
}

async function savePdfPassword(userId: string, password: string): Promise<void> {
  const { encrypted, iv } = encrypt(password);
  await prisma.settings.upsert({
    where: { key_userId: { key: PDF_PASSWORD_KEY, userId } },
    update: { value: JSON.stringify({ encrypted, iv }) },
    create: {
      key: PDF_PASSWORD_KEY,
      value: JSON.stringify({ encrypted, iv }),
      userId,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;
    const savePasswordFlag = formData.get("savePassword") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)" },
        { status: 400 }
      );
    }

    // Process file — handle password-protected PDFs
    let ocrResult;
    try {
      ocrResult = await processFile(file, password || undefined);
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        if (password) {
          // Explicit password was wrong
          return NextResponse.json({
            needsPassword: true,
            error: "Senha incorreta. Tente novamente.",
          });
        }

        // No password provided — try saved password
        const savedPassword = await getSavedPdfPassword(ctx.userId);
        if (savedPassword) {
          try {
            ocrResult = await processFile(file, savedPassword);
          } catch (retryError) {
            if (retryError instanceof PdfPasswordError) {
              // Saved password also failed — tell frontend
              return NextResponse.json({ needsPassword: true, savedPasswordFailed: true });
            }
            throw retryError;
          }
        } else {
          return NextResponse.json({ needsPassword: true });
        }
      } else {
        throw error;
      }
    }

    // Save password if requested and a password was explicitly provided
    if (savePasswordFlag && password) {
      await savePdfPassword(ctx.userId, password);
    }

    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Não foi possível extrair texto do arquivo. Verifique se a imagem está legível." },
        { status: 400 }
      );
    }

    // Parse statement text (try bank statement format first, then notification format)
    let parseResult = parseStatementText(ocrResult.text, ocrResult.confidence);

    // If no transactions found as statement, try notification format
    if (parseResult.transactions.length === 0) {
      const notificationResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
      if (notificationResult) {
        parseResult = notificationResult;
      }
    }

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
          rawText: ocrResult.text,
          confidence: ocrResult.confidence,
        },
        { status: 400 }
      );
    }

    // Convert to ImportedTransaction format and apply categorization
    const transactions: (ImportedTransaction & {
      categoryId?: string;
      selected: boolean;
      transactionKind?: string;
    })[] = [];

    const defaultCategory = await prisma.category.findFirst({
      where: { ...ctx.ownerFilter, name: "Outros" },
    });

    for (const t of parseResult.transactions) {
      const suggestedCat = await suggestCategory(t.description, ctx.userId);
      let categoryId = suggestedCat?.id || defaultCategory?.id;
      const installmentInfo = detectInstallment(t.description);
      const recurringInfo = detectRecurringTransaction(t.description);

      transactions.push({
        description: t.description,
        amount: t.amount,
        date: t.date,
        type: t.type,
        categoryId,
        suggestedCategoryId: categoryId,
        isInstallment: installmentInfo.isInstallment,
        currentInstallment: installmentInfo.currentInstallment,
        totalInstallments: installmentInfo.totalInstallments,
        isRecurring: recurringInfo.isRecurring,
        recurringName: recurringInfo.recurringName,
        confidence: t.confidence,
        transactionKind: t.transactionKind,
        selected: true,
      });
    }

    return NextResponse.json({
      transactions,
      origin: parseResult.bank,
      confidence: parseResult.averageConfidence,
      rawText: ocrResult.text,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("OCR processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao processar arquivo",
      },
      { status: 500 }
    );
  }
}
```

**Verification**: `npm run build` (type-check) + manual test with curl:
```bash
# Test needsPassword response
curl -X POST http://localhost:3000/api/ocr -F "file=@password-protected.pdf" -H "Cookie: <session>"

# Test with explicit password
curl -X POST http://localhost:3000/api/ocr -F "file=@password-protected.pdf" -F "password=12345678" -F "savePassword=true" -H "Cookie: <session>"
```

**On Failure**:
- If `PdfPasswordError` import fails: Verify export from `src/lib/ocr-parser.ts`
- If `encrypt`/`decrypt` import fails: Verify `src/lib/crypto.ts` was created in Task 1
- If Settings upsert fails: Check `key_userId` compound unique constraint in Prisma schema
- If `ocrResult` is possibly undefined: The control flow ensures `ocrResult` is assigned before use (either from direct call, retry with saved password, or early return). If TypeScript complains, add `!` assertion after the catch block.

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — All project checks pass (0 new type errors, 12/12 new tests pass, 537/540 total pass -- 3 failures pre-existing em SpaceSwitcher)

### Manual Verification (only if automation impossible)
- [ ] Upload de PDF protegido via curl/Postman retorna `{ needsPassword: true }` sem senha e transações com senha correta
