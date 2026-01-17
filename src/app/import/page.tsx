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
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { detectTransfer } from "@/lib/categorizer";
import type { Category, ImportedTransaction, TransactionType } from "@/types";

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
};

export default function ImportPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
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
          })),
        }),
      });

      const data = await res.json();

      if (data.hasDuplicates) {
        const updatedTransactions = parsedTransactions.map((t, index) => ({
          ...t,
          isDuplicate: data.duplicates.includes(index),
          selected: !data.duplicates.includes(index), // Auto-deselect duplicates
        }));

        toast({
          title: "Possiveis duplicatas detectadas",
          description: `${data.duplicates.length} transacao(es) podem ja existir no sistema`,
          variant: "destructive",
        });

        return updatedTransactions;
      }

      return parsedTransactions;
    } catch (error) {
      console.error("Error checking duplicates:", error);
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
      detectedOrigin = "Cartao C6";
    } else if (
      lowerContent.includes("itau") ||
      lowerContent.includes("itaú") ||
      file.name.toLowerCase().includes("itau")
    ) {
      detectedOrigin = "Cartao Itau";
    } else if (
      lowerContent.includes("btg") ||
      file.name.toLowerCase().includes("btg")
    ) {
      detectedOrigin = "Cartao BTG";
    }

    setOrigin(detectedOrigin);

    // Parse CSV locally
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("Arquivo vazio ou invalido");
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

      // Check for installment pattern
      const installmentMatch = description.match(/(\d+)\s*(?:\/|DE)\s*(\d+)/i);
      const isInstallment = !!installmentMatch;
      const currentInstallment = installmentMatch
        ? parseInt(installmentMatch[1])
        : undefined;
      const totalInstallments = installmentMatch
        ? parseInt(installmentMatch[2])
        : undefined;

      // Check for transfer pattern (credit card bill payment, internal transfer)
      const isTransfer = detectTransfer(description);

      // Find category by rules
      let categoryId: string | undefined;
      const upperDesc = description.toUpperCase();
      for (const rule of rules) {
        if (upperDesc.includes(rule.keyword.toUpperCase())) {
          categoryId = rule.categoryId;
          break;
        }
      }

      // Default to "Outros" category if no rule matched (except for transfers)
      if (!categoryId && !isTransfer) {
        const outrosCategory = categories.find(c => c.name === "Outros");
        categoryId = outrosCategory?.id;
      }

      // Determine transaction type
      let transactionType: TransactionType = "EXPENSE";
      if (isTransfer) {
        transactionType = "TRANSFER";
      } else if (amount > 0) {
        transactionType = "INCOME";
      }

      parsedTransactions.push({
        description,
        amount: transactionType === "INCOME" ? Math.abs(amount) : -Math.abs(amount),
        date,
        type: transactionType,
        isInstallment,
        currentInstallment,
        totalInstallments,
        categoryId,
        suggestedCategoryId: categoryId,
        selected: true,
      });
    }

    if (parsedTransactions.length === 0) {
      throw new Error("Nenhuma transação encontrada no arquivo");
    }

    // Check for duplicates
    const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
    setTransactions(transactionsWithDuplicates);
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

  function getConfidenceBadge(confidence?: number) {
    if (confidence === undefined) return null;

    if (confidence >= 90) {
      return <Badge className="bg-green-100 text-green-800">Alta</Badge>;
    } else if (confidence >= 70) {
      return <Badge className="bg-yellow-100 text-yellow-800">Media</Badge>;
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
    (t) => t.selected && t.type === "INCOME"
  ).length;
  const expenseCount = transactions.filter(
    (t) => t.selected && t.type === "EXPENSE"
  ).length;
  const transferCount = transactions.filter(
    (t) => t.selected && t.type === "TRANSFER"
  ).length;
  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;

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
                    {duplicateCount > 0 && (
                      <span className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-4 w-4" />
                        {duplicateCount} possivel(eis) duplicata(s)
                      </span>
                    )}
                    {incomeCount > 0 && (
                      <span className="flex items-center gap-1">
                        <ArrowDownCircle className="h-4 w-4 text-green-500" />
                        {incomeCount} entrada{incomeCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {expenseCount > 0 && (
                      <span className="flex items-center gap-1">
                        <ArrowUpCircle className="h-4 w-4 text-red-500" />
                        {expenseCount} despesa{expenseCount !== 1 ? 's' : ''}
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
                      As datas das parcelas serao ajustadas para este mes
                    </span>
                  </div>
                )}
              </div>

              <div className="max-h-[500px] overflow-auto rounded-md border">
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
                              {t.isRecurring && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  {t.recurringName || "Recorrente"}
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
                            onValueChange={(value) =>
                              updateTransaction(index, {
                                categoryId: value || undefined,
                              })
                            }
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
              <div className="mt-6 flex gap-4">
                <Button variant="outline" onClick={resetForm}>
                  Importar mais
                </Button>
                <Button onClick={() => (window.location.href = "/transactions")}>
                  Ver transações
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
