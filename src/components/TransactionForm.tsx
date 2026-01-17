"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import type { Transaction, Category, Origin } from "@/types";

interface Props {
  categories: Category[];
  origins: Origin[];
  transaction?: Transaction | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TransactionForm({
  categories,
  origins,
  transaction,
  onSuccess,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [description, setDescription] = useState(transaction?.description || "");
  const [amount, setAmount] = useState(
    transaction ? String(Math.abs(transaction.amount)) : ""
  );
  const [date, setDate] = useState(
    transaction
      ? new Date(transaction.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [type, setType] = useState<"INCOME" | "EXPENSE">(
    transaction?.type as "INCOME" | "EXPENSE" || "EXPENSE"
  );
  const [origin, setOrigin] = useState(transaction?.origin || "");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || "");
  const [isFixed, setIsFixed] = useState(transaction?.isFixed || false);
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState("2");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!description || !amount || !date || !origin) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatorios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const payload = {
        description,
        amount: parseFloat(amount),
        date,
        type,
        origin,
        categoryId: categoryId || null,
        isFixed,
        isInstallment: isInstallment && !transaction,
        totalInstallments: isInstallment ? parseInt(totalInstallments) : undefined,
        installmentAmount: isInstallment ? parseFloat(amount) : undefined,
      };

      const url = transaction
        ? `/api/transactions/${transaction.id}`
        : "/api/transactions";

      const res = await fetch(url, {
        method: transaction ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Erro ao salvar transacao");
      }

      toast({
        title: "Sucesso",
        description: transaction
          ? "Transacao atualizada com sucesso"
          : isInstallment
          ? `${totalInstallments} parcelas criadas com sucesso`
          : "Transacao criada com sucesso",
      });

      onSuccess();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao salvar a transacao",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`cursor-pointer rounded-lg border-2 p-3 text-center transition-colors ${
            type === "EXPENSE"
              ? "border-red-500 bg-red-50 text-red-700"
              : "border-gray-200 hover:border-gray-300"
          }`}
          onClick={() => setType("EXPENSE")}
        >
          Despesa
        </div>
        <div
          className={`cursor-pointer rounded-lg border-2 p-3 text-center transition-colors ${
            type === "INCOME"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-gray-200 hover:border-gray-300"
          }`}
          onClick={() => setType("INCOME")}
        >
          Receita
        </div>
      </div>

      <div>
        <Label htmlFor="description">Descricao *</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Supermercado"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="amount">Valor *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>

        <div>
          <Label htmlFor="date">Data *</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="origin">Origem *</Label>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a origem" />
          </SelectTrigger>
          <SelectContent>
            {origins.map((o) => (
              <SelectItem key={o.id} value={o.name}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="category">Categoria</Label>
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="isFixed"
            checked={isFixed}
            onCheckedChange={setIsFixed}
            disabled={isInstallment}
          />
          <Label htmlFor="isFixed">Despesa fixa mensal</Label>
        </div>
      </div>

      {!transaction && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch
              id="isInstallment"
              checked={isInstallment}
              onCheckedChange={(checked) => {
                setIsInstallment(checked);
                if (checked) setIsFixed(false);
              }}
            />
            <Label htmlFor="isInstallment">Compra parcelada</Label>
          </div>

          {isInstallment && (
            <div>
              <Label htmlFor="totalInstallments">Numero de parcelas</Label>
              <Input
                id="totalInstallments"
                type="number"
                min="2"
                max="48"
                value={totalInstallments}
                onChange={(e) => setTotalInstallments(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Serao criadas {totalInstallments} parcelas de{" "}
                {amount
                  ? new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(parseFloat(amount))
                  : "R$ 0,00"}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? "Salvando..." : transaction ? "Atualizar" : "Criar"}
        </Button>
      </div>
    </form>
  );
}
