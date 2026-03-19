"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { toLocalDateString } from "@/lib/utils";

interface InvestmentDepositModalProps {
  investmentId: string;
  investmentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InvestmentDepositModal({
  investmentId,
  investmentName,
  open,
  onOpenChange,
  onSuccess,
}: InvestmentDepositModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [notes, setNotes] = useState("");

  function resetForm() {
    setAmount("");
    setDate(toLocalDateString(new Date()));
    setNotes("");
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
        description: "Informe um valor válido para o aporte",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/investments/${investmentId}/deposit`, {
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
        throw new Error(error.error || "Erro ao registrar aporte");
      }

      toast({
        title: "Sucesso",
        description: "Aporte registrado com sucesso",
      });

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao registrar aporte",
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
          <DialogTitle>Registrar Aporte</DialogTitle>
          <DialogDescription>
            Adicione um novo aporte ao investimento{" "}
            <span className="font-medium">{investmentName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deposit-amount">Valor *</Label>
            <CurrencyInput
              id="deposit-amount"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposit-date">Data</Label>
            <Input
              id="deposit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposit-notes">Notas (opcional)</Label>
            <Input
              id="deposit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Aporte mensal, bônus, etc."
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
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar Aporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
