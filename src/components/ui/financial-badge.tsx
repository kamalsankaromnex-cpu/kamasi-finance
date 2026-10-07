"use client";

import { Badge } from "./badge";
import { CheckCircle, Calendar, Sparkles } from "lucide-react";

export type FinancialState = "ACTUAL" | "PLANNED" | "FORECAST";

export interface FinancialBadgeProps {
  state: FinancialState;
  className?: string;
  showIcon?: boolean;
}

export function FinancialBadge({ state, className, showIcon = true }: FinancialBadgeProps) {
  switch (state) {
    case "ACTUAL":
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-[11px] font-semibold uppercase tracking-wider ${className || ""}`}
        >
          {showIcon && <CheckCircle className="h-3 w-3" />}
          <span>Actual</span>
        </Badge>
      );
    case "PLANNED":
      return (
        <Badge
          variant="outline"
          className={`bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1 text-[11px] font-semibold uppercase tracking-wider ${className || ""}`}
        >
          {showIcon && <Calendar className="h-3 w-3" />}
          <span>Planned</span>
        </Badge>
      );
    case "FORECAST":
      return (
        <Badge
          variant="outline"
          className={`bg-purple-500/10 text-purple-600 border-purple-500/30 gap-1 text-[11px] font-semibold uppercase tracking-wider ${className || ""}`}
        >
          {showIcon && <Sparkles className="h-3 w-3" />}
          <span>Forecast</span>
        </Badge>
      );
    default:
      return null;
  }
}
