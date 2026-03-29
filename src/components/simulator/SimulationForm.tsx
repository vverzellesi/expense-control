"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/types";

interface SimulationFormProps {
  description: string;
  onDescriptionChange: (v: string) => void;
  totalAmount: number;
  onTotalAmountChange: (v: number) => void;
  totalInstallments: number;
  onTotalInstallmentsChange: (v: number) => void;
  categoryId: string;
  onCategoryIdChange: (v: string) => void;
  categories: Category[];
}

export function SimulationForm({
  description,
  onDescriptionChange,
  totalAmount,
  onTotalAmountChange,
  totalInstallments,
  onTotalInstallmentsChange,
  categoryId,
  onCategoryIdChange,
  categories,
}: SimulationFormProps) {
  const installmentOptions = Array.from({ length: 24 }, (_, i) => i + 1);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex: TV Samsung 55&quot;"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalAmount">Valor total (R$)</Label>
            <CurrencyInput
              id="totalAmount"
              value={totalAmount != null ? totalAmount.toFixed(2) : ""}
              onChange={(v) => onTotalAmountChange(v ? parseFloat(v) : 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="installments">Parcelas</Label>
            <Select
              value={String(totalInstallments)}
              onValueChange={(v) => onTotalInstallmentsChange(parseInt(v))}
            >
              <SelectTrigger id="installments">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {installmentOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}x {totalAmount > 0 ? `(R$ ${(totalAmount / n).toFixed(2)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Select value={categoryId} onValueChange={onCategoryIdChange}>
              <SelectTrigger id="category">
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
        </div>
      </CardContent>
    </Card>
  );
}
