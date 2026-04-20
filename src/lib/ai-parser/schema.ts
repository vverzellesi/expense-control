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
