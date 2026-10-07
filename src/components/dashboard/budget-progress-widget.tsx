"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { PiggyBank, AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface BudgetProgressWidgetProps {
  budget: DashboardSnapshot["budget"];
}

export function BudgetProgressWidget({ budget }: BudgetProgressWidgetProps) {
  const categories = budget.categories || [];
  const hasBudgets = categories.length > 0;

  return (
    <Card className="col-span-full md:col-span-1 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-primary" />
            Budget Utilization
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Spend thresholds and category limits
          </p>
        </div>
        <Link
          href="/budgets"
          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Overall summary bar */}
        <div className="rounded-lg bg-muted/40 p-3 border">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">Overall Spend</span>
            <span className="text-sm font-semibold">
              {formatINR(budget.totalSpent)} / {formatINR(budget.totalBudgeted)}
            </span>
          </div>
          <Progress
            value={Math.min(100, budget.utilizationPercentage)}
            className={`h-2 ${
              budget.utilizationPercentage > 100
                ? "[&>div]:bg-rose-500"
                : budget.utilizationPercentage > 85
                ? "[&>div]:bg-amber-500"
                : "[&>div]:bg-primary"
            }`}
          />
          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1.5">
            <span>Utilization: {budget.utilizationPercentage.toFixed(1)}%</span>
            <span>Remaining: {formatINR(budget.totalRemaining)}</span>
          </div>
        </div>

        {/* Category list */}
        {!hasBudgets ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-xs">No active category budgets set</p>
            <Link href="/budgets" className="text-xs text-primary hover:underline mt-1 inline-block">
              Create a budget plan →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {categories.slice(0, 5).map((cat) => {
              const isOver = cat.status === "EXCEEDED";
              const isWarning = cat.status === "WARNING";
              return (
                <div key={cat.categoryId} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium truncate max-w-[140px] flex items-center gap-1">
                      {isOver && <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />}
                      {cat.name}
                    </span>
                    <span className="text-muted-foreground">
                      {formatINR(cat.actual)} / {formatINR(cat.budgeted)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, cat.percentage)}
                    className={`h-1.5 ${
                      isOver
                        ? "[&>div]:bg-rose-500"
                        : isWarning
                        ? "[&>div]:bg-amber-500"
                        : "[&>div]:bg-emerald-500"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

