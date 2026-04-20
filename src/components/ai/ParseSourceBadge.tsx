import { AlertTriangle, Sparkles } from "lucide-react";

type Source = "ai" | "notif" | "regex";

type Props = {
  source: Source;
  usedFallback: boolean;
};

export function ParseSourceBadge({ source, usedFallback }: Props) {
  if (source === "ai" && !usedFallback) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
        <Sparkles className="h-3.5 w-3.5" />
        Extraído com IA
      </div>
    );
  }

  if (usedFallback) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Usando parser tradicional — revise com atenção
      </div>
    );
  }

  return null;
}
