"use client";

import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import {
  CreditCard,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wallet,
  Clock,
  Filter,
  Building,
  ShieldCheck,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Info,
  CalendarClock,
  FileText,
  Percent,
  Check,
  X,
  History,
  Lock,
} from "lucide-react";

export default function BorrowingPage() {
  const [borrowings, setBorrowings] = useState<any[]>([]);
  const [lenders, setLenders] = useState<any[]>([]);
  const [scopes, setScopes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [lenderFilter, setLenderFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDisburseOpen, setIsDisburseOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReverseOpen, setIsReverseOpen] = useState(false);
  const [selectedBorrowing, setSelectedBorrowing] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    borrowingType: "TERM_LOAN",
    financingType: "SECURED",
    repaymentMethod: "AMORTIZED_EMI",
    purpose: "",
    principalAmount: "",
    interestRate: "10.5",
    tenureMonths: "12",
    startDate: new Date().toISOString().split("T")[0],
    lenderId: "",
    newLenderName: "",
    scopeId: "",
    categoryId: "",
    costCenterId: "",
    assetId: "",
  });

  const [disburseForm, setDisburseForm] = useState({
    receivingAccountId: "",
    disbursementDate: new Date().toISOString().split("T")[0],
    referenceNo: "",
    notes: "",
  });

  const [repayForm, setRepayForm] = useState({
    payingAccountId: "",
    principalAmount: "",
    interestAmount: "0",
    paymentDate: new Date().toISOString().split("T")[0],
    referenceNo: "",
    notes: "",
    installmentId: "",
  });

  const [reverseReason, setReverseReason] = useState("");

  // Load initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [bRes, lRes, sRes, cRes, ccRes, accRes, assRes, uRes] = await Promise.all([
        fetch("/api/borrowing?includeArchived=true"),
        fetch("/api/lenders"),
        fetch("/api/scopes"),
        fetch("/api/categories"),
        fetch("/api/cost-centers"),
        fetch("/api/accounts"),
        fetch("/api/assets"),
        fetch("/api/auth/me"),
      ]);

      if (bRes.ok) setBorrowings(await bRes.json());
      if (lRes.ok) setLenders(await lRes.json());
      if (sRes.ok) setScopes(await sRes.json());
      if (cRes.ok) setCategories(await cRes.json());
      if (ccRes.ok) setCostCenters(await ccRes.json());
      if (accRes.ok) setAccounts(await accRes.json());
      if (assRes.ok) {
        const assData = await assRes.json();
        if (!Array.isArray(assData) && !Array.isArray(assData?.assets)) {
          console.warn("Unexpected borrowing assets API response format:", assData);
        }
        setAssets(Array.isArray(assData) ? assData : assData?.assets || []);
      }
      if (uRes.ok) setCurrentUser(await uRes.json());
    } catch (e) {
      console.error("Failed to load borrowing data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isViewer = currentUser?.role === "VIEWER";

  // KPIs
  const kpis = useMemo(() => {
    let totalBorrowed = 0;
    let outstandingPrincipal = 0;
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;
    let activeCount = 0;

    for (const b of borrowings) {
      if (b.status === "ACTIVE" || b.status === "PARTIALLY_SETTLED") {
        totalBorrowed += Number(b.principalAmount);
        outstandingPrincipal += Number(b.outstandingPrincipal);
        totalPrincipalPaid += Number(b.totalPrincipalPaid);
        totalInterestPaid += Number(b.totalInterestPaid);
        activeCount++;
      } else if (b.status === "SETTLED") {
        totalBorrowed += Number(b.principalAmount);
        totalPrincipalPaid += Number(b.totalPrincipalPaid);
        totalInterestPaid += Number(b.totalInterestPaid);
      }
    }

    return {
      totalBorrowed,
      outstandingPrincipal,
      totalPrincipalPaid,
      totalInterestPaid,
      activeCount,
    };
  }, [borrowings]);

  // Filtered borrowings
  const filteredBorrowings = useMemo(() => {
    return borrowings.filter((b) => {
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
      if (scopeFilter !== "ALL" && b.scopeId !== scopeFilter) return false;
      if (lenderFilter !== "ALL" && b.lenderId !== lenderFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = b.name.toLowerCase().includes(q);
        const matchLender = b.lender?.name?.toLowerCase().includes(q);
        const matchType = b.borrowingType?.toLowerCase().includes(q);
        if (!matchName && !matchLender && !matchType) return false;
      }
      return true;
    });
  }, [borrowings, statusFilter, scopeFilter, lenderFilter, searchQuery]);

  // Create Borrowing Handler
  const handleCreateBorrowing = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/borrowing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description || null,
          borrowingType: createForm.borrowingType,
          financingType: createForm.financingType,
          repaymentMethod: createForm.repaymentMethod,
          purpose: createForm.purpose || null,
          principalAmount: parseFloat(createForm.principalAmount),
          interestRate: parseFloat(createForm.interestRate),
          tenureMonths: parseInt(createForm.tenureMonths),
          startDate: createForm.startDate,
          lenderId: createForm.lenderId || undefined,
          lenderName: createForm.newLenderName || undefined,
          scopeId: createForm.scopeId || null,
          categoryId: createForm.categoryId || null,
          costCenterId: createForm.costCenterId || null,
          assetId: createForm.assetId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create borrowing");

      setIsCreateOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Disburse Handler
  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/borrowing/${selectedBorrowing.id}/disburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disburseForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disburse loan");

      setIsDisburseOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Repay Handler
  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/borrowing/${selectedBorrowing.id}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payingAccountId: repayForm.payingAccountId,
          principalAmount: parseFloat(repayForm.principalAmount || "0"),
          interestAmount: parseFloat(repayForm.interestAmount || "0"),
          paymentDate: repayForm.paymentDate,
          referenceNo: repayForm.referenceNo || null,
          notes: repayForm.notes || null,
          installmentId: repayForm.installmentId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record repayment");

      setIsRepayOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reverse Handler
  const handleReverseEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing || !selectedEvent) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/borrowing/${selectedBorrowing.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          reason: reverseReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reverse event");

      setIsReverseOpen(false);
      setIsHistoryOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Full Detail Modal
  const openDetail = async (borrowing: any, targetModal: "schedule" | "history") => {
    try {
      const res = await fetch(`/api/borrowing/${borrowing.id}`);
      if (res.ok) {
        const full = await res.json();
        setSelectedBorrowing(full);
        if (targetModal === "schedule") setIsScheduleOpen(true);
        if (targetModal === "history") setIsHistoryOpen(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Active</span>;
      case "PARTIALLY_SETTLED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">Partially Paid</span>;
      case "SETTLED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">Settled</span>;
      case "DRAFT":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Draft</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Cancelled</span>;
      case "ARCHIVED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">Archived</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CreditCard className="h-7 w-7 text-primary" />
              Borrowing & Debt Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Production double-entry loan agreements, automated EMI schedules, and lifecycle accounting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isViewer ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200">
                <Lock className="h-3.5 w-3.5" /> Read-Only Mode (Viewer)
              </span>
            ) : (
              <button
                onClick={() => {
                  setActionError(null);
                  setIsCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition"
              >
                <PlusCircle className="h-4 w-4" />
                New Loan Agreement
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="shadow-xs">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">Total Borrowed</CardDescription>
              <CardTitle className="text-xl font-bold text-foreground">
                {formatINR(kpis.totalBorrowed)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Principal under active management
            </CardContent>
          </Card>

          <Card className="shadow-xs border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium text-amber-800 dark:text-amber-400">
                Outstanding Principal
              </CardDescription>
              <CardTitle className="text-xl font-bold text-amber-900 dark:text-amber-200">
                {formatINR(kpis.outstandingPrincipal)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Active ledger debt liability
            </CardContent>
          </Card>

          <Card className="shadow-xs border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium text-emerald-800 dark:text-emerald-400">
                Principal Repaid
              </CardDescription>
              <CardTitle className="text-xl font-bold text-emerald-900 dark:text-emerald-200">
                {formatINR(kpis.totalPrincipalPaid)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Direct debt reduction (Non-Expense)
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">Interest Paid</CardDescription>
              <CardTitle className="text-xl font-bold text-foreground">
                {formatINR(kpis.totalInterestPaid)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Financing borrowing costs (Expense)
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-medium">Active Obligations</CardDescription>
              <CardTitle className="text-xl font-bold text-foreground">
                {kpis.activeCount} <span className="text-xs font-normal text-muted-foreground">Loans</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Across family & enterprise scopes
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-xl border">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by loan name, lender, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="PARTIALLY_SETTLED">Partially Paid</option>
              <option value="SETTLED">Settled</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Scope:</span>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="bg-background border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="ALL">All Scopes</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Lender:</span>
            <select
              value={lenderFilter}
              onChange={(e) => setLenderFilter(e.target.value)}
              className="bg-background border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="ALL">All Lenders</option>
              {lenders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loan Obligations List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Loading loan obligations...
            </div>
          ) : filteredBorrowings.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-card">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-base font-semibold text-foreground">No loan obligations found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No borrowing agreements match the selected criteria. Create a loan agreement to begin tracking.
              </p>
            </div>
          ) : (
            filteredBorrowings.map((b) => {
              const principal = Number(b.principalAmount);
              const outstanding = Number(b.outstandingPrincipal);
              const repaid = Number(b.totalPrincipalPaid);
              const pctRepaid = principal > 0 ? Math.min(100, Math.round((repaid / principal) * 100)) : 0;

              return (
                <Card key={b.id} className="overflow-hidden border hover:border-primary/40 transition">
                  <div className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-semibold text-base text-foreground">{b.name}</h3>
                        {getStatusBadge(b.status)}
                        {b.scope && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                            style={{ borderColor: b.scope.color || "#ccc", color: b.scope.color || "inherit" }}
                          >
                            {b.scope.name}
                          </span>
                        )}
                        {b.costCenter && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-secondary text-secondary-foreground">
                            {b.costCenter.name}
                          </span>
                        )}
                        {b.asset && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            Asset: {b.asset.name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <strong>Lender:</strong> {b.lender?.name || "Unassigned"}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Type:</strong> {b.borrowingType}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Interest Rate:</strong> {Number(b.interestRate)}% APR
                        </span>
                        {b.tenureMonths && (
                          <>
                            <span>•</span>
                            <span>
                              <strong>Tenure:</strong> {b.tenureMonths} Months
                            </span>
                          </>
                        )}
                      </div>

                      {/* Repayment Progress */}
                      {b.status !== "DRAFT" && (
                        <div className="pt-2 max-w-md">
                          <div className="flex items-center justify-between text-xs mb-1 font-medium">
                            <span className="text-muted-foreground">Repayment Progress ({pctRepaid}%)</span>
                            <span className="text-foreground">{formatINR(repaid)} paid of {formatINR(principal)}</span>
                          </div>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${pctRepaid}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Middle: Financials */}
                    <div className="flex items-center gap-6 pr-4 border-l pl-4 border-border/60">
                      <div>
                        <p className="text-[11px] uppercase font-semibold text-muted-foreground">Outstanding</p>
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                          {formatINR(outstanding)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold text-muted-foreground">Interest Paid</p>
                        <p className="text-base font-semibold text-foreground">
                          {formatINR(Number(b.totalInterestPaid))}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {b.status === "DRAFT" && !isViewer && (
                        <button
                          onClick={() => {
                            setSelectedBorrowing(b);
                            setDisburseForm({
                              receivingAccountId: b.receivingAccountId || accounts[0]?.id || "",
                              disbursementDate: new Date().toISOString().split("T")[0],
                              referenceNo: "",
                              notes: `Disbursement for ${b.name}`,
                            });
                            setIsDisburseOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                          Disburse Funds
                        </button>
                      )}

                      {(b.status === "ACTIVE" || b.status === "PARTIALLY_SETTLED") && !isViewer && (
                        <button
                          onClick={() => {
                            setSelectedBorrowing(b);
                            setRepayForm({
                              payingAccountId: accounts[0]?.id || "",
                              principalAmount: "",
                              interestAmount: "0",
                              paymentDate: new Date().toISOString().split("T")[0],
                              referenceNo: "",
                              notes: `Repayment on ${b.name}`,
                              installmentId: "",
                            });
                            setIsRepayOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Record Repayment
                        </button>
                      )}

                      <button
                        onClick={() => openDetail(b, "schedule")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-background hover:bg-muted"
                      >
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                        Schedule
                      </button>

                      <button
                        onClick={() => openDetail(b, "history")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-background hover:bg-muted"
                      >
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        Audit History
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal: New Loan Agreement */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Create Loan Agreement</h3>
                  <p className="text-xs text-muted-foreground">Draft agreement with planning parameters.</p>
                </div>
                <button onClick={() => setIsCreateOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {actionError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-2 border border-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
                </div>
              )}

              <form onSubmit={handleCreateBorrowing} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Loan Agreement Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC Agri Term Loan"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Borrowing Type *</label>
                    <select
                      value={createForm.borrowingType}
                      onChange={(e) => setCreateForm({ ...createForm, borrowingType: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    >
                      <option value="TERM_LOAN">Term Loan</option>
                      <option value="EMI_LOAN">Amortized EMI Loan</option>
                      <option value="MORTGAGE">Mortgage</option>
                      <option value="VEHICLE_LOAN">Vehicle Loan</option>
                      <option value="PERSONAL_LOAN">Personal Loan</option>
                      <option value="LINE_OF_CREDIT">Line of Credit</option>
                      <option value="PEER_BORROWING">Peer / Family Borrowing</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Principal Amount (INR) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="e.g. 500000"
                      value={createForm.principalAmount}
                      onChange={(e) => setCreateForm({ ...createForm, principalAmount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Annual Interest Rate (%) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={createForm.interestRate}
                      onChange={(e) => setCreateForm({ ...createForm, interestRate: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Tenure (Months) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={createForm.tenureMonths}
                      onChange={(e) => setCreateForm({ ...createForm, tenureMonths: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Lender</label>
                    <select
                      value={createForm.lenderId}
                      onChange={(e) => setCreateForm({ ...createForm, lenderId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    >
                      <option value="">-- Select or Add Below --</option>
                      {lenders.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {!createForm.lenderId && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">New Lender Name</label>
                      <input
                        type="text"
                        placeholder="e.g. State Bank of India"
                        value={createForm.newLenderName}
                        onChange={(e) => setCreateForm({ ...createForm, newLenderName: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                      />
                    </div>
                  )}
                </div>

                {/* Classification */}
                <div className="pt-2 border-t space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Universal Financial Classification</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Financial Scope</label>
                      <select
                        value={createForm.scopeId}
                        onChange={(e) => setCreateForm({ ...createForm, scopeId: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                      >
                        <option value="">-- No Scope --</option>
                        {scopes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Expense Category</label>
                      <select
                        value={createForm.categoryId}
                        onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                      >
                        <option value="">-- No Category --</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Facility / Cost Center</label>
                      <select
                        value={createForm.costCenterId}
                        onChange={(e) => setCreateForm({ ...createForm, costCenterId: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                      >
                        <option value="">-- No Cost Center --</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Linked Physical Asset (Optional)</label>
                    <select
                      value={createForm.assetId}
                      onChange={(e) => setCreateForm({ ...createForm, assetId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    >
                      <option value="">-- None (Unlinked) --</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.category})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  >
                    {actionLoading ? "Creating Draft..." : "Create Draft Agreement"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Disburse Loan */}
        {isDisburseOpen && selectedBorrowing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Disburse Loan Funds</h3>
                  <p className="text-xs text-muted-foreground">{selectedBorrowing.name}</p>
                </div>
                <button onClick={() => setIsDisburseOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {actionError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-2 border border-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
                </div>
              )}

              <form onSubmit={handleDisburse} className="p-6 space-y-4">
                <div className="p-3 rounded-xl bg-muted/50 border space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Disbursement Amount:</span>
                    <span className="font-bold text-foreground text-sm">
                      {formatINR(Number(selectedBorrowing.principalAmount))}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Double-Entry: Debits Receiving Bank Account, Credits Loan Liability Account. Income is strictly ZERO.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Receiving Bank Account *</label>
                  {accounts.filter((a) => ["BANK", "CASH"].includes(a.type.toUpperCase())).length === 0 ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                      <p className="font-medium">A receiving account is required before recording loan disbursement.</p>
                      <button
                        type="button"
                        onClick={() => window.location.href = "/accounts"}
                        className="px-3 py-1 bg-background border rounded text-xs font-semibold hover:bg-muted"
                      >
                        Create Account
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={disburseForm.receivingAccountId}
                      onChange={(e) => setDisburseForm({ ...disburseForm, receivingAccountId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    >
                      <option value="">-- Select Receiving Bank Account --</option>
                      {accounts.filter((a) => ["BANK", "CASH"].includes(a.type.toUpperCase())).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type}) - Balance: {formatINR(Number(a.balance))}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Disbursement Date *</label>
                    <input
                      type="date"
                      required
                      value={disburseForm.disbursementDate}
                      onChange={(e) => setDisburseForm({ ...disburseForm, disbursementDate: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Reference / UTR Number</label>
                    <input
                      type="text"
                      placeholder="e.g. UTR8472918"
                      value={disburseForm.referenceNo}
                      onChange={(e) => setDisburseForm({ ...disburseForm, referenceNo: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Disbursement Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Disbursed into primary checking account"
                    value={disburseForm.notes}
                    onChange={(e) => setDisburseForm({ ...disburseForm, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsDisburseOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                  >
                    {actionLoading ? "Posting Ledger Entries..." : "Execute Disbursement"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Repayment / EMI Payment */}
        {isRepayOpen && selectedBorrowing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Record Loan Repayment</h3>
                  <p className="text-xs text-muted-foreground">{selectedBorrowing.name}</p>
                </div>
                <button onClick={() => setIsRepayOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {actionError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-2 border border-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
                </div>
              )}

              <form onSubmit={handleRepay} className="p-6 space-y-4">
                <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-800 dark:text-amber-300">Outstanding Balance:</span>
                    <span className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                      {formatINR(Number(selectedBorrowing.outstandingPrincipal))}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Principal repayment reduces liability (not expense). Interest is an expense.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Paying Bank Account *</label>
                  {accounts.filter((a) => ["BANK", "CASH"].includes(a.type.toUpperCase())).length === 0 ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                      <p className="font-medium">A paying account is required before recording loan repayment.</p>
                      <button
                        type="button"
                        onClick={() => window.location.href = "/accounts"}
                        className="px-3 py-1 bg-background border rounded text-xs font-semibold hover:bg-muted"
                      >
                        Create Account
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={repayForm.payingAccountId}
                      onChange={(e) => setRepayForm({ ...repayForm, payingAccountId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    >
                      <option value="">-- Select Paying Bank Account --</option>
                      {accounts.filter((a) => ["BANK", "CASH"].includes(a.type.toUpperCase())).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type}) - Balance: {formatINR(Number(a.balance))}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Principal Amount (INR) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      max={Number(selectedBorrowing.outstandingPrincipal)}
                      step="any"
                      placeholder="e.g. 25000"
                      value={repayForm.principalAmount}
                      onChange={(e) => setRepayForm({ ...repayForm, principalAmount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Interest Amount (INR)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={repayForm.interestAmount}
                      onChange={(e) => setRepayForm({ ...repayForm, interestAmount: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={repayForm.paymentDate}
                      onChange={(e) => setRepayForm({ ...repayForm, paymentDate: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Reference / Cheque No</label>
                    <input
                      type="text"
                      placeholder="e.g. CHQ00492"
                      value={repayForm.referenceNo}
                      onChange={(e) => setRepayForm({ ...repayForm, referenceNo: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Monthly installment payment"
                    value={repayForm.notes}
                    onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsRepayOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  >
                    {actionLoading ? "Posting Repayment..." : "Post Double-Entry Repayment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Schedule & Installments */}
        {isScheduleOpen && selectedBorrowing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-4xl bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in flex flex-col max-h-[85vh]">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Amortization Schedule</h3>
                  <p className="text-xs text-muted-foreground">{selectedBorrowing.name} • {selectedBorrowing.schedules?.[0]?.totalInstallments || 0} Installments</p>
                </div>
                <button onClick={() => setIsScheduleOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {(!selectedBorrowing.schedules || selectedBorrowing.schedules.length === 0 || !selectedBorrowing.schedules[0].installments?.length) ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No active repayment schedule found for this loan.
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/70 text-muted-foreground font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Due Date</th>
                          <th className="py-2.5 px-3">Principal</th>
                          <th className="py-2.5 px-3">Interest</th>
                          <th className="py-2.5 px-3">Total Due</th>
                          <th className="py-2.5 px-3">Paid Principal</th>
                          <th className="py-2.5 px-3">Remaining</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedBorrowing.schedules[0].installments.map((inst: any) => (
                          <tr key={inst.id} className="hover:bg-muted/30">
                            <td className="py-2.5 px-3 font-semibold">{inst.installmentNumber}</td>
                            <td className="py-2.5 px-3">{new Date(inst.dueDate).toLocaleDateString()}</td>
                            <td className="py-2.5 px-3">{formatINR(Number(inst.principalAmount))}</td>
                            <td className="py-2.5 px-3">{formatINR(Number(inst.interestAmount))}</td>
                            <td className="py-2.5 px-3 font-medium">{formatINR(Number(inst.totalAmount))}</td>
                            <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-medium">
                              {formatINR(Number(inst.paidPrincipal))}
                            </td>
                            <td className="py-2.5 px-3">{formatINR(Number(inst.remainingAmount))}</td>
                            <td className="py-2.5 px-3">
                              {inst.status === "PAID" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Paid
                                </span>
                              ) : inst.status === "PARTIALLY_PAID" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                  Partial
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Upcoming
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Audit & Double-Entry History */}
        {isHistoryOpen && selectedBorrowing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-4xl bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in flex flex-col max-h-[85vh]">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Double-Entry Financial Events & Reversals</h3>
                  <p className="text-xs text-muted-foreground">{selectedBorrowing.name}</p>
                </div>
                <button onClick={() => setIsHistoryOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {(!selectedBorrowing.financialEvents || selectedBorrowing.financialEvents.length === 0) ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No financial events have occurred for this borrowing yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedBorrowing.financialEvents.map((evt: any) => (
                      <div
                        key={evt.id}
                        className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                          evt.isReversed
                            ? "bg-muted/40 border-muted opacity-60 line-through"
                            : evt.eventType === "REVERSAL"
                            ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50"
                            : "bg-card"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground uppercase tracking-wide">
                              {evt.eventType}
                            </span>
                            {evt.isReversed && (
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                                [REVERSED]
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(evt.effectiveDate).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{evt.reason || "Financial Event"}</p>
                          {evt.journal && (
                            <p className="text-[10px] font-mono text-muted-foreground">
                              Journal Ref: {evt.journal.id.substring(0, 8)}... ({evt.journal.entries?.length || 0} entries)
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-sm text-foreground">
                              {formatINR(Number(evt.totalAmount))}
                            </p>
                            {Number(evt.interestAmount) > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                (P: {formatINR(Number(evt.principalAmount))}, I: {formatINR(Number(evt.interestAmount))})
                              </p>
                            )}
                          </div>

                          {!isViewer && !evt.isReversed && evt.eventType !== "REVERSAL" && (
                            <button
                              onClick={() => {
                                setSelectedEvent(evt);
                                setReverseReason(`Compensating reversal for ${evt.eventType}`);
                                setIsReverseOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200"
                            >
                              <RotateCcw className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Reversal */}
        {isReverseOpen && selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl overflow-hidden animate-in fade-in">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-rose-600" />
                  Confirm Compensating Reversal
                </h3>
                <button onClick={() => setIsReverseOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {actionError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-2 border border-red-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
                </div>
              )}

              <form onSubmit={handleReverseEvent} className="p-6 space-y-4">
                <p className="text-xs text-muted-foreground">
                  You are reversing a <strong>{selectedEvent.eventType}</strong> of{" "}
                  <strong>{formatINR(Number(selectedEvent.totalAmount))}</strong>.
                </p>

                {selectedEvent.eventType === "DISBURSEMENT" && Number(selectedBorrowing.totalPrincipalPaid) > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-xs border border-amber-200">
                    <p className="font-semibold">Reversal Blocked by Accounting Safeguard:</p>
                    <p className="text-[11px] mt-0.5">
                      Downstream repayments exist. You must reverse subsequent repayments first before reversing the initial disbursement.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Reversal Reason *</label>
                  <input
                    type="text"
                    required
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    placeholder="Reason for audit attribution"
                    className="w-full border rounded-lg px-3 py-2 text-xs bg-background"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsReverseOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || (selectedEvent.eventType === "DISBURSEMENT" && Number(selectedBorrowing.totalPrincipalPaid) > 0)}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Reversing Journal..." : "Confirm Reversal"}
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
