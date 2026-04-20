import { Type, type Schema } from "@google/genai";

/**
 * Schema endurecido (Oracle review):
 * - transactionKind como enum fechado (evita string livre inventada)
 * - amount com minimum: 0 (valores absolutos, não-negativos)
 * - date com format: "date" em adição ao pattern
 * - documentConfidence no topo para gate de acceptance
 * - ordering explícito para estabilidade
 */
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
    documentConfidence: {
      type: Type.NUMBER,
      minimum: 0,
      maximum: 1,
      description:
        "Confiança [0.0, 1.0] de que este documento É REALMENTE uma fatura/extrato bancário. Use <0.5 se for provavelmente outra coisa (print de tela, notificação push, documento ilegível). Valores altos (>=0.8) só para documentos claramente bancários.",
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
            minimum: 0,
            description: "Valor absoluto em BRL, sempre positivo.",
          },
          date: {
            type: Type.STRING,
            format: "date",
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
            enum: ["compra", "transferencia", "pagamento", "taxa", "estorno", "outro"],
            description:
              "Classificação da transação. Use 'outro' se não souber.",
          },
        },
        required: ["description", "amount", "date", "type"],
        propertyOrdering: ["description", "amount", "date", "type", "transactionKind"],
      },
    },
  },
  required: ["bank", "documentType", "transactions"],
  propertyOrdering: ["bank", "documentType", "documentConfidence", "transactions"],
};

export interface AiInvoiceOutput {
  bank: string;
  documentType: "fatura_cartao" | "extrato_bancario" | "desconhecido";
  /** Confiança [0, 1] do próprio modelo de que o doc é mesmo um extrato/fatura. */
  documentConfidence?: number;
  transactions: Array<{
    description: string;
    amount: number;
    date: string;
    type: "INCOME" | "EXPENSE";
    transactionKind?: "compra" | "transferencia" | "pagamento" | "taxa" | "estorno" | "outro";
  }>;
}
