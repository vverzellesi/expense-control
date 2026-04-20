# Phase 2: AI Parser (Gemini)

## Overview

Implementar o módulo de parse com IA: schema de output, system prompt, wrapper do Gemini com interface injetável (pra testes), e a função principal `parseFileWithAi(buffer, mime, filename)` que devolve `StatementParseResult`.

Esta fase NÃO mexe em endpoints existentes — só cria o módulo. Integração vem na Phase 3.

## Reference Docs for This Phase

- `src/types/index.ts:133-168` — `ImportedTransaction`, `StatementTransaction`, `StatementParseResult`
- `src/lib/statement-parser.ts` — exemplo do formato que o retorno deve matchar (usado pelo consumidor)
- `src/lib/utils.ts` — `parseDate` (helpers de data)
- https://ai.google.dev/gemini-api/docs/structured-output — como passar responseSchema
- https://ai.google.dev/gemini-api/docs/document-processing — limites de PDF e como mandar inline data

## Changes Required

---

### Task 2.1: Instalar SDK do Gemini

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Complexity:** Low
**TDD:** NO — dependência externa
**Depends On:** none

**Why:** Precisamos do cliente oficial pra chamar a API.

**Acceptance Criteria:**
```gherkin
Given o package.json sem SDK Gemini
When npm install @google/genai for executado
Then a dependência aparece em package.json
And node_modules/@google/genai existe
And o build (npm run build) continua passando
```

- [ ] **Step 1: Instalar pacote**

Run: `npm install @google/genai`
Expected output: `added 1 package` ou similar (pode vir com subdeps).

- [ ] **Step 2: Confirmar versão**

Run: `node -e "console.log(require('@google/genai/package.json').version)"`
Expected: versão >=0.10 (SDK é novo, nome `@google/genai`; NÃO é o legacy `@google/generative-ai`).

- [ ] **Step 3: Verificar que lint/build continuam ok**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(ai-parser): add @google/genai SDK"
```

---

### Task 2.2: Definir schema de output do Gemini

**Files:**
- Create: `src/lib/ai-parser/schema.ts`

**Complexity:** Low
**TDD:** NO — type/constant definition; validação acontece indiretamente via invoice-parser tests
**Depends On:** Task 2.1

**Why:** Gemini 2.5 suporta structured output com `responseSchema`. O schema garante conformidade do JSON e simplifica parsing.

**Acceptance Criteria:**
```gherkin
Given um schema definido
When ele é importado em invoice-parser
Then os tipos TypeScript batem (bank, documentType, transactions[])
```

- [ ] **Step 1: Criar schema.ts**

Escrever `src/lib/ai-parser/schema.ts`:

```typescript
import { Type, type Schema } from "@google/genai";

export const AI_INVOICE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    bank: {
      type: Type.STRING,
      description:
        "Nome do banco ou instituição. Ex: 'Nubank', 'Itaú', 'C6', 'BTG', 'Inter'. Se não detectável, use 'Desconhecido'.",
    },
    documentType: {
      type: Type.STRING,
      enum: ["fatura_cartao", "extrato_bancario", "desconhecido"],
      description:
        "Tipo do documento. Use 'desconhecido' se não for fatura nem extrato reconhecível.",
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description:
              "Descrição original da transação, preservada. Inclua marcadores como '3/12' se presentes.",
          },
          amount: {
            type: Type.NUMBER,
            description: "Valor absoluto em BRL, sempre positivo.",
          },
          date: {
            type: Type.STRING,
            description: "Data no formato ISO 'YYYY-MM-DD'.",
          },
          type: {
            type: Type.STRING,
            enum: ["INCOME", "EXPENSE"],
            description:
              "EXPENSE para saídas (compras, pagamentos); INCOME para entradas (salário, PIX recebido, estorno).",
          },
          transactionKind: {
            type: Type.STRING,
            description:
              "Tipo específico se detectável: PIX, TED, BOLETO, CARTAO, ESTORNO, SAQUE, TARIFA. Omita se não for óbvio.",
          },
        },
        required: ["description", "amount", "date", "type"],
      },
    },
  },
  required: ["bank", "documentType", "transactions"],
};

export interface AiInvoiceOutput {
  bank: string;
  documentType: "fatura_cartao" | "extrato_bancario" | "desconhecido";
  transactions: Array<{
    description: string;
    amount: number;
    date: string;
    type: "INCOME" | "EXPENSE";
    transactionKind?: string;
  }>;
}
```

- [ ] **Step 2: Validar que compila**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erros de tipo em `schema.ts`. (Se `Schema`/`Type` não existirem no SDK, ajustar import — consultar https://googleapis.github.io/js-genai/ conforme a versão instalada.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-parser/schema.ts
git commit -m "feat(ai-parser): define Gemini structured output schema"
```

---

