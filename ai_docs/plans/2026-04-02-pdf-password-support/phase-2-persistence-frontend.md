# Phase 2: Persistência de Senha + Frontend

## Overview

Criar endpoint dedicado para gerenciamento de senha salva (`GET` hasSavedPassword, `DELETE` para remover) e implementar a UI de input de senha na tela de importação. Ao final desta fase, a feature está completa: o usuário faz upload de um PDF com senha, o app pede a senha (ou usa a salva), e exibe as transações para importação.

## Reference Docs for This Phase

- `src/app/api/ocr/route.ts` (full file) — API modificada na Phase 1 (password, needsPassword, savePassword)
- `src/app/api/settings/route.ts` (full file) — Padrão Settings para o endpoint pdf-password
- `src/lib/auth-utils.ts` (lines 76-114) — getAuthContext pattern
- `src/lib/crypto.ts` (full file) — decrypt para verificar existência de senha salva
- `src/app/import/page.tsx` (lines 1-60, 170-190, 358-400, 645-704, 1009-1081) — Estado, processFile, processOCR, UI de upload

## Changes Required

#### 1. Criar endpoint de gerenciamento de senha salva -- DONE

**File**: `src/app/api/user/pdf-password/route.ts` (CREATE)
**Complexity**: Low
**TDD**: NO (simple CRUD -- underlying crypto tested in Phase 1)
**Depends On**: Phase 1

**Pre-conditions**:
- [x] Phase 1 complete (crypto.ts exists, Settings used for pdfPassword)
- [x] Directory `src/app/api/user/` exists (create `pdf-password/` inside)
  - **Learning:** Diretorio `src/app/api/user/` nao existia, criado com `mkdir -p`

**Why**: O frontend precisa saber se existe uma senha salva (para mostrar indicador e botão "esquecer") sem ter acesso ao valor criptografado. Endpoint dedicado retorna apenas boolean e permite exclusão.

**Acceptance Criteria**:
```gherkin
Given a user with a saved PDF password
When GET /api/user/pdf-password is called
Then response is { hasSavedPassword: true }

Given a user without a saved PDF password
When GET /api/user/pdf-password is called
Then response is { hasSavedPassword: false }

Given a user with a saved PDF password
When DELETE /api/user/pdf-password is called
Then the password is removed and subsequent GET returns { hasSavedPassword: false }

Given an unauthenticated request
When any method is called
Then response is 401 Unauthorized
```

**Implementation**:
```typescript
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";

const PDF_PASSWORD_KEY = "pdfPassword";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const setting = await prisma.settings.findUnique({
      where: { key_userId: { key: PDF_PASSWORD_KEY, userId: ctx.userId } },
    });

    return NextResponse.json({
      hasSavedPassword: !!setting?.value,
    });
  } catch (error) {
    return handleApiError(error, "verificar senha de PDF");
  }
}

export async function DELETE() {
  try {
    const ctx = await getAuthContext();

    await prisma.settings.deleteMany({
      where: { key: PDF_PASSWORD_KEY, userId: ctx.userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "remover senha de PDF");
  }
}
```

**Verification**: `npm run build`

**On Failure**:
- If directory doesn't exist: `mkdir -p src/app/api/user/pdf-password`
- If `handleApiError` import fails: Check `src/lib/auth-utils.ts` exports

---

#### 2. Implementar UI de input de senha na tela de importacao -- DONE

**File**: `src/app/import/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: NO (UI component -- verified manually and by E2E in future)
**Depends On**: Phase 1, Task 2.1

**Load Before Implementing**:
1. `src/app/import/page.tsx` (lines 1-60) -- Imports e tipos
2. `src/app/import/page.tsx` (lines 170-190) -- State declarations
3. `src/app/import/page.tsx` (lines 358-400) -- processFile, handleFileUpload
4. `src/app/import/page.tsx` (lines 645-704) -- processOCR function
5. `src/app/import/page.tsx` (lines 1009-1081) -- Upload UI section
6. `src/components/ui/checkbox.tsx` -- Checkbox component to import

**Pre-conditions**:
- [x] Phase 1 complete (API returns `needsPassword`)
- [x] Task 2.1 complete (pdf-password endpoint exists)
- [x] Checkbox component available at `@/components/ui/checkbox`
  - **Learning:** Checkbox component ja existia em `src/components/ui/checkbox.tsx`, importacao direta funcionou sem problemas

**Why**: O usuário precisa de uma interface para fornecer a senha do PDF quando o backend detecta proteção. A UI deve ser fluida: tentar senha salva silenciosamente, mostrar input apenas quando necessário, e permitir salvar para uso futuro.

**Acceptance Criteria**:
```gherkin
Given a password-protected PDF is uploaded
And no saved password exists
When the API returns needsPassword
Then a password input card appears below the upload area
And the card has: password input, "Lembrar senha" checkbox (checked), "Desbloquear" button

