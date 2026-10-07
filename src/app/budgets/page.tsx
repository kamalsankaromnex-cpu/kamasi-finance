"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
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
  Play,
  Pause,
  Archive,
  Edit2,
  Trash2,
  Layers,
  ArrowRight,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";

export default function BudgetsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "budgets" | "bills" | "history" | "reports">("overview");

  // State
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [scopes, setScopes] = useState<any[]>([]);
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

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [budgetForm, setBudgetForm] = useState({
    id: "",
    name: "",
    amount: "",
    periodType: "MONTHLY",
    month: String(currentMonth),
    year: String(currentYear),
    startDate: new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString().split("T")[0],
    endDate: new Date(Date.UTC(currentYear, currentMonth, 0)).toISOString().split("T")[0],
    scopeId: "",
    categoryId: "",
    subcategoryId: "",
    costCenterId: "",
    status: "ACTIVE",
    notes: "",
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
      const [bRes, cRes, aRes, rRes, tRes, sRes] = await Promise.all([
        fetch("/api/budgets"),
        fetch("/api/categories"),
        fetch("/api/accounts"),
        fetch("/api/recurring-bills"),
        fetch("/api/transactions"),
        fetch("/api/scopes"),
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
      if (sRes.ok) setScopes(await sRes.json());
    } catch (err) {
      console.error("Failed to fetch budget & expense data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [planningHorizon, setPlanningHorizon] = useState<"MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ALL">("MONTHLY");

  const getHorizonBounds = () => {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-based
    if (planningHorizon === "MONTHLY") {
      return {
        start: new Date(Date.UTC(curYear, curMonth, 1, 0, 0, 0)),
        end: new Date(Date.UTC(curYear, curMonth + 1, 0, 23, 59, 59, 999)),
        label: "Monthly",
      };
    } else if (planningHorizon === "QUARTERLY") {
      const qStart = Math.floor(curMonth / 3) * 3;
      return {
        start: new Date(Date.UTC(curYear, qStart, 1, 0, 0, 0)),
        end: new Date(Date.UTC(curYear, qStart + 3, 0, 23, 59, 59, 999)),
        label: "Quarterly",
      };
    } else if (planningHorizon === "HALF_YEARLY") {
      const hStart = curMonth < 6 ? 0 : 6;
      return {
        start: new Date(Date.UTC(curYear, hStart, 1, 0, 0, 0)),
        end: new Date(Date.UTC(curYear, hStart + 6, 0, 23, 59, 59, 999)),
        label: "Half-Yearly",
      };
    } else if (planningHorizon === "YEARLY") {
      const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;
      return {
        start: new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0)),
        end: new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59, 999)),
        label: "Annual",
      };
    } else {
      return {
        start: new Date(Date.UTC(curYear, curMonth, 1, 0, 0, 0)),
        end: new Date(Date.UTC(curYear, curMonth + 1, 0, 23, 59, 59, 999)),
        label: "All Horizons",
      };
    }
  };

  const horizonBounds = getHorizonBounds();

  // Filter Authoritative Expense Transactions for current horizon
  // Strictly excludes DRAFT, REVERSED, VOIDED, and subtracts refundedAmount
  const currentExpenseTxns = transactions.filter((t) => {
    if (t.isVoided || t.type === "VOIDED" || t.type !== "EXPENSE") return false;
    if (t.status === "DRAFT" || t.status === "REVERSED" || t.status === "ARCHIVED") return false;
    const d = new Date(t.date);
    return d >= horizonBounds.start && d <= horizonBounds.end;
  });

  const totalCurrentSpent = currentExpenseTxns.reduce((acc, t) => {
    const rawAmt = typeof t.amount === "number" ? t.amount : Number(t.amount);
    const refAmt = typeof t.refundedAmount === "number" ? t.refundedAmount : Number(t.refundedAmount || 0);
    const effective = rawAmt - refAmt;
    return acc + (effective > 0 ? effective : 0);
  }, 0);

  // Filter budgets matching the selected planning horizon
  // When MONTHLY: strictly matches MONTHLY budgets for current month, preventing annual budgets from inflating monthly KPIs
  // When YEARLY: strictly matches YEARLY budgets for current FY
  const currentPeriodBudgets = budgets.filter((b) => {
    if (b.status === "ARCHIVED") return false;
    const pType = b.periodType || "MONTHLY";
    if (planningHorizon !== "ALL" && pType !== planningHorizon) return false;

    if (pType === "MONTHLY" && b.month && b.year) {
      return b.month === currentMonth && b.year === currentYear;
    }

    const bStart = new Date(b.startDate);
    const bEnd = new Date(b.endDate);
    return bStart <= horizonBounds.end && bEnd >= horizonBounds.start;
  });

  // Horizon planned summary
  const totalPlannedBudget = currentPeriodBudgets.reduce(
    (acc, b) => acc + (typeof b.amount === "number" ? b.amount : Number(b.amount)),
    0
  );

  const remainingTotalBudget = totalPlannedBudget - totalCurrentSpent;
  const isOverallOverBudget = totalCurrentSpent > totalPlannedBudget;
  const overallUtilizationPct = totalPlannedBudget > 0 ? Math.round((totalCurrentSpent / totalPlannedBudget) * 100) : 0;

  const overBudgetAllocationsCount = currentPeriodBudgets.filter((b) => {
    const spent = typeof b.actualSpent === "number" ? b.actualSpent : 0;
    const limit = typeof b.amount === "number" ? b.amount : Number(b.amount);
    return spent > limit;
  }).length;

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

  const handlePeriodTypeChange = (pType: string) => {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-based
    let sDate = new Date();
    let eDate = new Date();

    if (pType === "MONTHLY") {
      sDate = new Date(Date.UTC(curYear, curMonth, 1));
      eDate = new Date(Date.UTC(curYear, curMonth + 1, 0));
    } else if (pType === "QUARTERLY") {
      const qStart = Math.floor(curMonth / 3) * 3;
      sDate = new Date(Date.UTC(curYear, qStart, 1));
      eDate = new Date(Date.UTC(curYear, qStart + 3, 0));
    } else if (pType === "HALF_YEARLY") {
      const hStart = curMonth < 6 ? 0 : 6;
      sDate = new Date(Date.UTC(curYear, hStart, 1));
      eDate = new Date(Date.UTC(curYear, hStart + 6, 0));
    } else if (pType === "YEARLY") {
      // Indian Financial Year: 01 Apr to 31 Mar
      const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;
      sDate = new Date(Date.UTC(fyStartYear, 3, 1));
      eDate = new Date(Date.UTC(fyStartYear + 1, 2, 31));
    }

    setBudgetForm((prev) => ({
      ...prev,
      periodType: pType,
      startDate: sDate.toISOString().split("T")[0],
      endDate: eDate.toISOString().split("T")[0],
      month: String(sDate.getUTCMonth() + 1),
      year: String(sDate.getUTCFullYear()),
    }));
  };

  // Set / Edit Budget Handler
  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetForm.amount) return;

    try {
      const url = budgetForm.id ? `/api/budgets/${budgetForm.id}` : "/api/budgets";
      const method = budgetForm.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: budgetForm.name || undefined,
          amount: parseFloat(budgetForm.amount),
          periodType: budgetForm.periodType,
          startDate: budgetForm.startDate || undefined,
          endDate: budgetForm.endDate || undefined,
          month: parseInt(budgetForm.month),
          year: parseInt(budgetForm.year),
          scopeId: budgetForm.scopeId || undefined,
          categoryId: budgetForm.categoryId || undefined,
          subcategoryId: budgetForm.subcategoryId || undefined,
          costCenterId: budgetForm.costCenterId || undefined,
          status: budgetForm.status,
          notes: budgetForm.notes || undefined,
        }),
      });

      if (res.ok) {
        setIsSetBudgetOpen(false);
        setBudgetForm({
          id: "",
          name: "",
          amount: "",
          periodType: "MONTHLY",
          month: String(currentMonth),
          year: String(currentYear),
          startDate: new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString().split("T")[0],
          endDate: new Date(Date.UTC(currentYear, currentMonth, 0)).toISOString().split("T")[0],
          scopeId: "",
          categoryId: "",
          subcategoryId: "",
          costCenterId: "",
          status: "ACTIVE",
          notes: "",
        });
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save budget");
      }
    } catch (err) {
      console.error("Failed to set budget:", err);
    }
  };

  const handleToggleStatus = async (budgetId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleArchiveBudget = async (budgetId: string) => {
    if (!confirm("Are you sure you want to archive this budget? Historical spending will remain preserved.")) return;
    try {
      const res = await fetch(`/api/budgets/${budgetId}`, { method: "DELETE" });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("Failed to archive budget:", err);
    }
  };

  const handleEditBudget = (b: any) => {
    setBudgetForm({
      id: b.id,
      name: b.name || "",
      amount: String(b.amount),
      periodType: b.periodType || "MONTHLY",
      month: String(b.month || currentMonth),
      year: String(b.year || currentYear),
      startDate: b.startDate ? new Date(b.startDate).toISOString().split("T")[0] : "",
      endDate: b.endDate ? new Date(b.endDate).toISOString().split("T")[0] : "",
      scopeId: b.scopeId || "",
      categoryId: b.categoryId || "",
      subcategoryId: b.subcategoryId || "",
      costCenterId: b.costCenterId || "",
      status: b.status || "ACTIVE",
      notes: b.notes || "",
    });
    setIsSetBudgetOpen(true);
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
            {/* Planning Horizon Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Planning Horizon:
                </span>
                <div className="flex items-center gap-1 bg-background rounded-lg p-1 border shadow-xs">
                  {(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ALL"] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => setPlanningHorizon(h)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        planningHorizon === h
                          ? "bg-rose-600 text-white font-semibold shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {h === "MONTHLY" ? "Monthly" : h === "QUARTERLY" ? "Quarterly" : h === "HALF_YEARLY" ? "Half-Yearly" : h === "YEARLY" ? "Annual" : "All Horizons"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Active view: <span className="font-semibold text-foreground">{horizonBounds.label}</span> planning cycle
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="border-l-4 border-l-rose-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    {horizonBounds.label} Actual Spent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-rose-600">{formatINR(totalCurrentSpent)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Verified posted & reconciled expenses</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Total Planned ({horizonBounds.label})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{formatINR(totalPlannedBudget)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active targets for {horizonBounds.label.toLowerCase()} horizon</p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${isOverallOverBudget ? "border-l-rose-600" : "border-l-emerald-500"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    {isOverallOverBudget ? "Over Budget Amount" : "Remaining Headroom"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isOverallOverBudget ? "text-rose-600" : "text-emerald-600"}`}>
                    {isOverallOverBudget ? `-${formatINR(Math.abs(remainingTotalBudget))}` : formatINR(remainingTotalBudget)}
                  </div>
                  <p className={`text-xs mt-1 font-medium ${isOverallOverBudget ? "text-rose-600" : "text-muted-foreground"}`}>
                    {isOverallOverBudget ? "Spending exceeds planned budget!" : "Available spending headroom"}
                  </p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${overBudgetAllocationsCount > 0 ? "border-l-amber-500" : "border-l-primary"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                    Utilization & Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{overallUtilizationPct}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overBudgetAllocationsCount > 0 ? (
                      <span className="text-rose-600 font-semibold">{overBudgetAllocationsCount} allocation{overBudgetAllocationsCount > 1 ? "s" : ""} over budget</span>
                    ) : (
                      "All targets within limit"
                    )}
                  </p>
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
                  <CardDescription>Latest posted ledger items (Drafts excluded)</CardDescription>
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
                  {currentExpenseTxns.length === 0 && (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No verified expenses posted this month.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 2: Budgets */}
        {activeTab === "budgets" && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse p-6">
                    <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-1/3 mb-4" />
                    <div className="h-8 bg-muted rounded w-full" />
                  </Card>
                ))}
              </div>
            ) : budgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
                <PieIcon className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-lg">No Budgets Defined</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                  Plan spending targets across scopes (Family, Agriculture, Goat Farming), categories, subcategories, and facilities.
                </p>
                <button
                  onClick={() => setIsSetBudgetOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Your First Budget
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {budgets.map((b) => {
                  const cat = categories.find((c) => c.id === b.categoryId);
                  const limit = typeof b.amount === "number" ? b.amount : Number(b.amount);
                  const spent = typeof b.actualSpent === "number" ? b.actualSpent : 0;
                  const pct = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
                  const progressWidth = Math.min(100, pct);
                  const isOver = spent > limit;
                  const isWarning = pct >= 80 && !isOver;

                  return (
                    <Card
                      key={b.id}
                      className={`border-l-4 transition-shadow hover:shadow-md ${
                        b.status === "PAUSED"
                          ? "border-l-muted-foreground opacity-80"
                          : isOver
                          ? "border-l-rose-500"
                          : isWarning
                          ? "border-l-amber-500"
                          : "border-l-emerald-500"
                      }`}
                    >
                      <CardHeader className="pb-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {b.scope && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                                style={{ backgroundColor: `${b.scope.color || "#3b82f6"}20`, color: b.scope.color || "#3b82f6" }}
                              >
                                {b.scope.name}
                              </span>
                            )}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                              {b.periodType || "MONTHLY"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                b.status === "ACTIVE"
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : b.status === "PAUSED"
                                  ? "bg-amber-500/15 text-amber-600"
                                  : "bg-blue-500/15 text-blue-600"
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>

                          {/* Action Menu */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleStatus(b.id, b.status)}
                              title={b.status === "ACTIVE" ? "Pause allocation" : "Activate allocation"}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                              {b.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => handleEditBudget(b)}
                              title="Edit budget"
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleArchiveBudget(b.id)}
                              title="Archive budget"
                              className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-accent transition-colors"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <CardTitle className="text-base font-bold">
                          {b.name || b.category?.name || cat?.name || "Budget Target"}
                        </CardTitle>

                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                          <span>{b.periodType || "MONTHLY"}</span>
                          <span>•</span>
                          <span>
                            {new Date(b.startDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} – {new Date(b.endDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>

                        {/* Classification Breadcrumb */}
                        <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 flex-wrap pt-0.5">
                          <span>{b.category?.name || cat?.name || "General"}</span>
                          {b.subcategory && (
                            <>
                              <ArrowRight className="h-3 w-3 inline text-muted-foreground/60" />
                              <span className="text-foreground">{b.subcategory.name}</span>
                            </>
                          )}
                          {b.costCenter && (
                            <span className="ml-1 text-[10px] rounded bg-secondary px-1.5 py-0.5">
                              📍 {b.costCenter.name}
                            </span>
                          )}
                        </div>
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
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-medium text-muted-foreground">{pct}% spent</span>
                            <span
                              className={`font-semibold ${
                                isOver ? "text-rose-600" : isWarning ? "text-amber-600" : "text-emerald-600"
                              }`}
                            >
                              {isOver
                                ? `Exceeded by ${formatINR(spent - limit)}!`
                                : `${formatINR(limit - spent)} remaining`}
                            </span>
                          </div>
                        </div>

                        {b.notes && (
                          <p className="text-[11px] text-muted-foreground italic border-t pt-1.5 truncate">
                            &ldquo;{b.notes}&rdquo;
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
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

        {/* Modal: Set / Edit Budget */}
        {isSetBudgetOpen && (() => {
          const selectedScopeObj = scopes.find((s) => s.id === budgetForm.scopeId);
          const allowedCatIds = selectedScopeObj?.categories?.map((sc: any) => sc.categoryId) || [];
          const availableCategories = (allowedCatIds.length > 0
            ? categories.filter((c) => allowedCatIds.includes(c.id) && c.type === "EXPENSE")
            : categories.filter((c) => c.type === "EXPENSE"));
          const selectedCategoryObj = categories.find((c) => c.id === budgetForm.categoryId);
          const availableSubcategories = selectedCategoryObj?.subcategories || [];
          const availableCostCenters = selectedScopeObj?.costCenters || [];

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl border max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b">
                  <div>
                    <h2 className="text-lg font-bold">
                      {budgetForm.id ? "Edit Budget Allocation" : "Set Budget Allocation"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define planned spending targets across universal classification dimensions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSetBudgetOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSetBudget} className="space-y-4 mt-4 text-xs">
                  {/* Budget Name */}
                  <div>
                    <label className="font-semibold block mb-1">Budget Allocation Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Monthly Green Fodder, Household Groceries"
                      value={budgetForm.name}
                      onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>

                  {/* Period Selection */}
                  <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Budget Period & Horizon
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-medium block mb-1">Period Type</label>
                        <select
                          value={budgetForm.periodType}
                          onChange={(e) => handlePeriodTypeChange(e.target.value)}
                          className="w-full rounded-md border p-2 text-xs bg-background font-medium"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="QUARTERLY">Quarterly</option>
                          <option value="HALF_YEARLY">Half-Yearly</option>
                          <option value="YEARLY">Yearly (Financial Year)</option>
                          <option value="CUSTOM">Custom Date Range</option>
                        </select>
                      </div>

                      {budgetForm.periodType === "MONTHLY" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-medium block mb-1">Month</label>
                            <select
                              value={budgetForm.month}
                              onChange={(e) => {
                                const m = parseInt(e.target.value);
                                const y = parseInt(budgetForm.year);
                                const s = new Date(Date.UTC(y, m - 1, 1)).toISOString().split("T")[0];
                                const end = new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
                                setBudgetForm({ ...budgetForm, month: e.target.value, startDate: s, endDate: end });
                              }}
                              className="w-full rounded-md border p-2 text-xs bg-background"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                                <option key={m} value={m}>
                                  {new Date(2026, m - 1, 1).toLocaleString("en-IN", { month: "short" })}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="font-medium block mb-1">Year</label>
                            <input
                              type="number"
                              value={budgetForm.year}
                              onChange={(e) => {
                                const y = parseInt(e.target.value) || 2026;
                                const m = parseInt(budgetForm.month);
                                const s = new Date(Date.UTC(y, m - 1, 1)).toISOString().split("T")[0];
                                const end = new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
                                setBudgetForm({ ...budgetForm, year: e.target.value, startDate: s, endDate: end });
                              }}
                              className="w-full rounded-md border p-2 text-xs bg-background"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-medium block mb-1">Start Date</label>
                            <input
                              type="date"
                              required
                              value={budgetForm.startDate}
                              onChange={(e) => setBudgetForm({ ...budgetForm, startDate: e.target.value })}
                              className="w-full rounded-md border p-2 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="font-medium block mb-1">End Date</label>
                            <input
                              type="date"
                              required
                              value={budgetForm.endDate}
                              onChange={(e) => setBudgetForm({ ...budgetForm, endDate: e.target.value })}
                              className="w-full rounded-md border p-2 text-xs bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4-Step Dependent Classification */}
                  <div className="rounded-lg border p-3 bg-muted/10 space-y-3">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      Universal Financial Classification
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Step 1: Scope */}
                      <div>
                        <label className="font-medium block mb-1">1. Financial Scope</label>
                        <select
                          value={budgetForm.scopeId}
                          onChange={(e) => {
                            const newScopeId = e.target.value;
                            setBudgetForm({
                              ...budgetForm,
                              scopeId: newScopeId,
                              costCenterId: "", // reset dependent facility
                            });
                          }}
                          className="w-full rounded-md border p-2 text-xs bg-background font-medium"
                        >
                          <option value="">(None / General Household)</option>
                          {scopes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 2: Category */}
                      <div>
                        <label className="font-medium block mb-1">2. Expense Category</label>
                        <select
                          value={budgetForm.categoryId}
                          onChange={(e) => {
                            setBudgetForm({
                              ...budgetForm,
                              categoryId: e.target.value,
                              subcategoryId: "", // reset dependent subcategory
                            });
                          }}
                          className="w-full rounded-md border p-2 text-xs bg-background font-medium"
                        >
                          <option value="">Select Category</option>
                          {availableCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Step 3: Subcategory */}
                      <div>
                        <label className="font-medium block mb-1">3. Subcategory (Optional)</label>
                        <select
                          value={budgetForm.subcategoryId}
                          onChange={(e) => setBudgetForm({ ...budgetForm, subcategoryId: e.target.value })}
                          disabled={!budgetForm.categoryId || availableSubcategories.length === 0}
                          className="w-full rounded-md border p-2 text-xs bg-background disabled:opacity-50"
                        >
                          <option value="">(None)</option>
                          {availableSubcategories.map((sub: any) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 4: Facility / Cost Center */}
                      <div>
                        <label className="font-medium block mb-1">4. Facility / Location (Optional)</label>
                        <select
                          value={budgetForm.costCenterId}
                          onChange={(e) => setBudgetForm({ ...budgetForm, costCenterId: e.target.value })}
                          disabled={!budgetForm.scopeId || availableCostCenters.length === 0}
                          className="w-full rounded-md border p-2 text-xs bg-background disabled:opacity-50"
                        >
                          <option value="">(None)</option>
                          {availableCostCenters.map((cc: any) => (
                            <option key={cc.id} value={cc.id}>
                              📍 {cc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Planned Amount & Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Planned Budget Amount (₹) *</label>
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
                    <div>
                      <label className="font-semibold block mb-1">Lifecycle Status</label>
                      <select
                        value={budgetForm.status}
                        onChange={(e) => setBudgetForm({ ...budgetForm, status: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background font-medium"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="PAUSED">PAUSED</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="font-semibold block mb-1">Planning Notes (Optional)</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Estimated based on Q3 fodder consumption rates"
                      value={budgetForm.notes}
                      onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => setIsSetBudgetOpen(false)}
                      className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500 transition-colors shadow-xs"
                    >
                      {budgetForm.id ? "Update Allocation" : "Save Allocation"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

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
