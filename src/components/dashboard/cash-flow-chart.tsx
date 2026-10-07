"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

interface CashFlowChartProps {
  cashFlow: DashboardSnapshot["cashFlow"];
  periodLabel: string;
}

export function CashFlowChart({ cashFlow, periodLabel }: CashFlowChartProps) {
  const hasSeriesData = cashFlow.series && cashFlow.series.length > 0;

  return (
    <Card className="col-span-full lg:col-span-2 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Cash Flow & Net Surplus
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Income vs Expenses and Net Savings ({periodLabel})
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 font-medium text-emerald-600">
            <span>+{formatINR(cashFlow.totalInflow)}</span>
          </div>
          <div className="flex items-center gap-1 font-medium text-rose-600">
            <span>-{formatINR(cashFlow.totalOutflow)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {!hasSeriesData ? (
          <div className="flex h-64 flex-col items-center justify-center text-center p-4">
            <p className="text-sm font-medium text-muted-foreground">No cash flow activity recorded</p>
            <p className="text-xs text-muted-foreground/80 mt-1">Post transactions to view income and expense cash flow trends</p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cashFlow.series}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
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
                    name === "income" ? "Income" : name === "expenses" ? "Expenses" : "Net Surplus",
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
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground capitalize">
                      {value === "income" ? "Inflow" : value === "expenses" ? "Outflow" : "Net Surplus"}
                    </span>
                  )}
                />
                <Bar dataKey="income" name="income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expenses" name="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

