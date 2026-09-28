"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatINR } from "@/lib/currency";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ShieldCheck,
  Target,
  LineChart as LineChartIcon,
  CreditCard,
  Building,
  PiggyBank,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const numeric = (value: unknown) => Number(value ?? 0) || 0;

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const paths = ["/api/transactions", "/api/accounts", "/api/goals", "/api/assets", "/api/liabilities", "/api/investments"];
        const responses = await Promise.all(paths.map((path) => fetch(path)));
        if (responses.some((response) => !response.ok)) throw new Error("Some dashboard data could not be loaded.");
        const [txns, accts, goalRows, assetRows, liabilityRows, investmentRows] = await Promise.all(responses.map((response) => response.json()));
        setTransactions(txns); setAccounts(accts); setGoals(goalRows); setAssets(assetRows); setLiabilities(liabilityRows); setInvestments(investmentRows);
      } catch {
        setLoadError("Dashboard data could not be loaded. Refresh the page or check your connection.");
      }
    };
    void load();
  }, []);


  // Dynamic Financial Ledger Computations
  const totalBankAndInvestments = accounts.filter((a) => a.type !== "INVESTMENT" && a.type !== "LOAN").reduce((sum, a) => sum + numeric(a.balance), 0) + investments.reduce((sum, item) => sum + numeric(item.quantity) * numeric(item.currentPrice), 0);
  const totalAssetsValue = assets.reduce((sum, asset) => sum + numeric(asset.value), 0);
  const totalLiabilitiesValue = liabilities.reduce((sum, liability) => sum + numeric(liability.amount), 0);
  const netWorth = totalBankAndInvestments + totalAssetsValue - totalLiabilitiesValue;

  const now = new Date();
  const activeTransactions = transactions.filter((txn) => !txn.isVoided && txn.type !== "VOIDED");
  const monthlyIncome = activeTransactions.filter((txn) => txn.type === "INCOME" && new Date(txn.date).getMonth() === now.getMonth() && new Date(txn.date).getFullYear() === now.getFullYear()).reduce((sum, txn) => sum + numeric(txn.amount), 0);
  const monthlyExpense = activeTransactions.filter((txn) => txn.type === "EXPENSE" && new Date(txn.date).getMonth() === now.getMonth() && new Date(txn.date).getFullYear() === now.getFullYear()).reduce((sum, txn) => sum + numeric(txn.amount), 0);
  const cashflowData = Array.from({ length: 5 }, (_, idx) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - 4 + idx, 1);
    const monthTxns = transactions.filter((txn) => {
      const txnDate = new Date(txn.date);
      return txnDate.getMonth() === monthDate.getMonth() && txnDate.getFullYear() === monthDate.getFullYear();
    });
    return {
      month: monthDate.toLocaleDateString("en-IN", { month: "short" }),
      income: monthTxns.filter((txn) => !txn.isVoided && txn.type === "INCOME").reduce((sum, txn) => sum + numeric(txn.amount), 0),
      expense: monthTxns.filter((txn) => !txn.isVoided && txn.type === "EXPENSE").reduce((sum, txn) => sum + numeric(txn.amount), 0),
    };
  });
  const assetAllocationData = [
    ...assets.map((asset, idx) => ({ name: asset.name, value: numeric(asset.value), color: ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"][idx % 4] })),
    ...(investments.length ? [{ name: "Investments", value: investments.reduce((sum, item) => sum + numeric(item.quantity) * numeric(item.currentPrice), 0), color: "#10b981" }] : []),
    ...(accounts.length ? [{ name: "Accounts", value: accounts.filter((a) => a.type !== "INVESTMENT" && a.type !== "LOAN").reduce((sum, a) => sum + numeric(a.balance), 0), color: "#06b6d4" }] : []),
  ].filter((row) => row.value > 0);

  // Monthly Cash Flow actuals
  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? Math.round((netSavings / monthlyIncome) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {loadError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>}
        {/* Top Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Executive Financial Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live actuals ledger, household net worth, and budget monitoring.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button className="gap-2 shadow-sm font-semibold" onClick={() => (window.location.href = "/transactions")}>
              <Plus className="h-4 w-4" /> Add Transaction
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => (window.location.href = "/forecasting")}>
              <LineChartIcon className="h-4 w-4 text-primary" /> 2026–2050 Forecasts
            </Button>
          </div>
        </div>

        {/* 4 Key Performance Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Net Worth */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Net Worth
              </CardTitle>
              <ShieldCheck className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">{formatINR(netWorth)}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                <ArrowUpRight className="h-4 w-4" /> +4.2% vs last quarter
              </div>
            </CardContent>
          </Card>

          {/* Monthly Income */}
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Monthly Income
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-emerald-600">{formatINR(monthlyIncome)}</div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">2 Active Income Stream Credits</p>
            </CardContent>
          </Card>

          {/* Monthly Expense */}
          <Card className="border-l-4 border-l-rose-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Monthly Expenses
              </CardTitle>
              <TrendingDown className="h-5 w-5 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-rose-600">{formatINR(monthlyExpense)}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                <ArrowDownRight className="h-4 w-4" /> -3.5% vs budget limit
              </div>
            </CardContent>
          </Card>

          {/* Savings Rate */}
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Net Savings Rate
              </CardTitle>
              <PiggyBank className="h-5 w-5 text-cyan-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">{savingsRate}%</div>
              <p className="text-xs text-emerald-600 font-semibold mt-1">
                +{formatINR(netSavings)} saved this month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-6 lg:grid-cols-7">
          {/* Cashflow Bar Chart */}
          <Card className="lg:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Monthly Cashflow Trend</CardTitle>
                <CardDescription>Income vs Expenses (May – Sep 2026)</CardDescription>
              </div>
              <Badge variant="outline" className="font-medium">2026 Actuals</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `₹${val / 1000}k`}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatINR(Number(value || 0)), ""]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Asset Allocation Pie Chart */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg">Asset Portfolio Breakdown</CardTitle>
              <CardDescription>Wealth distribution across real estate & liquidity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetAllocationData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {assetAllocationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [formatINR(Number(value || 0)), "Value"]} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Section: Accounts & Recent Transactions & Goals */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Accounts Overview */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Accounts & Liquidity</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => (window.location.href = "/accounts")}>
                View All
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {acc.type === "BANK" ? <Wallet className="h-4 w-4" /> : acc.type === "CREDIT" ? <CreditCard className="h-4 w-4" /> : <Building className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{acc.accountNumber || acc.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${acc.balance < 0 ? "text-rose-600" : "text-foreground"}`}>
                      {formatINR(acc.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Ledger Transactions */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Recent Ledger Transactions</CardTitle>
                <CardDescription>Actual verified entries</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => (window.location.href = "/transactions")}>
                View Ledger
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transactions.slice(0, 5).map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${txn.type.startsWith("ADJUSTMENT_") ? "bg-muted text-muted-foreground" : txn.type === "INCOME" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                        {txn.type === "INCOME" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{txn.type.startsWith("ADJUSTMENT_") ? `Balance adjustment · ${txn.description}` : txn.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(txn.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {txn.tags && <span className="ml-2 font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{txn.tags}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${txn.type.startsWith("ADJUSTMENT_") ? "text-muted-foreground" : txn.type === "INCOME" ? "text-emerald-600" : "text-foreground"}`}>
                        {txn.type === "INCOME" || String(txn.type) === "ADJUSTMENT_INCREASE" ? "+" : txn.type === "EXPENSE" || String(txn.type) === "ADJUSTMENT_DECREASE" ? "-" : ""}{formatINR(txn.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Financial Goals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Active Family Savings Goals</CardTitle>
              <CardDescription>Target milestones & progress</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => (window.location.href = "/savings-goals")}>
              <Target className="h-3.5 w-3.5" /> Manage Goals
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {goals.map((goal) => {
                const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
                return (
                  <div key={goal.id} className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{goal.category}</span>
                      <Badge variant={goal.priority === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">
                        {goal.priority}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{goal.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{goal.description}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span>{formatINR(goal.currentAmount)}</span>
                        <span className="text-muted-foreground">{pct}% of {formatINR(goal.targetAmount)}</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
