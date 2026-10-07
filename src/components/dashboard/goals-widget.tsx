"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { Target, ArrowRight } from "lucide-react";
import Link from "next/link";

interface GoalsWidgetProps {
  goals: DashboardSnapshot["goals"];
}

export function GoalsWidget({ goals }: GoalsWidgetProps) {
  const items = goals.items || [];
  const hasGoals = items.length > 0;

  return (
    <Card className="col-span-full md:col-span-1 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Savings Goals
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active milestones and funding progress
          </p>
        </div>
        <Link
          href="/savings-goals"
          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Overall summary bar */}
        <div className="rounded-lg bg-muted/40 p-3 border">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">Portfolio Progress</span>
            <span className="text-sm font-semibold">
              {formatINR(goals.overallSaved)} / {formatINR(goals.overallTarget)}
            </span>
          </div>
          <Progress value={goals.overallProgressPercent} className="h-2 [&>div]:bg-primary" />
          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1.5">
            <span>Progress: {goals.overallProgressPercent.toFixed(1)}%</span>
            <span>Active Goals: {goals.totalGoals}</span>
          </div>
        </div>

        {/* Goals list */}
        {!hasGoals ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-xs">No active goals created</p>
            <Link href="/savings-goals" className="text-xs text-primary hover:underline mt-1 inline-block">
              Set your first savings goal →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {items.slice(0, 4).map((g) => (
              <div key={g.id} className="space-y-1 rounded-md border p-2 bg-background/50">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium truncate max-w-[150px]">{g.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {g.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{formatINR(g.currentAmount)}</span>
                  <span>Target: {formatINR(g.targetAmount)}</span>
                </div>
                <Progress value={g.progressPercent} className="h-1.5 [&>div]:bg-emerald-500" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

