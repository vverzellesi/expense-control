import { describe, expect, it } from "vitest";
import { amountRange, MAX_DESCRIPTION_LENGTH, minimizeDescription } from "./redact";

describe("minimizeDescription", () => {
  it("mantém descrição comum, só normalizando espaços", () => {
    expect(minimizeDescription("  LOJA   EXEMPLO  ")).toBe("LOJA EXEMPLO");
  });

  it("remove CPF com e sem pontuação", () => {
    expect(minimizeDescription("LOJA EXEMPLO 123.456.789-00")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO 12345678900")).toBe("LOJA EXEMPLO");
  });

  it("remove CNPJ com e sem pontuação", () => {
    expect(minimizeDescription("MERCADO TESTE 12.345.678/0001-00")).toBe("MERCADO TESTE");
    expect(minimizeDescription("MERCADO TESTE 12345678000100")).toBe("MERCADO TESTE");
  });

  it("remove telefones", () => {
    expect(minimizeDescription("PADARIA FICTICIA (11) 98765-4321")).toBe("PADARIA FICTICIA");
    expect(minimizeDescription("PADARIA FICTICIA +55 11 98765-4321")).toBe("PADARIA FICTICIA");
    expect(minimizeDescription("PADARIA FICTICIA 4000-0000")).toBe("PADARIA FICTICIA");
  });

  it("remove e-mails", () => {
    expect(minimizeDescription("SERVICO EXEMPLO contato@example.test")).toBe("SERVICO EXEMPLO");
  });

  it("remove sequências de 6 ou mais dígitos, inclusive separadas", () => {
    expect(minimizeDescription("LOJA EXEMPLO PEDIDO 123456")).toBe("LOJA EXEMPLO PEDIDO");
    expect(minimizeDescription("LOJA EXEMPLO 1234 5678 9012")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO 12/03/2026")).toBe("LOJA EXEMPLO");
  });

  it("preserva números curtos, como filial", () => {
    expect(minimizeDescription("LOJA EXEMPLO 0123")).toBe("LOJA EXEMPLO 0123");
  });

  it("remove dia/mês, marcador de parcela e valores com centavos", () => {
    expect(minimizeDescription("LOJA EXEMPLO 12/03")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO 3/10")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO R$ 37,42")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO 1.234,56")).toBe("LOJA EXEMPLO");
    expect(minimizeDescription("LOJA EXEMPLO 12.345.678,90")).toBe("LOJA EXEMPLO");
  });

  it("remove caracteres de controle", () => {
    expect(minimizeDescription("LOJA\nEXEMPLO\u0000")).toBe("LOJA EXEMPLO");
  });

  it("trunca em 80 caracteres", () => {
    const out = minimizeDescription("LOJA " + "A".repeat(200));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
  });

  it("deixa fora o que fica com menos de 3 letras", () => {
    expect(minimizeDescription("AB 123456789")).toBeNull();
    expect(minimizeDescription("123.456.789-00")).toBeNull();
    expect(minimizeDescription("   ")).toBeNull();
  });

  it("deixa fora referências de transferência (podem trazer nome de pessoa)", () => {
    expect(minimizeDescription("PIX FULANO DE TAL")).toBeNull();
    expect(minimizeDescription("TED PESSOA EXEMPLO")).toBeNull();
    expect(minimizeDescription("TRANSFERENCIA PESSOA EXEMPLO")).toBeNull();
    expect(minimizeDescription("PIXEL STUDIO EXEMPLO")).toBe("PIXEL STUDIO EXEMPLO");
  });

  it("deixa fora carteira de pagamento entre pessoas", () => {
    expect(minimizeDescription("PICPAY*PESSOA EXEMPLO")).toBeNull();
    expect(minimizeDescription("PIC PAY *PESSOA EXEMPLO")).toBeNull();
  });

  it("com includePeople, transferência e carteira entram, ainda sem identificadores", () => {
    const opts = { includePeople: true };
    expect(minimizeDescription("PIX FULANO DE TAL", opts)).toBe("PIX FULANO DE TAL");
    expect(minimizeDescription("PICPAY*PESSOA EXEMPLO", opts)).toBe("PICPAY*PESSOA EXEMPLO");
    expect(minimizeDescription("TED PESSOA EXEMPLO 123.456.789-00 (11) 98765-4321 pessoa@example.test 1234567", opts)).toBe(
      "TED PESSOA EXEMPLO"
    );
    expect(minimizeDescription("PIX 12.345.678/0001-00", opts)).toBe("PIX");
  });

  it("conta letras acentuadas", () => {
    expect(minimizeDescription("ÁÉÍ")).toBe("ÁÉÍ");
  });
});

describe("amountRange", () => {
  it("classifica em faixas, pelo módulo do valor", () => {
    expect(amountRange(100)).toBe("até 50");
    expect(amountRange(5000)).toBe("até 50");
    expect(amountRange(5001)).toBe("50 a 200");
    expect(amountRange(-20000)).toBe("50 a 200");
    expect(amountRange(20001)).toBe("200 a 1000");
    expect(amountRange(100000)).toBe("200 a 1000");
    expect(amountRange(100001)).toBe("acima de 1000");
  });
});
