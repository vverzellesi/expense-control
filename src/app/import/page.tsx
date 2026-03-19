"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Upload,
  FileText,
  Check,
  Image,
  FileSpreadsheet,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  Pencil,
  RefreshCw,
  Repeat,
  AlertTriangle,
  Info,
  CreditCard,
  Receipt,
  Ban,
  Link2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { detectTransfer, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import type { Category, ImportedTransaction, TransactionType, SpecialTransactionType, CategoryTag } from "@/types";

// Detecta transações especiais de cartão de crédito
function detectSpecialTransaction(description: string): { type: SpecialTransactionType; warning: string } | null {
  const upperDesc = description.toUpperCase();

  // Pagamento de fatura (crédito na fatura)
  if (
    upperDesc.includes("INCLUSAO DE PAGAMENTO") ||
    upperDesc.includes("PAGAMENTO RECEBIDO") ||
    upperDesc.includes("PAGTO RECEBIDO") ||
    upperDesc.includes("CREDITO PAGAMENTO") ||
    upperDesc.includes("PAGAMENTO FATURA") ||
    upperDesc.includes("PAG FATURA")
  ) {
    return {
      type: "BILL_PAYMENT",
      warning: "Este é um registro de pagamento da fatura anterior. Normalmente deve ser ignorado ou tratado como crédito."
    };
  }

  // Parcelamento de fatura (refinanciamento)
  if (
    upperDesc.includes("PARCELAMENTO DE FATURA") ||
    upperDesc.includes("PARCELAMENTO FATURA") ||
    upperDesc.includes("FATURA PARCELADA") ||
    upperDesc.includes("REPARCELAMENTO") ||
    upperDesc.includes("REFINANCIAMENTO")
  ) {
    return {
      type: "FINANCING",
      warning: "Este é um parcelamento/refinanciamento de dívida. O valor original já foi contabilizado anteriormente."
    };
  }

  // Estorno
  if (
    upperDesc.includes("ESTORNO") ||
    upperDesc.includes("DEVOLUCAO") ||
    upperDesc.includes("CANCELAMENTO") ||
    upperDesc.includes("REEMBOLSO") ||
    upperDesc.includes("CHARGEBACK")
  ) {
    return {
      type: "REFUND",
      warning: "Este é um estorno/devolução. O valor será creditado (positivo)."
    };
  }

  // Taxas e tarifas
  if (
    upperDesc.includes("ANUIDADE") ||
    upperDesc.includes("TARIFA") ||
    (upperDesc.includes("TAXA") && !upperDesc.includes("TAXAS DE"))
  ) {
    return {
      type: "FEE",
      warning: "Esta é uma tarifa/anuidade do cartão."
    };
  }

  // IOF (transações internacionais)
  if (
    upperDesc.includes(" IOF") ||
    upperDesc.includes("IOF ") ||
    upperDesc.includes("IMPOSTO IOF")
  ) {
    return {
      type: "IOF",
      warning: "Este é o IOF de uma transação internacional."
    };
  }

  // Spread de cotação (transações internacionais)
  if (
    upperDesc.includes("COTACAO") ||
    upperDesc.includes("COTAÇÃO") ||
    upperDesc.includes("SPREAD") ||
    upperDesc.includes("CUUSD") ||
    upperDesc.includes("CUEUR")
  ) {
    return {
      type: "CURRENCY_SPREAD",
      warning: "Este é o spread de cotação de uma transação internacional."
    };
  }

  return null;
}

type ExtendedTransaction = ImportedTransaction & {
  categoryId?: string;
  selected: boolean;
  transactionKind?: string;
  isEditing?: boolean;
  editedDescription?: string;
  isRecurring?: boolean;
  recurringName?: string;
  originalDate?: Date;
  isDuplicate?: boolean;
  specialType?: SpecialTransactionType;
  specialTypeWarning?: string;
  isRelatedInstallment?: boolean;
  relatedInstallmentInfo?: {
    relatedTransactionId: string;
    relatedDescription: string;
    relatedInstallment: number;
  };
  // Recurring match fields
  recurringMatchId?: string;
  recurringMatchDescription?: string;
  recurringAlreadyGenerated?: boolean;
  // Category tag fields
  categoryTagId?: string;
  categoryTagName?: string;
};

export default function ImportPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTags, setCategoryTags] = useState<CategoryTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [transactions, setTransactions] = useState<ExtendedTransaction[]>([]);
  const [origin, setOrigin] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [fileType, setFileType] = useState<"csv" | "ocr" | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [lastImportBatchId, setLastImportBatchId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!invoiceMonth || transactions.length === 0) return;

    const [year, month] = invoiceMonth.split("-").map(Number);

    setTransactions(prev => prev.map(t => {
      if (t.isInstallment) {
        const originalDate = t.originalDate || t.date;
        const day = originalDate instanceof Date ? originalDate.getDate() : new Date(originalDate).getDate();
        const adjustedDate = new Date(year, month - 1, day);
        return {
          ...t,
          originalDate: t.originalDate || t.date,
          date: adjustedDate,
        };
      }
      return t;
    }));
  }, [invoiceMonth]);

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);

    const tagsRes = await fetch("/api/category-tags");
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      setCategoryTags(tagsData);
    }
  }

  async function checkDuplicates(parsedTransactions: ExtendedTransaction[]) {
    try {
      const res = await fetch("/api/transactions/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date instanceof Date ? t.date.toISOString() : t.date,
            isInstallment: t.isInstallment,
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
          })),
          origin,
        }),
      });

      const data = await res.json();

      // Build a map of related installments by index
      const relatedMap = new Map<number, typeof data.relatedInstallments[0]>();
      if (data.relatedInstallments) {
        for (const ri of data.relatedInstallments) {
          relatedMap.set(ri.index, ri);
        }
      }

      let updatedTransactions = parsedTransactions.map((t, index) => {
        const related = relatedMap.get(index);
        return {
          ...t,
          isDuplicate: data.duplicates.includes(index),
          selected: !data.duplicates.includes(index), // Auto-deselect duplicates only
          isRelatedInstallment: !!related,
          relatedInstallmentInfo: related ? {
            relatedTransactionId: related.relatedTransactionId,
            relatedDescription: related.relatedDescription,
            relatedInstallment: related.relatedInstallment,
          } : undefined,
        };
      });

      if (data.hasDuplicates) {
        toast({
          title: "Possíveis duplicatas detectadas",
          description: `${data.duplicates.length} transação(ões) podem já existir no sistema`,
          variant: "destructive",
        });
      }

      if (data.hasRelatedInstallments) {
        toast({
          title: "Parcelas relacionadas encontradas",
          description: `${data.relatedInstallments.length} parcela(s) são continuação de compras existentes`,
        });
      }

      return updatedTransactions;
    } catch (error) {
      console.error("Error checking duplicates:", error);
      return parsedTransactions;
    }
  }

  async function checkRecurringMatches(parsedTransactions: ExtendedTransaction[]) {
    try {
      const res = await fetch("/api/transactions/check-recurring-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date instanceof Date ? t.date.toISOString() : t.date,
          })),
          origin,
        }),
      });

      if (!res.ok) return parsedTransactions;

      const data = await res.json();

      if (!data.hasMatches) return parsedTransactions;

      const matchMap = new Map<number, typeof data.matches[0]>();
      for (const match of data.matches) {
        matchMap.set(match.index, match);
      }

      return parsedTransactions.map((t, index) => {
        const match = matchMap.get(index);
        if (!match) return t;

        return {
          ...t,
          recurringMatchId: match.recurringExpenseId,
          recurringMatchDescription: match.recurringDescription,
          recurringAlreadyGenerated: match.hasExistingTransaction,
          // Deselect if recurring already has transaction for this month
          selected: match.hasExistingTransaction ? false : t.selected,
        };
      });
    } catch (error) {
      console.error("Error checking recurring matches:", error);
      return parsedTransactions;
    }
  }

  function getFileType(file: File): "csv" | "ocr" {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return "csv";
    return "ocr";
  }

  async function processFile(file: File) {
    const type = getFileType(file);
    setFileType(type);
    setLoading(true);
    setOcrProgress(0);

    try {
      if (type === "csv") {
        await processCSV(file);
      } else {
        await processOCR(file);
      }
    } catch (error) {
      toast({
        title: "Erro ao processar arquivo",
        description:
          error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOcrProgress(0);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".csv", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValid) {
      toast({
        title: "Formato não suportado",
        description: "Use arquivos CSV, PDF ou imagens (PNG, JPG)",
        variant: "destructive",
      });
      return;
    }

    await processFile(file);
  }

  async function processCSV(file: File) {
    const text = await file.text();

    // Detect bank from content
    const lowerContent = text.toLowerCase();
    let detectedOrigin = "Importação CSV";

    if (lowerContent.includes("c6") || file.name.toLowerCase().includes("c6")) {
      detectedOrigin = "Cartão C6";
    } else if (
      lowerContent.includes("itau") ||
      lowerContent.includes("itaú") ||
      file.name.toLowerCase().includes("itau")
    ) {
      detectedOrigin = "Cartão Itaú";
    } else if (
      lowerContent.includes("btg") ||
      file.name.toLowerCase().includes("btg")
    ) {
      detectedOrigin = "Cartão BTG";
    }

    setOrigin(detectedOrigin);

    // Parse CSV locally
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("Arquivo vazio ou inválido");
    }

    const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
    const dateIndex = headers.findIndex(
      (h) => h.includes("data") || h === "date"
    );
    const descIndex = headers.findIndex(
      (h) =>
        h.includes("descricao") ||
        h.includes("estabelecimento") ||
        h.includes("lancamento") ||
        h.includes("historico") ||
        h === "description"
    );
    const amountIndex = headers.findIndex(
      (h) => h.includes("valor") || h === "amount" || h === "value"
    );

    if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) {
      throw new Error(
        "Formato de arquivo não reconhecido. Certifique-se de que o CSV possui colunas de data, descrição e valor."
      );
    }

    const parsedTransactions: ExtendedTransaction[] = [];

    // Fetch rules for categorization
    const rulesRes = await fetch("/api/rules");
    const rules = await rulesRes.json();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map((v) => v.trim().replace(/"/g, ""));

      if (values.length <= Math.max(dateIndex, descIndex, amountIndex)) continue;

      const dateStr = values[dateIndex];
      const description = values[descIndex];
      let amountStr = values[amountIndex];

      if (!dateStr || !description || !amountStr) continue;

      // Parse date (handle DD/MM/YYYY format)
      let date: Date;
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          const [day, month, year] = parts;
          date = new Date(
            parseInt(year.length === 2 ? `20${year}` : year),
            parseInt(month) - 1,
            parseInt(day)
          );
        } else {
          date = new Date(dateStr);
        }
      } else {
        date = new Date(dateStr);
      }

      if (isNaN(date.getTime())) continue;

      // Parse amount (handle Brazilian format)
      amountStr = amountStr.replace(/\./g, "").replace(",", ".");
      const amount = parseFloat(amountStr);

      if (isNaN(amount)) continue;

      // Check for installment pattern using the improved detectInstallment function
      const installmentInfo = detectInstallment(description);
      const isInstallment = installmentInfo.isInstallment;
      const currentInstallment = installmentInfo.currentInstallment;
      const totalInstallments = installmentInfo.totalInstallments;

      // Check for recurring pattern (activate dead badge)
      const recurringInfo = detectRecurringTransaction(description);

      // Check for transfer pattern (credit card bill payment, internal transfer)
      const isTransfer = detectTransfer(description);

      // Detect special transaction types (bill payments, financing, etc.)
      const specialTx = detectSpecialTransaction(description);

      // Find category by rules
      let categoryId: string | undefined;
      const upperDesc = description.toUpperCase();
      for (const rule of rules) {
        if (upperDesc.includes(rule.keyword.toUpperCase())) {
          categoryId = rule.categoryId;
          break;
        }
      }

      // Default to "Outros" category if no rule matched (except for transfers and special types)
      if (!categoryId && !isTransfer && !specialTx) {
        const outrosCategory = categories.find(c => c.name === "Outros");
        categoryId = outrosCategory?.id;
      }

      // Determine transaction type based on special type detection
      let transactionType: TransactionType = "EXPENSE";
      let finalAmount = amount;

      if (specialTx) {
        switch (specialTx.type) {
          case "BILL_PAYMENT":
            // Bill payments should be positive (credit) or ignored
            // If the CSV shows as negative (expense), it's wrong - should be positive
            transactionType = "INCOME";
            finalAmount = Math.abs(amount);
            break;
          case "REFUND":
            // Refunds are credits
            transactionType = "INCOME";
            finalAmount = Math.abs(amount);
            break;
          case "FINANCING":
            // Financing is a special case - it's technically an expense but represents
            // refinanced debt, not new spending
            transactionType = "EXPENSE";
            finalAmount = -Math.abs(amount);
            break;
          case "FEE":
          case "IOF":
          case "CURRENCY_SPREAD":
            // Fees are expenses
            transactionType = "EXPENSE";
            finalAmount = -Math.abs(amount);
            break;
        }
      } else if (isTransfer) {
        transactionType = "TRANSFER";
        finalAmount = amount; // Keep original sign
      } else if (amount > 0) {
        transactionType = "INCOME";
        finalAmount = Math.abs(amount);
      } else {
        transactionType = "EXPENSE";
        finalAmount = -Math.abs(amount);
      }

      // Match category tag
      let categoryTagId: string | undefined;
      let categoryTagName: string | undefined;
      if (categoryId) {
        const tagMatch = matchTag(description, categoryId);
        if (tagMatch) {
          categoryTagId = tagMatch.id;
          categoryTagName = tagMatch.name;
        }
      }

      // Auto-deselect bill payments (they shouldn't be imported as regular transactions)
      const shouldBeSelected = specialTx?.type !== "BILL_PAYMENT";

      parsedTransactions.push({
        description,
        amount: finalAmount,
        date,
        type: transactionType,
        isInstallment,
        currentInstallment,
        totalInstallments,
        categoryId,
        suggestedCategoryId: categoryId,
        selected: shouldBeSelected,
        isRecurring: recurringInfo.isRecurring,
        recurringName: recurringInfo.recurringName,
        specialType: specialTx?.type,
        specialTypeWarning: specialTx?.warning,
        categoryTagId,
        categoryTagName,
      });
    }

    if (parsedTransactions.length === 0) {
      throw new Error("Nenhuma transação encontrada no arquivo");
    }

    // Check for duplicates
    const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
    // Check for recurring matches
    const transactionsWithRecurring = await checkRecurringMatches(transactionsWithDuplicates);
    setTransactions(transactionsWithRecurring);
    setStep("preview");
  }

  async function processOCR(file: File) {
    // Simulate progress while waiting for OCR
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

      if (!res.ok) {
        throw new Error(data.error || "Erro ao processar arquivo");
      }

      setOrigin(data.origin);
      setOcrConfidence(data.confidence);
      const parsedTransactions = data.transactions.map((t: ExtendedTransaction) => ({
        ...t,
        date: new Date(t.date),
        selected: true,
      }));
      // Check for duplicates
      const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
      setTransactions(transactionsWithDuplicates);
      setStep("preview");
    } finally {
      clearInterval(progressInterval);
    }
  }

  function updateTransaction(index: number, updates: Partial<ExtendedTransaction>) {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...updates } : t))
    );
  }

  function startEditing(index: number) {
    setTransactions((prev) =>
      prev.map((t, i) =>
        i === index
          ? { ...t, isEditing: true, editedDescription: t.description }
          : t
      )
    );
  }

  function saveEdit(index: number) {
    setTransactions((prev) =>
      prev.map((t, i) =>
        i === index
          ? {
              ...t,
              description: t.editedDescription || t.description,
              isEditing: false,
            }
          : t
      )
    );
  }

  function cancelEdit(index: number) {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, isEditing: false } : t))
    );
  }

  function toggleAll(selected: boolean) {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected })));
  }

  function removeTransaction(index: number) {
    setTransactions((prev) => prev.filter((_, i) => i !== index));
  }

  function extractKeyword(description: string): string {
    // Remove known prefixes from bank statements
    let keyword = description
      .replace(/^(IFD\*|MP\s*\*|EC\s*\*|PDV\*|PG\s*\*|PAG\*|PIX\s+)/i, "")
      .trim();

    // Remove trailing installment info
    keyword = keyword
      .replace(/\s*[-–]\s*Parcela.*$/i, "")
      .replace(/\s*\d+\s*[\/\\]\s*\d+\s*$/i, "")
      .trim();

    // Remove trailing transaction codes (common in bank statements)
    keyword = keyword
      .replace(/\s+\d{6,}$/i, "")  // trailing numbers (6+ digits)
      .replace(/\s+[A-Z]{2,3}\d{2,}$/i, "")  // codes like "SP01234"
      .trim();

    // Take first meaningful words (max 3 words, at least 3 chars each)
    const words = keyword.split(/\s+/).filter(w => w.length >= 3);
    if (words.length > 3) {
      keyword = words.slice(0, 3).join(" ");
    }

    return keyword;
  }

  function matchTag(description: string, categoryId: string): { id: string; name: string } | null {
    const tagsForCategory = categoryTags.filter(t => t.categoryId === categoryId);
    if (tagsForCategory.length === 0) return null;

    const upperDesc = description.toUpperCase();
    const matches = tagsForCategory.filter(tag => {
      const keywords = tag.keywords.split(",").map(k => k.trim().toUpperCase()).filter(k => k.length > 0);
      return keywords.some(keyword => upperDesc.includes(keyword));
    });

    if (matches.length === 1) {
      return { id: matches[0].id, name: matches[0].name };
    }
    return null;
  }

  async function suggestRule(description: string, categoryId: string) {
    const keyword = extractKeyword(description);
    if (keyword.length < 3) return;

    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    toast({
      title: "Criar regra de categorização?",
      description: `"${keyword.toUpperCase()}" → ${category.name}`,
      action: (
        <ToastAction
          altText="Criar regra"
          onClick={async () => {
            try {
              const res = await fetch("/api/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  keyword: keyword.toUpperCase(),
                  categoryId,
                }),
              });

              if (res.ok) {
                toast({
                  title: "Regra criada",
                  description: `Transações com "${keyword.toUpperCase()}" serão categorizadas automaticamente`,
                });
              }
            } catch (error) {
              console.error("Error creating rule:", error);
            }
          }}
        >
          Criar regra
        </ToastAction>
      ),
    });
  }

  async function suggestTag(description: string, categoryId: string, transactionIndex?: number) {
    // Don't suggest if a tag already matches
    const existingMatch = matchTag(description, categoryId);
    if (existingMatch) return;

    const keyword = extractKeyword(description);
    if (keyword.length < 3) return;

    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    toast({
      title: "Criar tag para esta categoria?",
      description: `"${keyword}" em ${category.name}`,
      action: (
        <ToastAction
          altText="Criar tag"
          onClick={async () => {
            try {
              const res = await fetch("/api/category-tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: keyword,
                  keywords: keyword.toLowerCase(),
                  categoryId,
                }),
              });

              if (res.ok) {
                const newTag = await res.json();
                setCategoryTags(prev => [...prev, newTag]);
                // Retroactively assign the new tag to the transaction that triggered this
                if (transactionIndex !== undefined) {
                  updateTransaction(transactionIndex, {
                    categoryTagId: newTag.id,
                    categoryTagName: newTag.name,
                  });
                }
                toast({
                  title: "Tag criada",
                  description: `Tag "${keyword}" adicionada em ${category.name}`,
                });
              }
            } catch (error) {
              console.error("Error creating tag:", error);
            }
          }}
        >
          Criar tag
        </ToastAction>
      ),
    });
  }

  function getConfidenceBadge(confidence?: number) {
    if (confidence === undefined) return null;

    if (confidence >= 90) {
      return <Badge className="bg-green-100 text-green-800">Alta</Badge>;
    } else if (confidence >= 70) {
      return <Badge className="bg-yellow-100 text-yellow-800">Média</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Baixa</Badge>;
    }
  }

  async function handleImport() {
    const selectedTransactions = transactions.filter((t) => t.selected);

    if (selectedTransactions.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma transação para importar",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: selectedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date,
            type: t.type || "EXPENSE",
            categoryId: t.categoryId,
            isInstallment: t.isInstallment,
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
            recurringExpenseId: t.recurringMatchId || undefined,
            categoryTagId: t.categoryTagId || undefined,
          })),
          origin,
        }),
      });

      if (!res.ok) {
        throw new Error("Erro ao importar transações");
      }

      const data = await res.json();

      toast({
        title: "Sucesso",
        description: `${data.count} transações importadas com sucesso`,
      });

      setLastImportBatchId(data.importBatchId || null);
      setStep("done");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao importar as transações",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  function resetForm() {
    setStep("upload");
    setTransactions([]);
    setOrigin("");
    setOcrConfidence(null);
    setFileType(null);
  }

  const selectedCount = transactions.filter((t) => t.selected).length;
  const incomeCount = transactions.filter(
    (t) => t.selected && t.type === "INCOME" && !t.specialType
  ).length;
  const expenseCount = transactions.filter(
    (t) => t.selected && t.type === "EXPENSE" && !t.specialType
  ).length;
  const transferCount = transactions.filter(
    (t) => t.selected && t.type === "TRANSFER"
  ).length;
  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;
  const relatedInstallmentCount = transactions.filter((t) => t.isRelatedInstallment).length;
  const recurringAlreadyCount = transactions.filter((t) => t.recurringAlreadyGenerated).length;
  const recurringMatchCount = transactions.filter((t) => t.recurringMatchId && !t.recurringAlreadyGenerated).length;
  const specialCount = transactions.filter((t) => t.specialType).length;
  const billPaymentCount = transactions.filter((t) => t.specialType === "BILL_PAYMENT").length;
  const financingCount = transactions.filter((t) => t.specialType === "FINANCING").length;
  const totalIncomeAmount = transactions
    .filter((t) => t.selected && t.type === "INCOME" && !t.specialType)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalExpenseAmount = transactions
    .filter((t) => t.selected && t.type === "EXPENSE" && !t.specialType)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalSelectedAmount = transactions
    .filter((t) => t.selected)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Transações</h1>
        <p className="text-gray-500">
          Importe transações de arquivos CSV, PDF ou imagens de extratos
        </p>
      </div>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div
                className={`flex items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  <div className={`mx-auto flex justify-center gap-4 ${isDragging ? "text-primary" : "text-gray-400"}`}>
                    <FileSpreadsheet className="h-10 w-10" />
                    <FileText className="h-10 w-10" />
                    <Image className="h-10 w-10" />
                  </div>
                  <div className="mt-4">
                    {isDragging ? (
                      <p className="text-sm font-medium text-primary">Solte o arquivo aqui</p>
                    ) : (
                      <>
                        <Label
                          htmlFor="file"
                          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                        >
                          {loading ? "Processando..." : "Selecionar arquivo"}
                        </Label>
                        <Input
                          id="file"
                          type="file"
                          accept=".csv,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                          onChange={handleFileUpload}
                          disabled={loading}
                          className="hidden"
                        />
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {isDragging ? "Arquivos suportados: CSV, PDF, PNG, JPG" : "Arraste um arquivo ou clique para selecionar"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Bancos: C6, Itaú, BTG, Nubank, Bradesco, Santander, BB, Caixa
                  </p>
                </div>
              </div>

              {loading && fileType === "ocr" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Processando OCR...</span>
                    <span className="text-gray-500">{ocrProgress}%</span>
                  </div>
                  <Progress value={ocrProgress} className="h-2" />
                  <p className="text-xs text-gray-400">
                    O processamento de imagens pode levar alguns segundos
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Preview das Transações</span>
                <div className="flex items-center gap-2">
                  {ocrConfidence !== null && (
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-gray-500">Confiança OCR:</span>
                      {getConfidenceBadge(ocrConfidence)}
                    </div>
                  )}
                  <Badge variant="outline">{origin}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>
                      {selectedCount} de {transactions.length} selecionadas
                    </span>
                    {selectedCount > 0 && (
                      <span className="font-semibold">
                        Total: {formatCurrency(totalSelectedAmount)}
                      </span>
                    )}
                    {duplicateCount > 0 && (
                      <span className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-4 w-4" />
                        {duplicateCount} possível(eis) duplicata(s)
                      </span>
                    )}
                    {relatedInstallmentCount > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Link2 className="h-4 w-4" />
                        {relatedInstallmentCount} parcela(s) relacionada(s)
                      </span>
                    )}
                    {recurringAlreadyCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <RefreshCw className="h-4 w-4" />
                        {recurringAlreadyCount} recorrente(s) já gerada(s)
                      </span>
                    )}
                    {recurringMatchCount > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Link2 className="h-4 w-4" />
                        {recurringMatchCount} a vincular com recorrente
                      </span>
                    )}
                    {incomeCount > 0 && (
                      <span className="flex items-center gap-1">
                        <ArrowDownCircle className="h-4 w-4 text-green-500" />
                        {incomeCount} entrada{incomeCount !== 1 ? 's' : ''} ({formatCurrency(totalIncomeAmount)})
                      </span>
                    )}
                    {expenseCount > 0 && (
                      <span className="flex items-center gap-1">
                        <ArrowUpCircle className="h-4 w-4 text-red-500" />
                        {expenseCount} despesa{expenseCount !== 1 ? 's' : ''} ({formatCurrency(totalExpenseAmount)})
                      </span>
                    )}
                    {transferCount > 0 && (
                      <span className="flex items-center gap-1">
                        <ArrowLeftRight className="h-4 w-4 text-gray-500" />
                        {transferCount} transferencia{transferCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAll(true)}
                    >
                      Selecionar todas
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAll(false)}
                    >
                      Desmarcar todas
                    </Button>
                  </div>
                </div>

                {transactions.some(t => t.isInstallment) && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Label htmlFor="invoiceMonth" className="text-sm font-medium text-blue-700 whitespace-nowrap">
                      Mês da Fatura:
                    </Label>
                    <Input
                      id="invoiceMonth"
                      type="month"
                      value={invoiceMonth}
                      onChange={(e) => setInvoiceMonth(e.target.value)}
                      className="w-40 h-8"
                      placeholder="Selecione"
                    />
                    <span className="text-xs text-blue-600">
                      As datas das parcelas serão ajustadas para este mês
                    </span>
                  </div>
                )}

                {specialCount > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-start gap-2">
                      <Info className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-amber-800">
                          Transações especiais detectadas ({specialCount})
                        </p>
                        <ul className="text-xs text-amber-700 space-y-1">
                          {billPaymentCount > 0 && (
                            <li className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              <strong>{billPaymentCount}</strong> pagamento(s) de fatura - desmarcados automaticamente
                            </li>
                          )}
                          {financingCount > 0 && (
                            <li className="flex items-center gap-1">
                              <Receipt className="h-3 w-3" />
                              <strong>{financingCount}</strong> parcelamento(s) de fatura - verifique se deve importar
                            </li>
                          )}
                          {(specialCount - billPaymentCount - financingCount) > 0 && (
                            <li className="flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              <strong>{specialCount - billPaymentCount - financingCount}</strong> outras transações especiais (IOF, taxas, estornos)
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 max-h-[500px] overflow-auto">
                {transactions.map((t, index) => {
                  const isExpanded = expandedCard === index;
                  const amountColor =
                    t.type === "INCOME"
                      ? "text-green-600"
                      : t.type === "TRANSFER"
                      ? "text-gray-400"
                      : "text-red-600";
                  const category = categories.find((c) => c.id === t.categoryId);

                  return (
                    <div
                      key={index}
                      className={`rounded-lg border bg-white p-4 ${
                        t.selected ? "" : "opacity-50"
                      }`}
                    >
                      {/* Header with checkbox */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={t.selected}
                          onChange={(e) =>
                            updateTransaction(index, {
                              selected: e.target.checked,
                            })
                          }
                          className="h-4 w-4 mt-1"
                        />
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => setExpandedCard(isExpanded ? null : index)}
                        >
                          {/* Row 1: Category dot + Description */}
                          <div className="flex items-start gap-2 mb-2">
                            {category && (
                              <div
                                className="h-3 w-3 rounded-full mt-1 flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                            )}
                            <p className="font-medium text-gray-900 truncate flex-1">
                              {t.description}
                            </p>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </div>

                          {/* Row 2: Date and Amount */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-500">
                                {formatDate(t.date)}
                              </span>
                              {t.isInstallment && t.originalDate && (
                                <span className="text-xs text-gray-400">
                                  Compra: {formatDate(t.originalDate)}
                                </span>
                              )}
                            </div>
                            <span className={`font-semibold ${amountColor}`}>
                              {formatCurrency(t.amount)}
                            </span>
                          </div>

                          {/* Row 3: Badges */}
                          <div className="flex flex-wrap items-center gap-1">
                            {t.isDuplicate && (
                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Duplicata
                              </Badge>
                            )}
                            {t.isInstallment && (
                              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                <Repeat className="h-3 w-3 mr-1" />
                                {t.currentInstallment && t.totalInstallments
                                  ? `${t.currentInstallment}/${t.totalInstallments}`
                                  : "Parcela"}
                              </Badge>
                            )}
                            {t.isRecurring && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <RefreshCw className="h-3 w-3 mr-1" />
                                {t.recurringName || "Recorrente"}
                              </Badge>
                            )}
                            {t.recurringAlreadyGenerated && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Já gerada
                              </Badge>
                            )}
                            {t.recurringMatchId && !t.recurringAlreadyGenerated && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <Link2 className="h-3 w-3 mr-1" />
                                Vincular
                              </Badge>
                            )}
                            {t.categoryTagName && (
                              <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                                <Tag className="h-3 w-3 mr-1" />
                                {t.categoryTagName}
                              </Badge>
                            )}
                            {t.specialType === "BILL_PAYMENT" && (
                              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                <CreditCard className="h-3 w-3 mr-1" />
                                Pag. Fatura
                              </Badge>
                            )}
                            {t.specialType === "FINANCING" && (
                              <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                                <Receipt className="h-3 w-3 mr-1" />
                                Parcelamento
                              </Badge>
                            )}
                            {t.specialType === "REFUND" && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">
                                <ArrowDownCircle className="h-3 w-3 mr-1" />
                                Estorno
                              </Badge>
                            )}
                            {fileType === "ocr" && t.confidence !== undefined && (
                              getConfidenceBadge(t.confidence)
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t space-y-3">
                          {/* Category selector */}
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">
                              Categoria
                            </Label>
                            <Select
                              value={t.categoryId || ""}
                              onValueChange={(value) => {
                                const tagMatch = value ? matchTag(t.description, value) : null;
                                updateTransaction(index, {
                                  categoryId: value || undefined,
                                  categoryTagId: tagMatch?.id,
                                  categoryTagName: tagMatch?.name,
                                });
                                if (value && value !== t.categoryId) {
                                  suggestRule(t.description, value);
                                  suggestTag(t.description, value, index);
                                }
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: c.color }}
                                      />
                                      {c.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Edit description for OCR */}
                          {fileType === "ocr" && (
                            <div>
                              <Label className="text-xs text-gray-500 mb-1 block">
                                Descrição
                              </Label>
                              {t.isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={t.editedDescription}
                                    onChange={(e) =>
                                      updateTransaction(index, {
                                        editedDescription: e.target.value,
                                      })
                                    }
                                    className="h-8"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => saveEdit(index)}
                                  >
                                    OK
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => cancelEdit(index)}
                                  >
                                    X
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => startEditing(index)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Editar descrição
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => removeTransaction(index)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block max-h-[500px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Data</TableHead>
                      {fileType === "ocr" && (
                        <TableHead className="w-20">Tipo</TableHead>
                      )}
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      {fileType === "ocr" && (
                        <TableHead className="w-20">Confiança</TableHead>
                      )}
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t, index) => (
                      <TableRow
                        key={index}
                        className={t.selected ? "" : "opacity-50"}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={t.selected}
                            onChange={(e) =>
                              updateTransaction(index, {
                                selected: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{formatDate(t.date)}</span>
                            {t.isInstallment && t.originalDate && (
                              <span className="text-xs text-gray-400">
                                Compra: {formatDate(t.originalDate)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {fileType === "ocr" && (
                          <TableCell>
                            {t.type === "INCOME" ? (
                              <Badge className="bg-green-100 text-green-800">
                                <ArrowDownCircle className="mr-1 h-3 w-3" />
                                Entrada
                              </Badge>
                            ) : t.type === "TRANSFER" ? (
                              <Badge className="bg-gray-100 text-gray-800">
                                <ArrowLeftRight className="mr-1 h-3 w-3" />
                                Transfer
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800">
                                <ArrowUpCircle className="mr-1 h-3 w-3" />
                                Saida
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {t.isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={t.editedDescription}
                                onChange={(e) =>
                                  updateTransaction(index, {
                                    editedDescription: e.target.value,
                                  })
                                }
                                className="h-8"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => saveEdit(index)}
                              >
                                OK
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelEdit(index)}
                              >
                                X
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="flex-1">{t.description}</span>
                              {t.isDuplicate && (
                                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Possivel duplicata
                                </Badge>
                              )}
                              {t.type === "TRANSFER" && (
                                <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700 border-gray-300">
                                  <ArrowLeftRight className="h-3 w-3 mr-1" />
                                  Transferencia
                                </Badge>
                              )}
                              {t.isInstallment && (
                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                  <Repeat className="h-3 w-3 mr-1" />
                                  {t.currentInstallment && t.totalInstallments
                                    ? `Parcela ${t.currentInstallment}/${t.totalInstallments}`
                                    : "Parcela"}
                                </Badge>
                              )}
                              {t.isRelatedInstallment && t.relatedInstallmentInfo && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                                  title={`Continuação de: ${t.relatedInstallmentInfo.relatedDescription}`}
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Vinculada a {t.relatedInstallmentInfo.relatedInstallment}/{t.totalInstallments}
                                </Badge>
                              )}
                              {t.isRecurring && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Recorrente: {t.recurringName || "Recorrente"}
                                </Badge>
                              )}
                              {t.recurringAlreadyGenerated && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Recorrente já gerada
                                </Badge>
                              )}
                              {t.recurringMatchId && !t.recurringAlreadyGenerated && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Vincular a recorrente
                                </Badge>
                              )}
                              {t.categoryTagName && (
                                <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                                  <Tag className="h-3 w-3 mr-1" />
                                  Tag: {t.categoryTagName}
                                </Badge>
                              )}
                              {t.specialType === "BILL_PAYMENT" && (
                                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300" title={t.specialTypeWarning}>
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  Pagamento Fatura
                                </Badge>
                              )}
                              {t.specialType === "FINANCING" && (
                                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300" title={t.specialTypeWarning}>
                                  <Receipt className="h-3 w-3 mr-1" />
                                  Parcelamento Fatura
                                </Badge>
                              )}
                              {t.specialType === "REFUND" && (
                                <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300" title={t.specialTypeWarning}>
                                  <ArrowDownCircle className="h-3 w-3 mr-1" />
                                  Estorno
                                </Badge>
                              )}
                              {(t.specialType === "FEE" || t.specialType === "IOF" || t.specialType === "CURRENCY_SPREAD") && (
                                <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700 border-gray-300" title={t.specialTypeWarning}>
                                  <Info className="h-3 w-3 mr-1" />
                                  {t.specialType === "FEE" ? "Taxa/Anuidade" : t.specialType === "IOF" ? "IOF" : "Cotacao"}
                                </Badge>
                              )}
                              {t.transactionKind && (
                                <Badge variant="secondary" className="text-xs">
                                  {t.transactionKind}
                                </Badge>
                              )}
                              {fileType === "ocr" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => startEditing(index)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={t.categoryId || ""}
                            onValueChange={(value) => {
                              const tagMatch = value ? matchTag(t.description, value) : null;
                              updateTransaction(index, {
                                categoryId: value || undefined,
                                categoryTagId: tagMatch?.id,
                                categoryTagName: tagMatch?.name,
                              });
                              if (value && value !== t.categoryId) {
                                suggestRule(t.description, value);
                                suggestTag(t.description, value, index);
                              }
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: c.color }}
                                    />
                                    {c.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {fileType === "ocr" && (
                          <TableCell>{getConfidenceBadge(t.confidence)}</TableCell>
                        )}
                        <TableCell
                          className={`text-right font-medium ${
                            t.type === "INCOME"
                              ? "text-green-600"
                              : t.type === "TRANSFER"
                              ? "text-gray-400"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(t.amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                            onClick={() => removeTransaction(index)}
                            title="Remover transação"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
              {importing
                ? "Importando..."
                : `Importar ${selectedCount} transações`}
            </Button>
          </div>
        </>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-green-100 p-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">
                Importação concluída!
              </h2>
              <p className="mt-2 text-gray-500">
                As transações foram importadas com sucesso.
              </p>
              <div className="mt-6 flex flex-col items-center gap-4">
                <div className="flex gap-4">
                  <Button variant="outline" onClick={resetForm}>
                    Importar mais
                  </Button>
                  <Button onClick={() => (window.location.href = "/transactions")}>
                    Ver transações
                  </Button>
                </div>
                {lastImportBatchId && (
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/import?batchId=${lastImportBatchId}`, {
                          method: "DELETE",
                        });
                        if (res.ok) {
                          const data = await res.json();
                          toast({
                            title: "Importação desfeita",
                            description: `${data.count} transações removidas`,
                          });
                          setLastImportBatchId(null);
                        } else {
                          throw new Error("Erro ao desfazer");
                        }
                      } catch {
                        toast({
                          title: "Erro",
                          description: "Não foi possível desfazer a importação",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Desfazer importação
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
