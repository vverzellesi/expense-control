"use client";

import { useEffect, useRef, useState } from "react";
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
  Lock,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deduplicateTransactions } from "@/lib/dedup";
import { detectTransfer, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import { detectOriginFromCSV, isC6ExchangeRateRow, type StatementType } from "@/lib/csv-parser";
import { AiQuotaBadge } from "@/components/ai/AiQuotaBadge";
import { ParseSourceBadge } from "@/components/ai/ParseSourceBadge";
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
  const [ocrProgressLabel, setOcrProgressLabel] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [fileType, setFileType] = useState<"csv" | "ocr" | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [detectedStatementType, setDetectedStatementType] = useState<StatementType | null>(null);
  const [origins, setOrigins] = useState<{ id: string; name: string }[]>([]);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [lastImportBatchId, setLastImportBatchId] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "notif" | "regex" | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Re-run duplicate and recurring checks when origin changes after initial load
  const originCheckRef = useRef(origin);
  useEffect(() => {
    if (!origin || origin === originCheckRef.current || transactions.length === 0 || step !== "preview") {
      originCheckRef.current = origin;
      return;
    }
    originCheckRef.current = origin;

    async function recheckWithNewOrigin() {
      const transactionsWithDuplicates = await checkDuplicates(transactions);
      const transactionsWithRecurring = await checkRecurringMatches(transactionsWithDuplicates);
      setTransactions(transactionsWithRecurring);
    }
    recheckWithNewOrigin();
  }, [origin]);

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

  useEffect(() => {
    fetch("/api/user/pdf-password")
      .then((res) => res.json())
      .then((data) => setHasSavedPassword(data.hasSavedPassword))
      .catch(() => {});
  }, []);

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);

    const tagsRes = await fetch("/api/category-tags");
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      setCategoryTags(tagsData);
    }

    const originsRes = await fetch("/api/origins");
    if (originsRes.ok) {
      const originsData = await originsRes.json();
      setOrigins(originsData);
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
          selected: data.duplicates.includes(index) ? false : t.selected,
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Multiple OCR files: process them all and merge
    const ocrFiles: File[] = [];
    let csvFile: File | null = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (getFileType(f) === "csv") {
        csvFile = f;
      } else {
        ocrFiles.push(f);
      }
    }

    // If there's a CSV, process it alone (CSVs already contain all transactions)
    if (csvFile) {
      await processFile(csvFile);
      return;
    }

    // Multiple OCR images: process each and merge results
    if (ocrFiles.length > 1) {
      await processMultipleOCR(ocrFiles);
    } else if (ocrFiles.length === 1) {
      await processFile(ocrFiles[0]);
    }
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

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    // Validate file types
    const validExtensions = [".csv", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const validFiles: File[] = [];
    for (let i = 0; i < droppedFiles.length; i++) {
      const f = droppedFiles[i];
      if (validExtensions.some(ext => f.name.toLowerCase().endsWith(ext))) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      toast({
        title: "Formato não suportado",
        description: "Use arquivos CSV, PDF ou imagens (PNG, JPG)",
        variant: "destructive",
      });
      return;
    }

    // Separate CSV and OCR files
    const ocrFiles = validFiles.filter(f => getFileType(f) !== "csv");
    const csvFile = validFiles.find(f => getFileType(f) === "csv");

    if (csvFile) {
      await processFile(csvFile);
    } else if (ocrFiles.length > 1) {
      await processMultipleOCR(ocrFiles);
    } else if (ocrFiles.length === 1) {
      await processFile(ocrFiles[0]);
    }
  }

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

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Erro do servidor (${res.status}). Tente novamente.`);
      }

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
      setParseSource(data.source ?? null);
      setUsedFallback(data.usedFallback ?? false);
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
      const res = await fetch("/api/user/pdf-password", { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Server returned " + res.status);
      }
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

  async function processCSV(file: File) {
    const text = await file.text();

    // Parse CSV locally
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("Arquivo vazio ou inválido");
    }

    const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());

    // Detect bank and statement type from content + headers
    const contentForDetection = text + " " + file.name;
    const detected = detectOriginFromCSV(contentForDetection, headers);
    setOrigin(detected.origin);
    setDetectedStatementType(detected.statementType);
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

      // Skip C6 exchange rate informational rows (cotação, CUUSD, SPREAD)
      // These contain the exchange rate in the value field, not a real transaction
      if (isC6ExchangeRateRow(description)) continue;

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
      // Transfer takes priority over specialTx because patterns like
      // "INCLUSAO DE PAGAMENTO" match both detectTransfer and BILL_PAYMENT,
      // but they represent internal transfers, not income.
      let transactionType: TransactionType = "EXPENSE";
      let finalAmount = amount;

      if (isTransfer) {
        transactionType = "TRANSFER";
        finalAmount = amount; // Keep original sign
      } else if (specialTx) {
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

      // Auto-deselect bill payments and transfers (they shouldn't be imported as regular transactions)
      const shouldBeSelected = specialTx?.type !== "BILL_PAYMENT" && !isTransfer;

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

    // Auto-fill billing month based on the most recent transaction date
    const validDates = transactionsWithRecurring
      .map(t => t.date instanceof Date ? t.date : new Date(t.date))
      .filter(d => !isNaN(d.getTime()));
    if (validDates.length > 0) {
      const latestDate = new Date(Math.max(...validDates.map(d => d.getTime())));
      const suggestedMonth = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}`;
      setInvoiceMonth(suggestedMonth);
    }

    setStep("preview");
  }

  function normalizeTransactionDates(
    rawTransactions: ExtendedTransaction[]
  ): ExtendedTransaction[] {
    return rawTransactions.map((t) => {
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
  }

  async function callOCRApi(file: File): Promise<{
    transactions: ExtendedTransaction[];
    origin: string;
    confidence: number;
    source: "ai" | "notif" | "regex" | null;
    usedFallback: boolean;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });

    // Handle non-JSON responses (e.g., 504 gateway timeout)
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(
        res.status === 504
          ? "O servidor demorou demais para processar. Tente com menos arquivos ou imagens menores."
          : `Erro do servidor (${res.status}). Tente novamente.`
      );
    }

    if (data.needsPassword) {
      throw Object.assign(new Error("needsPassword"), { data });
    }

    if (!res.ok) {
      throw new Error(data.error || "Erro ao processar arquivo");
    }

    return {
      transactions: normalizeTransactionDates(data.transactions),
      origin: data.origin,
      confidence: data.confidence,
      source: data.source ?? null,
      usedFallback: data.usedFallback ?? false,
    };
  }

  async function processOCR(file: File) {
    const progressInterval = setInterval(() => {
      setOcrProgress((prev) => Math.min(prev + 5, 90));
    }, 500);

    try {
      let result;
      try {
        result = await callOCRApi(file);
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "needsPassword") {
          clearInterval(progressInterval);
          const errData = (error as Error & { data: { savedPasswordFailed?: boolean } }).data;
          setPendingFile(file);
          setNeedsPassword(true);
          setPasswordError(
            errData.savedPasswordFailed
              ? "Senha salva não funcionou para este PDF."
              : null
          );
          return;
        }
        throw error;
      }

      clearInterval(progressInterval);
      setOcrProgress(100);

      setOrigin(result.origin);
      setParseSource(result.source);
      setUsedFallback(result.usedFallback);
      setOcrConfidence(result.confidence);
      const transactionsWithDuplicates = await checkDuplicates(result.transactions);
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

  async function processMultipleOCR(files: File[]) {
    setFileType("ocr");
    setLoading(true);
    setOcrProgress(0);
    setOcrProgressLabel("");

    try {
      const allTransactions: ExtendedTransaction[] = [];
      let lastOrigin = "";
      let lastSource: "ai" | "notif" | "regex" | null = null;
      let lastUsedFallback = false;
      let totalConfidence = 0;
      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        setOcrProgressLabel(`Processando imagem ${i + 1} de ${files.length}...`);
        setOcrProgress(Math.round((i / files.length) * 90));

        try {
          const result = await callOCRApi(files[i]);
          allTransactions.push(...result.transactions);
          lastOrigin = result.origin || lastOrigin;
          lastSource = result.source;
          lastUsedFallback = result.usedFallback;
          totalConfidence += result.confidence;
          successCount++;
        } catch (error) {
          errors.push(`${files[i].name}: ${error instanceof Error ? error.message : "Erro"}`);
        }
      }

      setOcrProgress(100);
      setOcrProgressLabel("");

      if (allTransactions.length === 0) {
        throw new Error(
          errors.length > 0
            ? `Nenhuma transação encontrada. Erros:\n${errors.join("\n")}`
            : "Nenhuma transação encontrada nos arquivos."
        );
      }

      if (errors.length > 0) {
        toast({
          title: `${errors.length} arquivo(s) com erro`,
          description: errors.join("; "),
          variant: "destructive",
        });
      }

      // Deduplicate across images (same date + description + amount)
      const uniqueTransactions = deduplicateTransactions(allTransactions);

      setOrigin(lastOrigin);
      setParseSource(lastSource);
      setUsedFallback(lastUsedFallback);
      setOcrConfidence(successCount > 0 ? totalConfidence / successCount : null);
      const transactionsWithDuplicates = await checkDuplicates(uniqueTransactions);
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
        title: "Erro ao processar arquivos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOcrProgress(0);
      setOcrProgressLabel("");
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

      const toastParts = [`${data.count} transações importadas`];
      if (data.futureInstallmentsCreated > 0) {
        toastParts.push(`${data.futureInstallmentsCreated} parcelas futuras geradas`);
      }
      toast({
        title: "Sucesso",
        description: toastParts.join(". "),
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
    setDetectedStatementType(null);
    setOcrConfidence(null);
    setFileType(null);
    setNeedsPassword(false);
    setPendingFile(null);
    setPdfPassword("");
    setPasswordError(null);
    setSavePassword(true);
    setParseSource(null);
    setUsedFallback(false);
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
            <div className="mb-4 flex justify-end">
              <AiQuotaBadge />
            </div>
            <div className="space-y-4">
              <div
                className={`flex items-center justify-center rounded-lg border-2 border-dashed p-6 md:p-12 transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  <div className={`mx-auto hidden sm:flex justify-center gap-4 ${isDragging ? "text-primary" : "text-gray-400"}`}>
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
                          className="cursor-pointer rounded-md bg-primary px-6 py-3 text-base sm:px-4 sm:py-2 sm:text-sm font-medium text-white hover:bg-primary/90"
                        >
                          {loading ? "Processando..." : "Selecionar arquivos"}
                        </Label>
                        <Input
                          id="file"
                          type="file"
                          accept=".csv,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                          multiple
                          onChange={handleFileUpload}
                          disabled={loading}
                          className="hidden"
                        />
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {isDragging ? "Arquivos suportados: CSV, PDF, PNG, JPG" : "Arraste arquivos ou clique para selecionar (múltiplas imagens aceitas)"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Bancos: C6, Itaú, BTG, Nubank, Bradesco, Santander, BB, Caixa
                  </p>
                </div>
              </div>

              {loading && fileType === "ocr" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {ocrProgressLabel || "Processando OCR..."}
                    </span>
                    <span className="text-gray-500">{ocrProgress}%</span>
                  </div>
                  <Progress value={ocrProgress} className="h-2" />
                  <p className="text-xs text-gray-400">
                    O processamento de imagens pode levar alguns segundos
                  </p>
                </div>
              )}

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
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>Preview das Transações</span>
                {parseSource && (
                  <ParseSourceBadge source={parseSource} usedFallback={usedFallback} />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {ocrConfidence !== null && (
                    <div className="flex items-center gap-1 text-sm">
                      <span className="text-gray-500">Confiança OCR:</span>
                      {getConfidenceBadge(ocrConfidence)}
                    </div>
                  )}
                  <Select value={origin} onValueChange={setOrigin}>
                    <SelectTrigger className="w-full sm:w-[200px] h-8 text-sm">
                      <SelectValue placeholder="Selecionar origem" />
                    </SelectTrigger>
                    <SelectContent>
                      {origins.map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                      {/* Include detected origin if not in list */}
                      {origin && !origins.some((o) => o.name === origin) && (
                        <SelectItem value={origin}>{origin}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {detectedStatementType && (
                    <Badge variant="secondary" className="text-xs">
                      {detectedStatementType === "fatura" ? (
                        <><CreditCard className="mr-1 h-3 w-3" /> Fatura de cartão</>
                      ) : (
                        <><Receipt className="mr-1 h-3 w-3" /> Extrato bancário</>
                      )}
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-500">
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
                          className="h-5 w-5 mt-1"
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

                          {/* Tag selector */}
                          {(() => {
                            const tagsForCategory = t.categoryId
                              ? categoryTags.filter(ct => ct.categoryId === t.categoryId)
                              : [];
                            if (tagsForCategory.length === 0) return null;
                            return (
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">
                                  Tag
                                </Label>
                                <Select
                                  value={t.categoryTagId || "__none__"}
                                  onValueChange={(value) => {
                                    if (value === "__none__") {
                                      updateTransaction(index, {
                                        categoryTagId: undefined,
                                        categoryTagName: undefined,
                                      });
                                    } else {
                                      const tag = categoryTags.find(ct => ct.id === value);
                                      updateTransaction(index, {
                                        categoryTagId: tag?.id,
                                        categoryTagName: tag?.name,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Sem tag" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">Sem tag</SelectItem>
                                    {tagsForCategory.map((ct) => (
                                      <SelectItem key={ct.id} value={ct.id}>
                                        {ct.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })()}

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
                      <TableHead>Tag</TableHead>
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
                        <TableCell>
                          {(() => {
                            const tagsForCategory = t.categoryId
                              ? categoryTags.filter(ct => ct.categoryId === t.categoryId)
                              : [];
                            if (tagsForCategory.length === 0) {
                              return <span className="text-sm text-gray-400">-</span>;
                            }
                            return (
                              <Select
                                value={t.categoryTagId || "__none__"}
                                onValueChange={(value) => {
                                  if (value === "__none__") {
                                    updateTransaction(index, {
                                      categoryTagId: undefined,
                                      categoryTagName: undefined,
                                    });
                                  } else {
                                    const tag = categoryTags.find(ct => ct.id === value);
                                    updateTransaction(index, {
                                      categoryTagId: tag?.id,
                                      categoryTagName: tag?.name,
                                    });
                                  }
                                }}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue placeholder="Sem tag" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Sem tag</SelectItem>
                                  {tagsForCategory.map((ct) => (
                                    <SelectItem key={ct.id} value={ct.id}>
                                      {ct.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
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

          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing || selectedCount === 0} className="w-full sm:w-auto">
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
