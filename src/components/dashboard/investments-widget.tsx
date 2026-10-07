"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { PiggyBank, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";

interface InvestmentsWidgetProps {
  investments: DashboardSnapshot["investments"];
}

export function InvestmentsWidget({ investments }: InvestmentsWidgetProps) {
  const allocation = investments.allocation || [];
  const hasHoldings = investments.holdingsCount > 0;
  const isGain = investments.unrealizedGainLoss >= 0;

  return (
    <Card className="col-span-full md:col-span-1 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Investment Portfolio
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Holdings, valuation, and asset allocation
          </p>
        </div>
        <Link
          href="/investments"
          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
        >
          Portfolio <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Market Value & Return summary */}
        <div className="rounded-lg bg-muted/40 p-3 border">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">Market Value</span>
            <span className="text-base font-bold text-purple-600">
              {formatINR(investments.totalMarketValue)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t">
            <span className="text-muted-foreground">Unrealized Gain / Loss:</span>
            <span className={`font-semibold ${isGain ? "text-emerald-600" : "text-rose-600"}`}>
              {isGain ? "+" : ""}{formatINR(investments.unrealizedGainLoss)} ({investments.totalReturn.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Asset Class Allocations */}
        {!hasHoldings ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-xs">No active investment holdings</p>
            <Link href="/investments" className="text-xs text-primary hover:underline mt-1 inline-block">
              Add investment holding →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Asset Class Breakdown</span>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {allocation.map((item) => (
                <div key={item.type} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-muted/20 border">
                  <span className="font-medium">{item.type.replace(/_/g, " ")}</span>
                  <div className="text-right">
                    <span className="font-semibold">{formatINR(item.marketValue)}</span>
                    <span className="text-muted-foreground text-[10px] ml-1.5">({item.percentage.toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