Given a password-protected PDF is uploaded
And a saved password exists that works
When the API returns transactions (saved password worked silently)
Then no password card is shown and preview appears normally

Given a password-protected PDF is uploaded
And a saved password exists that fails
When the API returns needsPassword
Then the password input card appears with message "Senha salva não funcionou"

Given the user enters a correct password
When "Desbloquear e importar" is clicked
Then the PDF is reprocessed with the password and preview appears

Given the user enters a wrong password
When "Desbloquear e importar" is clicked
Then an error message appears in the card and the input is cleared for retry

Given "Lembrar senha" is checked
When a correct password is submitted
Then savePassword=true is sent to the API

Given a saved password exists
Then a small indicator shows "Senha de PDF salva" with a "Esquecer" link
```

**Implementation**:

**Step A — Add imports (line ~2, after existing imports):**

Add to the lucide-react import:
```typescript
Lock,
```

Add new import:
```typescript
import { Checkbox } from "@/components/ui/checkbox";
```

**Step B — Add state variables (after line ~187, after `lastImportBatchId`):**

```typescript
const [needsPassword, setNeedsPassword] = useState(false);
const [pdfPassword, setPdfPassword] = useState("");
const [pendingFile, setPendingFile] = useState<File | null>(null);
const [hasSavedPassword, setHasSavedPassword] = useState(false);
const [savePassword, setSavePassword] = useState(true);
const [passwordError, setPasswordError] = useState<string | null>(null);
```

**Step C — Add useEffect to check saved password (after existing useEffects):**

```typescript
useEffect(() => {
  fetch("/api/user/pdf-password")
    .then((res) => res.json())
    .then((data) => setHasSavedPassword(data.hasSavedPassword))
    .catch(() => {});
}, []);
```

**Step D — Add password handling functions (after `handleDragLeave`, before `processCSV`):**

```typescript
async function handlePasswordSubmit() {
  if (!pendingFile || !pdfPassword) return;

  setLoading(true);
  setPasswordError(null);
  setOcrProgress(0);

  const progressInterval = setInterval(() => {
    setOcrProgress((prev) => Math.min(prev + 5, 90));
  }, 500);

  try {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("password", pdfPassword);
    if (savePassword) {
      formData.append("savePassword", "true");
    }

    const res = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });

    clearInterval(progressInterval);
    setOcrProgress(100);

    const data = await res.json();

    if (data.needsPassword) {
      setPasswordError(data.error || "Senha incorreta. Tente novamente.");
      setPdfPassword("");
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || "Erro ao processar arquivo");
    }

    // Success — clear password state
    setNeedsPassword(false);
    setPendingFile(null);
    setPdfPassword("");
    if (savePassword) {
      setHasSavedPassword(true);
    }

    // Process transactions (same logic as processOCR success path)
    setOrigin(data.origin);
    setOcrConfidence(data.confidence);
    const parsedTransactions = data.transactions.map((t: ExtendedTransaction) => {
      let normalizedDate: Date;
      if (typeof t.date === "string") {
        const match = (t.date as string).match(/^(\d{4})-(\d{2})-(\d{2})/);
        normalizedDate = match
          ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
          : new Date(t.date);
      } else {
        normalizedDate = new Date(t.date);
      }
      return { ...t, date: normalizedDate, selected: true };
    });

    const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
    setTransactions(transactionsWithDuplicates);

    const ocrValidDates = transactionsWithDuplicates
      .map((t) => (t.date instanceof Date ? t.date : new Date(t.date)))
      .filter((d) => !isNaN(d.getTime()));
    if (ocrValidDates.length > 0) {
      const latestDate = new Date(Math.max(...ocrValidDates.map((d) => d.getTime())));
      const suggestedMonth = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}`;
      setInvoiceMonth(suggestedMonth);
    }

    setStep("preview");
  } catch (error) {
    toast({
      title: "Erro ao processar arquivo",
      description: error instanceof Error ? error.message : "Erro desconhecido",
      variant: "destructive",
    });
  } finally {
    clearInterval(progressInterval);
    setLoading(false);
    setOcrProgress(0);
  }
}

async function handleForgetPassword() {
  try {
    await fetch("/api/user/pdf-password", { method: "DELETE" });
    setHasSavedPassword(false);
    toast({
      title: "Senha removida",
      description: "A senha salva de PDF foi removida.",
    });
  } catch {
    toast({
      title: "Erro",
      description: "Não foi possível remover a senha.",
      variant: "destructive",
    });
  }
}
```

**Step E — Modify `processOCR` function (replace lines 645-704):**