### Task 2.3: Definir system prompt

**Files:**
- Create: `src/lib/ai-parser/prompt.ts`

**Complexity:** Low
**TDD:** NO — string constante; snapshot test opcional
**Depends On:** none

**Why:** Prompt isolado em arquivo próprio facilita ajuste sem mexer na lógica e permite snapshot test futuro.

**Acceptance Criteria:**
```gherkin
Given o prompt definido
When invoice-parser importa SYSTEM_PROMPT
Then é uma string não vazia com as regras 1-7 do brainstorm
```

- [ ] **Step 1: Criar prompt.ts**

Escrever `src/lib/ai-parser/prompt.ts`:

```typescript
export const SYSTEM_PROMPT = `Você é um extrator de transações financeiras brasileiras. Recebe um PDF ou imagem de fatura de cartão ou extrato bancário e devolve dados estruturados no formato JSON especificado pelo schema.

REGRAS GERAIS:
1. Extraia APENAS lançamentos reais efetivos. Ignore: saldo inicial, saldo final, saldo anterior, totais, subtotais, juros informativos, limite de crédito, pontuação de cashback, ofertas, avisos de mudança de vencimento.

2. Em FATURAS DE CARTÃO, IGNORE TAMBÉM:
   - "Pagamento efetuado" / "Pagamento recebido" (contra-parte do débito que o usuário já registrou no extrato)
   - "Parcelamento de fatura" ou "refinanciamento de fatura" (quitação de dívida — valor já foi contabilizado)
   - "Próxima fatura" / "Lançamentos futuros" / "Compras parceladas futuras" (ainda não ocorreram)

3. Em FATURAS DE CARTÃO, EXTRAIA normalmente:
   - IOF, spread internacional, taxas de conversão (despesas reais)
   - Parcelas do ciclo atual (ex: "PARCELA 3/10 ABC" — preserve o marcador)
   - Compras, assinaturas, estornos (estornos são INCOME)

DATAS:
4. Formato ISO "YYYY-MM-DD".
5. Em FATURA DE CARTÃO com vencimento em janeiro mas transações de dezembro, use o ANO DA TRANSAÇÃO (o anterior ao do vencimento). Regra geral: o ano é quando a COMPRA ocorreu, não o de fechamento/vencimento.
6. Se o ano não estiver explícito na linha, inferir pelo período de referência do documento (cabeçalho).

VALORES:
7. Valores SEMPRE POSITIVOS em BRL. O schema é {amount: number (positivo), type: "INCOME"|"EXPENSE"}.
   - type="EXPENSE" para saídas: compras, saques, tarifas, boletos pagos, PIX enviados
   - type="INCOME" para entradas: salários, PIX recebidos, estornos, depósitos, devoluções
8. Em EXTRATOS com colunas C/D (Crédito/Débito): C → INCOME, D → EXPENSE.

DESCRIÇÕES:
9. Preserve o texto original: marcadores "3/12", "PARCELA 3 DE 10", prefixos "PAG*", "COMPRA", códigos do estabelecimento.
10. Descrições quebradas em múltiplas linhas (ex: "MERCADO LIVRE\\nPAGAMENTO PARCELADO"): JUNTE em uma só, separada por espaço.
11. NÃO resuma, NÃO invente, NÃO normalize nomes.

TRANSACTION KIND:
12. transactionKind: PIX, TED, BOLETO, CARTAO, ESTORNO, SAQUE, TARIFA, IOF. Omita se não for óbvio.

DOCUMENT TYPE:
13. Se fatura de cartão → "fatura_cartao". Se extrato bancário → "extrato_bancario". Se não for nenhum (print qualquer, notificação push, documento ilegível) → "desconhecido" e transactions: [].

FILOSOFIA:
14. Em dúvida, PREFIRA IGNORAR. Falsos negativos são preferíveis a falsos positivos — o usuário revisa e completa manualmente.

FORMATO DE SAÍDA: JSON conforme schema. Nada fora do JSON.`;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-parser/prompt.ts
git commit -m "feat(ai-parser): add Gemini system prompt"
```

---

### Task 2.4: Criar wrapper injetável do Gemini (`gemini-client.ts`)

**Files:**
- Create: `src/lib/ai-parser/gemini-client.ts`

**Complexity:** Medium
**TDD:** NO — wrapper fino; testado indiretamente via invoice-parser mocking
**Depends On:** Task 2.1, Task 2.2

**Why:** Isolar a chamada real da API num módulo com interface claramente tipada permite mockar facilmente em testes, e centraliza logging/retry/timeout.

**Acceptance Criteria:**
```gherkin
Given um buffer de PDF/imagem e mime type
When geminiClient.generateInvoiceStructured é chamado
Then retorna AiInvoiceOutput parseado
And timeouts de 60s são respeitados
And erros de 5xx tentam retry 1× com backoff de 2s
```

