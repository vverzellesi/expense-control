"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import type { Investment, InvestmentCategory } from "@/types";

interface InvestmentFormProps {
  investment?: Investment | null;
  categories: InvestmentCategory[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function InvestmentForm({
  investment,
  categories,
  onSuccess,
  onCancel,
}: InvestmentFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEditMode = !!investment;

  const [name, setName] = useState(investment?.name || "");
  const [categoryId, setCategoryId] = useState(investment?.categoryId || "");
  const [initialValue, setInitialValue] = useState("");
  const [goalAmount, setGoalAmount] = useState(
    investment?.goalAmount ? String(investment.goalAmount) : ""
  );
  const [broker, setBroker] = useState(investment?.broker || "");
  const [description, setDescription] = useState(investment?.description || "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do investimento e obrigatorio",
        variant: "destructive",
      });
      return;
    }

    if (!categoryId) {
      toast({
        title: "Erro",
        description: "Selecione uma categoria",
        variant: "destructive",
      });
      return;
    }

    if (!isEditMode && !initialValue) {
      toast({
        title: "Erro",
        description: "O valor inicial e obrigatorio",
        variant: "destructive",
      });
      return;
    }

    if (!isEditMode && parseFloat(initialValue) <= 0) {
      toast({
        title: "Erro",
        description: "O valor inicial deve ser maior que zero",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        categoryId,
        goalAmount: goalAmount ? parseFloat(goalAmount) : null,
        broker: broker.trim() || null,
        description: description.trim() || null,
      };

      if (!isEditMode) {
        payload.initialValue = parseFloat(initialValue);
      }

      const url = isEditMode
        ? `/api/investments/${investment.id}`
        : "/api/investments";

      const res = await fetch(url, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao salvar investimento");
      }

      toast({
        title: "Sucesso",
        description: isEditMode
          ? "Investimento atualizado com sucesso"
          : "Investimento criado com sucesso",
      });

      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Ocorreu um erro ao salvar o investimento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Editar Investimento" : "Novo Investimento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tesouro Selic 2029"
            />
          </div>

          <div>
            <Label htmlFor="category">Categoria *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
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

          {!isEditMode && (
            <div>
              <Label htmlFor="initialValue">Valor Inicial *</Label>
              <Input
                id="initialValue"
                type="number"
                step="0.01"
                min="0"
                value={initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <div>
            <Label htmlFor="goalAmount">Meta (opcional)</Label>
            <Input
              id="goalAmount"
              type="number"
              step="0.01"
              min="0"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div>
            <Label htmlFor="broker">Corretora/Banco (opcional)</Label>
            <Input
              id="broker"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="Ex: XP Investimentos"
            />
          </div>

          <div>
            <Label htmlFor="description">Descricao (opcional)</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas sobre o investimento..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Salvando..." : isEditMode ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
