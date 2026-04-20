import { AlertTriangle, Sparkles } from "lucide-react";
import type { FallbackReason } from "@/lib/parse-pipeline";

type Source = "ai" | "notif" | "regex";

type Props = {
  source: Source;
  fallbackReason?: FallbackReason;
};

/**
 * Badge contextual baseado na fonte do parse e no motivo do fallback.
 *
 * Contrato:
 * - source="ai"                              → "Extraído com IA" (verde)
 * - source="notif"                           → null (parser de notificação é silencioso)
 * - fallbackReason="disabled"                → null (AI não configurada, não poluir UI)
 * - fallbackReason="quota_exhausted"         → "IA esgotada este mês" (amarelo)
 * - fallbackReason="quota_error" | "ai_error" → "IA indisponível — parser tradicional" (amarelo)
 * - fallbackReason="gate_rejected"           → "IA não reconheceu o documento" (amarelo)
 * - fallbackReason="pdf_encrypted"           → "PDF protegido — parser tradicional" (amarelo)
 * - source="regex" sem fallbackReason        → null (defensivo)
 */
export function ParseSourceBadge({ source, fallbackReason }: Props) {
  if (source === "ai" && !fallbackReason) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
        <Sparkles className="h-3.5 w-3.5" />
        Extraído com IA
      </div>
    );
  }

  // Notif: via rápida silenciosa.
  if (source === "notif") return null;

  // AI desabilitada: não comentar.
  if (fallbackReason === "disabled") return null;

  // Sem razão de fallback explícita (defensivo): não comentar.
  if (!fallbackReason) return null;

  const label = messageFor(fallbackReason);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200">
      <AlertTriangle className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function messageFor(reason: FallbackReason): string {
  switch (reason) {
    case "quota_exhausted":
      return "IA esgotada este mês — parser tradicional";
    case "quota_error":
    case "ai_error":
      return "IA indisponível — parser tradicional";
    case "gate_rejected":
      return "IA não reconheceu o documento — parser tradicional";
    case "pdf_encrypted":
      return "PDF protegido — parser tradicional";
    case "disabled":
      // Já tratado antes, mas TS exige exaustividade.
      return "";
  }
}