- [ ] **Step 1: Criar gemini-client.ts**

Escrever `src/lib/ai-parser/gemini-client.ts`:

```typescript
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

      return JSON.parse(text) as AiInvoiceOutput;
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
```

**Mudança vs plano inicial:** retry removido. Budget do endpoint é 60s e precisa sobrar tempo pro fallback regex em caso de falha. Se Gemini deu timeout ou 5xx, a tentativa seguinte seria quase garantidamente lenta de novo — melhor cair direto no `processFile` + `parseStatementText` e devolver algo ao usuário. Retry era dívida.

- [ ] **Step 2: Validar compilação**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erros. (Se a API do `@google/genai` divergir — método `generateContent` tem forma diferente — ajustar chamada conforme docs oficiais da versão instalada.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-parser/gemini-client.ts
git commit -m "feat(ai-parser): add Gemini client wrapper with retry"
```

---

### Task 2.5: Criar fixtures de teste

**Files:**
- Create: `tests/fixtures/ai-parser/nubank-fatura-sample-response.json`
- Create: `tests/fixtures/ai-parser/itau-extrato-sample-response.json`
- Create: `tests/fixtures/ai-parser/empty-response.json`
- Create: `tests/fixtures/ai-parser/malformed-ai-response.json`

**Complexity:** Low
**TDD:** NO — fixtures
**Depends On:** none

**Why:** Testes unitários e de integração precisam de respostas simuladas sem tocar API real. Fixtures são dados fake (sem PII), conforme feedback `feedback_mock_test_data.md`.

**Acceptance Criteria:**
```gherkin
Given fixtures em tests/fixtures/ai-parser/
When os testes de invoice-parser/integração importam as fixtures
Then todas carregam sem erro
And nenhum dado real de PF aparece
```

- [ ] **Step 1: Criar fixture Nubank (fatura)**

Criar `tests/fixtures/ai-parser/nubank-fatura-sample-response.json`:

```json
{
  "bank": "Nubank",
  "documentType": "fatura_cartao",
  "transactions": [
    {
      "description": "PAG*IFOOD",
      "amount": 45.90,
      "date": "2026-03-15",
      "type": "EXPENSE",
      "transactionKind": "CARTAO"
    },
    {
      "description": "NETFLIX.COM 1/1",
      "amount": 55.90,
      "date": "2026-03-20",
      "type": "EXPENSE",
      "transactionKind": "CARTAO"
    },
    {
      "description": "UBER TRIP 3/12",
      "amount": 23.00,
      "date": "2026-03-22",
      "type": "EXPENSE",
      "transactionKind": "CARTAO"
    }
  ]
}
```

- [ ] **Step 2: Criar fixture Itaú (extrato)**

Criar `tests/fixtures/ai-parser/itau-extrato-sample-response.json`:

```json
{
  "bank": "Itaú",
  "documentType": "extrato_bancario",
  "transactions": [
    {
      "description": "PIX RECEBIDO - FULANO TESTE",
      "amount": 1500.00,
      "date": "2026-03-05",
      "type": "INCOME",
      "transactionKind": "PIX"
    },
    {
      "description": "BOLETO PAGO - CONTA LUZ",
      "amount": 240.15,
      "date": "2026-03-10",
      "type": "EXPENSE",
      "transactionKind": "BOLETO"
    },
    {
      "description": "SAQUE CAIXA ELETRONICO",
      "amount": 100.00,
      "date": "2026-03-12",
      "type": "EXPENSE",
      "transactionKind": "SAQUE"
    }
  ]
}
```

- [ ] **Step 3: Criar fixture vazia**

Criar `tests/fixtures/ai-parser/empty-response.json`:

```json
{
  "bank": "Desconhecido",
  "documentType": "desconhecido",
  "transactions": []
}
```

- [ ] **Step 4: Criar fixture malformada (pra testar erro)**

Criar `tests/fixtures/ai-parser/malformed-ai-response.json`:

```json
{
  "bank": "Nubank",
  "documentType": "fatura_cartao",
  "transactions": [
    {
      "description": "",
      "amount": -10,
      "date": "not-a-date",
      "type": "INCOME"
    },
    {
      "description": "ITEM VÁLIDO",
      "amount": 50,
      "date": "2026-03-10",
      "type": "EXPENSE"
    }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/ai-parser/
git commit -m "test(ai-parser): add fixtures for unit/integration tests"
```

---

### Task 2.6: Escrever testes do `invoice-parser` (TDD)

**Files:**
- Create: `src/lib/ai-parser/invoice-parser.test.ts`

**Complexity:** Medium
**TDD:** YES — testes primeiro
**Depends On:** Task 2.2, Task 2.5

**Why:** `invoice-parser` é a fronteira entre Gemini e o resto da aplicação. Sanitização (descarte de entradas inválidas), mapeamento pra `StatementParseResult` e edge cases precisam ser testados.

**Acceptance Criteria:**
```gherkin
Given o invoice-parser ainda não implementado
When os testes rodam
Then falham por módulo inexistente
```

- [ ] **Step 1: Criar arquivo de teste**

Escrever `src/lib/ai-parser/invoice-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm run test:unit -- src/lib/ai-parser/invoice-parser.test.ts`
Expected: FAIL com `Cannot find module './invoice-parser'`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-parser/invoice-parser.test.ts
git commit -m "test(ai-parser): add failing tests for invoice-parser"
```

---

### Task 2.7: Implementar `invoice-parser.ts`

**Files:**
- Create: `src/lib/ai-parser/invoice-parser.ts`

**Complexity:** Medium
**TDD:** YES
**Depends On:** Task 2.6

**Why:** Implementação mínima pra passar os testes da 2.6.

**Acceptance Criteria:**
```gherkin
Given os testes de invoice-parser
When parseFileWithAi é implementado
Then todos os testes passam
And entradas inválidas são descartadas silenciosamente (warning log)
```

- [ ] **Step 1: Implementar invoice-parser.ts**

Escrever `src/lib/ai-parser/invoice-parser.ts`:

```typescript
import type { StatementParseResult, StatementTransaction } from "@/types";
import type { GeminiClient } from "./gemini-client";
import type { AiInvoiceOutput } from "./schema";

export interface AiParseResult extends StatementParseResult {
  documentType: "fatura_cartao" | "extrato_bancario" | "desconhecido";
}

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (isNaN(date.getTime())) return null;
  return date;
}

function sanitize(output: AiInvoiceOutput): StatementTransaction[] {
  const result: StatementTransaction[] = [];
  for (const t of output.transactions) {
    if (!t.description || t.description.trim().length === 0) continue;
    if (!Number.isFinite(t.amount) || t.amount <= 0) continue;
    const date = parseIsoDate(t.date);
    if (!date) continue;
    if (t.type !== "INCOME" && t.type !== "EXPENSE") continue;

    // Normaliza sinal pro contrato do statement-parser:
    // EXPENSE → amount negativo, INCOME → amount positivo.
    // IA retorna amount sempre positivo (schema), então:
    const signedAmount = t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount);

    result.push({
      date,
      description: t.description.trim().replace(/\s+/g, " "),
      amount: signedAmount,
      type: t.type,
      transactionKind: t.transactionKind,
      confidence: 1,
    });
  }
  return result;
}

export async function parseFileWithAi(
  buffer: Buffer,
  mimeType: string,
  client: GeminiClient
): Promise<AiParseResult> {
  const output = await client.generateInvoiceStructured(buffer, mimeType);
  const transactions = sanitize(output);

  const discarded = output.transactions.length - transactions.length;
  if (discarded > 0) {
    console.warn(
      `AI parser descartou ${discarded} transações inválidas de ${output.bank}`
    );
  }

  return {
    bank: output.bank,
    documentType: output.documentType,
    transactions,
    averageConfidence: 1,
  };
}
```

- [ ] **Step 2: Rodar testes — devem passar**

Run: `npm run test:unit -- src/lib/ai-parser/invoice-parser.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-parser/invoice-parser.ts
git commit -m "feat(ai-parser): implement invoice-parser with sanitization"
```

---

### Task 2.8: Adicionar `GEMINI_API_KEY` ao `.env.example`

**Files:**
- Modify: `.env.example`

**Complexity:** Trivial
**TDD:** NO
**Depends On:** Task 2.4

**Why:** Documentar a env var nova pro próximo dev que clonar o repo.

- [ ] **Step 1: Editar .env.example**

Verificar se `.env.example` existe:

Run: `ls -la .env.example`
Se existir, adicionar ao final:

```
# Google Gemini API (opcional — sem ela o AI parser desliga e cai no fallback regex)
GEMINI_API_KEY=

# Quota mensal de calls de IA por usuário (default 5)
AI_MONTHLY_QUOTA=5
```

Se não existir, criar com essas linhas.

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(ai-parser): document GEMINI_API_KEY and AI_MONTHLY_QUOTA envs"
```

---

## Phase 2 Exit Criteria

- [ ] `npm run test:unit -- src/lib/ai-parser` — todos passam
- [ ] `npm run lint` passa
- [ ] `npx tsc --noEmit` passa sem erros de tipo novos
- [ ] `@google/genai` instalado, import funciona
- [ ] Fixtures em `tests/fixtures/ai-parser/` existem

**Próxima fase:** [phase-3-unified-pipeline.md](phase-3-unified-pipeline.md) — amarrar tudo num pipeline único que substitui o OCR+regex atual.
