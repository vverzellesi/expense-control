"use client";

import { Button } from "@/components/ui/button";
import { ShoppingCart, Save, Trash2 } from "lucide-react";

interface SimulatorActionsProps {
  hasSimulation: boolean;
  isSaved: boolean;
  onSave: () => void;
  onRegister: () => void;
  onDiscard: () => void;
}

export function SimulatorActions({
  hasSimulation,
  isSaved,
  onSave,
  onRegister,
  onDiscard,
}: SimulatorActionsProps) {
  if (!hasSimulation) return null;

  return (
    <div className="sticky bottom-0 border-t bg-white p-4 -mx-4 md:-mx-6 flex gap-3 justify-end">
      <Button variant="ghost" onClick={onDiscard} className="text-gray-500">
        <Trash2 className="h-4 w-4 mr-2" />
        Descartar
      </Button>
      {!isSaved && (
        <Button variant="outline" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar simulacao
        </Button>
      )}
      <Button onClick={onRegister} className="bg-emerald-600 hover:bg-emerald-700">
        <ShoppingCart className="h-4 w-4 mr-2" />
        Registrar compra
      </Button>
    </div>
  );
}
