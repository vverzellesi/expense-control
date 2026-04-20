# Phase 5: UX Telegram (mensagens com info de IA/quota/fallback)

## Overview

Espelhar o feedback de UX do web no bot do Telegram. O pipeline unificado (Phase 3) já expõe `source` e `usedFallback`; aqui formatamos o texto da mensagem de resumo que o bot envia após processar um batch de fotos.

Também mostramos o status da quota após uso bem-sucedido da IA (pro usuário saber quantas restam).

## Reference Docs for This Phase

- `src/lib/telegram/commands.ts:800-878` — construção da mensagem de resumo do batch
- `src/lib/rate-limit/ai-quota.ts` — `getUsage` (Phase 1)
- Phase 3 Task 3.4: variáveis `batchUsedAi` e `batchUsedFallback` já capturadas no loop

## Changes Required

---

### Task 5.1: Atualizar testes do batch processor do Telegram

**Files:**
- Modify: `src/lib/telegram/commands.test.ts`

**Complexity:** Medium
**TDD:** YES (adicionar casos novos antes de mudar produção)
**Depends On:** Phase 3 completa

**Why:** Garantir que as mensagens espelham o estado de AI/fallback/quota.

- [ ] **Step 1: Adicionar testes novos**

Localizar em `src/lib/telegram/commands.test.ts` o bloco que testa processamento de batch de fotos (grep por `parseFileForImport` ou similar após Phase 3). Adicionar casos:

```typescript
it("inclui linha '(IA · X/5 usos)' quando batch usou AI com sucesso", async () => {
  // setup: mock parseFileForImport retornando source:"ai", quota getUsage retornando 1 restante
  mockParsePipeline.mockResolvedValue({
    kind: "success",
    bank: "Nubank",
    transactions: [
      { date: new Date(), description: "PAG*IFOOD", amount: 45, type: "EXPENSE", confidence: 1 },
    ],
    source: "ai",
    usedFallback: false,
    confidence: 1,
  });
  vi.mocked(getUsage).mockResolvedValue({ used: 4, remaining: 1, limit: 5 });

  // ... disparar processamento de batch ...

  const call = mockSendMessage.mock.calls.at(-1);
  expect(call?.[1]).toContain("✨");
  expect(call?.[1]).toContain("IA · 4/5");
});

it("inclui aviso '⚠️ Cota esgotada — parser tradicional' quando batch usou fallback", async () => {
  mockParsePipeline.mockResolvedValue({
    kind: "success",
    bank: "C6",
    transactions: [
      { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
    ],
    source: "regex",
    usedFallback: true,
    confidence: 0.85,
  });

  // ... disparar ...

  const call = mockSendMessage.mock.calls.at(-1);
  expect(call?.[1]).toContain("⚠️");
  expect(call?.[1]).toContain("parser tradicional");
});

it("não adiciona linha de IA quando source='notif'", async () => {
  mockParsePipeline.mockResolvedValue({
    kind: "success",
    bank: "Nubank",
    transactions: [
      { date: new Date(), description: "CPG IFOOD", amount: 25, type: "EXPENSE", confidence: 0.9 },
    ],
    source: "notif",
    usedFallback: false,
    confidence: 0.9,
  });

  // ... disparar ...

  const call = mockSendMessage.mock.calls.at(-1);
  expect(call?.[1]).not.toContain("IA ·");
  expect(call?.[1]).not.toContain("parser tradicional");
});
```

Também adicionar mock de `getUsage`:

```typescript
vi.mock("@/lib/rate-limit/ai-quota", () => ({
  getUsage: vi.fn(),
  hasQuota: vi.fn(),
  increment: vi.fn(),
}));

import { getUsage } from "@/lib/rate-limit/ai-quota";
```

- [ ] **Step 2: Rodar — testes novos devem falhar**

Run: `npm run test:unit -- src/lib/telegram/commands.test.ts`
Expected: FAILS nos 3 testes novos (a msg de resumo ainda não inclui linha de IA/fallback). Testes velhos devem continuar passando.

- [ ] **Step 3: Commit só os testes**

```bash
git add src/lib/telegram/commands.test.ts
git commit -m "test(telegram): add failing tests for AI/fallback summary lines"
```

---

### Task 5.2: Atualizar mensagem de resumo no `commands.ts`

**Files:**
- Modify: `src/lib/telegram/commands.ts` (bloco ~850-864)

**Complexity:** Low
**TDD:** YES
**Depends On:** Task 5.1

**Why:** Usar as variáveis `batchUsedAi` e `batchUsedFallback` (capturadas no loop pós-Phase 3) pra compor o header da mensagem.

