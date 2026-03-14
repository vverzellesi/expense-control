"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** Raw numeric string, e.g. "1234.56" */
  value: string;
  /** Called with raw numeric string, e.g. "1234.56" */
  onChange: (value: string) => void;
}

function formatDisplay(raw: string): string {
  if (!raw) return "";
  const num = parseFloat(raw);
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function digitsToRaw(digits: string): string {
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  if (isNaN(cents)) return "";
  return (cents / 100).toFixed(2);
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, placeholder = "R$ 0,00", ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    // Merge forwarded ref with inner ref
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const display = value ? `R$ ${formatDisplay(value)}` : "";

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const digits = e.target.value.replace(/\D/g, "");
      onChange(digitsToRaw(digits));
    }

    // Keep cursor at end when display value changes
    React.useEffect(() => {
      const el = innerRef.current;
      if (el && el === document.activeElement && display) {
        const len = display.length;
        el.setSelectionRange(len, len);
      }
    }, [display]);

    return (
      <input
        ref={innerRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatDisplay, digitsToRaw };
