"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Category } from "@/types";

interface RegisterPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  categoryId: string;
  categories: Category[];
  onSuccess: () => void;
}

export function RegisterPurchaseDialog({
  open,
  onOpenChange,
  description,
  totalAmount,
  totalInstallments,
  categoryId: initialCategoryId,
  categories,
  onSuccess,
}: RegisterPurchaseDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [origin, setOrigin] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);

  const installmentAmount = totalAmount / totalInstallments;

  async function handleRegister() {
    setLoading(true);
    try {
      const isInstallment = totalInstallments > 1;

      const body: Record<string, unknown> = {
        description,
        amount: installmentAmount,
        date,
        type: "EXPENSE",
        origin: origin || "Simulador",
        categoryId: selectedCategoryId || null,
        isFixed: false,
        isInstallment,
      };

      if (isInstallment) {
        body.totalInstallments = totalInstallments;
        body.installmentAmount = installmentAmount;
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao registrar compra");
      }

      toast({ title: "Compra registrada com sucesso!" });
      onSuccess();
      router.push("/dashboard");
    } catch (error) {
      toast({
        title: "Erro ao registrar compra",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="font-medium text-gray-900">{description}</p>
            <p className="text-sm text-gray-500 mt-1">
              {totalInstallments > 1
                ? `${totalInstallments}x ${formatCurrency(installmentAmount)} (total: ${formatCurrency(totalAmount)})`
                : formatCurrency(totalAmount)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-date">Data da primeira parcela</Label>
            <Input
              id="reg-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-origin">Origem / Banco</Label>
            <Input
              id="reg-origin"
              placeholder="Ex: Cartao Nubank"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-category">Categoria</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger id="reg-category">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleRegister} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Registrando..." : "Confirmar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
