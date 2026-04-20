# Phase 3: Pipeline Unificado

## Overview

Consolidar a lógica duplicada de parse (OCR + statement-parser + notification-parser) num módulo único `parse-pipeline.ts` que orquestra: PDF preflight → notification-parser quick try → AI (com quota reservada atomicamente + acceptance gate) → fallback regex. Refatorar `/api/ocr/route.ts` e `telegram/commands.ts` pra consumir o pipeline.

Ao final desta fase, o usuário já pode fazer upload via web ou enviar foto pro Telegram e ter a IA extraindo — sem mudanças visíveis de UX ainda (a UX vem nas Phases 4 e 5).

### Mudanças aplicadas após review do Oracle

- **PDF preflight:** detecta encryption antes de chamar IA; PDFs cifrados pulam direto pro STEP 3 (fluxo legacy trata senha)
- **Acceptance gate duplo:** `documentType ∈ {fatura_cartao, extrato_bancario}` **AND** `transactions.length > 0`. Senão release quota + fallback
- **Reserve/release em vez de check+increment:** quota atomicamente protegida (ver Phase 1)
- **`yearMonth` capturado uma vez** por request — evita race na virada de mês
- **Sem retry de 5xx:** falha vai direto pro STEP 3 (preserva budget de 60s do endpoint)

## Reference Docs for This Phase

- `src/app/api/ocr/route.ts:112-140` — pipeline atual web
- `src/lib/telegram/commands.ts:750-790` — pipeline atual Telegram (batch de fotos)
- `src/lib/ocr-parser.ts` — `processFile`, `processImageOCR`, `processBufferOCR`, `PdfPasswordError`
- `src/lib/statement-parser.ts` — `parseStatementText`
- `src/lib/notification-parser.ts` — `parseNotificationText`
- `src/lib/rate-limit/ai-quota.ts` — `hasQuota`, `increment` (Phase 1)
- `src/lib/ai-parser/invoice-parser.ts` — `parseFileWithAi` (Phase 2)
- `src/lib/ai-parser/gemini-client.ts` — `createGeminiClient` (Phase 2)

## Changes Required

---

### Task 3.1: Escrever testes do `parse-pipeline` (TDD)

**Files:**
- Create: `src/lib/parse-pipeline.test.ts`

**Complexity:** High
**TDD:** YES
**Depends On:** Phase 1 completa, Phase 2 completa

**Why:** Pipeline tem muitos caminhos (notif quick, AI success, AI fail→fallback, quota=0→fallback, senha PDF, arquivo grande). Cada um precisa de teste.

- [x] **Step 1: Criar arquivo de teste**

