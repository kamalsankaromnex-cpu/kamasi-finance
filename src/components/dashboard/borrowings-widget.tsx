"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatINR } from "@/lib/currency";
import { DashboardSnapshot } from "@/finance/dashboard/dashboard-query.service";
import { Landmark, ArrowRight } from "lucide-react";
import Link from "next/link";

interface BorrowingsWidgetProps {
  borrowings: DashboardSnapshot["borrowings"];
}

export function BorrowingsWidget({ borrowings }: BorrowingsWidgetProps) {
  const items = borrowings.items || [];
  const hasBorrowings = borrowings.activeCount > 0;

  return (
    <Card className="col-span-full md:col-span-1 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Borrowing & Debt
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Outstanding liabilities and repayment status
          </p>
        </div>
        <Link
          href="/borrowing"
          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
        >
          Obligations <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Overall summary bar */}
        <div className="rounded-lg bg-muted/40 p-3 border">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs text-muted-foreground">Outstanding Balance</span>
            <span className="text-base font-bold text-amber-600">
              {formatINR(borrowings.totalOutstanding)}
            </span>
          </div>
          <Progress
            value={Math.min(100, borrowings.repaymentProgressPercent)}
            className="h-2 [&>div]:bg-amber-500"
          />
          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1.5">
            <span>Repaid: {borrowings.repaymentProgressPercent.toFixed(1)}%</span>
            <span>Total: {formatINR(borrowings.totalPrincipal)}</span>
          </div>
        </div>

        {/* Debts list */}
        {!hasBorrowings ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-xs">No active debt obligations</p>
            <p className="text-[11px] text-muted-foreground/80 mt-1">Great job! All loans and borrowing records are fully resolved.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {items.map((b) => (
              <div key={b.id} className="space-y-1 rounded-md border p-2 bg-background/50 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="truncate max-w-[150px]">{b.name}</span>
                  <span className="text-amber-600 font-semibold">{formatINR(b.outstanding)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Lender: {b.lenderName}</span>
                  {b.emiAmount ? <span>EMI: {formatINR(b.emiAmount)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

