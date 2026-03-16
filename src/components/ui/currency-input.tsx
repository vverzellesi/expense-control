"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** Raw numeric string, e.g. "1234.56", or "" for empty */
  value: string;
  /** Called with raw numeric string, e.g. "1234.56", or "" when cleared */
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
  ({ value, onChange, placeholder = "R$ 0,00", ...props }, ref) => {
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
      <Input
        ref={innerRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatDisplay, digitsToRaw };