Escrever `src/lib/parse-pipeline.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseFileForImport } from "./parse-pipeline";

vi.mock("@/lib/rate-limit/ai-quota");
vi.mock("@/lib/ai-parser/gemini-client");
vi.mock("@/lib/ai-parser/invoice-parser");
vi.mock("@/lib/ocr-parser");
vi.mock("@/lib/statement-parser");
vi.mock("@/lib/notification-parser");

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
    vi.mocked(ocrParser.isPdfEncrypted).mockResolvedValue(false);
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "", averageConfidence: 0, transactions: [],
    });
  });

  it("PREFLIGHT: PDF encriptado → pula AI, vai direto STEP 3 (legacy trata senha)", async () => {
    vi.mocked(ocrParser.isPdfEncrypted).mockResolvedValue(true);
    const { PdfPasswordError } = await import("@/lib/ocr-parser");
    vi.mocked(ocrParser.processFile).mockRejectedValue(new PdfPasswordError(true));

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "secret.pdf", userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("needs_password");
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 1: notification-parser match → retorna source=notif, não chama AI", async () => {
    vi.mocked(notifParser.parseNotificationText).mockReturnValue({
      bank: "Nubank",
      averageConfidence: 0.9,
      transactions: [
        { date: new Date(), description: "CPG IFOOD", amount: -25, type: "EXPENSE", confidence: 0.9 },
      ],
    });
    vi.mocked(ocrParser.processImageOCR).mockResolvedValue({ text: "Compra aprovada R$25", confidence: 80 });

    const result = await parseFileForImport({
      buffer, mimeType: "image/png", filename: "notif.png", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("notif");
      expect(result.usedFallback).toBe(false);
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 2: AI success + documentType válido → source=ai + quota RESERVADA e NÃO liberada", async () => {
    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "fatura.pdf", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("ai");
      expect(result.usedFallback).toBe(false);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalledWith(userId, "2026-04");
    expect(aiQuota.release).not.toHaveBeenCalled();
  });

  it("ACCEPTANCE GATE: AI retorna documentType=desconhecido → release quota → fallback", async () => {
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
      bank: "C6", averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalled();
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("ACCEPTANCE GATE: AI retorna 0 transações → release quota → fallback", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockResolvedValue({
      bank: "Nubank",
      documentType: "fatura_cartao",
      averageConfidence: 1,
      transactions: [],
    });
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "", averageConfidence: 0, transactions: [],
    });

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("no_transactions_found");
    }
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("STEP 2 skip: sem GEMINI_API_KEY → cai em fallback sem reservar", async () => {
    vi.mocked(geminiClientMod.createGeminiClient).mockReturnValue(null);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6", averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("STEP 2 skip: tryReserve retorna false (quota esgotada) → fallback", async () => {
    vi.mocked(aiQuota.tryReserve).mockResolvedValue(false);
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6", averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.release).not.toHaveBeenCalled(); // não reservou, não precisa liberar
  });

  it("STEP 2 falha (API error) → release quota → fallback", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("API down"));
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "EXTRATO", confidence: 85 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "C6", averageConfidence: 0.85,
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
    });

    const result = await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.source).toBe("regex");
      expect(result.usedFallback).toBe(true);
    }
    expect(aiQuota.tryReserve).toHaveBeenCalled();
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("yearMonth é capturado UMA vez e reusado em reserve + release (evita race de virada de mês)", async () => {
    vi.mocked(invoiceParser.parseFileWithAi).mockRejectedValue(new Error("falha"));
    vi.mocked(ocrParser.processFile).mockResolvedValue({ text: "", confidence: 0 });
    vi.mocked(statementParser.parseStatementText).mockReturnValue({
      bank: "", averageConfidence: 0, transactions: [],
    });

    // currentYearMonth é chamado uma vez no início; reserve e release recebem o mesmo valor
    await parseFileForImport({
      buffer, mimeType: "application/pdf", filename: "x.pdf", userId,
    });

    expect(aiQuota.currentYearMonth).toHaveBeenCalledTimes(1);
    expect(aiQuota.tryReserve).toHaveBeenCalledWith(userId, "2026-04");
    expect(aiQuota.release).toHaveBeenCalledWith(userId, "2026-04");
  });

  it("arquivo > 50MB → retorna invalid_file sem chamar AI", async () => {
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024);

    const result = await parseFileForImport({
      buffer: bigBuffer, mimeType: "application/pdf", filename: "huge.pdf", userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("invalid_file");
    }
    expect(invoiceParser.parseFileWithAi).not.toHaveBeenCalled();
    expect(aiQuota.tryReserve).not.toHaveBeenCalled();
  });

  it("mime inválido → retorna invalid_file", async () => {
    const result = await parseFileForImport({
      buffer, mimeType: "application/x-exe", filename: "malware.exe", userId,
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBe("invalid_file");
    }
  });
});
```

**Dependência nova:** o teste usa `isPdfEncrypted` mockado do `ocr-parser`. Precisamos adicionar esse helper — ver Task 3.1b.

- [x] **Step 2: Rodar — deve falhar**

Run: `npm run test:unit -- src/lib/parse-pipeline.test.ts`
Expected: FAIL com `Cannot find module './parse-pipeline'`. ✓ Confirmado RED.

- [x] **Step 3: Commit**

Commit: `c48056a test(ai-parser): add failing tests for parse-pipeline`

**Learnings:**
- `vi.mock("@/lib/ocr-parser")` substitui tudo incluindo a classe `PdfPasswordError`, o que quebra o teste de preflight. Solução: mock parcial com `importOriginal` preservando a classe real e mockando só as funções (`processFile`, `processImageOCR`, `processBufferOCR`, `isPdfEncrypted`).

---

### Task 3.1b: Adicionar helper `isPdfEncrypted` ao `ocr-parser.ts`

**Files:**
- Modify: `src/lib/ocr-parser.ts`
- Create: `src/lib/ocr-parser.test.ts` (append novo teste)

