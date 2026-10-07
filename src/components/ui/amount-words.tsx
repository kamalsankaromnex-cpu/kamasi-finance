"use client";

import { useMemo } from "react";
import { amountToWordsINR } from "@/lib/amount-to-words";

interface AmountWordsProps {
  amount: number | string | null | undefined;
  className?: string;
}

export function AmountWords({ amount, className = "" }: AmountWordsProps) {
  const result = useMemo(() => {
    return amountToWordsINR(amount);
  }, [amount]);

  if (!result.isValid || !result.words) {
    return null;
  }

  return (
    <div className={`mt-1.5 flex items-center gap-1 text-xs text-primary font-medium ${className}`}>
      <span className="inline-block bg-primary/10 border border-primary/20 rounded-md px-2 py-0.5 font-sans">
        {result.words}
      </span>
    </div>
  );
}
