"use client";

import { formatCurrency } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DayData {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  totalExpense: number;
  transactionCount: number;
  transactions: { description: string; amount: number }[];
}

interface Props {
  days: DayData[];
  maxExpense: number;
}

function getIntensityClass(expense: number, maxExpense: number): string {
  if (expense === 0) return "bg-gray-100 text-gray-400";
  if (maxExpense === 0) return "bg-gray-100 text-gray-400";

  const ratio = expense / maxExpense;

  if (ratio > 0.9) return "bg-emerald-700 text-white";
  if (ratio > 0.66) return "bg-emerald-500 text-white";
  if (ratio > 0.33) return "bg-emerald-300 text-gray-800";
  return "bg-emerald-100 text-gray-700";
}

const WEEKDAY_HEADERS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function CalendarHeatmap({ days, maxExpense }: Props) {
  if (days.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  // First day of month's day of week determines empty cells before the 1st
  const firstDayOfWeek = days[0]?.dayOfWeek || 0;
  const emptyCells = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((header) => (
          <div
            key={header}
            className="text-center text-xs font-medium text-gray-500 py-1"
          >
            {header}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before the 1st */}
        {emptyCells.map((i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {days.map((day) => (
          <Popover key={day.date}>
            <PopoverTrigger asChild>
              <button
                className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs transition-colors hover:ring-2 hover:ring-emerald-400 cursor-pointer ${getIntensityClass(day.totalExpense, maxExpense)}`}
              >
                <span className="font-medium text-[10px] sm:text-xs">{day.dayOfMonth}</span>
                {day.totalExpense > 0 && (
                  <span className="text-[8px] sm:text-[10px] leading-tight truncate max-w-full px-0.5">
                    {formatCurrency(day.totalExpense).replace("R$\u00a0", "R$")}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <div className="space-y-2">
                <div className="font-medium text-sm">
                  {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </div>
                <div className="text-sm text-gray-600">
                  Total: <span className="font-semibold">{formatCurrency(day.totalExpense)}</span>
                  {" "} ({day.transactionCount} {day.transactionCount === 1 ? "transacao" : "transacoes"})
                </div>
                {day.transactions.length > 0 && (
                  <div className="border-t pt-2 space-y-1 max-h-40 overflow-y-auto">
                    {day.transactions.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="truncate mr-2">{t.description}</span>
                        <span className="font-medium whitespace-nowrap">{formatCurrency(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {day.transactions.length === 0 && (
                  <div className="text-xs text-gray-400">Nenhuma despesa neste dia</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pt-2">
        <span>Menor</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-gray-100" />
          <div className="w-4 h-4 rounded bg-emerald-100" />
          <div className="w-4 h-4 rounded bg-emerald-300" />
          <div className="w-4 h-4 rounded bg-emerald-500" />
          <div className="w-4 h-4 rounded bg-emerald-700" />
        </div>
        <span>Maior</span>
      </div>
    </div>
  );
}
