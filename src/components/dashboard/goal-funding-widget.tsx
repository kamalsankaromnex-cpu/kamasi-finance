"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { Sparkles, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

interface GoalFundingWidgetProps {
  goals: DashboardSnapshot["goals"];
}

export function GoalFundingWidget({ goals }: GoalFundingWidgetProps) {
  const items = goals.items || [];
  const hasGoals = items.length > 0;
  const totalGap = Math.max(0, goals.overallTarget - goals.overallSaved);

  return (
    <Card className="col-span-full md:col-span-1 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Goal Funding v2 Planner
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deterministic strategy and shortfall planning
          </p>
        </div>
        <Link
          href="/goal-funding"
          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
        >
          Plan Funding <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Funding gap pill */}
        <div className="rounded-lg bg-muted/40 p-3 border">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">Portfolio Funding Gap</span>
            <span className="text-sm font-semibold text-rose-600">
              {formatINR(totalGap)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px] text-muted-foreground">
            <span>Current Capital: {formatINR(goals.overallSaved)}</span>
            <span>Target: {formatINR(goals.overallTarget)}</span>
          </div>
        </div>

        {/* Certified Strategy Pillars */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Certified Funding Engines</span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 p-2 rounded border bg-background/60">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">Aggressive Growth</span>
            </div>
            <div className="flex items-center gap-1.5 p-2 rounded border bg-background/60">
              <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="truncate">Conservative Debt</span>
            </div>
          </div>
        </div>

        {!hasGoals ? (
          <div className="text-center py-4 text-muted-foreground border-t pt-3">
            <p className="text-xs">No active funding targets defined</p>
            <Link href="/goal-funding" className="text-xs text-primary hover:underline mt-1 inline-block">
              Launch Goal Funding v2 Wizard →
            </Link>
          </div>
        ) : (
          <div className="pt-2 border-t text-xs text-muted-foreground flex justify-between items-center">
            <span>{items.length} goals mapped to funding matrix</span>
            <Link href="/goal-funding" className="text-primary hover:underline font-medium">
              Run solver →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