```typescript
async function processOCR(file: File) {
  const progressInterval = setInterval(() => {
    setOcrProgress((prev) => Math.min(prev + 5, 90));
  }, 500);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });

    clearInterval(progressInterval);
    setOcrProgress(100);

    const data = await res.json();

    // Handle password-protected PDF
    if (data.needsPassword) {
      setPendingFile(file);
      setNeedsPassword(true);
      setPasswordError(
        data.savedPasswordFailed
          ? "Senha salva não funcionou para este PDF."
          : null
      );
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || "Erro ao processar arquivo");
    }

    setOrigin(data.origin);
    setOcrConfidence(data.confidence);
    const parsedTransactions = data.transactions.map((t: ExtendedTransaction) => {
      let normalizedDate: Date;
      if (typeof t.date === "string") {
        const match = (t.date as string).match(/^(\d{4})-(\d{2})-(\d{2})/);
        normalizedDate = match
          ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
          : new Date(t.date);
      } else {
        normalizedDate = new Date(t.date);
      }
      return { ...t, date: normalizedDate, selected: true };
    });
    const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
    setTransactions(transactionsWithDuplicates);

    const ocrValidDates = transactionsWithDuplicates
      .map((t) => (t.date instanceof Date ? t.date : new Date(t.date)))
      .filter((d) => !isNaN(d.getTime()));
    if (ocrValidDates.length > 0) {
      const latestDate = new Date(Math.max(...ocrValidDates.map((d) => d.getTime())));
      const suggestedMonth = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}`;
      setInvoiceMonth(suggestedMonth);
    }

    setStep("preview");
  } finally {
    clearInterval(progressInterval);
  }
}
```

**Step F — Add password card UI (after the OCR progress bar, inside `{step === "upload" && (`, after line ~1077 closing `</div>`):**

Insert after the `{loading && fileType === "ocr" && (...)}` block, still inside the `<CardContent><div className="space-y-4">`:

```tsx
{needsPassword && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
    <div className="flex items-center gap-2 text-amber-800">
      <Lock className="h-4 w-4" />
      <span className="font-medium text-sm">PDF protegido por senha</span>
    </div>

    {passwordError && (
      <p className="text-sm text-red-600">{passwordError}</p>
    )}

    <div className="flex gap-2">
      <Input
        type="password"
        placeholder="Senha do PDF"
        value={pdfPassword}
        onChange={(e) => setPdfPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handlePasswordSubmit();
        }}
        disabled={loading}
        className="flex-1"
      />
      <Button
        onClick={handlePasswordSubmit}
        disabled={loading || !pdfPassword}
        size="sm"
      >
        {loading ? "Processando..." : "Desbloquear"}
      </Button>
    </div>

    <div className="flex items-center gap-2">
      <Checkbox
        id="savePassword"
        checked={savePassword}
        onCheckedChange={(checked) => setSavePassword(checked === true)}
      />
      <Label htmlFor="savePassword" className="text-sm text-gray-600 cursor-pointer">
        {hasSavedPassword
          ? "Substituir senha salva"
          : "Lembrar senha para próximos PDFs"}
      </Label>
    </div>
  </div>
)}

{hasSavedPassword && !needsPassword && !loading && (
  <div className="flex items-center justify-between text-xs text-gray-400">
    <span className="flex items-center gap-1">
      <Lock className="h-3 w-3" />
      Senha de PDF salva
    </span>
    <button
      onClick={handleForgetPassword}
      className="text-red-400 hover:text-red-600 underline"
    >
      Esquecer
    </button>
  </div>
)}
```

**Verification**: `npm run build` + manual test no browser: upload PDF com senha → card aparece → digitar senha → transações exibidas

**On Failure**:
- If `Checkbox` import fails: Check `src/components/ui/checkbox.tsx` exists. If not, use native `<input type="checkbox">` instead
- If `Lock` icon not found in lucide-react: Use `KeyRound` or `Shield` as alternative
- If `data.needsPassword` check fails: Verify Phase 1 API returns `{ needsPassword: true }` (not `{ error: ... }` with status 400)
- If duplicate code between processOCR and handlePasswordSubmit: This is intentional — the transaction processing logic is duplicated to keep both functions self-contained. Extract to a helper only if a third caller appears.

## Success Criteria

### Automated Verification
- [x] `npm run build` -- Compilacao bem-sucedida (ambas as tasks)
- [x] `npm run test:unit` -- 537 testes passando (3 falhas pre-existentes em SpaceSwitcher, nao relacionadas)

### Manual Verification (only if automation impossible)
- [ ] Upload PDF com senha no browser -> card de senha aparece -> digitar senha correta -> transacoes exibidas
- [ ] Marcar "Lembrar senha" -> proximo upload usa senha automaticamente
- [ ] "Esquecer" remove a senha salva