- [ ] **Step 1: Atualizar construção das `lines`**

Localizar o bloco em `commands.ts` onde `lines` é construída (por volta da linha 855 após Phase 3). Substituir por:

```typescript
const lines: string[] = []

// Header com indicador de fonte
if (batchUsedAi && !batchUsedFallback) {
  const usage = await getUsage(userId)
  lines.push(`✨ ${lastBank || "Extrato"} — ${allTransactions.length} transações extraídas (IA · ${usage.used}/${usage.limit} usos neste mês)`)
} else if (batchUsedFallback) {
  lines.push(`⚠️ Cota de IA esgotada este mês — usei parser tradicional.`)
  lines.push(`📊 ${lastBank || "Extrato"} — ${allTransactions.length} transações encontradas (revise com atenção)`)
} else {
  lines.push(`📊 ${lastBank || "Extrato"} — ${allTransactions.length} transações encontradas`)
}

lines.push(`💰 Total: ${formatCurrency(total)}`)

if (totalDupes > 0) {
  lines.push(`⚠️ ${totalDupes} duplicata(s) removida(s)`)
}
lines.push(`✅ ${unique.length} pronta(s) para importar`)
```

- [ ] **Step 2: Importar `getUsage`**

No topo de `src/lib/telegram/commands.ts`, adicionar ao import existente:

```typescript
import { getUsage } from "@/lib/rate-limit/ai-quota"
```

- [ ] **Step 3: Rodar testes**

Run: `npm run test:unit -- src/lib/telegram/commands.test.ts`
Expected: PASS (testes novos + antigos).

- [ ] **Step 4: Teste manual (opcional, depende de bot configurado)**

Se houver bot de dev:
1. Enviar foto de fatura → mensagem deve mostrar "✨ [banco] · IA · X/5 usos"
2. Setar `AI_MONTHLY_QUOTA=0` + restart → reenviar → "⚠️ Cota esgotada · parser tradicional"
3. Enviar screenshot de notificação push → mensagem sem linha de IA (só "📊 [banco]")

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/commands.ts
git commit -m "feat(telegram): show AI/fallback indicator in photo batch summary"
```

---

### Task 5.3: Criar scaffolding do script de calibração manual

**Files:**
- Create: `tests/calibration/run.ts`
- Create: `tests/calibration/README.md`
- Create: `tests/calibration/.gitignore`

**Complexity:** Low
**TDD:** NO (dev tool, não é código de produção)
**Depends On:** Phase 2, Phase 3

**Why:** Oracle apontou que testes com JSON mockado não validam comportamento multimodal real. Script permite rodar pipeline contra faturas reais antes do deploy (gate obrigatório do README).

- [ ] **Step 1: Criar `tests/calibration/run.ts`**

```typescript
// tsx tests/calibration/run.ts
// Roda o parse-pipeline com GEMINI_API_KEY real contra arquivos locais em
// tests/calibration/fixtures/ (gitignored) e reporta métricas por arquivo.

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, extname, basename } from "path";
import { parseFileForImport } from "../../src/lib/parse-pipeline";

const FIXTURES_DIR = resolve(__dirname, "fixtures");
const GROUND_TRUTH_DIR = resolve(__dirname, "ground-truth");

type GroundTruth = {
  bank: string;
  documentType: "fatura_cartao" | "extrato_bancario";
  expectedTransactionCount: number;
  samples?: Array<{ description: string; amount: number; date: string }>;
};

function mimeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  throw new Error(`Extensão não suportada: ${ext}`);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY ausente. Configure antes de rodar calibração.");
    process.exit(1);
  }

  if (!existsSync(FIXTURES_DIR)) {
    console.error(`❌ Diretório ${FIXTURES_DIR} não existe. Coloque PDFs/imagens anonimizados lá.`);
    process.exit(1);
  }

  const files = readdirSync(FIXTURES_DIR).filter((f) =>
    [".pdf", ".png", ".jpg", ".jpeg"].includes(extname(f).toLowerCase())
  );

  if (files.length === 0) {
    console.error(`❌ Nenhum arquivo em ${FIXTURES_DIR}. Adicione pelo menos 5 fixtures anonimizados.`);
    process.exit(1);
  }

  const results: Array<{
    file: string;
    source: string;
    bank: string;
    count: number;
    expected: number;
    accuracy: number;
    ok: boolean;
  }> = [];

  for (const file of files) {
    const buffer = readFileSync(resolve(FIXTURES_DIR, file));
    const gtPath = resolve(GROUND_TRUTH_DIR, basename(file, extname(file)) + ".json");
    const gt: GroundTruth | null = existsSync(gtPath)
      ? JSON.parse(readFileSync(gtPath, "utf-8"))
      : null;

    const t0 = Date.now();
    const res = await parseFileForImport({
      buffer,
      mimeType: mimeFor(file),
      filename: file,
      userId: "calibration-user",
    });
    const ms = Date.now() - t0;

    if (res.kind === "error") {
      console.log(`❌ ${file}: erro ${res.error} (${ms}ms)`);
      results.push({
        file, source: "error", bank: "-",
        count: 0, expected: gt?.expectedTransactionCount ?? 0,
        accuracy: 0, ok: false,
      });
      continue;
    }

    const expected = gt?.expectedTransactionCount ?? res.transactions.length;
    const accuracy = expected > 0
      ? Math.min(res.transactions.length / expected, 1)
      : 1;

    const ok = accuracy >= 0.8 && res.source === "ai";
    console.log(
      `${ok ? "✅" : "⚠️"} ${file}: ${res.source} · ${res.bank} · ${res.transactions.length}/${expected} · accuracy=${(accuracy * 100).toFixed(0)}% · ${ms}ms`
    );

    results.push({
      file, source: res.source, bank: res.bank,
      count: res.transactions.length, expected,
      accuracy, ok,
    });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== Resumo ===`);
  console.log(`Passaram (AI + accuracy>=80%): ${passed}/${results.length}`);
  const overallAccuracy = results.reduce((s, r) => s + r.accuracy, 0) / results.length;
  console.log(`Accuracy média: ${(overallAccuracy * 100).toFixed(1)}%`);

  if (passed < results.length) {
    console.log(`\n⚠️  Calibração não passou em todos os arquivos. Ajustar prompt e repetir.`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Criar `tests/calibration/.gitignore`**

```
# Fixtures reais nunca vão pro repo (PII)
fixtures/
ground-truth/
```

- [ ] **Step 3: Criar `tests/calibration/README.md`**

```markdown
# Calibração manual do AI parser

Script ad-hoc pra validar o pipeline contra faturas/extratos reais antes do deploy.

## Uso

1. Coloque ao menos 5 arquivos PDF/JPG/PNG **anonimizados** em `tests/calibration/fixtures/` (gitignored)
2. (Opcional) Crie `tests/calibration/ground-truth/<nome-do-arquivo>.json` com:
   \`\`\`json
   {
     "bank": "Nubank",
     "documentType": "fatura_cartao",
     "expectedTransactionCount": 42
   }
   \`\`\`
3. `export GEMINI_API_KEY=<sua-key>`
4. `npx tsx tests/calibration/run.ts`

## Critério de passagem

- Pelo menos 80% das transações esperadas são extraídas por cada arquivo
- `source === "ai"` (não caiu em fallback)
- Log do resultado vai em `ai_docs/ai-parser-calibration/YYYY-MM-DD.md` (manualmente)

## Segurança

- **NUNCA** commitar arquivos em `fixtures/` — contêm PII.
- `.gitignore` já protege. Confira antes de `git add`.
```

- [ ] **Step 4: Commit**

```bash
git add tests/calibration/
git commit -m "chore(ai-parser): add calibration script scaffolding"
```

---

### Task 5.4: Verificação final da suite inteira

**Files:**
- Various

**Complexity:** Low
**TDD:** N/A
**Depends On:** Tasks 5.1, 5.2

- [ ] **Step 1: Rodar tudo**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 2: Rodar lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build completo**

Run: `npm run build`
Expected: PASS sem warnings novos.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(ai-parser): final cleanup before release"
```

---

## Phase 5 Exit Criteria

- [ ] `npm run test:all` passa
- [ ] `npm run build` passa
- [ ] Mensagem do bot mostra "✨ ... IA · X/Y usos" em uploads com AI
- [ ] Mensagem do bot mostra "⚠️ Cota esgotada · parser tradicional" no fallback
- [ ] Screenshots de push notification não recebem linha de IA/fallback (source=notif)
- [ ] Script `tests/calibration/run.ts` existe e roda (com `--help`-ish error se sem `GEMINI_API_KEY` ou sem fixtures)

---

## Implementação Completa

Se todas as 5 fases passaram no Exit Criteria, a feature está pronta pra deploy. Seguir o **Deploy Checklist** em [README.md](README.md).

## Rollback

Em produção, se algo der errado:
1. Unset `GEMINI_API_KEY` na Vercel — pipeline cai silenciosamente no fallback regex
2. Ou setar `AI_MONTHLY_QUOTA=0` pra desabilitar via quota
3. Código do fallback permanece funcional em todos os cenários

Sem necessidade de revert de código ou migration.
