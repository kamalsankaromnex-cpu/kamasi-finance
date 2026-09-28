"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/currency";
import { Download } from "lucide-react";
import { exportToCSV } from "@/lib/csv";
import { summarizeMonth } from "@/lib/reporting";

interface ReportTransaction {
  id: string;
  date: string;
  description: string;
  amount: string | number;
  type: string;
  isVoided?: boolean;
  accountId: string;
  categoryId: string | null;
  account?: { name: string } | null;
  category?: { name: string } | null;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now] = useState(() => new Date());
  const currentMonthLabel = formatMonth(now);

  useEffect(() => {
    let active = true;
    fetch("/api/transactions")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load household transactions.");
        return response.json();
      })
      .then((data: ReportTransaction[]) => {
        if (active) setTransactions(Array.isArray(data) ? data : []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load reports.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentMonth = useMemo(() => transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && !transaction.isVoided && transaction.type !== "VOIDED";
  }), [transactions, now]);
  const totals = summarizeMonth(transactions, now.getFullYear(), now.getMonth());
  const netCashFlow = totals.income - totals.expenses;

  const handleExport = () => {
    const reportData = transactions.map((transaction) => ({
      Date: new Date(transaction.date).toLocaleDateString("en-IN"),
      Description: transaction.description,
      Amount: transaction.amount,
      Type: transaction.type,
      IsVoided: transaction.isVoided || transaction.type === "VOIDED",
      Account: transaction.account?.name || "",
      Category: transaction.category?.name || "",
    }));
    if (reportData.length) exportToCSV(reportData, "kamasi-finance-full-statement");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Executive Financial Reports</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Household cash flow calculated from posted ledger transactions.</p>
          </div>
          <Button onClick={handleExport} disabled={loading || transactions.length === 0} className="gap-2 font-semibold">
            <Download className="h-4 w-4" /> Download Full CSV Statement
          </Button>
        </div>

        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading household transactions…</p>}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Cash Flow Statement</CardTitle>
              <CardDescription>Posted inflows and outflows for {currentMonthLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium">Income Credits</span>
                <span className="font-bold text-emerald-600">{formatINR(totals.income)}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm font-medium">Operating Expenses</span>
                <span className="font-bold text-rose-600">{formatINR(totals.expenses)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-bold">Net Cash Flow</span>
                <span className={`text-lg font-bold ${netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatINR(netCashFlow)}</span>
              </div>
              {!loading && !error && currentMonth.length === 0 && <p className="text-sm text-muted-foreground">No posted transactions for this month.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Coverage</CardTitle>
              <CardDescription>Totals use household transactions visible to your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="font-semibold">Transactions in this month:</span> {currentMonth.length}</p>
              <p><span className="font-semibold">Statement rows available:</span> {transactions.length}</p>
              <p className="text-muted-foreground">Transfers are excluded from income and expense totals to avoid counting the same funds twice. Health ratios and debt-service classifications are not shown because the current ledger does not provide verified calculation inputs for those measures.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
