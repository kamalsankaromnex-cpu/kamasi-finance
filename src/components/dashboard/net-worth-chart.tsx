"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ShieldCheck, Wallet, PiggyBank, Home, CreditCard, Landmark } from "lucide-react";

interface NetWorthChartProps {
  netWorth: DashboardSnapshot["netWorth"];
  periodLabel: string;
}

export function NetWorthChart({ netWorth, periodLabel }: NetWorthChartProps) {
  const hasTrajectory = netWorth.trajectorySeries && netWorth.trajectorySeries.length > 0;
  const { assetBreakdown, liabilityBreakdown } = netWorth;

  return (
    <Card className="col-span-full lg:col-span-2 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Net Worth Breakdown & Trajectory
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Asset vs Liability composition and 6-month historical progression
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold">{formatINR(netWorth.current)}</span>
          <p className="text-[10px] text-muted-foreground uppercase">Current Net Worth</p>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Composition Bars */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs bg-muted/30 p-2.5 rounded-lg border">
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3 text-emerald-500" /> Cash & Bank
            </span>
            <p className="font-semibold text-emerald-600">{formatINR(assetBreakdown.liquidCash)}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <PiggyBank className="h-3 w-3 text-purple-500" /> Investments
            </span>
            <p className="font-semibold text-purple-600">{formatINR(assetBreakdown.investments)}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Home className="h-3 w-3 text-blue-500" /> Physical Assets
            </span>
            <p className="font-semibold text-blue-600">{formatINR(assetBreakdown.physicalAssets)}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Landmark className="h-3 w-3 text-amber-500" /> Loans
            </span>
            <p className="font-semibold text-amber-600">{formatINR(liabilityBreakdown.loans)}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3 w-3 text-rose-500" /> Credit Cards
            </span>
            <p className="font-semibold text-rose-600">{formatINR(liabilityBreakdown.creditCards)}</p>
          </div>
        </div>

        {/* 6-Month Trajectory Area Chart */}
        {!hasTrajectory ? (
          <div className="flex h-56 flex-col items-center justify-center text-center p-4">
            <p className="text-sm font-medium text-muted-foreground">No historical net worth snapshots</p>
            <p className="text-xs text-muted-foreground/80 mt-1">Net worth trajectory builds as ledger activity accumulates</p>
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={netWorth.trajectorySeries}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatINR(Number(value) || 0),
                    name === "netWorth" ? "Net Worth" : name === "totalAssets" ? "Total Assets" : "Total Liabilities",
                  ]}
                  labelFormatter={(label) => `Period: ${label}`}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#netWorthGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

