"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
}

export function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);

  function applyRange() {
    if (tempStartDate && tempEndDate) {
      onRangeChange(tempStartDate, tempEndDate);
      setIsOpen(false);
    }
  }

  function setQuickRange(months: number) {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months + 1);
    start.setDate(1);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    setTempStartDate(startStr);
    setTempEndDate(endStr);
    onRangeChange(startStr, endStr);
    setIsOpen(false);
  }

  function setCurrentMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    setTempStartDate(startStr);
    setTempEndDate(endStr);
    onRangeChange(startStr, endStr);
    setIsOpen(false);
  }

  function navigateMonth(direction: "prev" | "next") {
    const currentStart = new Date(startDate);
    const offset = direction === "prev" ? -1 : 1;

    const newStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + offset, 1);
    const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0);

    const startStr = newStart.toISOString().split("T")[0];
    const endStr = newEnd.toISOString().split("T")[0];

    setTempStartDate(startStr);
    setTempEndDate(endStr);
    onRangeChange(startStr, endStr);
  }

  const displayText = startDate && endDate
    ? `${formatDate(startDate)} - ${formatDate(endDate)}`
    : "Selecione o período";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => navigateMonth("prev")}
        className="h-9 w-9"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[240px] justify-start">
            <Calendar className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Atalhos</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={setCurrentMonth}
                >
                  Mes atual
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange(3)}
                >
                  Últimos 3 meses
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange(6)}
                >
                  Últimos 6 meses
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickRange(12)}
                >
                  Último ano
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Período personalizado</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">De</Label>
                  <Input
                    type="date"
                    value={tempStartDate}
                    onChange={(e) => setTempStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Ate</Label>
                  <Input
                    type="date"
                    value={tempEndDate}
                    onChange={(e) => setTempEndDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={applyRange}
                disabled={!tempStartDate || !tempEndDate}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        onClick={() => navigateMonth("next")}
        className="h-9 w-9"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
