"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

interface InvestmentWithdrawModalProps {
  investmentId: string;
  investmentName: string;
  currentValue: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InvestmentWithdrawModal({
  investmentId,
  investmentName,
  currentValue,
  open,
  onOpenChange,
  onSuccess,
}: InvestmentWithdrawModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate amount whenever it changes
  useEffect(() => {
    const parsedAmount = parseFloat(amount);
    if (amount && !isNaN(parsedAmount) && parsedAmount > currentValue) {
      setValidationError(
        `O valor do resgate nao pode ser maior que o saldo atual (${formatCurrency(currentValue)})`
      );
    } else {
      setValidationError(null);
    }
  }, [amount, currentValue]);

  function resetForm() {
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setValidationError(null);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido para o resgate",
        variant: "destructive",
      });
      return;
    }

    if (parsedAmount > currentValue) {
      toast({
        title: "Erro",
        description: `O valor do resgate nao pode ser maior que o saldo atual (${formatCurrency(currentValue)})`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/investments/${investmentId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          date,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Erro ao registrar resgate");
      }

      toast({
        title: "Sucesso",
        description: "Resgate registrado com sucesso",
      });

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao registrar resgate",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Registrar Resgate</DialogTitle>
          <DialogDescription>
            Registre um resgate do investimento{" "}
            <span className="font-medium">{investmentName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <span className="text-muted-foreground">Saldo disponivel:</span>{" "}
          <span className="font-semibold">{formatCurrency(currentValue)}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="withdraw-amount">Valor *</Label>
            <Input
              id="withdraw-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={currentValue}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className={validationError ? "border-red-500" : ""}
              autoFocus
            />
            {validationError && (
              <p className="text-sm text-red-500">{validationError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-date">Data</Label>
            <Input
              id="withdraw-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-notes">Notas (opcional)</Label>
            <Input
              id="withdraw-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Resgate para emergencia, etc."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !!validationError}
              variant="destructive"
            >
              {loading ? "Registrando..." : "Registrar Resgate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
