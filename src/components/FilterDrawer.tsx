"use client";

import { useEffect, useState } from "react";
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
import { X, Tag } from "lucide-react";
import type { Category, Origin } from "@/types";

interface FilterValues {
  startDate: string;
  endDate: string;
  category: string;
  type: string;
  origin: string;
  isFixed: boolean;
  isInstallment: boolean;
  tag: string;
}

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterValues;
  onApply: (filters: FilterValues) => void;
  categories: Category[];
  origins: Origin[];
  allTags: string[];
}

export function FilterDrawer({
  isOpen,
  onClose,
  filters,
  onApply,
  categories,
  origins,
  allTags,
}: FilterDrawerProps) {
  const [localFilters, setLocalFilters] = useState<FilterValues>(filters);

  // Sync local filters when drawer opens
  useEffect(() => {
    if (isOpen) {
      setLocalFilters(filters);
    }
  }, [isOpen, filters]);

  function handleClear() {
    const currentDate = new Date();
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    setLocalFilters({
      startDate: currentMonthStart.toISOString().split("T")[0],
      endDate: currentMonthEnd.toISOString().split("T")[0],
      category: "all",
      type: "all",
      origin: "all",
      isFixed: false,
      isInstallment: false,
      tag: "",
    });
  }

  function handleApply() {
    onApply(localFilters);
    onClose();
  }

  // Prevent body scroll when drawer is open
  // Uses a counter to handle multiple overlays safely
  useEffect(() => {
    if (!isOpen) return;

    // Increment the scroll lock counter
    const currentCount = parseInt(document.body.dataset.scrollLockCount || "0", 10);
    document.body.dataset.scrollLockCount = String(currentCount + 1);
    document.body.style.overflow = "hidden";

    return () => {
      // Decrement the counter and only restore scroll if no other locks remain
      const count = parseInt(document.body.dataset.scrollLockCount || "1", 10);
      const newCount = Math.max(0, count - 1);
      document.body.dataset.scrollLockCount = String(newCount);

      if (newCount === 0) {
        document.body.style.overflow = "";
        delete document.body.dataset.scrollLockCount;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl"
        style={{ height: "70vh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Limpar
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-4 py-4 space-y-6" style={{ height: "calc(70vh - 140px)" }}>
          {/* Date Range */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Periodo</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">De</Label>
                <Input
                  type="date"
                  value={localFilters.startDate}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, startDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Ate</Label>
                <Input
                  type="date"
                  value={localFilters.endDate}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, endDate: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Categoria</Label>
            <Select
              value={localFilters.category}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, category: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
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

          {/* Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`rounded-lg border-2 p-3 text-center text-sm transition-colors ${
                  localFilters.type === "all"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setLocalFilters({ ...localFilters, type: "all" })}
              >
                Todos
              </button>
              <button
                type="button"
                className={`rounded-lg border-2 p-3 text-center text-sm transition-colors ${
                  localFilters.type === "EXPENSE"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setLocalFilters({ ...localFilters, type: "EXPENSE" })}
              >
                Despesa
              </button>
              <button
                type="button"
                className={`rounded-lg border-2 p-3 text-center text-sm transition-colors ${
                  localFilters.type === "INCOME"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setLocalFilters({ ...localFilters, type: "INCOME" })}
              >
                Receita
              </button>
            </div>
          </div>

          {/* Origin */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Origem</Label>
            <Select
              value={localFilters.origin}
              onValueChange={(value) =>
                setLocalFilters({ ...localFilters, origin: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {origins.map((o) => (
                  <SelectItem key={o.id} value={o.name}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Switches */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="fixed-mobile">Despesas fixas</Label>
              <Switch
                id="fixed-mobile"
                checked={localFilters.isFixed}
                onCheckedChange={(checked) =>
                  setLocalFilters({ ...localFilters, isFixed: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="installment-mobile">Parceladas</Label>
              <Switch
                id="installment-mobile"
                checked={localFilters.isInstallment}
                onCheckedChange={(checked) =>
                  setLocalFilters({ ...localFilters, isInstallment: checked })
                }
              />
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tag</Label>
              <Select
                value={localFilters.tag}
                onValueChange={(value) =>
                  setLocalFilters({ ...localFilters, tag: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {tag}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={handleApply}
          >
            Aplicar Filtros
          </Button>
        </div>
      </div>
    </>
  );
}
