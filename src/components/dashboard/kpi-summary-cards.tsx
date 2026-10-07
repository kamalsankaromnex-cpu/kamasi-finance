"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShieldCheck,
  CreditCard,
  Building,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface KpiSummaryCardsProps {
  overview: DashboardSnapshot["overview"];
  periodLabel: string;
  currencySymbol: string;
}

export function KpiSummaryCards({ overview, periodLabel, currencySymbol }: KpiSummaryCardsProps) {
  const isSurplusPositive = overview.netSavingsInPeriod >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Net Worth */}
      <Card className="border-l-4 border-l-primary shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Net Worth
          </CardTitle>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">
            {formatINR(overview.netWorth)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <span>Assets: {formatINR(overview.totalAssets)}</span>
            <span>•</span>
            <span>Liab: {formatINR(overview.totalLiabilities)}</span>
          </p>
        </CardContent>
      </Card>

      {/* 2. Liquid Cash */}
      <Card className="border-l-4 border-l-emerald-500 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Available Cash
          </CardTitle>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
            <Wallet className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-emerald-600">
            {formatINR(overview.availableCash)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Liquid Bank & Cash Balances
          </p>
        </CardContent>
      </Card>

      {/* 3. Income vs Expenses in Period */}
      <Card className="border-l-4 border-l-blue-500 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Inflow & Outflow
          </CardTitle>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-blue-600">+{formatINR(overview.incomeInPeriod)}</span>
            <span className="text-sm font-semibold text-rose-600">-{formatINR(overview.expensesInPeriod)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
            <span>Net Surplus:</span>
            <span className={`font-semibold ${isSurplusPositive ? "text-emerald-600" : "text-rose-600"}`}>
              {isSurplusPositive ? "+" : ""}{formatINR(overview.netSavingsInPeriod)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 4. Debt & Investment Assets */}
      <Card className="border-l-4 border-l-purple-500 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Investments & Debt
          </CardTitle>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-600">
            <PiggyBank className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight text-purple-600">
            {formatINR(overview.investmentMarketValue)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
            <span>Investments</span>
            <span className="text-amber-600 font-medium">Debt: {formatINR(overview.borrowingOutstanding)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


