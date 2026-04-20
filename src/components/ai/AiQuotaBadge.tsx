"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type UsageEnabled = {
  enabled: true;
  used: number;
  remaining: number;
  limit: number;
  yearMonth: string;
};

type UsageDisabled = { enabled: false };

type UsageResponse = UsageEnabled | UsageDisabled;

function daysUntilReset(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1));
  const now = new Date();
  const ms = nextMonth.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function AiQuotaBadge() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-usage");
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const data = (await res.json()) as UsageResponse;
        if (!cancelled) setUsage(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  // AI desabilitada no servidor: não renderiza nada (sem badge enganoso).
  if (usage && usage.enabled === false) return null;

  if (!usage) {
    return (
      <Badge variant="outline" className="text-xs font-normal">
        <Sparkles className="mr-1 h-3 w-3" />
        Carregando cota IA…
      </Badge>
    );
  }

  const resetDays = daysUntilReset(usage.yearMonth);

  if (usage.remaining === 0) {
    return (
      <Badge variant="destructive" className="text-xs font-normal">
        <Sparkles className="mr-1 h-3 w-3" />
        IA esgotada · usando parser tradicional
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-normal">
      <Sparkles className="mr-1 h-3 w-3 text-emerald-600" />
      IA: {usage.used}/{usage.limit} usos · reseta em {resetDays}d
    </Badge>
  );
}
