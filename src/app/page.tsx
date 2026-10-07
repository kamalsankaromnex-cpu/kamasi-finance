"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { FormErrorReassurance } from "@/components/ui/form-error-reassurance";
import { FinancialBadge } from "@/components/ui/financial-badge";
import {
  DashboardPeriodType,
  DashboardSnapshot,
} from "@/finance/dashboard/dashboard-query.service";
import { KpiSummaryCards } from "@/components/dashboard/kpi-summary-cards";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { NetWorthChart } from "@/components/dashboard/net-worth-chart";
import { BudgetProgressWidget } from "@/components/dashboard/budget-progress-widget";
import { GoalsWidget } from "@/components/dashboard/goals-widget";
import { InvestmentsWidget } from "@/components/dashboard/investments-widget";
import { BorrowingsWidget } from "@/components/dashboard/borrowings-widget";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { GoalFundingWidget } from "@/components/dashboard/goal-funding-widget";
import { AlertsActivityWidget } from "@/components/dashboard/alerts-activity-widget";
import {
  RotateCcw,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriodType>("MONTHLY");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  const fetchDashboard = useCallback(async (selectedPeriod: DashboardPeriodType) => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await fetch(`/api/dashboard?period=${selectedPeriod}`);
      if (!res.ok) {
        throw new Error(`Failed to load command center snapshot: ${res.statusText}`);
      }
      const data: DashboardSnapshot = await res.json();
      setSnapshot(data);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load command center data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(period);
  }, [fetchDashboard, period]);

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Header with Title, Period Switcher, and Refresh */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                Financial Command Center
              </h1>
              <FinancialBadge state="ACTUAL" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Read-only visual command center over certified double-entry ledger • Period:{" "}
              <span className="font-semibold text-foreground">
                {snapshot ? snapshot.period.label : "Loading..."}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Pills */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-1 text-xs">
              {(["MONTHLY", "QUARTERLY", "YEARLY", "ALL_TIME"] as DashboardPeriodType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    period === p
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "MONTHLY" ? "Monthly" : p === "QUARTERLY" ? "Quarterly" : p === "YEARLY" ? "Yearly" : "All Time"}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(period)}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error Reassurance Banner */}
        {loadError && (
          <FormErrorReassurance
            type="NETWORK_TIMEOUT"
            message={loadError}
            onRetry={() => fetchDashboard(period)}
          />
        )}

        {/* Loading State or Rendered Widgets */}
        {loading && !snapshot ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl border bg-muted/20 animate-pulse" />
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-72 rounded-xl border bg-muted/20 animate-pulse" />
              <div className="h-72 rounded-xl border bg-muted/20 animate-pulse" />
            </div>
          </div>
        ) : snapshot ? (
          <div className="space-y-6">
            {/* Row 1: KPI Summary Cards */}
            <KpiSummaryCards
              overview={snapshot.overview}
              periodLabel={snapshot.period.label}
              currencySymbol={snapshot.currency.symbol}
            />

            {/* Row 2: Cash Flow and Net Worth Visuals */}
            <div className="grid gap-6 lg:grid-cols-4">
              <CashFlowChart cashFlow={snapshot.cashFlow} periodLabel={snapshot.period.label} />
              <NetWorthChart netWorth={snapshot.netWorth} periodLabel={snapshot.period.label} />
            </div>

            {/* Row 3: Budget, Goals, Investments, Debt (4 Widgets in 2x2 or 4-col responsive grid) */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <BudgetProgressWidget budget={snapshot.budget} />
              <GoalsWidget goals={snapshot.goals} />
              <InvestmentsWidget investments={snapshot.investments} />
              <BorrowingsWidget borrowings={snapshot.borrowings} />
            </div>

            {/* Row 4: 12-Month Net Worth Trajectory & Goal Funding Planner */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ForecastChart forecast={snapshot.forecast} />
              </div>
              <div className="lg:col-span-1">
                <GoalFundingWidget goals={snapshot.goals} />
              </div>
            </div>

            {/* Row 5: Action Items & Recent Ledger Activity */}
            <AlertsActivityWidget
              alerts={snapshot.alerts}
              recentActivity={snapshot.recentActivity}
            />
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