**Complexity:** Low
**TDD:** YES
**Depends On:** nenhum

**Why:** Pipeline precisa detectar PDFs criptografados ANTES de chamar AI (Gemini não aceita PDF com senha). Usa `unpdf` já instalado.

- [x] **Step 1: Adicionar teste em `src/lib/ocr-parser.test.ts`**

Append ao arquivo existente:

```typescript
import { isPdfEncrypted } from "./ocr-parser";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("isPdfEncrypted", () => {
  it("retorna false para buffer não-PDF", async () => {
    const buffer = Buffer.from("not a pdf");
    expect(await isPdfEncrypted(buffer)).toBe(false);
  });

  it("retorna false para PDF não-criptografado", async () => {
    // Usar uma fixture pública ou gerar um PDF mínimo
    // Se não houver fixture, criar um PDF simples via pdf-lib no setup
    const plain = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000010 00000 n\ntrailer\n<</Size 2/Root 1 0 R>>\n%%EOF"
    );
    expect(await isPdfEncrypted(plain)).toBe(false);
  });

  // Um teste com PDF criptografado real — pular se não houver fixture, documentar TODO:
  it.skip("retorna true para PDF criptografado (fixture manual)", async () => {
    // Pular até criarmos uma fixture protegida por senha
  });
});
```

- [x] **Step 2: Implementar `isPdfEncrypted`**

Em `src/lib/ocr-parser.ts`, adicionar função exportada:

```typescript
/**
 * Detecta se um buffer é um PDF criptografado.
 * Returns false para buffers não-PDF (sem crash).
 * Returns true se o PDF precisa de senha pra abrir.
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
```

- [x] **Step 3: Rodar teste**

Run: `npm run test:unit -- src/lib/ocr-parser.test.ts`
Expected: PASS (testes novos + os já existentes). ✓ 11 testes passam.

- [x] **Step 4: Commit**

Commit: `d37f2f3 feat(ocr): add isPdfEncrypted helper for AI preflight`

**Learnings:**
- Adicionados 4 testes: não-PDF, PDF limpo, PDF criptografado (`PasswordException`), e erro inesperado. Pulei a fixture de PDF criptografado real — os testes existentes já cobrem o contrato via mocks de `unpdf`.
- Heurística de header (`%PDF-`) evita chamar `getDocumentProxy` para buffers não-PDF, economizando trabalho no pipeline.

---

### Task 3.2: Implementar `parse-pipeline.ts`

**Files:**
- Create: `src/lib/parse-pipeline.ts`

**Complexity:** High
**TDD:** YES
**Depends On:** Task 3.1, Phase 1, Phase 2

**Why:** Orquestração central. Conecta quota + AI + fallback num fluxo único consumível por qualquer entrada.

**Acceptance Criteria:**
```gherkin
Given o pipeline implementado
When parseFileForImport é chamado com input válido
Then executa STEP 1 → STEP 2 → STEP 3 na ordem correta
And respeita PdfPasswordError e limites de arquivo
And retorna ParseResult tipado discriminado por "kind"
```

- [x] **Step 1: Criar parse-pipeline.ts**

Escrever `src/lib/parse-pipeline.ts`:

