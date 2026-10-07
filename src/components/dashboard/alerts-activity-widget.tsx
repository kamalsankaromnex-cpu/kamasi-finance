"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { AlertCircle, AlertTriangle, Info, ArrowRight, Clock } from "lucide-react";
import Link from "next/link";

interface AlertsActivityWidgetProps {
  alerts: DashboardSnapshot["alerts"];
  recentActivity: DashboardSnapshot["recentActivity"];
}

export function AlertsActivityWidget({ alerts, recentActivity }: AlertsActivityWidgetProps) {
  const hasAlerts = alerts && alerts.length > 0;
  const hasActivity = recentActivity && recentActivity.length > 0;

  return (
    <div className="col-span-full grid gap-4 md:grid-cols-2">
      {/* 1. Attention & Action Items */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Financial Attention Items
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liquidity warnings and budget limit breaches
            </p>
          </div>
          {hasAlerts && (
            <Badge variant="secondary" className="text-xs">
              {alerts.length} Active
            </Badge>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {!hasAlerts ? (
            <div className="flex h-44 flex-col items-center justify-center text-center p-4">
              <p className="text-sm font-medium text-emerald-600">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">No pending warnings or liquidity concerns detected</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const isCrit = alert.type === "CRITICAL";
                const isWarn = alert.type === "WARNING";
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                      isCrit
                        ? "bg-rose-50/50 border-rose-200 text-rose-900"
                        : isWarn
                        ? "bg-amber-50/50 border-amber-200 text-amber-900"
                        : "bg-blue-50/50 border-blue-200 text-blue-900"
                    }`}
                  >
                    {isCrit ? (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : isWarn ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-0.5">
                      <div className="font-semibold">{alert.title}</div>
                      <p className="text-[11px] opacity-90">{alert.message}</p>
                      {alert.ctaHref && alert.ctaLabel && (
                        <Link
                          href={alert.ctaHref}
                          className="inline-flex items-center gap-1 font-semibold underline mt-1 text-[11px]"
                        >
                          {alert.ctaLabel} <ArrowRight className="h-2.5 w-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Recent Reconciled Activity */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Reconciled Activity
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest 5 posted ledger journal entries
            </p>
          </div>
          <Link
            href="/accounts"
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
          >
            Accounts <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {!hasActivity ? (
            <div className="flex h-44 flex-col items-center justify-center text-center p-4">
              <p className="text-sm font-medium text-muted-foreground">No recent transactions</p>
              <p className="text-xs text-muted-foreground/80 mt-1">Reconciled ledger transactions will appear here</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {recentActivity.map((tx) => {
                const isExpense = tx.type === "EXPENSE" || tx.amount < 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium truncate max-w-[180px]">{tx.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {tx.accountName} {tx.categoryName ? `• ${tx.categoryName}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`font-semibold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
                        {isExpense ? "-" : "+"}{formatINR(Math.abs(tx.amount))}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

