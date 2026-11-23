import { describe, expect, it } from "vitest";
import { classifyPluggyTransaction, compileExcludePatterns, matchesUserExclusion } from "./rules";

// Padrões e descrições sintéticos.
describe("compileExcludePatterns", () => {
  it("aceita literal e regex e ignora entradas inválidas", () => {
    const compiled = compileExcludePatterns([
      { pattern: "texto exemplo" },
      { pattern: "/^LOJA\\s+TESTE/i", accountType: "CREDIT" },
      { pattern: "/[unclosed/" }, // regex inválida
      { pattern: "/(a+)+$/" }, // grupo quantificado: risco de retrocesso catastrófico
      { pattern: "/(x|y){2,}/" },
      { pattern: "/(a)\\1/" }, // referência para trás
      { pattern: "x".repeat(201) },
      { pattern: "   " },
      { pattern: "ok", accountType: "INVESTMENT" },
      { pattern: 42 },
      null,
      "string solta",
    ]);
    expect(compiled.matchers).toHaveLength(2);
    expect(compiled.rejected).toBe(10);
  });

  it("entrada que não é lista vira lista vazia", () => {
    expect(compileExcludePatterns(undefined)).toEqual({ matchers: [], rejected: 0 });
    expect(compileExcludePatterns({ pattern: "x" })).toEqual({ matchers: [], rejected: 0 });
  });

  it("literal ignora maiúsculas, acentos e espaços repetidos; não é regex", () => {
    const compiled = compileExcludePatterns([{ pattern: "transferência   exemplo" }, { pattern: "a.b" }]);
    expect(matchesUserExclusion("TRANSFERENCIA EXEMPLO 123", "BANK", compiled)).toBe(true);
    expect(matchesUserExclusion("axb", "BANK", compiled)).toBe(false);
    expect(matchesUserExclusion("loja a.b", "BANK", compiled)).toBe(true);
  });

  it("respeita o tipo de conta do padrão", () => {
    const compiled = compileExcludePatterns([{ pattern: "/^LOJA TESTE/", accountType: "CREDIT" }]);
    expect(matchesUserExclusion("LOJA TESTE 1", "CREDIT", compiled)).toBe(true);
    expect(matchesUserExclusion("LOJA TESTE 1", "BANK", compiled)).toBe(false);
  });

  it("regex permitida roda rápido em descrição longa", () => {
    const compiled = compileExcludePatterns([{ pattern: "/A+B+C+$/" }]);
    const started = Date.now();
    expect(matchesUserExclusion("A".repeat(5000) + "X", "BANK", compiled)).toBe(false);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("classifyPluggyTransaction", () => {
  const none = compileExcludePatterns([]);

  it("conta: débito é despesa, crédito é receita, transferência própria é TRANSFER", () => {
    expect(classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "LOJA EXEMPLO" }, none)).toEqual({
      type: "EXPENSE",
      creditKind: null,
      preDisposition: null,
    });
    expect(classifyPluggyTransaction({ accountType: "BANK", direction: "CREDIT", description: "PIX RECEBIDO EXEMPLO" }, none).type).toBe("INCOME");
    expect(
      classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "TRANSFERENCIA ENTRE CONTAS" }, none).type
    ).toBe("TRANSFER");
  });

  it("cartão: estorno é INCOME, pagamento é excluído, outro crédito vai para revisão", () => {
    expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "CREDIT", description: "ESTORNO LOJA EXEMPLO" }, none)).toEqual({
      type: "INCOME",
      creditKind: "refund",
      preDisposition: null,
    });
    for (const description of ["PAGAMENTO DE FATURA", "PAGAMENTO RECEBIDO", "PAGTO FATURA CARTAO", "INCLUSAO DE PAGAMENTO"]) {
      expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "CREDIT", description }, none)).toEqual({
        type: "TRANSFER",
        creditKind: "bill_payment",
        preDisposition: { disposition: "excluded", reasonCode: "bill_payment_credit" },
      });
    }
    expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "CREDIT", description: "AJUSTE EXEMPLO" }, none)).toEqual({
      type: "INCOME",
      creditKind: "unknown",
      preDisposition: { disposition: "needs_review", reasonCode: "credit_unknown" },
    });
  });

  it("estorno e pagamento juntos são ambíguos e vão para revisão", () => {
    const result = classifyPluggyTransaction(
      { accountType: "CREDIT", direction: "CREDIT", description: "ESTORNO PAGAMENTO FATURA" },
      none
    );
    expect(result.creditKind).toBe("unknown");
    expect(result.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "credit_unknown" });
  });

  it("débito no cartão com texto de estorno continua despesa", () => {
    const result = classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description: "ESTORNO EXEMPLO" }, none);
    expect(result).toEqual({ type: "EXPENSE", creditKind: null, preDisposition: null });
  });

  it("rotativo vai para revisão", () => {
    for (const accountType of ["CREDIT", "BANK"] as const) {
      expect(
        classifyPluggyTransaction({ accountType, direction: "DEBIT", description: "SALDO ROTATIVO" }, none).preDisposition
      ).toEqual({ disposition: "needs_review", reasonCode: "carryover" });
    }
  });

  it("padrão do usuário tem prioridade sobre as demais regras", () => {
    const patterns = compileExcludePatterns([{ pattern: "saldo rotativo" }]);
    expect(
      classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description: "SALDO ROTATIVO" }, patterns).preDisposition
    ).toEqual({ disposition: "excluded", reasonCode: "user_pattern" });
  });
});
