"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

interface BillPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bill: {
    month: number;
    year: number;
    origin: string;
    total: number;
  };
}

type PaymentMode = "full" | "partial";
type PartialPaymentType = "rollover" | "finance";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function BillPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  bill,
}: BillPaymentModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Payment mode: full or partial
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("full");

  // Partial payment type: rollover or finance
  const [partialType, setPartialType] = useState<PartialPaymentType>("rollover");

  // Amount to pay now (used for both rollover and finance entry)
  const [amountToPay, setAmountToPay] = useState("");

  // Number of installments for financing
  const [installments, setInstallments] = useState("2");

  // Interest rate (optional)
  const [interestRate, setInterestRate] = useState("");

  // Derived values
  const parsedAmountToPay = useMemo(() => {
    const val = parseFloat(amountToPay);
    return isNaN(val) ? 0 : val;
  }, [amountToPay]);

  const remainingAmount = useMemo(() => {
    return Math.max(0, bill.total - parsedAmountToPay);
  }, [bill.total, parsedAmountToPay]);

  const installmentCount = useMemo(() => {
    return parseInt(installments) || 2;
  }, [installments]);

  const installmentValue = useMemo(() => {
    if (installmentCount <= 0) return 0;
    return remainingAmount / installmentCount;
  }, [remainingAmount, installmentCount]);

  const monthLabel = useMemo(() => {
    return `${MONTH_NAMES[bill.month - 1]}/${bill.year}`;
  }, [bill.month, bill.year]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentMode("full");
      setPartialType("rollover");
      setAmountToPay("");
      setInstallments("2");
      setInterestRate("");
    }
  }, [isOpen]);

  // Update default amount when switching modes
  useEffect(() => {
    if (paymentMode === "partial" && !amountToPay) {
      // Default to paying 80% when switching to partial
      setAmountToPay((bill.total * 0.8).toFixed(2));
    }
  }, [paymentMode, bill.total, amountToPay]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // For full payment, no API call needed - just close modal
    if (paymentMode === "full") {
      toast({
        title: "Sucesso",
        description: "Fatura paga integralmente. Nenhum saldo a rolar.",
      });
      onClose();
      onSuccess();
      return;
    }

    // Validation for partial payments
    if (parsedAmountToPay <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido para pagamento",
        variant: "destructive",
      });
      return;
    }

    if (parsedAmountToPay >= bill.total) {
      toast({
        title: "Erro",
        description:
          "Para pagar o valor total, selecione 'Pagar valor total'",
        variant: "destructive",
      });
      return;
    }

    if (partialType === "finance" && installmentCount < 2) {
      toast({
        title: "Erro",
        description: "O parcelamento deve ter pelo menos 2 parcelas",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Build request payload for partial payment
      const payload: Record<string, unknown> = {
        billMonth: bill.month,
        billYear: bill.year,
        origin: bill.origin,
        totalBillAmount: bill.total,
      };

      if (partialType === "rollover") {
        // Partial payment - rollover remaining to next bill
        payload.paymentType = "PARTIAL";
        payload.amountPaid = parsedAmountToPay;
        if (interestRate) {
          payload.interestRate = parseFloat(interestRate);
        }
      } else {
        // Finance - split remaining into installments
        payload.paymentType = "FINANCED";
        payload.amountPaid = parsedAmountToPay;
        payload.installments = installmentCount;
        if (interestRate) {
          payload.interestRate = parseFloat(interestRate);
        }
      }

      const res = await fetch("/api/bill-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Erro ao registrar pagamento");
      }

      toast({
        title: "Sucesso",
        description:
          partialType === "rollover"
            ? "Pagamento parcial registrado. Saldo rolado para proxima fatura."
            : `Financiamento registrado em ${installmentCount}x`,
      });

      onClose();
      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Erro ao registrar pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Pagar Fatura - {monthLabel} - {bill.origin}
          </DialogTitle>
          <DialogDescription>
            Total: <span className="font-semibold">{formatCurrency(bill.total)}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Mode Selection */}
          <div className="space-y-3">
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                paymentMode === "full"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : "border-input hover:border-emerald-300"
              }`}
              onClick={() => setPaymentMode("full")}
            >
              <input
                type="radio"
                name="paymentMode"
                checked={paymentMode === "full"}
                onChange={() => setPaymentMode("full")}
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <p className="font-medium">Pagar valor total</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(bill.total)}
                </p>
              </div>
            </div>

            <div
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                paymentMode === "partial"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : "border-input hover:border-emerald-300"
              }`}
              onClick={() => setPaymentMode("partial")}
            >
              <input
                type="radio"
                name="paymentMode"
                checked={paymentMode === "partial"}
                onChange={() => setPaymentMode("partial")}
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <p className="font-medium">Pagar parcialmente</p>
                <p className="text-sm text-muted-foreground">
                  Escolha como pagar o restante
                </p>
              </div>
            </div>
          </div>

          {/* Partial Payment Options */}
          {paymentMode === "partial" && (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <p className="font-medium text-sm">Como deseja pagar?</p>

              {/* Rollover Option */}
              <div
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  partialType === "rollover"
                    ? "border-emerald-500 bg-background"
                    : "border-input hover:border-emerald-300 bg-background"
                }`}
                onClick={() => setPartialType("rollover")}
              >
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="radio"
                    name="partialType"
                    checked={partialType === "rollover"}
                    onChange={() => setPartialType("rollover")}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <p className="font-medium">Rolar saldo para proxima fatura</p>
                </div>

                {partialType === "rollover" && (
                  <div className="space-y-3 pl-7">
                    <div className="space-y-2">
                      <Label htmlFor="rollover-amount">Valor a pagar agora</Label>
                      <Input
                        id="rollover-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={bill.total - 0.01}
                        value={amountToPay}
                        onChange={(e) => setAmountToPay(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>

                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        Saldo para proxima fatura:{" "}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(remainingAmount)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rollover-interest">Juros (%) - opcional</Label>
                      <Input
                        id="rollover-interest"
                        type="number"
                        step="0.01"
                        min="0"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        placeholder="Ex: 7.5"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Finance Option */}
              <div
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  partialType === "finance"
                    ? "border-emerald-500 bg-background"
                    : "border-input hover:border-emerald-300 bg-background"
                }`}
                onClick={() => setPartialType("finance")}
              >
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="radio"
                    name="partialType"
                    checked={partialType === "finance"}
                    onChange={() => setPartialType("finance")}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <p className="font-medium">Parcelar o restante</p>
                </div>

                {partialType === "finance" && (
                  <div className="space-y-3 pl-7">
                    <div className="space-y-2">
                      <Label htmlFor="finance-entry">Entrada</Label>
                      <Input
                        id="finance-entry"
                        type="number"
                        step="0.01"
                        min="0"
                        max={bill.total - 0.01}
                        value={amountToPay}
                        onChange={(e) => setAmountToPay(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>

                    <div className="text-sm">
                      <span className="text-muted-foreground">Restante: </span>
                      <span className="font-semibold">
                        {formatCurrency(remainingAmount)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="finance-installments">Parcelas</Label>
                      <div className="flex items-center gap-3">
                        <Select
                          value={installments}
                          onValueChange={setInstallments}
                        >
                          <SelectTrigger id="finance-installments" className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n}x
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-sm">
                          de{" "}
                          <span className="font-semibold">
                            {formatCurrency(installmentValue)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="finance-interest">Juros (%) - opcional</Label>
                      <Input
                        id="finance-interest"
                        type="number"
                        step="0.01"
                        min="0"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        placeholder="Ex: 7.5"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
