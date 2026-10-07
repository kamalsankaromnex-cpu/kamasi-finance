"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { LineChart as ChartIcon, Sparkles } from "lucide-react";

interface ForecastChartProps {
  forecast: DashboardSnapshot["forecast"];
}

export function ForecastChart({ forecast }: ForecastChartProps) {
  const hasTrajectory = forecast.available && forecast.trajectory && forecast.trajectory.length > 0;

  return (
    <Card className="col-span-full lg:col-span-2 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-primary" />
            12-Month Net Worth Trajectory
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scenario projections (Conservative, Baseline, Optimistic)
          </p>
        </div>
        {forecast.available && (
          <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
            <Sparkles className="h-3 w-3" />
            <span>Scenario: {forecast.scenarioName}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Milestone Milestones */}
        {forecast.available && (
          <div className="grid grid-cols-3 gap-2 text-center bg-muted/30 p-2 rounded-lg border text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">3 Months</p>
              <p className="font-semibold">{formatINR(forecast.projected3MonthNetWorth)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">6 Months</p>
              <p className="font-semibold">{formatINR(forecast.projected6MonthNetWorth)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">12 Months</p>
              <p className="font-semibold text-primary">{formatINR(forecast.projected12MonthNetWorth)}</p>
            </div>
          </div>
        )}

        {!hasTrajectory ? (
          <div className="flex h-56 flex-col items-center justify-center text-center p-4">
            <p className="text-sm font-medium text-muted-foreground">Forecasting model not yet calibrated</p>
            <p className="text-xs text-muted-foreground/80 mt-1">Requires recurring income and budget benchmarks to project 12-month trajectory</p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={forecast.trajectory}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="date"
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
                    name === "projectedNetWorth"
                      ? "Baseline"
                      : name === "conservativeNetWorth"
                      ? "Conservative"
                      : "Optimistic",
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
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
                  height={32}
                  iconType="plainline"
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground capitalize">
                      {value === "projectedNetWorth"
                        ? "Baseline"
                        : value === "conservativeNetWorth"
                        ? "Conservative"
                        : "Optimistic"}
                    </span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="conservativeNetWorth"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="projectedNetWorth"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="optimisticNetWorth"
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

