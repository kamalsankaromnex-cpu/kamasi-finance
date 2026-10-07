"use client";

import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { AmountWords } from "@/components/ui/amount-words";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Plus,
  Zap,
  Layers,
  FileSpreadsheet,
  CalendarDays,
  ListFilter,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Receipt,
  Tag,
  Pencil,
  Power,
  Landmark,
  FileText,
  Archive,
  RefreshCw,
  Wallet,
  TrendingDown,
  Clock,
  CheckCheck,
} from "lucide-react";

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<"quick" | "advanced" | "categories" | "import" | "bills" | "history">("quick");

  // Domain Master State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [scopes, setScopes] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Quick Add Form Classification State
  const [quickAmount, setQuickAmount] = useState("");
  const [quickScopeId, setQuickScopeId] = useState("");
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [quickSubcategoryId, setQuickSubcategoryId] = useState("");
  const [quickCostCenterId, setQuickCostCenterId] = useState("");
  const [quickAccountId, setQuickAccountId] = useState("");
  const [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickDescription, setQuickDescription] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [quickTags, setQuickTags] = useState("");
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Advanced Entry Form State
  const [advAmount, setAdvAmount] = useState("");
  const [advScopeId, setAdvScopeId] = useState("");
  const [advCategoryId, setAdvCategoryId] = useState("");
  const [advSubcategoryId, setAdvSubcategoryId] = useState("");
  const [advCostCenterId, setAdvCostCenterId] = useState("");
  const [advAccountId, setAdvAccountId] = useState("");
  const [advDate, setAdvDate] = useState(new Date().toISOString().slice(0, 10));
  const [advDescription, setAdvDescription] = useState("");
  const [advMerchant, setAdvMerchant] = useState("");
  const [advReceiptUrl, setAdvReceiptUrl] = useState("");
  const [advReimbursement, setAdvReimbursement] = useState("NONE");
  const [advNotes, setAdvNotes] = useState("");
  const [advTags, setAdvTags] = useState("");
  const [splits, setSplits] = useState<{ categoryId: string; amount: string; description: string }[]>([
    { categoryId: "", amount: "", description: "" },
  ]);
  const [isSubmittingAdv, setIsSubmittingAdv] = useState(false);

  // Dependent Subcategories & Cost Centers Cache
  const [subcategories, setSubcategories] = useState<Record<string, any[]>>({});
  const [costCenters, setCostCenters] = useState<Record<string, any[]>>({});

  // Category Management State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", type: "EXPENSE", icon: "tag", color: "#64748b" });

  // Refund Modal State
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  // CSV Import State
  const [csvContent, setCsvContent] = useState("");
  const [importAccountId, setImportAccountId] = useState("");
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Ledger History Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterScope, setFilterScope] = useState("ALL");
  const [filterAccount, setFilterAccount] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txnRes, accRes, catRes, scopeRes, memRes, billRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/accounts"),
        fetch("/api/categories"),
        fetch("/api/scopes"),
        fetch("/api/household/members"),
        fetch("/api/recurring-bills"),
      ]);

      if (txnRes.ok) setTransactions(await txnRes.json());
      if (accRes.ok) {
        const accs = await accRes.json();
        setAccounts(accs);
        if (accs.length > 0) {
          setQuickAccountId((prev) => prev || accs[0].id);
          setAdvAccountId((prev) => prev || accs[0].id);
          setImportAccountId((prev) => prev || accs[0].id);
        }
      }
      if (catRes.ok) {
        const cats = await catRes.json();
        setAllCategories(cats);
        const expCats = cats.filter((c: any) => c.type === "EXPENSE" && c.isActive !== false);
        setCategories(expCats);
      }
      if (scopeRes.ok) {
        const scps = await scopeRes.json();
        setScopes(scps);
        if (scps.length > 0) {
          setQuickScopeId((prev) => prev || scps[0].id);
          setAdvScopeId((prev) => prev || scps[0].id);
        }
      }
      if (memRes.ok) setMembers(await memRes.json());
      if (billRes.ok) {
        const billData = await billRes.json();
        if (!Array.isArray(billData) && !Array.isArray(billData?.rules)) {
          console.warn("Unexpected recurring bills API response format:", billData);
        }
        setBills(Array.isArray(billData) ? billData : billData?.rules || []);
      }
    } catch {
      setStatusMessage({ type: "error", text: "Failed to load expense data" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch Subcategories when Category Changes
  const loadSubcategories = async (categoryId: string) => {
    if (!categoryId || subcategories[categoryId]) return;
    try {
      const res = await fetch(`/api/categories/${categoryId}/subcategories?activeOnly=true`);
      if (res.ok) {
        const data = await res.json();
        setSubcategories((prev) => ({ ...prev, [categoryId]: data }));
      }
    } catch {}
  };

  // Fetch Cost Centers when Scope Changes
  const loadCostCenters = async (scopeId: string) => {
    if (!scopeId || costCenters[scopeId]) return;
    try {
      const res = await fetch(`/api/scopes/${scopeId}/cost-centers?activeOnly=true`);
      if (res.ok) {
        const data = await res.json();
        setCostCenters((prev) => ({ ...prev, [scopeId]: data }));
      }
    } catch {}
  };

  useEffect(() => {
    if (quickCategoryId) loadSubcategories(quickCategoryId);
  }, [quickCategoryId]);

  useEffect(() => {
    if (quickScopeId) loadCostCenters(quickScopeId);
  }, [quickScopeId]);

  useEffect(() => {
    if (advCategoryId) loadSubcategories(advCategoryId);
  }, [advCategoryId]);

  useEffect(() => {
    if (advScopeId) loadCostCenters(advScopeId);
  }, [advScopeId]);

  // Derived Categories Compatible with Selected Scope
  const quickAvailableCategories = useMemo(() => {
    if (!quickScopeId) return categories;
    const scopeObj = scopes.find((s) => s.id === quickScopeId);
    if (!scopeObj || !scopeObj.scopeCategories || scopeObj.scopeCategories.length === 0) return categories;
    const mappedCatIds = new Set(scopeObj.scopeCategories.map((sc: any) => sc.categoryId));
    return categories.filter((c) => mappedCatIds.has(c.id));
  }, [quickScopeId, categories, scopes]);

  const advAvailableCategories = useMemo(() => {
    if (!advScopeId) return categories;
    const scopeObj = scopes.find((s) => s.id === advScopeId);
    if (!scopeObj || !scopeObj.scopeCategories || scopeObj.scopeCategories.length === 0) return categories;
    const mappedCatIds = new Set(scopeObj.scopeCategories.map((sc: any) => sc.categoryId));
    return categories.filter((c) => mappedCatIds.has(c.id));
  }, [advScopeId, categories, scopes]);

  // KPI Computations
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let mtd = 0;
    let ytd = 0;
    let pendingDrafts = 0;
    let totalRefunded = 0;

    for (const t of transactions) {
      const amt = parseFloat(t.amount) || 0;
      const tDate = new Date(t.date);

      if (t.status === "DRAFT") {
        pendingDrafts += 1;
        continue;
      }

      if (t.type === "EXPENSE" && !t.isVoided) {
        if (tDate.getFullYear() === currentYear) {
          ytd += amt;
          if (tDate.getMonth() === currentMonth) {
            mtd += amt;
          }
        }
        totalRefunded += parseFloat(t.refundedAmount) || 0;
      }
    }

    return { mtd, ytd, pendingDrafts, totalRefunded };
  }, [transactions]);

  // Quick Add Submit Handler (Supports Draft vs Post)
  const handleQuickAdd = async (e: React.FormEvent, asDraft: boolean = false) => {
    e.preventDefault();
    if (isSubmittingQuick) return;
    const numAmount = parseFloat(quickAmount);
    if (isNaN(numAmount) || numAmount <= 0 || !quickDescription.trim()) {
      setStatusMessage({ type: "error", text: "Please provide a valid amount and description" });
      return;
    }

    setIsSubmittingQuick(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          accountId: quickAccountId,
          scopeId: quickScopeId || null,
          categoryId: quickCategoryId || null,
          subcategoryId: quickSubcategoryId || null,
          costCenterId: quickCostCenterId || null,
          date: new Date(quickDate).toISOString(),
          amount: numAmount,
          type: "EXPENSE",
          status: asDraft ? "DRAFT" : "POSTED",
          description: quickDescription.trim(),
          notes: quickNotes || null,
          tags: quickTags || null,
        }),
      });

      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: asDraft ? "Expense saved as DRAFT." : "Expense posted to ledger successfully!",
        });
        setQuickDescription("");
        setQuickAmount("");
        setQuickNotes("");
        setQuickTags("");
        fetchData();
        setActiveTab("history");
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to record expense" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "An error occurred while saving expense" });
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  // Advanced Entry Submit Handler
  const handleAdvancedAdd = async (e: React.FormEvent, asDraft: boolean = false) => {
    e.preventDefault();
    if (isSubmittingAdv) return;
    const numAmount = parseFloat(advAmount);
    if (isNaN(numAmount) || numAmount <= 0 || !advDescription.trim()) {
      setStatusMessage({ type: "error", text: "Please provide a valid amount and description" });
      return;
    }

    const validSplits = splits.filter((s) => parseFloat(s.amount) > 0);
    if (validSplits.length > 0) {
      const totalSplit = validSplits.reduce((acc, s) => acc + parseFloat(s.amount), 0);
      if (Math.abs(totalSplit - numAmount) > 0.01) {
        setStatusMessage({
          type: "error",
          text: `Split sum (${formatINR(totalSplit)}) must equal total amount (${formatINR(numAmount)})`,
        });
        return;
      }
    }

    setIsSubmittingAdv(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          accountId: advAccountId,
          scopeId: advScopeId || null,
          categoryId: advCategoryId || (validSplits.length > 0 ? validSplits[0].categoryId : categories[0]?.id || null),
          subcategoryId: advSubcategoryId || null,
          costCenterId: advCostCenterId || null,
          date: new Date(advDate).toISOString(),
          amount: numAmount,
          type: "EXPENSE",
          status: asDraft ? "DRAFT" : "POSTED",
          description: advDescription.trim(),
          merchant: advMerchant || null,
          receiptUrl: advReceiptUrl || null,
          reimbursementStatus: advReimbursement,
          splitsJson: validSplits.length > 0 ? JSON.stringify(validSplits) : null,
          notes: advNotes || null,
          tags: advTags || null,
        }),
      });

      if (res.ok) {
        setStatusMessage({ type: "success", text: asDraft ? "Advanced expense saved as DRAFT." : "Advanced expense posted to ledger!" });
        setAdvAmount("");
        setAdvDescription("");
        setAdvMerchant("");
        setAdvReceiptUrl("");
        setAdvNotes("");
        setAdvTags("");
        setSplits([{ categoryId: "", amount: "", description: "" }]);
        fetchData();
        setActiveTab("history");
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to post advanced expense" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "An error occurred during submission" });
    } finally {
      setIsSubmittingAdv(false);
    }
  };

  // Lifecycle Action Handlers
  const handlePostDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}/post`, { method: "POST" });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "Draft expense successfully posted to double-entry ledger!" });
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to post draft" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error posting draft expense" });
    }
  };

  const handleReconcile = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}/reconcile`, { method: "POST" });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "Expense marked as RECONCILED!" });
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to reconcile expense" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error reconciling expense" });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}/archive`, { method: "POST" });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "Expense archived." });
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to archive expense" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error archiving expense" });
    }
  };

  const handleReverseTransaction = async (id: string) => {
    if (!confirm("Are you sure you want to reverse this transaction? A compensating entry will be posted.")) return;
    try {
      const res = await fetch(`/api/transactions/${id}/reverse`, { method: "POST" });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "Transaction successfully voided and reversed!" });
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to reverse transaction" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "An error occurred while reversing transaction" });
    }
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget || !refundAmount) return;
    const numAmt = parseFloat(refundAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setStatusMessage({ type: "error", text: "Please enter a valid refund amount" });
      return;
    }

    setIsRefunding(true);
    try {
      const res = await fetch(`/api/transactions/${refundTarget.id}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          amount: numAmt,
          description: refundReason ? `Refund: ${refundReason}` : undefined,
        }),
      });

      if (res.ok) {
        setStatusMessage({ type: "success", text: "Refund posted successfully!" });
        setRefundTarget(null);
        setRefundAmount("");
        setRefundReason("");
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Refund processing failed" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error submitting refund" });
    } finally {
      setIsRefunding(false);
    }
  };

  // Category Save / Active Handlers
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return;
    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
      const method = editingCategory ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          type: categoryForm.type,
          icon: categoryForm.icon,
          color: categoryForm.color,
        }),
      });

      if (res.ok) {
        setStatusMessage({ type: "success", text: `Category ${editingCategory ? "updated" : "created"}!` });
        setIsCategoryModalOpen(false);
        setEditingCategory(null);
        setCategoryForm({ name: "", type: "EXPENSE", icon: "tag", color: "#64748b" });
        fetchData();
      } else {
        const err = await res.json();
        setStatusMessage({ type: "error", text: err.error || "Failed to save category" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error saving category" });
    }
  };

  const handleToggleCategoryActive = async (categoryId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        setStatusMessage({ type: "success", text: `Category ${!currentActive ? "reactivated" : "deactivated"}!` });
        fetchData();
      }
    } catch {}
  };

  // CSV Import Handlers
  const handlePreviewCsv = async () => {
    if (!csvContent.trim() || !importAccountId) return;
    setIsImporting(true);
    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", accountId: importAccountId, csvContent }),
      });
      if (res.ok) setImportPreview(await res.json());
    } catch {
      setStatusMessage({ type: "error", text: "Error previewing CSV import" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview || !importPreview.rows) return;
    setIsImporting(true);
    try {
      const validRows = importPreview.rows.filter((r: any) => r.status === "VALID");
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", selectedRows: validRows }),
      });
      if (res.ok) {
        const result = await res.json();
        setStatusMessage({ type: "success", text: `Imported ${result.postedCount} entries.` });
        setCsvContent("");
        setImportPreview(null);
        fetchData();
      }
    } catch {
      setStatusMessage({ type: "error", text: "Error committing import" });
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered Ledger History
  const filteredTransactions = transactions.filter((t) => {
    if (t.type !== "EXPENSE" && !t.refundOfId) return false;
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (filterScope !== "ALL" && t.scopeId !== filterScope) return false;
    if (filterAccount !== "ALL" && t.accountId !== filterAccount) return false;
    if (filterCategory !== "ALL" && t.categoryId !== filterCategory) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(term);
      const matchCategory = t.category?.name?.toLowerCase().includes(term);
      const matchScope = t.scope?.name?.toLowerCase().includes(term);
      return matchDesc || matchCategory || matchScope;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Receipt className="w-7 h-7 text-primary" /> Expense Management System
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Production double-entry expense ledger with Universal Financial Classification, Account Branding, & Lifecycle Governance.
            </p>
          </div>
        </div>

        {/* Global Feedback Alert */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 border-rose-500/20"
            }`}
          >
            {statusMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase font-semibold">Total Expenses MTD</div>
                <div className="text-lg font-bold font-mono text-foreground">{formatINR(kpis.mtd)}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase font-semibold">Total Expenses YTD</div>
                <div className="text-lg font-bold font-mono text-foreground">{formatINR(kpis.ytd)}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase font-semibold">Pending Drafts</div>
                <div className="text-lg font-bold font-mono text-amber-600">{kpis.pendingDrafts} Drafts</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase font-semibold">Total Refunded</div>
                <div className="text-lg font-bold font-mono text-emerald-600">{formatINR(kpis.totalRefunded)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border space-x-6 overflow-x-auto text-sm font-medium">
          <button
            onClick={() => setActiveTab("quick")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "quick" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="w-4 h-4" /> Quick Add
          </button>
          <button
            onClick={() => setActiveTab("advanced")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "advanced" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-4 h-4" /> Advanced Entry & Splits
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "categories" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tag className="w-4 h-4" /> Categories ({allCategories.length})
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "import" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> CSV & Bank Import
          </button>
          <button
            onClick={() => setActiveTab("bills")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "bills" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Recurring Bills ({bills.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 flex items-center gap-2 border-b-2 transition ${
              activeTab === "history" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListFilter className="w-4 h-4" /> Ledger History & Reversals ({filteredTransactions.length})
          </button>
        </div>

        {/* TAB 1: Quick Add Expense with Dependent Selectors */}
        {activeTab === "quick" && (
          <Card className="shadow-xs border-muted max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" /> Quick Add Expense
              </CardTitle>
              <CardDescription className="text-xs">
                4-Step Dependent Selection: Scope → Category → Subcategory → Location / Facility
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => handleQuickAdd(e, false)} className="space-y-4">
                {/* Dependent Classification Step 1 & 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/20 rounded-xl border">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Step 1: Scope (Where / For Whom)</label>
                    <Select
                      value={quickScopeId}
                      onChange={(e) => {
                        setQuickScopeId(e.target.value);
                        setQuickCategoryId("");
                        setQuickSubcategoryId("");
                        setQuickCostCenterId("");
                      }}
                    >
                      <option value="">-- Optional / Default Scope --</option>
                      {scopes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.isSystem ? "(System)" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Step 2: Category *</label>
                    <Select
                      value={quickCategoryId}
                      onChange={(e) => {
                        setQuickCategoryId(e.target.value);
                        setQuickSubcategoryId("");
                      }}
                      required
                    >
                      <option value="">-- Select Category --</option>
                      {quickAvailableCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Dependent Classification Step 3 & 4 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/20 rounded-xl border">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Step 3: Subcategory (Optional)</label>
                    <Select
                      value={quickSubcategoryId}
                      onChange={(e) => setQuickSubcategoryId(e.target.value)}
                      disabled={!quickCategoryId || !(subcategories[quickCategoryId]?.length > 0)}
                    >
                      <option value="">-- Select Subcategory --</option>
                      {(subcategories[quickCategoryId] || []).map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Step 4: Location / Facility (Optional)</label>
                    <Select
                      value={quickCostCenterId}
                      onChange={(e) => setQuickCostCenterId(e.target.value)}
                      disabled={!quickScopeId || !(costCenters[quickScopeId]?.length > 0)}
                    >
                      <option value="">-- Select Facility --</option>
                      {(costCenters[quickScopeId] || []).map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Financial Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Amount (INR) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 1500"
                      value={quickAmount}
                      onChange={(e) => setQuickAmount(e.target.value)}
                      required
                    />
                    <AmountWords amount={quickAmount} />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Paid From Account *</label>
                    {accounts.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                        <p className="font-medium">Add a cash/bank account before recording this expense.</p>
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
                      <Select value={quickAccountId} onChange={(e) => setQuickAccountId(e.target.value)} required>
                        <option value="">-- Select Payment Account --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.financialInstitution?.name ? `${a.financialInstitution.name} • ` : ""}
                            {a.name} ({a.type} - {formatINR(a.balance)})
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Expense Date *</label>
                    <Input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} required />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Description *</label>
                    <Input
                      type="text"
                      placeholder="e.g. Green Fodder Purchase"
                      value={quickDescription}
                      onChange={(e) => setQuickDescription(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Tags</label>
                    <Input type="text" placeholder="e.g. fodder, monthly" value={quickTags} onChange={(e) => setQuickTags(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                    <Input type="text" placeholder="Optional notes" value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-3">
                  <Button type="button" variant="outline" onClick={(e) => handleQuickAdd(e, true)} disabled={isSubmittingQuick}>
                    Save as Draft
                  </Button>
                  <Button type="submit" disabled={isSubmittingQuick}>
                    {isSubmittingQuick ? "Posting..." : "Post Expense"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 2: Advanced Entry */}
        {activeTab === "advanced" && (
          <Card className="shadow-xs border-muted max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" /> Advanced Expense Entry & Category Splits
              </CardTitle>
              <CardDescription className="text-xs">
                Record complex expenses with vendor details, receipt upload, and split allocations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => handleAdvancedAdd(e, false)} className="space-y-4">
                {/* Dependent Classification */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-muted/20 rounded-xl border text-xs">
                  <div>
                    <label className="font-semibold text-muted-foreground">Scope</label>
                    <Select
                      value={advScopeId}
                      onChange={(e) => {
                        setAdvScopeId(e.target.value);
                        setAdvCategoryId("");
                        setAdvSubcategoryId("");
                        setAdvCostCenterId("");
                      }}
                    >
                      <option value="">-- Scope --</option>
                      {scopes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="font-semibold text-muted-foreground">Category *</label>
                    <Select
                      value={advCategoryId}
                      onChange={(e) => {
                        setAdvCategoryId(e.target.value);
                        setAdvSubcategoryId("");
                      }}
                      required
                    >
                      <option value="">-- Category --</option>
                      {advAvailableCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="font-semibold text-muted-foreground">Subcategory</label>
                    <Select
                      value={advSubcategoryId}
                      onChange={(e) => setAdvSubcategoryId(e.target.value)}
                      disabled={!advCategoryId || !(subcategories[advCategoryId]?.length > 0)}
                    >
                      <option value="">-- Subcategory --</option>
                      {(subcategories[advCategoryId] || []).map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="font-semibold text-muted-foreground">Facility</label>
                    <Select
                      value={advCostCenterId}
                      onChange={(e) => setAdvCostCenterId(e.target.value)}
                      disabled={!advScopeId || !(costCenters[advScopeId]?.length > 0)}
                    >
                      <option value="">-- Facility --</option>
                      {(costCenters[advScopeId] || []).map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Total Amount (INR) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 5000"
                      value={advAmount}
                      onChange={(e) => setAdvAmount(e.target.value)}
                      required
                    />
                    <AmountWords amount={advAmount} />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Paid From Account *</label>
                    {accounts.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                        <p className="font-medium">Add a cash/bank account before recording this expense.</p>
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
                      <Select value={advAccountId} onChange={(e) => setAdvAccountId(e.target.value)} required>
                        <option value="">-- Select Payment Account --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.financialInstitution?.name ? `${a.financialInstitution.name} • ` : ""}
                            {a.name} ({a.type})
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Date *</label>
                    <Input type="date" value={advDate} onChange={(e) => setAdvDate(e.target.value)} required />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Description *</label>
                    <Input
                      type="text"
                      placeholder="e.g. Agricultural Equipment Purchase"
                      value={advDescription}
                      onChange={(e) => setAdvDescription(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Merchant / Vendor</label>
                    <Input type="text" placeholder="e.g. Agri Supplies Ltd" value={advMerchant} onChange={(e) => setAdvMerchant(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Reimbursement Status</label>
                    <Select value={advReimbursement} onChange={(e) => setAdvReimbursement(e.target.value)}>
                      <option value="NONE">None (Personal Spending)</option>
                      <option value="CLAIMED">Claimed (Company / Family Reimbursement)</option>
                      <option value="SETTLED">Settled</option>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Receipt File / URL</label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="text"
                        placeholder="https://... or upload"
                        value={advReceiptUrl}
                        onChange={(e) => setAdvReceiptUrl(e.target.value)}
                        className="flex-1"
                      />
                      <label className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold px-3 py-2 rounded-md border shrink-0">
                        Upload
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("receipt", file);
                            try {
                              const res = await fetch("/api/uploads/receipts", { method: "POST", body: formData });
                              if (res.ok) {
                                const data = await res.json();
                                setAdvReceiptUrl(data.url);
                                setStatusMessage({ type: "success", text: "Receipt uploaded successfully!" });
                              }
                            } catch {
                              setStatusMessage({ type: "error", text: "Upload failed" });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <Button type="button" variant="outline" onClick={(e) => handleAdvancedAdd(e, true)} disabled={isSubmittingAdv}>
                    Save as Draft
                  </Button>
                  <Button type="submit" disabled={isSubmittingAdv}>
                    {isSubmittingAdv ? "Posting..." : "Post Advanced Expense"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB: Master Category Directory */}
        {activeTab === "categories" && (
          <Card className="shadow-xs border-muted max-w-4xl mx-auto">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-500" /> Master Category Directory
                </CardTitle>
                <CardDescription className="text-xs">Manage expense categorization master data.</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryForm({ name: "", type: "EXPENSE", icon: "tag", color: "#64748b" });
                  setIsCategoryModalOpen(true);
                }}
                className="gap-1 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Category</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {allCategories.map((cat) => (
                  <div key={cat.id} className="p-3 border rounded-xl flex items-center justify-between text-xs bg-card">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#64748b" }} />
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span>{cat.name}</span>
                          {cat.isDefault && <span className="text-[10px] text-muted-foreground font-normal">(System)</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase">{cat.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingCategory(cat);
                          setCategoryForm({ name: cat.name, type: cat.type, icon: cat.icon || "tag", color: cat.color || "#64748b" });
                          setIsCategoryModalOpen(true);
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleCategoryActive(cat.id, cat.isActive !== false)}
                        className="h-7 w-7 p-0"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modal: Category Edit */}
        <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add New Category"}</DialogTitle>
            <DialogDescription>Create or update master category classification.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCategory} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Category Name *</label>
              <Input
                placeholder="Category Name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCategoryModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Category
              </Button>
            </div>
          </form>
        </Dialog>

        {/* TAB: CSV Import */}
        {activeTab === "import" && (
          <Card className="shadow-xs border-muted max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Staged CSV & Bank Import
              </CardTitle>
              <CardDescription className="text-xs">Upload bank statements, preview validation diagnostics, and import.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!importPreview ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Target Payment Account *</label>
                    <Select value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Paste CSV Content *</label>
                    <textarea
                      rows={8}
                      className="w-full p-3 font-mono text-xs border rounded-xl bg-muted/20"
                      placeholder={`Date, Description, Amount, Category\n2026-10-01, Green Fodder Purchase, 8000, Feed`}
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handlePreviewCsv} disabled={isImporting || !csvContent.trim()}>
                      Preview & Validate Batch
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => setImportPreview(null)}>
                      Back
                    </Button>
                    <Button onClick={handleCommitImport} disabled={isImporting}>
                      Commit Valid Rows
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB: Recurring Bills */}
        {activeTab === "bills" && (
          <Card className="shadow-xs border-muted">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-purple-500" /> Recurring Bills & EMIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bills.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">No recurring bills found.</div>
              ) : (
                <div className="space-y-2">
                  {bills.map((b) => (
                    <div key={b.id} className="p-3 bg-muted/20 rounded-xl border flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold">{b.name}</span>
                        <span className="text-muted-foreground font-mono ml-2">({formatINR(b.amount)})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB: Unified Ledger History & Reversals */}
        {activeTab === "history" && (
          <Card className="shadow-xs border-muted">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ListFilter className="w-5 h-5 text-blue-500" /> Unified Expense Ledger History & Governance
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect double-entry postings, refund status, lifecycle state, and reverse or reconcile transactions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <Input type="text" placeholder="Search description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />

                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="POSTED">POSTED</option>
                  <option value="RECONCILED">RECONCILED</option>
                  <option value="REVERSED">REVERSED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </Select>

                <Select value={filterScope} onChange={(e) => setFilterScope(e.target.value)}>
                  <option value="ALL">All Scopes</option>
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>

                <Select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
                  <option value="ALL">All Accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>

                <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Ledger Table */}
              <div className="border rounded-xl overflow-hidden text-xs">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Classification & Facility</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Paid From</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Lifecycle Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No matching expense records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTransactions.map((t) => (
                        <TableRow key={t.id} className={t.isVoided || t.status === "REVERSED" ? "opacity-50 line-through" : ""}>
                          <TableCell className="whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">{t.category?.name || "Uncategorized"}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {t.scope?.name && <span className="font-medium text-primary">{t.scope.name}</span>}
                              {t.costCenter?.name && <span>• {t.costCenter.name}</span>}
                              {t.subcategory?.name && <span>• {t.subcategory.name}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{t.description}</div>
                            {t.merchant && <div className="text-[10px] text-muted-foreground">Vendor: {t.merchant}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 font-medium">
                              <Landmark className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>
                                {t.account?.financialInstitution?.name ? `${t.account.financialInstitution.name} ` : ""}
                                {t.account?.name || "Account"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {formatINR(t.amount)}
                            {t.refundedAmount > 0 && (
                              <div className="text-[10px] text-emerald-600 font-normal">Refunded: {formatINR(t.refundedAmount)}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                t.status === "POSTED"
                                  ? "outline"
                                  : t.status === "DRAFT"
                                  ? "secondary"
                                  : t.status === "RECONCILED"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-[10px]"
                            >
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* DRAFT Action */}
                              {t.status === "DRAFT" && (
                                <Button size="sm" variant="default" className="h-7 text-[10px]" onClick={() => handlePostDraft(t.id)}>
                                  Post Draft
                                </Button>
                              )}

                              {/* POSTED Actions */}
                              {t.status === "POSTED" && !t.isVoided && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px]"
                                    onClick={() => {
                                      setRefundTarget(t);
                                      setRefundAmount(String(parseFloat(t.amount) - (parseFloat(t.refundedAmount) || 0)));
                                    }}
                                  >
                                    Refund
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => handleReconcile(t.id)}>
                                    <CheckCheck className="w-3 h-3 mr-1" /> Reconcile
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-[10px] text-rose-500 hover:text-rose-700"
                                    onClick={() => handleReverseTransaction(t.id)}
                                  >
                                    <RotateCcw className="w-3 h-3 mr-1" /> Reverse
                                  </Button>
                                </>
                              )}

                              {/* Archive Action */}
                              {t.status !== "ARCHIVED" && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => handleArchive(t.id)} title="Archive Record">
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Refund Modal */}
        <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
          <DialogHeader>
            <DialogTitle>Process Expense Refund</DialogTitle>
            <DialogDescription>
              Record a full or partial refund for {refundTarget?.description} ({formatINR(refundTarget?.amount || 0)}).
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <form onSubmit={handleProcessRefund} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Refund Amount (Max: {formatINR(parseFloat(refundTarget.amount) - (parseFloat(refundTarget.refundedAmount) || 0))}) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Refund Reason / Context</label>
                <Input
                  type="text"
                  placeholder="e.g. Return of damaged item"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRefundTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isRefunding}>
                  {isRefunding ? "Processing..." : "Confirm Refund"}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      </div>
    </AppLayout>
  );
}
