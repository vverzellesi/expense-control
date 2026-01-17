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
                "Formato de arquivo nao reconhecido. Por favor, use um arquivo CSV do C6, Itau ou BTG."
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

export function detectBankFromContent(content: string): string {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes("c6 bank") || lowerContent.includes("c6bank")) {
    return "Cartao C6";
  }

  if (lowerContent.includes("itau") || lowerContent.includes("itaú")) {
    return "Cartao Itau";
  }

  if (lowerContent.includes("btg")) {
    return "Cartao BTG";
  }

  return "Importacao CSV";
}
