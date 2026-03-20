import Papa from "papaparse";
import { parseDate } from "./utils";
import { suggestCategory, detectInstallment } from "./categorizer";
import type { ImportedTransaction, Category } from "@/types";

type BankType = "c6" | "itau" | "btg" | "unknown";

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
}

function detectBank(headers: string[]): BankType {
  const headerStr = headers.join(",").toLowerCase();

  if (
    headerStr.includes("data") &&
    headerStr.includes("descricao") &&
    headerStr.includes("valor")
  ) {
    if (headerStr.includes("c6") || headerStr.includes("categoria")) {
      return "c6";
    }
  }

  if (
    headerStr.includes("data") &&
    headerStr.includes("lancamento") &&
    headerStr.includes("valor")
  ) {
    return "itau";
  }

  if (
    headerStr.includes("data") &&
    headerStr.includes("historico") &&
    headerStr.includes("valor")
  ) {
    return "btg";
  }

  // Default parsing if we have basic columns
  if (headerStr.includes("data") && headerStr.includes("valor")) {
    return "c6"; // Use C6 parser as default
  }

  return "unknown";
}

const C6_EXCHANGE_RATE_PATTERNS = [
  /cota[cç][aã]o/i,
  /\bCUUSD\b/,
  /\bCUEUR\b/,
  /\bSPREAD\b/i,
];

export function isC6ExchangeRateRow(description: string): boolean {
  return C6_EXCHANGE_RATE_PATTERNS.some((pattern) => pattern.test(description));
}

function parseC6Row(row: Record<string, string>): ParsedRow | null {
  const dateKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("data")
  );
  const descKey = Object.keys(row).find(
    (k) =>
      k.toLowerCase().includes("descricao") ||
      k.toLowerCase().includes("estabelecimento")
  );
  const amountKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("valor")
  );

  if (!dateKey || !descKey || !amountKey) return null;

  const date = row[dateKey]?.trim();
  const description = row[descKey]?.trim();
  let amount = row[amountKey]?.trim();

  if (!date || !description || !amount) return null;

  // Handle Brazilian number format (1.234,56)
  amount = amount.replace(/\./g, "").replace(",", ".");
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum)) return null;

  return {
    date,
    description,
    amount: amountNum,
  };
}

function parseItauRow(row: Record<string, string>): ParsedRow | null {
  const dateKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("data")
  );
  const descKey = Object.keys(row).find(
    (k) =>
      k.toLowerCase().includes("lancamento") ||
      k.toLowerCase().includes("descricao")
  );
  const amountKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("valor")
  );

  if (!dateKey || !descKey || !amountKey) return null;

  const date = row[dateKey]?.trim();
  const description = row[descKey]?.trim();
  let amount = row[amountKey]?.trim();

  if (!date || !description || !amount) return null;

  amount = amount.replace(/\./g, "").replace(",", ".");
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum)) return null;

  return {
    date,
    description,
    amount: amountNum,
  };
}

function parseBTGRow(row: Record<string, string>): ParsedRow | null {
  const dateKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("data")
  );
  const descKey = Object.keys(row).find(
    (k) =>
      k.toLowerCase().includes("historico") ||
      k.toLowerCase().includes("descricao")
  );
  const amountKey = Object.keys(row).find((k) =>
    k.toLowerCase().includes("valor")
  );

  if (!dateKey || !descKey || !amountKey) return null;

  const date = row[dateKey]?.trim();
  const description = row[descKey]?.trim();
  let amount = row[amountKey]?.trim();

  if (!date || !description || !amount) return null;

  amount = amount.replace(/\./g, "").replace(",", ".");
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum)) return null;

  return {
    date,
    description,
    amount: amountNum,
  };
}

export async function parseCSV(
  fileContent: string,
  origin: string
): Promise<ImportedTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            resolve([]);
            return;
          }

          const headers = results.meta.fields || [];
          const bankType = detectBank(headers);

          if (bankType === "unknown") {
            reject(
              new Error(
                "Formato de arquivo não reconhecido. Por favor, use um arquivo CSV do C6, Itaú ou BTG."
              )
            );
            return;
          }

          const transactions: ImportedTransaction[] = [];

          for (const row of results.data as Record<string, string>[]) {
            let parsed: ParsedRow | null = null;

            switch (bankType) {
              case "c6":
                parsed = parseC6Row(row);
                break;
              case "itau":
                parsed = parseItauRow(row);
                break;
              case "btg":
                parsed = parseBTGRow(row);
                break;
            }

            if (!parsed) continue;

            // Skip C6 exchange rate informational rows (cotação, spread, CUUSD)
            if (bankType === "c6" && isC6ExchangeRateRow(parsed.description)) {
              continue;
            }

            const installmentInfo = detectInstallment(parsed.description);
            const suggestedCategory = await suggestCategory(parsed.description);

            const transaction: ImportedTransaction = {
              description: parsed.description,
              amount: -Math.abs(parsed.amount), // Credit card expenses are always negative
              date: parseDate(parsed.date),
              suggestedCategoryId: suggestedCategory?.id,
              isInstallment: installmentInfo.isInstallment,
              currentInstallment: installmentInfo.currentInstallment,
              totalInstallments: installmentInfo.totalInstallments,
            };

            transactions.push(transaction);
          }

          resolve(transactions);
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

export type StatementType = "fatura" | "extrato";

/**
 * Detects whether a CSV is a credit card bill (fatura) or bank statement (extrato)
 * based on column headers.
 */
export function detectStatementType(headers: string[]): StatementType {
  const headerStr = headers.join(",").toLowerCase();

  // Extrato indicators: balance column, lancamento (Itaú), historico (BTG)
  if (
    headerStr.includes("saldo") ||
    headerStr.includes("lancamento") ||
    headerStr.includes("historico")
  ) {
    return "extrato";
  }

  // Fatura indicators: categoria (C6), estabelecimento
  if (
    headerStr.includes("categoria") ||
    headerStr.includes("estabelecimento")
  ) {
    return "fatura";
  }

  // Default: assume fatura (credit card bill) for generic CSV
  return "fatura";
}

export interface DetectedOriginResult {
  origin: string;
  bank: string | null;
  statementType: StatementType;
}

/**
 * Detects bank and statement type from CSV content and headers.
 * Returns appropriate origin name (e.g. "Cartão C6" or "Extrato C6").
 */
export function detectOriginFromCSV(
  content: string,
  headers: string[]
): DetectedOriginResult {
  const lowerContent = content.toLowerCase();
  const statementType = detectStatementType(headers);
  const prefix = statementType === "fatura" ? "Cartão" : "Extrato";

  let bank: string | null = null;

  if (lowerContent.includes("c6 bank") || lowerContent.includes("c6bank") || lowerContent.includes("c6")) {
    bank = "C6";
  } else if (lowerContent.includes("itau") || lowerContent.includes("itaú")) {
    bank = "Itaú";
  } else if (lowerContent.includes("btg")) {
    bank = "BTG";
  }

  const origin = bank ? `${prefix} ${bank}` : "Importação CSV";

  return { origin, bank, statementType };
}

/**
 * @deprecated Use detectOriginFromCSV() for richer detection.
 */
export function detectBankFromContent(content: string): string {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes("c6 bank") || lowerContent.includes("c6bank")) {
    return "Cartão C6";
  }

  if (lowerContent.includes("itau") || lowerContent.includes("itaú")) {
    return "Cartão Itaú";
  }

  if (lowerContent.includes("btg")) {
    return "Cartão BTG";
  }

  return "Importação CSV";
}