```typescript
import {
  processFile,
  processImageOCR,
  isPdfEncrypted,
  PdfPasswordError,
} from "@/lib/ocr-parser";
import { parseStatementText } from "@/lib/statement-parser";
import { parseNotificationText } from "@/lib/notification-parser";
import {
  tryReserve,
  release,
  currentYearMonth,
} from "@/lib/rate-limit/ai-quota";
import { createGeminiClient } from "@/lib/ai-parser/gemini-client";
import { parseFileWithAi } from "@/lib/ai-parser/invoice-parser";
import type { StatementParseResult } from "@/types";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — limite Gemini
const VALID_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export type ParseInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  userId: string;
  password?: string;
};

export type ParseResult =
  | {
      kind: "success";
      bank: string;
      transactions: StatementParseResult["transactions"];
      source: "ai" | "notif" | "regex";
      usedFallback: boolean;
      confidence: number;
      rawText?: string;
    }
  | {
      kind: "error";
      error:
        | "needs_password"
        | "wrong_password"
        | "invalid_file"
        | "no_transactions_found"
        | "internal";
      message?: string;
      rawText?: string;
    };

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

function bufferToFile(buffer: Buffer, name: string, mime: string): File {
  return new File([new Uint8Array(buffer)], name, { type: mime });
}

export async function parseFileForImport(input: ParseInput): Promise<ParseResult> {
  const { buffer, mimeType, userId, password } = input;

  // yearMonth capturado UMA vez no início pra evitar race na virada de mês
  const yearMonth = currentYearMonth();

  // Guarda pré-IA
  if (!VALID_MIMES.has(mimeType)) {
    return { kind: "error", error: "invalid_file", message: "Tipo de arquivo não suportado" };
  }
  if (buffer.byteLength > MAX_BYTES) {
    return {
      kind: "error",
      error: "invalid_file",
      message: "Arquivo excede 50 MB (limite da IA)",
    };
  }

  // PREFLIGHT: PDFs criptografados pulam AI (Gemini não aceita senha)
  let skipAiDueToEncryption = false;
  if (mimeType === "application/pdf") {
    try {
      skipAiDueToEncryption = await isPdfEncrypted(buffer);
    } catch {
      // Se o preflight quebrar, assumir não-criptografado (AI decide se aceita)
      skipAiDueToEncryption = false;
    }
  }

  // STEP 1: notification-parser rápido (imagens)
  if (isImage(mimeType)) {
    try {
      const ocrLight = await processImageOCR(bufferToFile(buffer, input.filename, mimeType));
      const notifResult = parseNotificationText(ocrLight.text, ocrLight.confidence);
      if (notifResult && notifResult.transactions.length > 0) {
        return {
          kind: "success",
          bank: notifResult.bank,
          transactions: notifResult.transactions,
          source: "notif",
          usedFallback: false,
          confidence: notifResult.averageConfidence,
          rawText: ocrLight.text,
        };
      }
    } catch (err) {
      console.warn("STEP 1 (notif) falhou, seguindo para STEP 2:", err);
    }
  }

  // STEP 2: AI (se não for PDF criptografado, tiver key, e reserva vier OK)
  const client = !skipAiDueToEncryption ? createGeminiClient() : null;

  if (client) {
    const reserved = await tryReserve(userId, yearMonth);
    if (reserved) {
      let gatePassed = false;
      try {
        const aiResult = await parseFileWithAi(buffer, mimeType, client);

        // Acceptance gate duplo: documentType reconhecido + transações existem
        const validDocType =
          aiResult.documentType === "fatura_cartao" ||
          aiResult.documentType === "extrato_bancario";

        if (validDocType && aiResult.transactions.length > 0) {
          gatePassed = true;
          return {
            kind: "success",
            bank: aiResult.bank,
            transactions: aiResult.transactions,
            source: "ai",
            usedFallback: false,
            confidence: aiResult.averageConfidence,
          };
        }
        // Gate reprovou → release + fallback
      } catch (err) {
        console.warn("AI falhou, release quota + fallback:", err);
        // PdfPasswordError não deveria chegar aqui (preflight filtrou),
        // mas por via das dúvidas, liberamos e caímos no STEP 3.
      } finally {
        if (!gatePassed) {
          try {
            await release(userId, yearMonth);
          } catch (releaseErr) {
            console.error("Falha ao liberar quota (non-fatal):", releaseErr);
          }
        }
      }
    }
  }

  // STEP 3: Fallback (tesseract + regex)
  try {
    const ocrResult = await processFile(
      bufferToFile(buffer, input.filename, mimeType),
      password
    );

    const statementResult = parseStatementText(ocrResult.text, ocrResult.confidence);
    if (statementResult.transactions.length > 0) {
      return {
        kind: "success",
        bank: statementResult.bank,
        transactions: statementResult.transactions,
        source: "regex",
        usedFallback: true,
        confidence: statementResult.averageConfidence,
        rawText: ocrResult.text,
      };
    }

    // Última tentativa: notification-parser em cima do texto OCR completo
    const notifResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
    if (notifResult && notifResult.transactions.length > 0) {
      return {
        kind: "success",
        bank: notifResult.bank,
        transactions: notifResult.transactions,
        source: "notif",
        usedFallback: true,
        confidence: notifResult.averageConfidence,
        rawText: ocrResult.text,
      };
    }

    return {
      kind: "error",
      error: "no_transactions_found",
      rawText: ocrResult.text,
    };
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      return {
        kind: "error",
        error: err.needsPassword ? "needs_password" : "wrong_password",
      };
    }
    console.error("Erro no pipeline de parse:", err);
    return {
      kind: "error",
      error: "internal",
      message: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}
```

