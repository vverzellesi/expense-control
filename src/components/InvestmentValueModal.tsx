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
import { formatCurrency, formatDate } from "@/lib/utils";

interface InvestmentValueModalProps {
  investmentId: string;
  investmentName: string;
  currentValue: number;
  lastUpdatedAt?: Date | string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InvestmentValueModal({
  investmentId,
  investmentName,
  currentValue,
  lastUpdatedAt,
  open,
  onOpenChange,
  onSuccess,
}: InvestmentValueModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");

  // Pre-fill with current value when modal opens
  useEffect(() => {
    if (open) {
      setValue(currentValue.toFixed(2));
    }
  }, [open, currentValue]);

  function resetForm() {
    setValue(currentValue.toFixed(2));
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedValue = parseFloat(value);
    if (!value || isNaN(parsedValue) || parsedValue < 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/investments/${investmentId}/value`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentValue: parsedValue,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Erro ao atualizar valor");
      }

      toast({
        title: "Sucesso",
        description: "Valor atualizado com sucesso",
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao atualizar valor",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const valueDiff = parseFloat(value) - currentValue;
  const hasValueChange = !isNaN(valueDiff) && Math.abs(valueDiff) >= 0.01;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Atualizar Valor</DialogTitle>
          <DialogDescription>
            Atualize o valor atual do investimento{" "}
            <span className="font-medium">{investmentName}</span>
          </DialogDescription>
        </DialogHeader>

        {lastUpdatedAt && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Ultima atualizacao:</span>{" "}
            <span className="font-medium">{formatDate(lastUpdatedAt)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-value">Valor Atual *</Label>
            <Input
              id="current-value"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
            {hasValueChange && (
              <p
                className={`text-sm ${
                  valueDiff > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {valueDiff > 0 ? "+" : ""}
                {formatCurrency(valueDiff)} em relacao ao valor anterior (
                {formatCurrency(currentValue)})
              </p>
            )}
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
              {loading ? "Atualizando..." : "Atualizar Valor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
