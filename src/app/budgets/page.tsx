"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import { store } from "@/lib/store";
import {
  TrendingDown,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wallet,
  Clock,
  Filter,
  PieChart as PieIcon,
  Copy,
  Receipt,
  Tag,
  ShieldCheck,
  Building,
  Sprout,
  Beef,
  Plus,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";

export default function BudgetsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "budgets" | "bills" | "history" | "reports">("overview");

  // State
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recurringRules, setRecurringRules] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isSetBudgetOpen, setIsSetBudgetOpen] = useState(false);
  const [isPayBillOpen, setIsPayBillOpen] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState<any>(null);

  // Forms
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    categoryId: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    merchant: "",
    description: "",
    notes: "",
    tags: "",
  });

  const [budgetForm, setBudgetForm] = useState({
    categoryId: "",
    amount: "",
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  });

  const [billPayForm, setBillPayForm] = useState({
    amount: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    merchant: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [bRes, cRes, aRes, rRes, tRes] = await Promise.all([
        fetch("/api/budgets"),
        fetch("/api/categories"),
        fetch("/api/accounts"),
        fetch("/api/recurring-bills"),
        fetch("/api/transactions"),
      ]);

      if (bRes.ok) setBudgets(await bRes.json());
      if (cRes.ok) setCategories(await cRes.json());
      if (aRes.ok) setAccounts(await aRes.json());
      if (rRes.ok) {
        const data = await rRes.json();
        setRecurringRules(data.rules || []);
        setOccurrences(data.occurrences || []);
      }
      if (tRes.ok) setTransactions(await tRes.json());
    } catch (err) {
      console.error("Failed to fetch budget & expense data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Expense Transactions for current month
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const currentExpenseTxns = transactions.filter((t) => {
    if (t.isVoided || t.type === "VOIDED" || t.type !== "EXPENSE") return false;
    const d = new Date(t.date);
    return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
  });

  const totalCurrentSpent = currentExpenseTxns.reduce(
    (acc, t) => acc + (typeof t.amount === "number" ? t.amount : Number(t.amount)),
    0
  );

  const currentPeriodBudgets = budgets.filter((b) => b.month === currentMonth && b.year === currentYear);

  // Current month summary must compare matching budget and ledger periods.
  const totalPlannedBudget = currentPeriodBudgets.reduce(
    (acc, b) => acc + (typeof b.amount === "number" ? b.amount : Number(b.amount)),
    0
  );

  const remainingTotalBudget = Math.max(0, totalPlannedBudget - totalCurrentSpent);
  const overallUtilizationPct = totalPlannedBudget > 0 ? Math.round((totalCurrentSpent / totalPlannedBudget) * 100) : 0;

  // Category Expense Map
  const categoryMap: Record<string, number> = {};
  currentExpenseTxns.forEach((t) => {
    const catName = categories.find((c) => c.id === t.categoryId)?.name || "General Expense";
    categoryMap[catName] = (categoryMap[catName] || 0) + (typeof t.amount === "number" ? t.amount : Number(t.amount));
  });

  const categoryChartData = Object.keys(categoryMap).map((key, idx) => ({
    name: key,
    value: categoryMap[key],
    color: ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#6366f1"][idx % 7],
  }));

  // Quick Add Expense Handler
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.accountId || !expenseForm.description) return;

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          accountId: expenseForm.accountId,
          categoryId: expenseForm.categoryId || categories[0]?.id,
          date: expenseForm.date,
          amount: parseFloat(expenseForm.amount),
          type: "EXPENSE",
          description: expenseForm.description,
          notes: expenseForm.notes,
          tags: expenseForm.tags,
        }),
      });

      if (res.ok) {
        setIsAddExpenseOpen(false);
        setExpenseForm({
          amount: "",
          categoryId: "",
          accountId: "",
          date: new Date().toISOString().split("T")[0],
          merchant: "",
          description: "",
          notes: "",
          tags: "",
        });
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to record expense:", err);
    }
  };

  // Set Budget Handler
  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetForm.categoryId || !budgetForm.amount) return;

    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: budgetForm.categoryId,
          amount: parseFloat(budgetForm.amount),
          month: parseInt(budgetForm.month),
          year: parseInt(budgetForm.year),
        }),
      });

      if (res.ok) {
        setIsSetBudgetOpen(false);
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to set budget:", err);
    }
  };

  // Pay Bill Handler
  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOccurrence || !billPayForm.amount || !billPayForm.accountId) return;

    try {
      const res = await fetch("/api/recurring-bills/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          occurrenceId: selectedOccurrence.id,
          accountId: billPayForm.accountId,
          amount: parseFloat(billPayForm.amount),
          date: billPayForm.date,
          merchant: billPayForm.merchant,
          notes: billPayForm.notes,
        }),
      });

      if (res.ok) {
        setIsPayBillOpen(false);
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to record bill payment:", err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expense & Budget Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Plan monthly targets, record actual spending, and manage recurring household, farm & business bills.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setExpenseForm({
                  amount: "",
                  categoryId: categories[0]?.id || "",
                  accountId: accounts[0]?.id || "",
                  date: new Date().toISOString().split("T")[0],
                  merchant: "",
                  description: "",
                  notes: "",
                  tags: "household",
                });
                setIsAddExpenseOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              Quick Add Expense
            </button>
            <button
              onClick={() => setIsSetBudgetOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border bg-background px-3.5 py-2 text-sm font-semibold text-foreground shadow-2xs hover:bg-accent transition-colors"
            >
              <PieIcon className="h-4 w-4 text-emerald-600" />
              Set Budget Limit
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b text-sm font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2.5 border-b-2 font-semibold transition-colors ${
              activeTab === "overview"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview & Summary
          </button>
          <button
            onClick={() => setActiveTab("budgets")}
            className={`px-4 py-2.5 border-b-2 font-semibold transition-colors ${
              activeTab === "budgets"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Budget Allocations
          </button>
          <button
            onClick={() => setActiveTab("bills")}
            className={`px-4 py-2.5 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "bills"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Bills & Recurring
            {occurrences.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 font-bold">
                {occurrences.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2.5 border-b-2 font-semibold transition-colors ${
              activeTab === "history"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Expense History
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2.5 border-b-2 font-semibold transition-colors ${
              activeTab === "reports"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Analytics & Reports
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="border-l-4 border-l-rose-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Monthly Actual Spent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-rose-600">{formatINR(totalCurrentSpent)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Verified expense transactions</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Total Planned Budget
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{formatINR(totalPlannedBudget)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Target category allocation</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Remaining Budget
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">{formatINR(remainingTotalBudget)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Available spending headroom</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Budget Utilization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{overallUtilizationPct}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Overall spent vs planned ratio</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts & Breakdown */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Category Spending Split</CardTitle>
                  <CardDescription>Verified expense distribution for current month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    {categoryChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            dataKey="value"
                            cx="50%"
                            cy="45%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={4}
                          >
                            {categoryChartData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any) => [formatINR(Number(val || 0)), "Spent"]} />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No expense transactions logged for this month.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Verified Expenses</CardTitle>
                  <CardDescription>Latest posted ledger items</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentExpenseTxns.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 font-bold">
                          <TrendingDown className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.date).toLocaleDateString("en-IN")} • {tx.merchant || "Direct Pay"}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-rose-600 text-sm">
                        -{formatINR(typeof tx.amount === "number" ? tx.amount : Number(tx.amount))}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 2: Budgets */}
        {activeTab === "budgets" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {budgets.map((b) => {
                const cat = categories.find((c) => c.id === b.categoryId);
                const limit = typeof b.amount === "number" ? b.amount : Number(b.amount);

                // Spent
                const budgetPeriodExpenses = transactions.filter((t) => {
                  if (t.isVoided || t.type === "VOIDED" || t.type !== "EXPENSE") return false;
                  const date = new Date(t.date);
                  return date.getMonth() + 1 === b.month && date.getFullYear() === b.year;
                });
                const spent = budgetPeriodExpenses
                  .filter((t) => t.categoryId === b.categoryId)
                  .reduce((acc, t) => acc + (typeof t.amount === "number" ? t.amount : Number(t.amount)), 0);

                const pct = limit > 0 ? Number(((spent / limit) * 100).toFixed(2)) : 0;
                const progressWidth = Math.min(100, pct);
                const isOver = spent > limit;
                const isWarning = pct >= 80 && !isOver;

                return (
                  <Card
                    key={b.id}
                    className={`border-l-4 ${
                      isOver ? "border-l-rose-500" : isWarning ? "border-l-amber-500" : "border-l-emerald-500"
                    }`}
                  >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-base font-bold">{cat?.name || "Category Target"}</CardTitle>
                        <CardDescription className="text-xs">
                          {b.month}/{b.year} Target
                        </CardDescription>
                      </div>
                      {isOver ? (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                          {pct}% OVER
                        </span>
                      ) : isWarning ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                          80% WARNING
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                          ON TRACK
                        </span>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="flex justify-between py-1 border-t">
                        <span className="text-muted-foreground">Actual Spent:</span>
                        <span className="font-bold text-foreground">{formatINR(spent)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-t">
                        <span className="text-muted-foreground">Planned Limit:</span>
                        <span className="font-semibold text-foreground">{formatINR(limit)}</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isOver ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                        <p
                          className={`text-[11px] font-semibold text-right ${
                            isOver ? "text-rose-600" : isWarning ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {isOver
                            ? `Exceeded by ${formatINR(spent - limit)}!`
                            : `${100 - pct}% remaining (${formatINR(limit - spent)})`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Bills & Recurring */}
        {activeTab === "bills" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recurring Bills & Future Commitments</CardTitle>
                <CardDescription>
                  Track upcoming, due, and overdue bills. Pay full or partial amounts safely to update ledger balances.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {occurrences.length > 0 ? (
                  <div className="divide-y">
                    {occurrences.map((occ) => {
                      const expected = Number(occ.expectedAmount || 0);
                      const paid = Number(occ.paidAmount || 0);
                      const outstanding = Number(occ.outstandingAmount || 0);

                      return (
                        <div key={occ.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{occ.name}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  occ.status === "PAID"
                                    ? "bg-emerald-500/15 text-emerald-600"
                                    : occ.status === "PARTIALLY_PAID"
                                    ? "bg-amber-500/15 text-amber-600"
                                    : "bg-rose-500/15 text-rose-600"
                                }`}
                              >
                                {occ.status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(occ.dueDate).toLocaleDateString("en-IN")} • Expected:{" "}
                              <span className="font-medium text-foreground">{formatINR(expected)}</span> • Paid:{" "}
                              <span className="font-medium text-emerald-600">{formatINR(paid)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground font-medium">Outstanding</p>
                              <p className="text-sm font-bold text-rose-600">{formatINR(outstanding)}</p>
                            </div>
                            {outstanding > 0 && (
                              <button
                                onClick={() => {
                                  setSelectedOccurrence(occ);
                                  setBillPayForm({
                                    amount: String(outstanding),
                                    accountId: accounts[0]?.id || "",
                                    date: new Date().toISOString().split("T")[0],
                                    merchant: "",
                                    notes: "",
                                  });
                                  setIsPayBillOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-500 transition-colors"
                              >
                                Pay Bill
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No active recurring bill occurrences.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 4: History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actual Expense Ledger</CardTitle>
                <CardDescription>Verified posted expense transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {currentExpenseTxns.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
                          <TrendingDown className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.date).toLocaleDateString("en-IN")} • {tx.tags || "Expense"}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-rose-600 text-sm">
                        -{formatINR(typeof tx.amount === "number" ? tx.amount : Number(tx.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Modal: Quick Add Expense */}
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Quick Add Expense</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Record actual money spent to update ledger & account balance.
              </p>
              <form onSubmit={handleAddExpense} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Description *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Swiggy Supermarket Groceries"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Amount (₹) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 2450.00"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background font-bold text-rose-600"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Payment Account *</label>
                    <select
                      required
                      value={expenseForm.accountId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatINR(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Category</label>
                    <select
                      value={expenseForm.categoryId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Tags</label>
                  <input
                    type="text"
                    placeholder="groceries, household"
                    value={expenseForm.tags}
                    onChange={(e) => setExpenseForm({ ...expenseForm, tags: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-500"
                  >
                    Post Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Set Budget */}
        {isSetBudgetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Set Category Budget Limit</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define target spending limit for a specific category.
              </p>
              <form onSubmit={handleSetBudget} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Category *</label>
                  <select
                    required
                    value={budgetForm.categoryId}
                    onChange={(e) => setBudgetForm({ ...budgetForm, categoryId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Monthly Budget Amount (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 25000"
                    value={budgetForm.amount}
                    onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background font-bold text-emerald-600"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSetBudgetOpen(false)}
                    className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500"
                  >
                    Save Target
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Pay Bill */}
        {isPayBillOpen && selectedOccurrence && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Record Bill Payment</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pay occurrence: <span className="font-semibold text-foreground">{selectedOccurrence.name}</span>
              </p>
              <form onSubmit={handlePayBill} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Payment Amount (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={billPayForm.amount}
                    onChange={(e) => setBillPayForm({ ...billPayForm, amount: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background font-bold text-rose-600"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Payment Account *</label>
                  <select
                    required
                    value={billPayForm.accountId}
                    onChange={(e) => setBillPayForm({ ...billPayForm, accountId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPayBillOpen(false)}
                    className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-500"
                  >
                    Post Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