**Notas importantes sobre a implementação:**

1. **`yearMonth` é capturado 1 vez** e passado explicitamente pra `tryReserve` e `release` — elimina race de virada de mês UTC.
2. **`gatePassed` é local ao bloco** do `if (reserved)` e controla o `finally` que libera a quota. Success path seta `gatePassed = true` antes do `return`; qualquer outro caminho (exception, gate falhou, AI retornou 0) deixa `gatePassed = false` e libera.
3. **`release` é best-effort** — se falhar, logamos mas não derrubamos o pipeline (usuário ainda tem o fallback).
4. **Sem retry no STEP 2** — se Gemini falhou (5xx, timeout, 4xx), cai direto no STEP 3.

- [x] **Step 2: Rodar testes**

Run: `npm run test:unit -- src/lib/parse-pipeline.test.ts`
Expected: PASS. ✓ 11 testes passam (lista foi expandida de 9 para 11 cobrindo todos os acceptance gates).

- [x] **Step 3: Commit**

Commit: `6570657 feat(ai-parser): implement unified parse-pipeline`

**Learnings:**
- O padrão `gatePassed` + `finally` funciona bem: success path seta `gatePassed = true` antes do `return`; qualquer outro caminho (exception, gate reprovado) mantém falso e libera a quota.
- `console.warn` dentro dos testes com mocks que rejeitam é esperado — é o próprio pipeline logando "AI falhou" antes do fallback.
- Separação entre `skipAiDueToEncryption` e "sem quota/sem key" simplifica os early-returns do STEP 2.

---

### Task 3.3: Refatorar `/api/ocr/route.ts` pra usar o pipeline

**Files:**
- Modify: `src/app/api/ocr/route.ts`

**Complexity:** Medium
**TDD:** YES (já tem integration tests provavelmente, mas garantir)
**Depends On:** Task 3.2

**Why:** Unificar a lógica — endpoint só resolve auth, senha salva e chama o pipeline.

- [x] **Step 1: Rodar integration tests existentes ANTES de mexer**

Run: `grep -l "api/ocr" tests/ -r`
Resultado: **Não havia nenhum teste de integração pra `/api/ocr`.** Criei um novo em `tests/integration/api/ocr-pipeline.test.ts` com 7 cenários cobrindo o contrato completo.

- [x] **Step 2: Substituir corpo do POST**

Editar `src/app/api/ocr/route.ts`. Manter os helpers `getSavedPdfPassword`/`savePdfPassword`. Substituir o `POST` por:

```typescript
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = (formData.get("password") as string | null) || undefined;
    const savePasswordFlag = formData.get("savePassword") === "true";

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)" },
        { status: 400 }
      );
    }

    // Tenta com senha explícita, depois com senha salva
    const savedPassword = await getSavedPdfPassword(ctx.userId);
    const passwordsToTry = [password, savedPassword].filter(Boolean) as string[];

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || guessMimeFromName(fileName);

    let result = await parseFileForImport({
      buffer, mimeType, filename: file.name, userId: ctx.userId, password: passwordsToTry[0],
    });

    if (
      result.kind === "error" &&
      (result.error === "needs_password" || result.error === "wrong_password") &&
      passwordsToTry.length > 1
    ) {
      result = await parseFileForImport({
        buffer, mimeType, filename: file.name, userId: ctx.userId, password: passwordsToTry[1],
      });
    }

    if (result.kind === "error") {
      if (result.error === "needs_password") {
        return NextResponse.json({ needsPassword: true });
      }
      if (result.error === "wrong_password") {
        return NextResponse.json({
          needsPassword: true,
          error: "Senha incorreta. Tente novamente.",
        });
      }
      if (result.error === "no_transactions_found") {
        return NextResponse.json(
          {
            error: "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
            rawText: result.rawText,
          },
          { status: 400 }
        );
      }
      if (result.error === "invalid_file") {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({ error: result.message || "Erro ao processar arquivo" }, { status: 500 });
    }

    // Salva senha se requisitada e foi usada com sucesso
    if (savePasswordFlag && password) {
      try {
        await savePdfPassword(ctx.userId, password);
      } catch (saveError) {
        console.error("Failed to save PDF password:", saveError);
      }
    }

    // Pós-processamento: categoria + parcelas + recorrência (igual hoje)
    const defaultCategory = await prisma.category.findFirst({
      where: { ...ctx.ownerFilter, name: "Outros" },
    });

    const transactions = await Promise.all(
      result.transactions.map(async (t) => {
        const suggestedCat = await suggestCategory(t.description, ctx.userId);
        const categoryId = suggestedCat?.id || defaultCategory?.id;
        const installmentInfo = detectInstallment(t.description);
        const recurringInfo = detectRecurringTransaction(t.description);

        return {
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
        };
      })
    );

    return NextResponse.json({
      transactions,
      origin: result.bank,
      confidence: result.confidence,
      rawText: result.rawText,
      source: result.source,         // NOVO — UI usa pra mostrar "extraído com IA"
      usedFallback: result.usedFallback, // NOVO — UI usa pra mostrar aviso amarelo
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
      { error: error instanceof Error ? error.message : "Erro ao processar arquivo" },
      { status: 500 }
    );
  }
}

function guessMimeFromName(fileName: string): string {
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
```

