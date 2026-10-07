"use client";

import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { FinancialBadge } from "@/components/ui/financial-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormErrorReassurance } from "@/components/ui/form-error-reassurance";
import {
  TrendingUp,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Building,
  Calendar,
  Clock,
  Layers,
  Filter,
  Search,
  CheckCheck,
  Archive,
  ArrowRight,
  DollarSign,
  Briefcase,
  Sprout,
  Landmark,
  FileText,
  PieChart,
  Tag,
  ShieldCheck,
  User,
} from "lucide-react";

// Universal Income Categories
const UNIVERSAL_CATEGORIES = [
  { id: "SALARY", label: "Salary", icon: Briefcase, color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "BUSINESS", label: "Business", icon: Building, color: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "AGRICULTURE", label: "Agriculture", icon: Sprout, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "SERICULTURE", label: "Sericulture", icon: Sprout, color: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "LIVESTOCK", label: "Livestock", icon: Sprout, color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "RENTAL", label: "Rental", icon: Landmark, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "FREELANCE", label: "Freelance", icon: FileText, color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { id: "INTEREST", label: "Interest", icon: PieChart, color: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "DIVIDEND", label: "Dividend", icon: TrendingUp, color: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "OTHER", label: "Other Income", icon: Tag, color: "bg-gray-50 text-gray-700 border-gray-200" },
];

function getCategoryConfig(categoryKey?: string) {
  const normalized = (categoryKey || "").toUpperCase();
  return UNIVERSAL_CATEGORIES.find((c) => c.id === normalized) || {
    id: categoryKey || "OTHER",
    label: categoryKey || "Other Income",
    icon: Tag,
    color: "bg-slate-50 text-slate-700 border-slate-200",
  };
}

export default function IncomePage() {
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const [statusTab, setStatusTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'CONFIRMED_FAILURE' | 'NETWORK_TIMEOUT'>('CONFIRMED_FAILURE');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isRecordExpectedOpen, setIsRecordExpectedOpen] = useState(false);
  const [receiveModalOccurrence, setReceiveModalOccurrence] = useState<any | null>(null);
  const [detailOccurrence, setDetailOccurrence] = useState<any | null>(null);

  // Form State: Add Source
  const [sourceForm, setSourceForm] = useState({
    name: "",
    category: "SALARY",
    expectedAmount: "",
    defaultAccountId: "",
    behavior: "RECURRING",
    frequency: "MONTHLY",
    expectedDay: "1",
    description: "",
  });

  // Form State: Record Expected Occurrence
  const [expectedForm, setExpectedForm] = useState({
    incomeSourceId: "",
    name: "",
    expectedAmount: "",
    dueDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Form State: Mark as Received (Credit)
  const [receiveForm, setReceiveForm] = useState({
    accountId: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    amount: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [occRes, srcRes, accRes] = await Promise.all([
        fetch("/api/income-occurrences"),
        fetch("/api/income-sources"),
        fetch("/api/accounts"),
      ]);

      if (occRes.ok) setOccurrences(await occRes.json());
      if (srcRes.ok) setSources(await srcRes.json());
      if (accRes.ok) {
        const accs = await accRes.json();
        setAccounts(accs);
      }
    } catch {
      setErrorMessage("Could not connect to financial server.");
      setErrorType("NETWORK_TIMEOUT");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute KPI Card Projections
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalExpected = 0;
    let creditedMTD = 0;
    let creditedYTD = 0;
    let reconciled = 0;
    let unreconciledCredited = 0;

    for (const occ of occurrences) {
      const expAmt = Number(occ.expectedAmount || 0);
      const recAmt = Number(occ.receivedAmount || occ.netAmount || occ.expectedAmount || 0);
      const occDate = new Date(occ.creditedAt || occ.dueDate || occ.createdAt);

      if (occ.status === "EXPECTED" || occ.status === "CONFIRMED") {
        totalExpected += expAmt;
      } else if (occ.status === "CREDITED" || occ.status === "RECONCILED") {
        if (occDate.getMonth() === currentMonth && occDate.getFullYear() === currentYear) {
          creditedMTD += recAmt;
        }
        if (occDate.getFullYear() === currentYear) {
          creditedYTD += recAmt;
        }
        if (occ.status === "RECONCILED") {
          reconciled += recAmt;
        } else {
          unreconciledCredited += recAmt;
        }
      }
    }

    return { totalExpected, creditedMTD, creditedYTD, reconciled, unreconciledCredited };
  }, [occurrences]);

  // Filtered Occurrences
  const filteredOccurrences = useMemo(() => {
    return occurrences.filter((item) => {
      if (statusTab !== "ALL" && item.status !== statusTab) return false;
      if (categoryFilter !== "ALL" && (item.incomeSource?.category || "").toUpperCase() !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (item.name || "").toLowerCase().includes(q);
        const sourceMatch = (item.incomeSource?.name || "").toLowerCase().includes(q);
        const catMatch = (item.incomeSource?.category || "").toLowerCase().includes(q);
        if (!nameMatch && !sourceMatch && !catMatch) return false;
      }
      return true;
    });
  }, [occurrences, statusTab, categoryFilter, searchQuery]);

  // Create Income Source
  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sourceForm.name.trim()) {
      setErrorMessage("Please enter an income source name.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    try {
      const res = await fetch("/api/income-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sourceForm.name.trim(),
          category: sourceForm.category,
          expectedAmount: sourceForm.expectedAmount ? parseFloat(sourceForm.expectedAmount) : null,
          defaultAccountId: sourceForm.defaultAccountId || null,
          behavior: sourceForm.behavior,
          frequency: sourceForm.frequency,
          expectedDay: parseInt(sourceForm.expectedDay, 10) || 1,
          description: sourceForm.description || null,
        }),
      });

      if (res.ok) {
        setIsAddSourceOpen(false);
        setSourceForm({
          name: "",
          category: "SALARY",
          expectedAmount: "",
          defaultAccountId: "",
          behavior: "RECURRING",
          frequency: "MONTHLY",
          expectedDay: "1",
          description: "",
        });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Failed to create income source.");
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch {
      setErrorMessage("Network timeout while creating income source.");
      setErrorType("NETWORK_TIMEOUT");
    }
  };

  // Create Record Expected Occurrence
  const handleCreateExpected = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!expectedForm.incomeSourceId) {
      setErrorMessage("Please select an income source.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }
    const amountNum = parseFloat(expectedForm.expectedAmount);
    if (!amountNum || amountNum <= 0) {
      setErrorMessage("Please enter a valid positive expected amount.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    try {
      const res = await fetch("/api/income-occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomeSourceId: expectedForm.incomeSourceId,
          name: expectedForm.name || "Expected Income",
          expectedAmount: amountNum,
          dueDate: new Date(expectedForm.dueDate).toISOString(),
          notes: expectedForm.notes || null,
        }),
      });

      if (res.ok) {
        setIsRecordExpectedOpen(false);
        setExpectedForm({
          incomeSourceId: "",
          name: "",
          expectedAmount: "",
          dueDate: new Date().toISOString().slice(0, 10),
          notes: "",
        });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Failed to record expected income.");
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch {
      setErrorMessage("Network error recording expected income.");
      setErrorType("NETWORK_TIMEOUT");
    }
  };

  // Execute Lifecycle State Transition via PATCH
  const handleLifecycleAction = async (occurrenceId: string, action: string, extraBody: any = {}) => {
    setErrorMessage(null);
    setActionLoadingId(occurrenceId);

    try {
      const res = await fetch("/api/income-occurrences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceId,
          action,
          ...extraBody,
        }),
      });

      if (res.ok) {
        if (receiveModalOccurrence) setReceiveModalOccurrence(null);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || `Failed to perform ${action.toLowerCase()} action.`);
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch {
      setErrorMessage("Network timeout while updating income status.");
      setErrorType("NETWORK_TIMEOUT");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open "Mark as Received" Modal with mandatory Credit To selector
  const openReceiveModal = (item: any) => {
    const defaultAccId = item.incomeSource?.defaultAccountId || (accounts.length > 0 ? accounts[0].id : "");
    setReceiveForm({
      accountId: defaultAccId,
      receivedDate: new Date().toISOString().slice(0, 10),
      amount: String(Number(item.expectedAmount || item.netAmount || 0)),
    });
    setReceiveModalOccurrence(item);
  };

  // Submit "Mark as Received" (CREDITED)
  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveForm.accountId) {
      setErrorMessage("Please select a receiving bank account.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }
    const amtNum = parseFloat(receiveForm.amount);
    if (!amtNum || amtNum <= 0) {
      setErrorMessage("Please enter a valid received amount.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    await handleLifecycleAction(receiveModalOccurrence.id, "CREDIT", {
      accountId: receiveForm.accountId,
      date: new Date(receiveForm.receivedDate).toISOString(),
      amount: amtNum,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Universal Income Management</h1>
              <FinancialBadge state="ACTUAL" />
            </div>
            <p className="text-sm text-muted-foreground">
              Track multi-stream expected income, confirmed schedules, and actual bank credits across your household.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setIsAddSourceOpen(true)} className="gap-2 text-xs shadow-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Income Source</span>
            </Button>
            <Button onClick={() => setIsRecordExpectedOpen(true)} className="gap-2 text-xs shadow-xs">
              <Calendar className="h-3.5 w-3.5" />
              <span>Record Expected Income</span>
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <FormErrorReassurance
            type={errorType}
            message={errorMessage}
            onRetry={() => setErrorMessage(null)}
          />
        )}

        {/* 4 Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 shadow-xs">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Expected
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-blue-700">{formatINR(kpis.totalExpected)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Planned & Confirmed income streams</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 shadow-xs">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Credited (MTD)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-emerald-700">{formatINR(kpis.creditedMTD)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Received in bank this month</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-teal-500 shadow-xs">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Credited (YTD)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-teal-700">{formatINR(kpis.creditedYTD)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Received in bank calendar year</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500 shadow-xs">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Reconciled vs Unreconciled
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-indigo-700">{formatINR(kpis.reconciled)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatINR(kpis.unreconciledCredited)} pending reconciliation
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Income Sources Overview Section */}
        <Card className="shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Active Income Sources</CardTitle>
              <CardDescription className="text-xs">Recurring & seasonal income channels configured for your household</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setIsAddSourceOpen(true)} className="text-xs gap-1">
              <Plus className="h-3.5 w-3.5" />
              <span>New Source</span>
            </Button>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg bg-muted/30">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-60" />
                <p className="text-xs font-medium text-muted-foreground">No income sources defined yet.</p>
                <Button size="sm" variant="link" onClick={() => setIsAddSourceOpen(true)} className="text-xs mt-1">
                  Configure Salary, Business, or Rental Sources
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sources.map((src) => {
                  const catCfg = getCategoryConfig(src.category);
                  const IconComp = catCfg.icon;
                  return (
                    <div key={src.id} className="p-3 border rounded-lg bg-card hover:bg-muted/20 transition-colors space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md border ${catCfg.color}`}>
                            <IconComp className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold leading-none">{src.name}</div>
                            <div className="text-[10px] text-muted-foreground capitalize">{catCfg.label}</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-600">
                          {src.expectedAmount ? formatINR(Number(src.expectedAmount)) : "Variable"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <span>{src.frequency || "MONTHLY"} • Day {src.expectedDay || 1}</span>
                        {src.defaultAccount && (
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Landmark className="h-3 w-3 text-muted-foreground" />
                            {src.defaultAccount.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Occurrences Main Table Section */}
        <Card className="shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Income Lifecycle Occurrences</CardTitle>
                <CardDescription className="text-xs">
                  Track transitions: EXPECTED → CONFIRMED → CREDITED → RECONCILED → ARCHIVED
                </CardDescription>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs">
                {["ALL", "EXPECTED", "CONFIRMED", "CREDITED", "RECONCILED", "ARCHIVED"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusTab(tab)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      statusTab === tab
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search income streams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full sm:w-48 h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="ALL">All Categories</option>
                {UNIVERSAL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="h-48 animate-pulse bg-muted/40 rounded-lg" />
            ) : filteredOccurrences.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No Income Occurrences Found"
                description="No income occurrences match your selected tab or search criteria."
                actionLabel="Record Expected Income"
                onAction={() => setIsRecordExpectedOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Status</TableHead>
                      <TableHead>Income Name / Source</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Receiving Account</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Lifecycle Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOccurrences.map((item) => {
                      const catCfg = getCategoryConfig(item.incomeSource?.category);
                      const IconComp = catCfg.icon;

                      // Display Account: Credited transaction account, or default source account
                      const creditedAccount = item.transactions?.[0]?.account;
                      const displayAccountName = creditedAccount?.name || item.incomeSource?.defaultAccount?.name || "Pending Selection";

                      return (
                        <TableRow key={item.id} className="text-xs">
                          {/* Lifecycle Status Badge */}
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                item.status === "EXPECTED"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : item.status === "CONFIRMED"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : item.status === "CREDITED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : item.status === "RECONCILED"
                                  ? "bg-teal-50 text-teal-800 border-teal-300"
                                  : "bg-gray-100 text-gray-700 border-gray-200"
                              }`}
                            >
                              {item.status === "EXPECTED" && <Clock className="h-3 w-3" />}
                              {item.status === "CONFIRMED" && <CheckCircle2 className="h-3 w-3" />}
                              {item.status === "CREDITED" && <DollarSign className="h-3 w-3" />}
                              {item.status === "RECONCILED" && <CheckCheck className="h-3 w-3" />}
                              {item.status === "ARCHIVED" && <Archive className="h-3 w-3" />}
                              <span>{item.status}</span>
                            </span>
                          </TableCell>

                          {/* Name & Source */}
                          <TableCell>
                            <div className="font-semibold text-xs text-foreground">{item.name}</div>
                            <div className="text-[10px] text-muted-foreground">{item.incomeSource?.name || "Manual Income"}</div>
                          </TableCell>

                          {/* Category Badge */}
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${catCfg.color}`}>
                              <IconComp className="h-3 w-3" />
                              <span>{catCfg.label}</span>
                            </span>
                          </TableCell>

                          {/* Receiving Account Branding */}
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5 font-medium">
                              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{displayAccountName}</span>
                            </div>
                          </TableCell>

                          {/* Date */}
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(item.creditedAt || item.dueDate || item.createdAt).toLocaleDateString("en-IN")}
                          </TableCell>

                          {/* Amount */}
                          <TableCell className="text-right font-bold text-xs text-emerald-600">
                            +{formatINR(Number(item.receivedAmount || item.netAmount || item.expectedAmount || 0))}
                          </TableCell>

                          {/* Lifecycle Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* EXPECTED -> CONFIRMED */}
                              {item.status === "EXPECTED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleLifecycleAction(item.id, "CONFIRM")}
                                  disabled={actionLoadingId === item.id}
                                  className="text-[11px] h-7 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Confirm</span>
                                </Button>
                              )}

                              {/* CONFIRMED / EXPECTED -> CREDITED */}
                              {(item.status === "CONFIRMED" || item.status === "EXPECTED") && (
                                <Button
                                  size="sm"
                                  onClick={() => openReceiveModal(item)}
                                  disabled={actionLoadingId === item.id}
                                  className="text-[11px] h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <DollarSign className="h-3 w-3" />
                                  <span>Mark as Received</span>
                                </Button>
                              )}

                              {/* CREDITED -> RECONCILED */}
                              {item.status === "CREDITED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleLifecycleAction(item.id, "RECONCILE")}
                                  disabled={actionLoadingId === item.id}
                                  className="text-[11px] h-7 gap-1 text-teal-700 border-teal-300 hover:bg-teal-50"
                                >
                                  <CheckCheck className="h-3 w-3" />
                                  <span>Reconcile</span>
                                </Button>
                              )}

                              {/* Soft Archive */}
                              {item.status !== "ARCHIVED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleLifecycleAction(item.id, "ARCHIVE")}
                                  disabled={actionLoadingId === item.id}
                                  className="text-[11px] h-7 px-1.5 text-muted-foreground hover:text-foreground"
                                  title="Archive Income"
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              {/* View Details */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailOccurrence(item)}
                                className="text-[11px] h-7 px-1.5 text-muted-foreground hover:text-foreground"
                                title="View Occurrence Details"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal 1: Add Income Source */}
        <Dialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen}>
          <DialogHeader>
            <DialogTitle>Add Income Source</DialogTitle>
            <DialogDescription>Configure a recurring or seasonal income stream for your household.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSource} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Source Name *</label>
              <Input
                placeholder="e.g. Primary Tech Corp Salary, Rental Flat 301"
                value={sourceForm.name}
                onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Category *</label>
                <select
                  value={sourceForm.category}
                  onChange={(e) => setSourceForm({ ...sourceForm, category: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  required
                >
                  {UNIVERSAL_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Amount (₹)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 75000"
                  value={sourceForm.expectedAmount}
                  onChange={(e) => setSourceForm({ ...sourceForm, expectedAmount: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Default Credit Account (Optional)</label>
              <select
                value={sourceForm.defaultAccountId}
                onChange={(e) => setSourceForm({ ...sourceForm, defaultAccountId: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              >
                <option value="">None (Select when credited)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatINR(Number(acc.balance))})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Frequency</label>
                <select
                  value={sourceForm.frequency}
                  onChange={(e) => setSourceForm({ ...sourceForm, frequency: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="CUSTOM_SEASONAL">Custom / Seasonal</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Day of Month</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={sourceForm.expectedDay}
                  onChange={(e) => setSourceForm({ ...sourceForm, expectedDay: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddSourceOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm">Save Income Source</Button>
            </div>
          </form>
        </Dialog>

        {/* Modal 2: Record Expected Income */}
        <Dialog open={isRecordExpectedOpen} onOpenChange={setIsRecordExpectedOpen}>
          <DialogHeader>
            <DialogTitle>Record Expected Income</DialogTitle>
            <DialogDescription>Schedule an upcoming expected income occurrence for cash-flow projection.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExpected} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Income Source *</label>
              <select
                value={expectedForm.incomeSourceId}
                onChange={(e) => {
                  const srcId = e.target.value;
                  const selectedSrc = sources.find((s) => s.id === srcId);
                  setExpectedForm({
                    ...expectedForm,
                    incomeSourceId: srcId,
                    name: selectedSrc ? `${selectedSrc.name} - Expected` : expectedForm.name,
                    expectedAmount: selectedSrc?.expectedAmount ? String(Number(selectedSrc.expectedAmount)) : expectedForm.expectedAmount,
                  });
                }}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                required
              >
                <option value="">Select Income Source...</option>
                {sources.map((src) => (
                  <option key={src.id} value={src.id}>{src.name} ({src.category})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Occurrence Title *</label>
              <Input
                placeholder="e.g. Tech Corp Salary - Oct 2026"
                value={expectedForm.name}
                onChange={(e) => setExpectedForm({ ...expectedForm, name: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Amount (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 85000"
                  value={expectedForm.expectedAmount}
                  onChange={(e) => setExpectedForm({ ...expectedForm, expectedAmount: e.target.value })}
                  className="mt-1 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Date *</label>
                <Input
                  type="date"
                  value={expectedForm.dueDate}
                  onChange={(e) => setExpectedForm({ ...expectedForm, dueDate: e.target.value })}
                  className="mt-1 text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsRecordExpectedOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm">Save Expected Income</Button>
            </div>
          </form>
        </Dialog>

        {/* Modal 3: Mark as Received (CREDITED) with Mandatory "Credit To" Selector */}
        <Dialog open={!!receiveModalOccurrence} onOpenChange={(open) => !open && setReceiveModalOccurrence(null)}>
          <DialogHeader>
            <DialogTitle>Mark Income as Received</DialogTitle>
            <DialogDescription>
              Record bank credit for <strong>{receiveModalOccurrence?.name}</strong>. This executes double-entry ledger posting and updates account balance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReceive} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Credit To (Receiving Bank Account) *</label>
              {accounts.length === 0 ? (
                <div className="mt-1 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-medium">A receiving account is required before marking income as received.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => window.location.href = "/accounts"}
                  >
                    Create Account
                  </Button>
                </div>
              ) : (
                <select
                  value={receiveForm.accountId}
                  onChange={(e) => setReceiveForm({ ...receiveForm, accountId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium"
                  required
                >
                  <option value="">Select Receiving Account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatINR(Number(acc.balance))})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Select the destination account where money was credited.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Received Date *</label>
                <Input
                  type="date"
                  value={receiveForm.receivedDate}
                  onChange={(e) => setReceiveForm({ ...receiveForm, receivedDate: e.target.value })}
                  className="mt-1 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Amount Received (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={receiveForm.amount}
                  onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
                  className="mt-1 text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Single-Path Ledger Posting</span>
              </div>
              <p className="text-[11px]">
                Posting will Debit the selected Bank Account and Credit Income Revenue, updating account balance immutably.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReceiveModalOccurrence(null)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Mark as Received
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal 4: Occurrence Detail View */}
        <Dialog open={!!detailOccurrence} onOpenChange={(open) => !open && setDetailOccurrence(null)}>
          <DialogHeader>
            <DialogTitle>Income Occurrence Details</DialogTitle>
            <DialogDescription>Complete financial breakdown and audit status</DialogDescription>
          </DialogHeader>
          {detailOccurrence && (
            <div className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40 border">
                <div>
                  <span className="text-muted-foreground">Title:</span>
                  <div className="font-semibold">{detailOccurrence.name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <div><FinancialBadge state={detailOccurrence.status === "CREDITED" || detailOccurrence.status === "RECONCILED" ? "ACTUAL" : "PLANNED"} /></div>
                </div>
                <div>
                  <span className="text-muted-foreground">Income Source:</span>
                  <div className="font-medium">{detailOccurrence.incomeSource?.name || "Manual"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <div className="font-medium">{detailOccurrence.incomeSource?.category || "Other"}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected Amount:</span>
                  <span className="font-semibold">{formatINR(Number(detailOccurrence.expectedAmount || 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received / Net Amount:</span>
                  <span className="font-bold text-emerald-600">{formatINR(Number(detailOccurrence.receivedAmount || detailOccurrence.netAmount || 0))}</span>
                </div>
                {detailOccurrence.journalId && (
                  <div className="flex justify-between pt-1 border-t text-[11px]">
                    <span className="text-muted-foreground">Ledger Journal Ref:</span>
                    <span className="font-mono text-muted-foreground">{detailOccurrence.journalId.slice(0, 16)}...</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" variant="outline" onClick={() => setDetailOccurrence(null)}>Close</Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppLayout>
  );
}
