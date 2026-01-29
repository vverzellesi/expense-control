"use client";

import { cn } from "@/lib/utils";

interface OnboardingDotsProps {
  total: number;
  current: number;
  onDotClick: (index: number) => void;
}

export function OnboardingDots({ total, current, onDotClick }: OnboardingDotsProps) {
  return (
    <div
      role="tablist"
      aria-label="Navegacao do tutorial"
      className="flex items-center justify-center gap-2"
    >
      {Array.from({ length: total }, (_, index) => {
        const isActive = index === current;

        return (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Ir para slide ${index + 1} de ${total}`}
            onClick={() => onDotClick(index)}
            className={cn(
              "rounded-full transition-all duration-300 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
              isActive
                ? "h-3 w-3 bg-emerald-500"
                : "h-2.5 w-2.5 border-2 border-gray-300 bg-transparent hover:border-emerald-300"
            )}
          />
        );
      })}
    </div>
  );
}