**Atualizar imports no topo do arquivo:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseFileForImport } from "@/lib/parse-pipeline";
import { suggestCategory, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { encrypt, decrypt } from "@/lib/crypto";
```

(Remover imports não mais usados: `processFile`, `PdfPasswordError`, `parseStatementText`, `parseNotificationText`, `ImportedTransaction`.)

- [x] **Step 3: Rodar integration tests**

Criado `tests/integration/api/ocr-pipeline.test.ts` com 7 cenários:
- AI success com `source=ai, usedFallback=false`
- Fallback regex com `source=regex, usedFallback=true`
- Erro `needs_password` → 200 com `needsPassword=true`
- Erro `no_transactions_found` → 400
- Erro `invalid_file` → 400 com message
- Retry com senha salva
- Extensão inválida → 400

Run: `npm run test:integration -- tests/integration/api/ocr-pipeline.test.ts` → 7/7 PASS.

- [ ] **Step 4: Teste manual**

(Pulei o teste manual — o plan file indicava `npm run dev` mas estamos em worktree sem envvar real configurada. Os 7 testes de integração cobrem o contrato JSON; teste manual fica para o usuário.)

- [x] **Step 5: Commit**

Commit: `c489c18 refactor(api): route /api/ocr to use unified parse-pipeline`

**Learnings:**
- A lógica de retry com senha salva precisou mudar: no legacy o retry era implícito (pegava `PdfPasswordError` dentro do `processFile`). No novo pipeline, o erro é sempre retornado como `ParseResult`, então o retry acontece no route. Manti as mesmas semânticas: senha explícita errada → `needsPassword: true + error message`; senha salva tentada e errada → `savedPasswordFailed: true`.
- Adicionei `guessMimeFromName` porque `File.type` pode ser vazio em alguns uploads. O pipeline valida MIME estritamente.
- Os campos `source` e `usedFallback` foram adicionados ao response JSON (campos NOVOS, não-breaking — UI atual ignora).

---

### Task 3.4: Refatorar `telegram/commands.ts` pra usar o pipeline

**Files:**
- Modify: `src/lib/telegram/commands.ts` (lines ~750-790)

**Complexity:** Medium
**TDD:** YES — já tem testes em `commands.test.ts`
**Depends On:** Task 3.2

**Why:** Eliminar a duplicação do pipeline. Bot passa a consumir o mesmo fluxo.

- [x] **Step 1: Rodar tests existentes primeiro**

Run: `npm run test:unit -- src/lib/telegram/commands.test.ts`
Expected: PASS (baseline). ✓ 26 testes passam.

- [x] **Step 2: Ajustar o loop de processamento de fotos**

Localizar em `src/lib/telegram/commands.ts` o bloco que começa em `// Download photo` (aprox. linha 750) e vai até o fim do bloco `allTransactions.push`.

Substituir:

```typescript
// Download photo
const filePath = await getFile(item.fileId)
if (!filePath) continue
const buffer = await downloadFileBuffer(filePath)

// OCR
const ocrResult = await processBufferOCR(buffer)
if (!ocrResult.text || ocrResult.text.trim().length === 0) continue

// Parse
let parseResult = parseStatementText(ocrResult.text, ocrResult.confidence)
if (parseResult.transactions.length === 0) {
  const notificationResult = parseNotificationText(ocrResult.text, ocrResult.confidence)
  if (notificationResult) parseResult = notificationResult
}

if (parseResult.bank) lastBank = parseResult.bank

// Categorize
for (const t of parseResult.transactions) {
  const suggested = await suggestCategory(t.description, userId)
  const installment = detectInstallment(t.description)

  allTransactions.push({
    description: t.description,
    amount: t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount),
    date: t.date instanceof Date ? t.date : new Date(t.date),
    categoryId: suggested?.id || null,
    type: t.type || "EXPENSE",
    selected: true,
    isInstallment: installment.isInstallment,
    currentInstallment: installment.currentInstallment || null,
    totalInstallments: installment.totalInstallments || null,
  })
}
```

Por:

```typescript
// Download photo
const filePath = await getFile(item.fileId)
if (!filePath) continue
const buffer = await downloadFileBuffer(filePath)

// Parse via pipeline unificado (AI → regex → notif)
const parsed = await parseFileForImport({
  buffer,
  mimeType: "image/jpeg", // Telegram photos come as JPEG
  filename: `telegram-${item.fileId}.jpg`,
  userId,
})

if (parsed.kind === "error") {
  // Tracking: se qualquer foto do batch falhar, pular mas continuar
  console.warn(`Telegram photo parse failed: ${parsed.error}`)
  continue
}

if (parsed.bank) lastBank = parsed.bank
if (parsed.usedFallback) batchUsedFallback = true
if (parsed.source === "ai") batchUsedAi = true

// Categorize
for (const t of parsed.transactions) {
  const suggested = await suggestCategory(t.description, userId)
  const installment = detectInstallment(t.description)

  allTransactions.push({
    description: t.description,
    amount: t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount),
    date: t.date instanceof Date ? t.date : new Date(t.date),
    categoryId: suggested?.id || null,
    type: t.type || "EXPENSE",
    selected: true,
    isInstallment: installment.isInstallment,
    currentInstallment: installment.currentInstallment || null,
    totalInstallments: installment.totalInstallments || null,
  })
}
```

**Adicionar no escopo anterior ao loop (junto de `let lastBank = ""`):**

```typescript
let batchUsedFallback = false
let batchUsedAi = false
```

**Atualizar imports no topo do arquivo `src/lib/telegram/commands.ts`:**

Adicionar:
```typescript
import { parseFileForImport } from "@/lib/parse-pipeline"
```

Remover os imports que não serão mais usados no bloco refatorado:
- `processBufferOCR` de `@/lib/ocr-parser` (se não for usado em outro bloco)
- `parseStatementText` de `@/lib/statement-parser` (se não for usado)
- `parseNotificationText` de `@/lib/notification-parser` (se não for usado)

**Expor `batchUsedAi` e `batchUsedFallback` no estado** para a Phase 5 usar nas mensagens. Adicionar um return/closure-capture que o chamador consiga ler (ou persistir no `TelegramPhotoQueue` via campo novo — mais simples: mantém nas variáveis do escopo e formata a mensagem do resumo diretamente aqui mesmo).

**NOTA:** Se houver usos de `processBufferOCR`/`parseStatementText`/`parseNotificationText` em OUTROS blocos do mesmo arquivo (ex: comando manual `/importar_texto`), mantenha os imports. Use `grep` pra confirmar:

```bash
grep -n "processBufferOCR\|parseStatementText\|parseNotificationText" src/lib/telegram/commands.ts
```

- [x] **Step 3: Atualizar/remover testes que mockavam `processBufferOCR` etc.**

Em `src/lib/telegram/commands.test.ts`, substituir mocks dos módulos antigos por mock do pipeline:

```typescript
vi.mock("@/lib/parse-pipeline", () => ({
  parseFileForImport: vi.fn(),
}))

import { parseFileForImport } from "@/lib/parse-pipeline"
const mockParsePipeline = vi.mocked(parseFileForImport)
```

E ajustar setups de teste pra retornar objetos no formato novo:

```typescript
mockParsePipeline.mockResolvedValue({
  kind: "success",
  bank: "Nubank",
  transactions: [/* ... */],
  source: "ai",
  usedFallback: false,
  confidence: 1,
})
```

Manter os mocks antigos de `processBufferOCR`, `parseStatementText`, `parseNotificationText` apenas se outros caminhos do arquivo (fora do refactor) ainda os usam.

- [x] **Step 4: Rodar testes**

Run: `npm run test:unit -- src/lib/telegram/commands.test.ts`
Expected: PASS. ✓ 26 testes passam (mesmo count que o baseline).

- [x] **Step 5: Commit**

Commit: `7be64cb refactor(telegram): use unified parse-pipeline for photo batches`

**Learnings:**
- Os `grep` confirmaram que `processBufferOCR`, `parseStatementText` e `parseNotificationText` eram usados APENAS no loop de fotos do batch. Pude remover esses três imports por completo do `commands.ts`.
- Adicionei `batchUsedAi` e `batchUsedFallback` como variáveis de escopo prontas pra Phase 5 consumir nas mensagens do bot.
- Cada foto do batch agora é um `parseFileForImport` independente — se uma falhar, o loop pula (com `console.warn`) e continua. Isso preserva a robustez do batch em caso de foto ruim.

---

### Task 3.5: Rodar a suite completa e consertar regressões

**Files:**
- Various — conforme necessário

**Complexity:** Variable
**TDD:** N/A — regression check
**Depends On:** Tasks 3.1 a 3.4

**Why:** Garantir que o refactor não quebrou nada fora dos testes diretos.

- [x] **Step 1: Rodar suite completa**

- Unit tests: `npm run test:unit` → **642/642 PASS** em 46 test files.
- Integration tests: `npm run test:integration` → 201 pass, 68 fail.
  - **Importante:** os 68 fails são PRE-EXISTENTES (confirmado rodando HEAD sem minhas changes — mesmo count). Estão em `bill-payments`, `check-duplicates`, `import`, etc — arquivos que não toquei.
  - O novo `ocr-pipeline.test.ts` está em PASS (7/7).

- [x] **Step 2: Rodar lint**

Run: `npm run lint`
O projeto não tem `.eslintrc` configurado — Next.js pediu setup interativo. Não rodei (pre-existente).

- [x] **Step 3: Rodar type check**

Run: `npx tsc --noEmit`
Resultado: **1 erro pre-existente** em `src/lib/csv-parser.test.ts:256` (não relacionado às minhas mudanças). Confirmado via `git stash` que o erro existe em HEAD antes do meu trabalho.

- [x] **Step 4: Commit (só se tiver ajustes)**

Sem ajustes necessários — nenhuma regressão introduzida.

**Learnings:**
- A suite de integração tem 68 falhas pre-existentes. Recomendo investigar separadamente em outra phase ou task dedicada.
- Verificar sempre com `git stash` se failures são pre-existentes antes de atribuí-las ao refactor atual.

---

## Phase 3 Exit Criteria

- [x] `npm run test:unit` passa 100% (642/642). Integration passa 201/269 (68 falhas pre-existentes, não relacionadas).
- [x] Endpoint `/api/ocr` retorna `source` e `usedFallback` no response JSON
- [x] Bot do Telegram usa `parseFileForImport` no loop de fotos
- [x] Nenhum uso remanescente do par `processFile → parseStatementText → parseNotificationText` fora do pipeline (o pipeline é o único orquestrador)
- [x] Sem `GEMINI_API_KEY`: comportamento idêntico ao pipeline antigo (testado via mock retornando `null` do `createGeminiClient`)
- [x] Com `GEMINI_API_KEY` e quota disponível: IA é chamada e quota **incrementa apenas se acceptance gate passar** (documentType válido + transactions > 0) — coberto pelos testes de acceptance gate
- [x] Amounts de despesas aparecem **negativos** no response JSON (contrato preservado — teste `ocr-pipeline.test.ts` verifica `amount: -45`)
- [x] PDF criptografado nunca chega ao Gemini (preflight detecta e pula) — coberto pelo teste PREFLIGHT

**Próxima fase:** [phase-4-web-ux.md](phase-4-web-ux.md) — badge de quota e indicadores visuais na UI web.
