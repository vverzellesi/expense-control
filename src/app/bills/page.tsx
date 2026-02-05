"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  CreditCard,
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Settings2,
  Receipt,
  Banknote,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BillPaymentModal } from "@/components/BillPaymentModal";

interface BillCategory {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
  percentage: number;
}

interface BillTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  origin: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  isInstallment: boolean;
  currentInstallment: number | null;
}

interface CarryoverInfo {
  amount: number;
  interest: number;
  fromBill: string;
  billPaymentId: string;
}

interface Bill {
  label: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  dueDate: string;
  total: number;
  transactionTotal: number;
  carryover: CarryoverInfo | null;
  transactionCount: number;
  categories: BillCategory[];
  transactions: BillTransaction[];
  previousTotal: number | null;
  changePercentage: number | null;
}

interface Origin {
  id: string;
  name: string;
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingDay, setClosingDay] = useState(13);
  const [selectedOrigin, setSelectedOrigin] = useState<string>("");
  const [expandedBill, setExpandedBill] = useState<number | null>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);

  useEffect(() => {
    fetchBills();
  }, [closingDay, selectedOrigin]);

  async function fetchBills() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        closingDay: closingDay.toString(),
      });
      if (selectedOrigin) {
        params.append("origin", selectedOrigin);
      }

      const res = await fetch(`/api/bills?${params}`);
      const data = await res.json();
      setBills(data.bills || []);
      setOrigins(data.origins || []);
    } catch (error) {
      console.error("Error fetching bills:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleBill(index: number) {
    setExpandedBill(expandedBill === index ? null : index);
  }

  function formatPeriod(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.getDate().toString().padStart(2, "0")}/${(start.getMonth() + 1).toString().padStart(2, "0")} a ${end.getDate().toString().padStart(2, "0")}/${(end.getMonth() + 1).toString().padStart(2, "0")}`;
  }

  function openPaymentModal(bill: Bill, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedBillForPayment(bill);
    setPaymentModalOpen(true);
  }

  function handlePaymentSuccess() {
    fetchBills();
  }

  const currentBill = bills[0];
  const totalLast6Months = bills.reduce((sum, b) => sum + b.total, 0);
  const averageBill = bills.length > 0 ? totalLast6Months / bills.length : 0;

  return (
    <div className="space-y-6 px-4 md:px-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Faturas</h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Visualize seus gastos por ciclo de fatura do cartao
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="w-full sm:w-auto min-h-[44px]"
        >
          <Settings2 className="h-4 w-4 mr-2" />
          Configurar
        </Button>
      </div>

      {showSettings && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="closingDay">Dia do fechamento</Label>
                <Input
                  id="closingDay"
                  type="number"
                  min={1}
                  max={28}
                  value={closingDay}
                  onChange={(e) => setClosingDay(parseInt(e.target.value) || 13)}
                  className="w-24"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="origin">Filtrar por cartao</Label>
                <Select
                  value={selectedOrigin || "all"}
                  onValueChange={(v) => setSelectedOrigin(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todos os cartoes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os cartoes</SelectItem>
                    {origins.map((o) => (
                      <SelectItem key={o.id} value={o.name}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-gray-500 pb-2">
                Periodo: dia {closingDay + 1} do mes anterior ate dia {closingDay} do mes atual
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fatura Atual</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(currentBill?.total || 0)}
            </div>
            {currentBill && currentBill.changePercentage !== null && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {currentBill.changePercentage > 0 ? (
                  <TrendingUp className="h-3 w-3 text-red-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-green-500" />
                )}
                <span
                  className={
                    currentBill.changePercentage > 0
                      ? "text-red-600"
                      : "text-green-600"
                  }
                >
                  {currentBill.changePercentage > 0 ? "+" : ""}
                  {currentBill.changePercentage.toFixed(1)}%
                </span>
                vs fatura anterior
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Media 6 meses</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageBill)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: {formatCurrency(totalLast6Months)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transacoes</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentBill?.transactionCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              na fatura atual
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bills List */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            Carregando faturas...
          </CardContent>
        </Card>
      ) : bills.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            Nenhuma fatura encontrada
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bills.map((bill, index) => (
            <Card key={bill.label} className={index === 0 ? "border-primary" : ""}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleBill(index)}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-lg">{bill.label}</CardTitle>
                      {index === 0 && (
                        <Badge className="bg-primary">Atual</Badge>
                      )}
                      {bill.carryover && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                          Pagamento Parcial
                        </Badge>
                      )}
                      <span className="text-sm text-gray-500">
                        {formatPeriod(bill.startDate, bill.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => openPaymentModal(bill, e)}
                        className="hidden sm:flex"
                      >
                        <Banknote className="h-4 w-4 mr-2" />
                        Pagar Fatura
                      </Button>
                      <div className="text-right">
                        <div className="text-xl font-bold text-red-600">
                          {formatCurrency(bill.total)}
                        </div>
                        {bill.changePercentage !== null && (
                          <span
                            className={`text-xs ${
                              bill.changePercentage > 0
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            {bill.changePercentage > 0 ? "+" : ""}
                            {bill.changePercentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {expandedBill === index ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Carryover badge info */}
                  {bill.carryover && (
                    <div className="text-sm text-gray-600 border-l-2 border-amber-400 pl-3 ml-1">
                      <div>Saldo anterior ({bill.carryover.fromBill}): <span className="font-medium">{formatCurrency(bill.carryover.amount)}</span></div>
                      {bill.carryover.interest > 0 && (
                        <div>Juros: <span className="font-medium text-red-600">{formatCurrency(bill.carryover.interest)}</span></div>
                      )}
                    </div>
                  )}

                  {/* Mobile button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => openPaymentModal(bill, e)}
                    className="sm:hidden w-full"
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Pagar Fatura
                  </Button>
                </div>
              </CardHeader>

              {expandedBill === index && (
                <CardContent className="border-t pt-4">
                  {/* Category Breakdown */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Por Categoria
                    </h4>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {bill.categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-sm">{cat.name}</span>
                            <span className="text-xs text-gray-400">
                              ({cat.count})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium">
                              {formatCurrency(cat.total)}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">
                              ({cat.percentage.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transactions Table - Desktop */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Transacoes ({bill.transactionCount})
                    </h4>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3 max-h-[400px] overflow-auto">
                      {bill.transactions.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-lg border bg-white p-4"
                        >
                          {/* Row 1: Category dot + Description */}
                          <div className="flex items-start gap-2 mb-2">
                            <div
                              className="h-3 w-3 rounded-full mt-1 flex-shrink-0"
                              style={{ backgroundColor: t.categoryColor }}
                            />
                            <p className="font-medium text-gray-900 truncate flex-1">
                              {t.description}
                            </p>
                          </div>

                          {/* Row 2: Date and Amount */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500">
                              {formatDate(t.date)}
                            </span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(t.amount)}
                            </span>
                          </div>

                          {/* Row 3: Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                backgroundColor: t.categoryColor
                                  ? `${t.categoryColor}15`
                                  : undefined,
                                borderColor: t.categoryColor || undefined,
                                color: t.categoryColor || undefined,
                              }}
                            >
                              {t.categoryName}
                            </Badge>
                            {t.isInstallment && t.currentInstallment && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                              >
                                Parcela {t.currentInstallment}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block max-h-[400px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descricao</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bill.transactions.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(t.date)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{t.description}</span>
                                  {t.isInstallment && t.currentInstallment && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-purple-50 text-purple-700"
                                    >
                                      Parcela {t.currentInstallment}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: t.categoryColor }}
                                  />
                                  <span className="text-sm">{t.categoryName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-red-600">
                                {formatCurrency(t.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Bill Payment Modal */}
      {selectedBillForPayment && (
        <BillPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setSelectedBillForPayment(null);
          }}
          onSuccess={handlePaymentSuccess}
          bill={{
            month: selectedBillForPayment.month,
            year: selectedBillForPayment.year,
            origin: selectedOrigin || selectedBillForPayment.transactions[0]?.origin || "Cartao",
            total: selectedBillForPayment.total,
          }}
        />
      )}
    </div>
  );
}
