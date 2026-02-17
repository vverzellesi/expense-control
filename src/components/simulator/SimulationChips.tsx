"use client";

import { X, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { Simulation } from "@/types";

interface SimulationChipsProps {
  simulations: Simulation[];
  selectedId: string | null;
  onSelect: (simulation: Simulation) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function SimulationChips({
  simulations,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onNew,
}: SimulationChipsProps) {
  if (simulations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {simulations.map((sim) => (
        <div
          key={sim.id}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            selectedId === sim.id
              ? "border-emerald-500 bg-emerald-50"
              : "border-gray-200 bg-white hover:border-gray-300",
            !sim.isActive && "opacity-50",
          )}
        >
          {/* Toggle checkbox */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(sim.id, !sim.isActive);
            }}
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded border",
              sim.isActive
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-gray-300",
            )}
          >
            {sim.isActive && <Check className="h-3 w-3" />}
          </button>

          {/* Chip label */}
          <button
            onClick={() => onSelect(sim)}
            className="truncate max-w-[150px]"
            title={`${sim.description} - ${formatCurrency(sim.totalAmount)} em ${sim.totalInstallments}x`}
          >
            {sim.description}
          </button>

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sim.id);
            }}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* New simulation chip */}
      <button
        onClick={onNew}
        className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Nova simulação
      </button>
    </div>
  );
}
