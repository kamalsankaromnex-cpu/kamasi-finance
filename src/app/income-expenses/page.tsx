"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import {
  TrendingUp,
  TrendingDown,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Wallet,
  Clock,
  Filter,
  DollarSign,
  Tag,
  FileText,
  Briefcase,
  Building,
  Pencil,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  User,
  Users,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";

export default function IncomeExpensesPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "salary" | "sources" | "pending" | "history">("overview");
  const [mounted, setMounted] = useState(false);

  // State
  const [sources, setSources] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [employments, setEmployments] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<any>(null);
  const [deactivatingSource, setDeactivatingSource] = useState<any>(null);

  const [isAddEmploymentOpen, setIsAddEmploymentOpen] = useState(false);
  const [isGeneratePayslipOpen, setIsGeneratePayslipOpen] = useState(false);
  const [isConfirmCreditOpen, setIsConfirmCreditOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);

  // Filters
  const [sourceStatusFilter, setSourceStatusFilter] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  // Form State - Income Source (Add/Edit)
  const [sourceForm, setSourceForm] = useState({
    name: "",
    category: "Salary",
    behavior: "RECURRING",
    frequency: "MONTHLY",
    expectedAmount: "",
    defaultAccountId: "",
    expectedDay: "1",
    description: "",
  });

  // Form State - Add Employment
  const [employmentForm, setEmploymentForm] = useState({
    userId: "",
    employerName: "",
    designation: "",
    employmentType: "FULL_TIME",
    joiningDate: new Date().toISOString().split("T")[0],
    salaryFrequency: "MONTHLY",
    salaryCreditDate: "1",
    status: "ACTIVE",
    expectedMonthlySalary: "",
    defaultAccountId: "",
  });

  // Form State - Monthly Payslip Inputs
  const [payslipForm, setPayslipForm] = useState({
    employmentId: "",
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    basicSalary: "",
    hra: "",
    otherAllowances: "",
    bonusIncentives: "",
    overtimeArrears: "",
    pfDeduction: "",
    esiDeduction: "",
    professionalTax: "",
    tdsTax: "",
    otherDeductions: "",
  });

  // Form State - Bank Credit Confirmation for Payslip
  const [creditForm, setCreditForm] = useState({
    accountId: "",
    actualCreditDate: new Date().toISOString().split("T")[0],
    actualAmountCredited: "",
    transactionRef: "",
    notes: "",
  });

  // Form State - Confirm General Receipt
  const [selectedOccurrence, setSelectedOccurrence] = useState<any>(null);
  const [receiptForm, setReceiptForm] = useState({
    amount: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    paymentMethod: "BANK_TRANSFER",
    referenceNo: "",
    notes: "",
  });

  // Form State - Ad-hoc Receipt
  const [adhocForm, setAdhocForm] = useState({
    incomeSourceId: "",
    amount: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    paymentMethod: "BANK_TRANSFER",
    referenceNo: "",
    description: "",
    notes: "",
  });

  // Form State - Direct Expense
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    merchant: "",
    description: "",
    notes: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [srcRes, occRes, empRes, payRes, memRes, accRes, txRes] = await Promise.all([
        fetch("/api/income-sources"),
        fetch("/api/income-occurrences"),
        fetch("/api/employments"),
        fetch("/api/payslips"),
        fetch("/api/household/members"),
        fetch("/api/accounts"),
        fetch("/api/transactions"),
      ]);

      if (srcRes.ok) {
        const d = await srcRes.json();
        setSources(Array.isArray(d) ? d : d.sources || []);
      }
      if (occRes.ok) {
        const d = await occRes.json();
        setOccurrences(Array.isArray(d) ? d : d.occurrences || []);
      }
      if (empRes.ok) {
        const d = await empRes.json();
        setEmployments(Array.isArray(d) ? d : []);
      }
      if (payRes.ok) {
        const d = await payRes.json();
        setPayslips(Array.isArray(d) ? d : []);
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMembers(Array.isArray(d) ? d : d.members || []);
      }
      if (accRes.ok) {
        const d = await accRes.json();
        setAccounts(Array.isArray(d) ? d : []);
      }
      if (txRes.ok) {
        const d = await txRes.json();
        setTransactions(Array.isArray(d) ? d : d.transactions || []);
      }
    } catch (err) {
      console.error("Failed to load income/expense data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Safe Array Wrappers
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeOccurrences = Array.isArray(occurrences) ? occurrences : [];
  const safeEmployments = Array.isArray(employments) ? employments : [];
  const safePayslips = Array.isArray(payslips) ? payslips : [];
  const safeMembers = Array.isArray(members) ? members : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  // Income vs Expense Calculations
  const activeTransactions = safeTransactions.filter((t) => !t.isVoided && t.type !== "VOIDED");
  const incomeTransactions = activeTransactions.filter((t) => t.type === "INCOME");
  const expenseTransactions = activeTransactions.filter((t) => t.type === "EXPENSE");

  const totalIncomeReceived = incomeTransactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const totalExpensePaid = expenseTransactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const netCashFlow = totalIncomeReceived - totalExpensePaid;
  const savingsRate = totalIncomeReceived > 0 ? ((netCashFlow / totalIncomeReceived) * 100).toFixed(1) : "0.0";

  // Pending Occurrences & Payslips
  const pendingOccurrences = safeOccurrences.filter((o) => o.status === "PENDING" || o.status === "PARTIALLY_RECEIVED");
  const pendingPayslips = safePayslips.filter((p) => p.status === "GENERATED");
  const confirmedPayslips = safePayslips.filter((p) => p.status === "CONFIRMED_CREDITED");

  const totalPendingOutstanding =
    pendingOccurrences.reduce((acc, o) => acc + Number(o.outstandingAmount || 0), 0) +
    pendingPayslips.reduce((acc, p) => acc + Number(p.netSalary || 0), 0);

  // Category split data
  const categoryMap: Record<string, number> = {};
  incomeTransactions.forEach((t) => {
    const catName = t.category?.name || "General Income";
    categoryMap[catName] = (categoryMap[catName] || 0) + Number(t.amount || 0);
  });

  const categoryChartData = Object.keys(categoryMap).map((key, idx) => ({
    name: key,
    value: categoryMap[key],
    color: ["#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"][idx % 6],
  }));

  // Payslip Calculations
  const calcGross = () => {
    const b = parseFloat(payslipForm.basicSalary) || 0;
    const h = parseFloat(payslipForm.hra) || 0;
    const a = parseFloat(payslipForm.otherAllowances) || 0;
    const bon = parseFloat(payslipForm.bonusIncentives) || 0;
    const ov = parseFloat(payslipForm.overtimeArrears) || 0;
    return b + h + a + bon + ov;
  };

  const calcDeductions = () => {
    const pf = parseFloat(payslipForm.pfDeduction) || 0;
    const esi = parseFloat(payslipForm.esiDeduction) || 0;
    const pt = parseFloat(payslipForm.professionalTax) || 0;
    const tds = parseFloat(payslipForm.tdsTax) || 0;
    const oth = parseFloat(payslipForm.otherDeductions) || 0;
    return pf + esi + pt + tds + oth;
  };

  const calcNet = () => calcGross() - calcDeductions();

  // Handlers - Income Sources
  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceForm.name) return;

    try {
      const url = editingSource ? `/api/income-sources/${editingSource.id}` : "/api/income-sources";
      const method = editingSource ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceForm),
      });

      if (res.ok) {
        setIsAddSourceOpen(false);
        setEditingSource(null);
        setSourceForm({
          name: "",
          category: "Salary",
          behavior: "RECURRING",
          frequency: "MONTHLY",
          expectedAmount: "",
          defaultAccountId: "",
          expectedDay: "1",
          description: "",
        });
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save income source");
      }
    } catch (err) {
      console.error("Failed to save income source:", err);
    }
  };

  const handleOpenEditSource = (src: any) => {
    setEditingSource(src);
    setSourceForm({
      name: src.name || "",
      category: src.category || "Salary",
      behavior: src.behavior || "RECURRING",
      frequency: src.frequency || "MONTHLY",
      expectedAmount: src.expectedAmount ? String(src.expectedAmount) : "",
      defaultAccountId: src.defaultAccountId || "",
      expectedDay: src.expectedDay ? String(src.expectedDay) : "1",
      description: src.description || "",
    });
    setIsAddSourceOpen(true);
  };

  const handleDeactivateSource = async () => {
    if (!deactivatingSource) return;

    try {
      const res = await fetch(`/api/income-sources/${deactivatingSource.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeactivatingSource(null);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to deactivate income source");
      }
    } catch (err) {
      console.error("Error deactivating source:", err);
    }
  };

  const handleReactivateSource = async (src: any) => {
    try {
      const res = await fetch(`/api/income-sources/${src.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("Error reactivating source:", err);
    }
  };

  // Handlers - Employment & Payslips
  const handleCreateEmployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employmentForm.employerName) return;

    try {
      const res = await fetch("/api/employments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employmentForm),
      });

      if (res.ok) {
        setIsAddEmploymentOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add employment");
      }
    } catch (err) {
      console.error("Error creating employment:", err);
    }
  };

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payslipForm.employmentId) return;

    try {
      const res = await fetch("/api/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payslipForm),
      });

      if (res.ok) {
        setIsGeneratePayslipOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to generate payslip");
      }
    } catch (err) {
      console.error("Error generating payslip:", err);
    }
  };

  const openConfirmCreditModal = (ps: any) => {
    setSelectedPayslip(ps);
    setCreditForm({
      accountId: ps.accountId || ps.employment?.incomeSource?.defaultAccountId || safeAccounts[0]?.id || "",
      actualCreditDate: new Date().toISOString().split("T")[0],
      actualAmountCredited: String(ps.netSalary),
      transactionRef: "",
      notes: "",
    });
    setIsConfirmCreditOpen(true);
  };

  const handleConfirmCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayslip || !creditForm.accountId) return;

    try {
      const res = await fetch("/api/payslips/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payslipId: selectedPayslip.id,
          ...creditForm,
        }),
      });

      if (res.ok) {
        setIsConfirmCreditOpen(false);
        setSelectedPayslip(null);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to confirm salary credit");
      }
    } catch (err) {
      console.error("Error confirming credit:", err);
    }
  };

  // Handlers - Confirm Receipt / Adhoc / Expense
  const openConfirmModal = (occ: any) => {
    setSelectedOccurrence(occ);
    setReceiptForm({
      amount: occ.outstandingAmount ? String(occ.outstandingAmount) : String(occ.expectedAmount),
      accountId: occ.incomeSource?.defaultAccountId || safeAccounts[0]?.id || "",
      date: new Date().toISOString().split("T")[0],
      paymentMethod: "BANK_TRANSFER",
      referenceNo: "",
      notes: "",
    });
    setIsConfirmOpen(true);
  };

  const handleConfirmReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOccurrence || !receiptForm.amount || !receiptForm.accountId) return;

    try {
      const res = await fetch("/api/income-sources/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          occurrenceId: selectedOccurrence.id,
          incomeSourceId: selectedOccurrence.incomeSourceId,
          accountId: receiptForm.accountId,
          amount: parseFloat(receiptForm.amount),
          date: receiptForm.date,
          paymentMethod: receiptForm.paymentMethod,
          referenceNo: receiptForm.referenceNo,
          notes: receiptForm.notes,
        }),
      });

      if (res.ok) {
        setIsConfirmOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to confirm receipt");
      }
    } catch (err) {
      console.error("Failed to confirm receipt:", err);
    }
  };

  const handleRecordAdhoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adhocForm.amount || !adhocForm.accountId) return;

    try {
      const res = await fetch("/api/income-sources/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          incomeSourceId: adhocForm.incomeSourceId || undefined,
          accountId: adhocForm.accountId,
          amount: parseFloat(adhocForm.amount),
          date: adhocForm.date,
          paymentMethod: adhocForm.paymentMethod,
          referenceNo: adhocForm.referenceNo,
          description: adhocForm.description || "Ad-hoc Income Receipt",
          notes: adhocForm.notes,
        }),
      });

      if (res.ok) {
        setIsRecordOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to record income receipt");
      }
    } catch (err) {
      console.error("Failed to record income receipt:", err);
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.accountId) return;

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          accountId: expenseForm.accountId,
          amount: parseFloat(expenseForm.amount),
          type: "EXPENSE",
          date: expenseForm.date,
          merchant: expenseForm.merchant,
          description: expenseForm.description || "Direct Expense Outflow",
          notes: expenseForm.notes,
        }),
      });

      if (res.ok) {
        setIsExpenseOpen(false);
        setExpenseForm({
          amount: "",
          accountId: "",
          date: new Date().toISOString().split("T")[0],
          merchant: "",
          description: "",
          notes: "",
        });
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to record expense");
      }
    } catch (err) {
      console.error("Failed to record expense:", err);
    }
  };

  const displayedSources = safeSources.filter((s) => (sourceStatusFilter === "ACTIVE" ? s.isActive !== false : s.isActive === false));

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-emerald-600" />
              Integrated Income, Salary & Expense OS
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Unified management for family salary payslips, agriculture, sericulture, goat farming, rental, consulting, and expense outflows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAddEmploymentOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              <Briefcase className="h-3.5 w-3.5" />
              Add Employment
            </button>

            <button
              onClick={() => {
                setPayslipForm({
                  employmentId: safeEmployments[0]?.id || "",
                  month: String(new Date().getMonth() + 1),
                  year: String(new Date().getFullYear()),
                  basicSalary: "",
                  hra: "",
                  otherAllowances: "",
                  bonusIncentives: "",
                  overtimeArrears: "",
                  pfDeduction: "",
                  esiDeduction: "",
                  professionalTax: "",
                  tdsTax: "",
                  otherDeductions: "",
                });
                setIsGeneratePayslipOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
            >
              <FileText className="h-3.5 w-3.5" />
              Enter Payslip
            </button>

            <button
              onClick={() => {
                setEditingSource(null);
                setSourceForm({
                  name: "",
                  category: "Salary",
                  behavior: "RECURRING",
                  frequency: "MONTHLY",
                  expectedAmount: "",
                  defaultAccountId: "",
                  expectedDay: "1",
                  description: "",
                });
                setIsAddSourceOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add Income Stream
            </button>

            <button
              onClick={() => {
                setExpenseForm({
                  amount: "",
                  accountId: safeAccounts[0]?.id || "",
                  date: new Date().toISOString().split("T")[0],
                  merchant: "",
                  description: "",
                  notes: "",
                });
                setIsExpenseOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
            >
              <ArrowDownRight className="h-3.5 w-3.5" />
              Record Expense
            </button>
          </div>
        </div>

        {/* Integrated Navigation Tabs */}
        <div className="flex border-b text-sm font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors ${
              activeTab === "overview" ? "border-emerald-600 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview & Analytics
          </button>
          <button
            onClick={() => setActiveTab("salary")}
            className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === "salary" ? "border-emerald-600 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            Salary & Payslips
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 font-bold">
              {safeEmployments.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("sources")}
            className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === "sources" ? "border-emerald-600 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Other Income Streams
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 font-bold">
              {safeSources.filter((s) => s.isActive !== false).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === "pending" ? "border-emerald-600 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending Expected Receipts
            {pendingOccurrences.length + pendingPayslips.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 font-bold">
                {pendingOccurrences.length + pendingPayslips.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors ${
              activeTab === "history" ? "border-emerald-600 text-emerald-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Transaction History Ledger
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Income Received</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">{formatINR(totalIncomeReceived)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Confirmed bank credits across all streams</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-rose-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Expenses Paid</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-rose-600">{formatINR(totalExpensePaid)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Deducted from bank/cash balances</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-indigo-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Net Cash Flow (Savings)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${netCashFlow >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
                    {formatINR(netCashFlow)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Savings Rate: <span className="font-semibold text-foreground">{savingsRate}%</span></p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Pending Expected Outflow/Receipts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{formatINR(totalPendingOutstanding)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{pendingOccurrences.length + pendingPayslips.length} item(s) pending credit</p>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actual Income Distribution</CardTitle>
                  <CardDescription>Income received breakdown by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    {mounted && categoryChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryChartData} dataKey="value" cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={4}>
                            {categoryChartData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any) => [formatINR(Number(val || 0)), "Received"]} />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No actual income transactions recorded yet.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Employments & Active Streams</CardTitle>
                  <CardDescription>Configured family member jobs and income streams</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {safeEmployments.map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between border-b pb-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{emp.employerName}</p>
                          <p className="text-xs text-muted-foreground">{emp.user?.name} • {emp.designation || "Executive"}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
                        {emp.employmentType}
                      </span>
                    </div>
                  ))}

                  {safeSources.filter((s) => s.isActive !== false).slice(0, 3).map((s) => (
                    <div key={s.id} className="flex items-center justify-between border-b pb-2.5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 font-bold text-xs uppercase">
                          {s.category?.substring(0, 2) || "IN"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.category} • {s.behavior}</p>
                        </div>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm">
                        {s.expectedAmount ? formatINR(Number(s.expectedAmount)) : "Variable"}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 2: Salary & Payslips */}
        {activeTab === "salary" && (
          <div className="space-y-6">
            {/* Employment Profiles */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg font-bold">1. Family Member Employments</CardTitle>
                  <CardDescription>Employer details, designations, and credit schedules.</CardDescription>
                </div>
                <button
                  onClick={() => setIsAddEmploymentOpen(true)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  + Add Employment
                </button>
              </CardHeader>
              <CardContent>
                {safeEmployments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No employment profiles setup yet. Click &quot;Add Employment&quot; to configure job details.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {safeEmployments.map((emp) => (
                      <div key={emp.id} className="rounded-xl border p-4 space-y-3 bg-card">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase">
                              {emp.employmentType}
                            </span>
                            <h3 className="font-bold text-base text-foreground mt-1">{emp.employerName}</h3>
                            <p className="text-xs text-muted-foreground">{emp.designation || "Executive"}</p>
                          </div>
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                            <Building className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="space-y-1 text-xs border-t pt-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Member:</span>
                            <span className="font-semibold">{emp.user?.name || "Kamalsankar"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Credit Date:</span>
                            <span className="font-semibold">{emp.salaryCreditDate ? `${emp.salaryCreditDate}th` : "1st"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payslips & Bank Credit Reconciliation */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg font-bold">2. Monthly Payslips & Bank Credit Verification</CardTitle>
                  <CardDescription>Itemized Basic, HRA, Allowances, Deductions & Bank Verification.</CardDescription>
                </div>
                <button
                  onClick={() => setIsGeneratePayslipOpen(true)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  + Enter Payslip
                </button>
              </CardHeader>
              <CardContent>
                {safePayslips.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No payslips logged yet. Click &quot;Enter Payslip&quot; to calculate earnings & deductions.
                  </div>
                ) : (
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {safePayslips.map((ps) => {
                      const isConfirmed = ps.status === "CONFIRMED_CREDITED";

                      return (
                        <div key={ps.id} className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card hover:bg-muted/30 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 rounded-xl p-2.5 ${isConfirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{ps.employment?.employerName || "Salary Credit"}</span>
                                <span className="text-xs text-muted-foreground">({ps.payPeriod})</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  isConfirmed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                                }`}>
                                  {isConfirmed ? "CREDITED TO BANK" : "AWAITING CREDIT"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Member: <span className="font-semibold text-foreground">{ps.user?.name || "Kamalsankar"}</span> • Basic: {formatINR(ps.basicSalary)} | HRA: {formatINR(ps.hra)} | PF: {formatINR(ps.pfDeduction)} | TDS: {formatINR(ps.tdsTax)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between lg:justify-end gap-6 border-t pt-2 lg:border-0 lg:pt-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Gross: {formatINR(ps.grossSalary)} | Deductions: -{formatINR(ps.totalDeductions)}</p>
                              <p className="text-base font-extrabold text-emerald-600">Net Salary: {formatINR(ps.netSalary)}</p>
                            </div>

                            {!isConfirmed ? (
                              <button
                                onClick={() => openConfirmCreditModal(ps)}
                                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition-all"
                              >
                                <CheckCircle2 className="h-4 w-4" /> Confirm Bank Credit
                              </button>
                            ) : (
                              <div className="text-xs text-right text-emerald-600 font-semibold">
                                Credited: {formatINR(ps.actualAmountCredited)}
                                {ps.account && <p className="text-[10px] text-muted-foreground">{ps.account.name}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 3: Other Income Streams */}
        {activeTab === "sources" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSourceStatusFilter("ACTIVE")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    sourceStatusFilter === "ACTIVE" ? "bg-emerald-600 text-white shadow-xs" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Active Streams ({safeSources.filter((s) => s.isActive !== false).length})
                </button>
                <button
                  onClick={() => setSourceStatusFilter("INACTIVE")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    sourceStatusFilter === "INACTIVE" ? "bg-emerald-600 text-white shadow-xs" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Deactivated Streams ({safeSources.filter((s) => s.isActive === false).length})
                </button>
              </div>
            </div>

            {displayedSources.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground border rounded-xl bg-card p-8">
                {sourceStatusFilter === "ACTIVE"
                  ? "No active income streams found. Click 'Add Income Stream' above to register agriculture, sericulture, or rental stream."
                  : "No deactivated income streams."}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayedSources.map((s) => (
                  <Card key={s.id} className="relative overflow-hidden border">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                          {s.category}
                        </span>
                        <span className="text-[11px] font-medium text-muted-foreground uppercase">{s.behavior}</span>
                      </div>
                      <CardTitle className="text-base font-bold mt-2 flex items-center justify-between">
                        <span>{s.name}</span>
                        {s.isActive === false && (
                          <span className="text-[10px] rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-600 font-bold uppercase">
                            Inactive
                          </span>
                        )}
                      </CardTitle>
                      {s.description && <CardDescription className="text-xs line-clamp-2">{s.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="text-xs space-y-2">
                      <div className="flex justify-between py-1 border-t">
                        <span className="text-muted-foreground">Expected Amount:</span>
                        <span className="font-bold text-foreground">
                          {s.expectedAmount ? formatINR(Number(s.expectedAmount)) : "Variable"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-t">
                        <span className="text-muted-foreground">Default Account:</span>
                        <span className="font-medium text-foreground">{s.defaultAccount?.name || "Unassigned"}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t">
                        <button onClick={() => handleOpenEditSource(s)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        {s.isActive !== false ? (
                          <button onClick={() => setDeactivatingSource(s)} className="flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                            <Archive className="h-3.5 w-3.5" /> Deactivate
                          </button>
                        ) : (
                          <button onClick={() => handleReactivateSource(s)} className="flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50">
                            <ArchiveRestore className="h-3.5 w-3.5" /> Reactivate
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Pending Receipts */}
        {activeTab === "pending" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Scheduled Incoming Receipts & Uncredited Payslips</CardTitle>
                <CardDescription>Confirm actual received funds to record ledger transactions and update account balances atomically.</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingOccurrences.length > 0 || pendingPayslips.length > 0 ? (
                  <div className="divide-y">
                    {pendingPayslips.map((ps) => (
                      <div key={ps.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">Salary: {ps.employment?.employerName} ({ps.payPeriod})</span>
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">PAYSLIP GENERATED</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Member: {ps.user?.name} • Net Salary Due: <span className="font-bold text-foreground">{formatINR(ps.netSalary)}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => openConfirmCreditModal(ps)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Bank Credit
                        </button>
                      </div>
                    ))}

                    {pendingOccurrences.map((occ) => (
                      <div key={occ.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{occ.name}</span>
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600">{occ.status}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Due: {new Date(occ.dueDate).toLocaleDateString("en-IN")} • Outstanding: <span className="font-bold text-amber-600">{formatINR(Number(occ.outstandingAmount))}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => openConfirmModal(occ)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Received
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No pending expected receipts right now. All scheduled streams and payslips are up to date!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 5: History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Combined Income & Expense Ledger</CardTitle>
                <CardDescription>Immutable log of confirmed actual receipts and expense transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {safeTransactions.length > 0 ? (
                  <div className="divide-y">
                    {safeTransactions.map((tx) => {
                      const isIncome = tx.type === "INCOME";

                      return (
                        <div key={tx.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isIncome ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                              {isIncome ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{tx.description || tx.merchant || (isIncome ? "Income Receipt" : "Expense Outflow")}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(tx.date).toLocaleDateString("en-IN")} • Account: {tx.account?.name || tx.accountId}
                              </p>
                            </div>
                          </div>
                          <span className={`font-bold text-sm ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                            {isIncome ? "+" : "-"}{formatINR(Number(tx.amount))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No transactions logged yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Modal: Add Employment Profile */}
        {isAddEmploymentOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold">1. Setup Family Member Employment Profile</h2>
              <form onSubmit={handleCreateEmployment} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Family Member *</label>
                    <select
                      value={employmentForm.userId}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, userId: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="">Current User</option>
                      {safeMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user?.name || m.userId} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Employer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Karur Vysya Bank"
                      value={employmentForm.employerName}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, employerName: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Designation</label>
                    <input
                      type="text"
                      placeholder="e.g. Branch Sales & Service Executive"
                      value={employmentForm.designation}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, designation: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Employment Type</label>
                    <select
                      value={employmentForm.employmentType}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, employmentType: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="FULL_TIME">Full-time</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="PART_TIME">Part-time</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Joining Date</label>
                    <input
                      type="date"
                      value={employmentForm.joiningDate}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, joiningDate: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Salary Credit Day</label>
                    <input
                      type="number"
                      placeholder="1st"
                      value={employmentForm.salaryCreditDate}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, salaryCreditDate: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Expected Salary (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 55000"
                      value={employmentForm.expectedMonthlySalary}
                      onChange={(e) => setEmploymentForm({ ...employmentForm, expectedMonthlySalary: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsAddEmploymentOpen(false)} className="rounded-md border px-3 py-1.5 font-semibold hover:bg-muted">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-md bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90">
                    Save Employment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Monthly Payslip Generator */}
        {isGeneratePayslipOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-background p-6 shadow-xl space-y-4 overflow-y-auto max-h-[90vh]">
              <h2 className="text-lg font-bold">2. Enter Monthly Payslip Earnings & Deductions</h2>
              <form onSubmit={handleGeneratePayslip} className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Employment *</label>
                    <select
                      required
                      value={payslipForm.employmentId}
                      onChange={(e) => setPayslipForm({ ...payslipForm, employmentId: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="">Select Employment</option>
                      {safeEmployments.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.employerName} ({emp.user?.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Pay Month *</label>
                    <select
                      value={payslipForm.month}
                      onChange={(e) => setPayslipForm({ ...payslipForm, month: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2026, i, 1).toLocaleString("default", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Pay Year *</label>
                    <input
                      type="number"
                      required
                      value={payslipForm.year}
                      onChange={(e) => setPayslipForm({ ...payslipForm, year: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="rounded-lg border p-3 bg-emerald-50/30 space-y-2">
                  <h3 className="font-bold text-emerald-700 text-xs uppercase tracking-wider">Earnings (Gross Salary Components)</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-medium block mb-1">Basic Salary *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 25000"
                        value={payslipForm.basicSalary}
                        onChange={(e) => setPayslipForm({ ...payslipForm, basicSalary: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">HRA *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 10000"
                        value={payslipForm.hra}
                        onChange={(e) => setPayslipForm({ ...payslipForm, hra: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Other Allowances</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 8000"
                        value={payslipForm.otherAllowances}
                        onChange={(e) => setPayslipForm({ ...payslipForm, otherAllowances: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-medium block mb-1">Bonus / Incentives</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 5000"
                        value={payslipForm.bonusIncentives}
                        onChange={(e) => setPayslipForm({ ...payslipForm, bonusIncentives: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Overtime / Arrears</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 2000"
                        value={payslipForm.overtimeArrears}
                        onChange={(e) => setPayslipForm({ ...payslipForm, overtimeArrears: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div className="text-right font-bold text-emerald-700 text-xs pt-1">
                    Auto-Calculated Gross Salary: {formatINR(calcGross())}
                  </div>
                </div>

                <div className="rounded-lg border p-3 bg-rose-50/30 space-y-2">
                  <h3 className="font-bold text-rose-700 text-xs uppercase tracking-wider">Deductions</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-medium block mb-1">PF Deduction</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 1800"
                        value={payslipForm.pfDeduction}
                        onChange={(e) => setPayslipForm({ ...payslipForm, pfDeduction: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">ESI Deduction</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 0"
                        value={payslipForm.esiDeduction}
                        onChange={(e) => setPayslipForm({ ...payslipForm, esiDeduction: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Professional Tax (PT)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 200"
                        value={payslipForm.professionalTax}
                        onChange={(e) => setPayslipForm({ ...payslipForm, professionalTax: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-medium block mb-1">TDS / Income Tax</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 1500"
                        value={payslipForm.tdsTax}
                        onChange={(e) => setPayslipForm({ ...payslipForm, tdsTax: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Other Deductions</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 0"
                        value={payslipForm.otherDeductions}
                        onChange={(e) => setPayslipForm({ ...payslipForm, otherDeductions: e.target.value })}
                        className="w-full rounded-md border p-2 text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div className="text-right font-bold text-rose-700 text-xs pt-1">
                    Total Deductions: -{formatINR(calcDeductions())}
                  </div>
                </div>

                <div className="rounded-lg border p-3 bg-muted/40 flex justify-between items-center">
                  <span className="font-bold text-sm">Calculated Net Salary:</span>
                  <span className="font-extrabold text-lg text-emerald-600">{formatINR(calcNet())}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsGeneratePayslipOpen(false)} className="rounded-md border px-4 py-2 font-semibold hover:bg-muted">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500">
                    Generate Payslip
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirm Salary Bank Credit */}
        {isConfirmCreditOpen && selectedPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold">3. Confirm Bank Credit Matching</h2>
              <p className="text-xs text-muted-foreground">
                Confirming salary credit for <span className="font-semibold text-foreground">{selectedPayslip.employment?.employerName} ({selectedPayslip.payPeriod})</span>. Calculated Net Salary is {formatINR(selectedPayslip.netSalary)}.
              </p>

              <form onSubmit={handleConfirmCredit} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Receiving Bank Account *</label>
                  <select
                    required
                    value={creditForm.accountId}
                    onChange={(e) => setCreditForm({ ...creditForm, accountId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    {safeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Actual Credit Date *</label>
                    <input
                      type="date"
                      required
                      value={creditForm.actualCreditDate}
                      onChange={(e) => setCreditForm({ ...creditForm, actualCreditDate: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Actual Amount Credited (₹) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={creditForm.actualAmountCredited}
                      onChange={(e) => setCreditForm({ ...creditForm, actualAmountCredited: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background font-bold text-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Transaction Ref / UTR (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. KVB1829031892"
                    value={creditForm.transactionRef}
                    onChange={(e) => setCreditForm({ ...creditForm, transactionRef: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsConfirmCreditOpen(false)} className="rounded-md border px-4 py-2 font-semibold hover:bg-muted">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500">
                    Confirm & Update Bank Balance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add/Edit Income Stream */}
        {isAddSourceOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">{editingSource ? "Edit Income Stream" : "Add Income Stream"}</h2>
              <form onSubmit={handleSaveSource} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Source Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sericulture Silk Cocoon Lot #2"
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Category</label>
                    <select
                      value={sourceForm.category}
                      onChange={(e) => setSourceForm({ ...sourceForm, category: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="Business">Business Income</option>
                      <option value="Agriculture">Agriculture & Crops</option>
                      <option value="Sericulture">Sericulture & Silk</option>
                      <option value="Livestock">Livestock & Goat Farming</option>
                      <option value="Rental">Rental Income</option>
                      <option value="Freelance">Freelance & Consulting</option>
                      <option value="Interest">Interest & Dividends</option>
                      <option value="Other">Other Income</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Behavior</label>
                    <select
                      value={sourceForm.behavior}
                      onChange={(e) => setSourceForm({ ...sourceForm, behavior: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="RECURRING">Recurring Schedule</option>
                      <option value="SEASONAL">Seasonal / Crop Cycle</option>
                      <option value="IRREGULAR">Irregular Stream</option>
                      <option value="ONE_TIME">One-Time Receipt</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Expected Amount (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 45000"
                      value={sourceForm.expectedAmount}
                      onChange={(e) => setSourceForm({ ...sourceForm, expectedAmount: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Default Account</label>
                    <select
                      value={sourceForm.defaultAccountId}
                      onChange={(e) => setSourceForm({ ...sourceForm, defaultAccountId: e.target.value })}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="">Select Account</option>
                      {safeAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({formatINR(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsAddSourceOpen(false)} className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500">
                    Save Stream
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirm Receipt */}
        {isConfirmOpen && selectedOccurrence && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Confirm Actual Receipt</h2>
              <form onSubmit={handleConfirmReceipt} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Actual Amount Received (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={receiptForm.amount}
                    onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background font-bold text-emerald-600"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Receiving Account *</label>
                  <select
                    required
                    value={receiptForm.accountId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, accountId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    {safeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsConfirmOpen(false)} className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500">
                    Confirm & Post to Ledger
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Direct Expense */}
        {isExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Record Expense Outflow</h2>
              <form onSubmit={handleRecordExpense} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Expense Amount (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 3500"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background font-bold text-rose-600"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Paying Account *</label>
                  <select
                    required
                    value={expenseForm.accountId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    {safeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsExpenseOpen(false)} className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-500">
                    Record Expense
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
