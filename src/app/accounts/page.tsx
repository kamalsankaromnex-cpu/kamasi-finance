"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import {
  Wallet,
  CreditCard,
  Building,
  Building2,
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  User,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  DollarSign,
  TrendingDown,
  Upload,
  Coins,
  Home,
  Briefcase,
  Shield,
  Gem,
  Image as ImageIcon,
} from "lucide-react";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [closingAccount, setClosingAccount] = useState<any>(null);

  // Uploading state
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: "",
    type: "BANK",
    balance: "",
    accountNumber: "",
    isShared: true,
    financialInstitutionId: "",
    logoMode: "AUTO", // AUTO, CUSTOM, ICON, INITIAL
    customLogoUrl: "",
    iconName: "bank",
    creditLimit: "",
    billingCycleDay: "",
    paymentDueDate: "",
    interestRate: "",
    maturityDate: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accRes, instRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/institutions"),
      ]);

      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(data);
      }
      if (instRes.ok) {
        const instData = await instRes.json();
        setInstitutions(instData);
      }
    } catch (err) {
      console.error("Failed to fetch accounts and institutions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      type: "BANK",
      balance: "",
      accountNumber: "",
      isShared: true,
      financialInstitutionId: "",
      logoMode: "AUTO",
      customLogoUrl: "",
      iconName: "bank",
      creditLimit: "",
      billingCycleDay: "",
      paymentDueDate: "",
      interestRate: "",
      maturityDate: "",
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const handleOpenEdit = (acc: any) => {
    setEditingAccount(acc);
    setForm({
      name: acc.name || "",
      type: acc.type || "BANK",
      balance: acc.balance !== null && acc.balance !== undefined ? String(acc.balance) : "",
      accountNumber: "",
      isShared: acc.isShared !== undefined ? acc.isShared : true,
      financialInstitutionId: acc.financialInstitutionId || acc.financialInstitution?.id || "",
      logoMode: acc.logoMode || "AUTO",
      customLogoUrl: acc.customLogoUrl || "",
      iconName: acc.iconName || "bank",
      creditLimit: acc.creditLimit !== null && acc.creditLimit !== undefined ? String(acc.creditLimit) : "",
      billingCycleDay: acc.billingCycleDay ? String(acc.billingCycleDay) : "",
      paymentDueDate: acc.paymentDueDate ? String(acc.paymentDueDate) : "",
      interestRate: acc.interestRate !== null && acc.interestRate !== undefined ? String(acc.interestRate) : "",
      maturityDate: acc.maturityDate ? new Date(acc.maturityDate).toISOString().split("T")[0] : "",
    });
  };

  const handleCustomLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingLogo(true);
      const data = new FormData();
      data.append("logo", file);

      const res = await fetch("/api/uploads/logos", {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        const result = await res.json();
        setForm((prev) => ({
          ...prev,
          customLogoUrl: result.url,
          logoMode: "CUSTOM",
        }));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to upload custom logo");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Network error uploading logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.balance === "") return;

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          balance: parseFloat(form.balance),
        }),
      });

      if (res.ok) {
        setIsAddOpen(false);
        resetForm();
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create account");
      }
    } catch (err) {
      console.error("Error creating account:", err);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !form.name) return;

    try {
      const { accountNumber, ...updateFields } = form;
      const res = await fetch(`/api/accounts/${editingAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updateFields,
          balance: parseFloat(form.balance),
          ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}),
        }),
      });

      if (res.ok) {
        setEditingAccount(null);
        resetForm();
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update account");
      }
    } catch (err) {
      console.error("Error updating account:", err);
    }
  };

  const handleCloseAccount = async () => {
    if (!closingAccount) return;

    try {
      const res = await fetch(`/api/accounts/${closingAccount.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setClosingAccount(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to close account");
      }
    } catch (err) {
      console.error("Error closing account:", err);
    }
  };

  const handleReopenAccount = async (acc: any) => {
    try {
      const res = await fetch(`/api/accounts/${acc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: false }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to reopen account");
      }
    } catch (err) {
      console.error("Error reopening account:", err);
    }
  };

  // Metrics Calculation
  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);

  const totalBankCash = activeAccounts
    .filter((a) => a.type === "BANK" || a.type === "CASH")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const totalCreditBalance = activeAccounts
    .filter((a) => a.type === "CREDIT")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const totalInvestmentBalance = activeAccounts
    .filter((a) => a.type === "INVESTMENT")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const totalLoanLiability = activeAccounts
    .filter((a) => a.type === "LOAN")
    .reduce((sum, a) => sum + Number(a.balance), 0);

  // Filtered List
  const displayAccounts = (activeTab === "ACTIVE" ? activeAccounts : archivedAccounts).filter((acc) => {
    if (typeFilter === "ALL") return true;
    return acc.type === typeFilter;
  });

  // Initials generator helper
  const getAccountInitials = (name: string, institutionName?: string) => {
    const text = institutionName || name;
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return text.substring(0, 2).toUpperCase() || "AC";
  };

  // Icon mapping helper
  const renderIconByName = (iconName?: string, className = "h-5 w-5") => {
    switch (iconName) {
      case "credit-card":
        return <CreditCard className={className} />;
      case "building":
        return <Building className={className} />;
      case "building2":
        return <Building2 className={className} />;
      case "coins":
        return <Coins className={className} />;
      case "home":
        return <Home className={className} />;
      case "briefcase":
        return <Briefcase className={className} />;
      case "shield":
        return <Shield className={className} />;
      case "gem":
        return <Gem className={className} />;
      case "wallet":
      case "bank":
      default:
        return <Wallet className={className} />;
    }
  };

  // Logo rendering with Fallback Chain
  const renderAccountLogo = (acc: any, sizeClass = "h-9 w-9") => {
    const mode = acc.logoMode || "AUTO";
    const selectedInst = institutions.find((i) => i.id === (acc.financialInstitutionId || acc.financialInstitution?.id));
    const instLogoUrl = selectedInst?.logoUrl || acc.financialInstitution?.logoUrl;
    const initials = getAccountInitials(acc.name, selectedInst?.name || acc.financialInstitution?.name);

    if (mode === "CUSTOM" && acc.customLogoUrl) {
      return (
        <img
          src={acc.customLogoUrl}
          alt={acc.name}
          className={`${sizeClass} rounded-xl object-contain border bg-background p-1`}
          onError={(e) => {
            // Graceful fallback to initial if image fails to load
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      );
    }

    if (mode === "AUTO" && instLogoUrl) {
      return (
        <img
          src={instLogoUrl}
          alt={selectedInst?.name || acc.name}
          className={`${sizeClass} rounded-xl object-contain border bg-background p-1`}
          onError={(e) => {
            // Graceful fallback to initial
            (e.target as HTMLElement).style.display = "none";
          }}
        />
      );
    }

    if (mode === "ICON" && acc.iconName) {
      return (
        <div className={`flex ${sizeClass} items-center justify-center rounded-xl bg-primary/10 text-primary border`}>
          {renderIconByName(acc.iconName, "h-5 w-5")}
        </div>
      );
    }

    if (mode === "INITIAL") {
      return (
        <div className={`flex ${sizeClass} items-center justify-center rounded-xl bg-primary/15 font-bold text-primary border text-xs`}>
          {initials}
        </div>
      );
    }

    // Default Fallback: System Type Icon
    const isBank = acc.type === "BANK";
    const isCredit = acc.type === "CREDIT";
    const isLoan = acc.type === "LOAN";

    return (
      <div
        className={`flex ${sizeClass} items-center justify-center rounded-xl ${
          isBank
            ? "bg-emerald-500/10 text-emerald-600"
            : isCredit
            ? "bg-amber-500/10 text-amber-600"
            : isLoan
            ? "bg-rose-500/10 text-rose-600"
            : "bg-indigo-500/10 text-indigo-600"
        }`}
      >
        {isBank ? <Wallet className="h-5 w-5" /> : isCredit ? <CreditCard className="h-5 w-5" /> : isLoan ? <Building2 className="h-5 w-5" /> : <Building className="h-5 w-5" />}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Wallet className="h-7 w-7 text-primary" />
              Accounts & Liquidity Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage bank accounts, credit cards, investments, cash wallets, and loan liabilities.
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
          >
            <Plus className="h-4 w-4" /> Add Account
          </button>
        </div>

        {/* Financial Overview Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Bank & Cash Liquid Balance
              </CardTitle>
              <Wallet className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatINR(totalBankCash)}</div>
              <p className="text-xs text-muted-foreground mt-1">Available liquid capital across active accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Credit Card Balance
              </CardTitle>
              <CreditCard className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{formatINR(totalCreditBalance)}</div>
              <p className="text-xs text-muted-foreground mt-1">Outstanding credit card dues</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Brokerage & Demat Assets
              </CardTitle>
              <Building className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{formatINR(totalInvestmentBalance)}</div>
              <p className="text-xs text-muted-foreground mt-1">Investment accounts & fixed deposits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Loan Liabilities
              </CardTitle>
              <Building2 className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{formatINR(totalLoanLiability)}</div>
              <p className="text-xs text-muted-foreground mt-1">Outstanding loan principal balances</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Selection & Filtering */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("ACTIVE")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "ACTIVE"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              Active Accounts ({activeAccounts.length})
            </button>
            <button
              onClick={() => setActiveTab("ARCHIVED")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "ARCHIVED"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              Closed / Archived Accounts ({archivedAccounts.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-xs bg-background"
            >
              <option value="ALL">All Account Types</option>
              <option value="BANK">Bank Savings</option>
              <option value="CREDIT">Credit Cards</option>
              <option value="INVESTMENT">Brokerage & Demat</option>
              <option value="CASH">Cash Wallets</option>
              <option value="LOAN">Loan Liabilities</option>
            </select>
          </div>
        </div>

        {/* Accounts Card List Grid */}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading financial accounts...</div>
        ) : displayAccounts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground border rounded-xl bg-card p-8">
            {activeTab === "ACTIVE"
              ? "No active financial accounts found. Click 'Add Account' above to register your bank or credit card."
              : "No closed/archived accounts."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayAccounts.map((acc) => {
              const numBal = Number(acc.balance || 0);
              const isCredit = acc.type === "CREDIT";
              const isLoan = acc.type === "LOAN";
              const isInvestment = acc.type === "INVESTMENT";
              const selectedInst = institutions.find((i) => i.id === (acc.financialInstitutionId || acc.financialInstitution?.id));

              return (
                <Card key={acc.id} className={`relative overflow-hidden transition-all hover:shadow-md ${acc.isArchived ? "opacity-75 bg-muted/30" : ""}`}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3 gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-foreground truncate">{acc.name}</CardTitle>
                        {acc.isArchived && (
                          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 uppercase shrink-0">
                            CLOSED
                          </span>
                        )}
                      </div>
                      {selectedInst && (
                        <p className="text-[11px] font-semibold text-primary">{selectedInst.name}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono flex-wrap">
                        <span>{acc.accountNumber ? `•••• ${acc.accountNumber.slice(-4)}` : acc.type}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {acc.isShared ? (
                            <>
                              <Users className="h-3 w-3 text-emerald-600" /> Shared
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 text-blue-600" /> Personal
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Account Branding Logo */}
                    <div className="shrink-0">
                      {renderAccountLogo(acc)}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Current Balance</p>
                        <div className={`text-2xl font-extrabold ${numBal < 0 || isCredit || isLoan ? "text-rose-600" : "text-emerald-600"}`}>
                          {formatINR(numBal)}
                        </div>
                      </div>

                      {/* Household Member Profile Avatars */}
                      {acc.sharedMembers && acc.sharedMembers.length > 0 && (
                        <div className="flex items-center -space-x-2 overflow-hidden py-1" title={acc.isShared ? "Authorized Household Members" : "Account Holder"}>
                          {acc.sharedMembers.map((m: any) => (
                            <div
                              key={m.id}
                              title={m.name}
                              className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-primary/20 flex items-center justify-center font-bold text-[10px] text-primary"
                            >
                              {m.avatarUrl ? (
                                <img src={m.avatarUrl} alt={m.name} className="h-full w-full rounded-full object-cover" />
                              ) : (
                                m.name?.substring(0, 2).toUpperCase() || "M"
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata details */}
                    <div className="space-y-1.5 rounded-lg border p-2.5 text-xs bg-muted/30">
                      {isCredit && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Credit Limit:</span>
                            <span className="font-semibold">{acc.creditLimit ? formatINR(acc.creditLimit) : "N/A"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Billing Cycle Day:</span>
                            <span className="font-semibold">{acc.billingCycleDay ? `${acc.billingCycleDay}th of month` : "N/A"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Payment Due Date:</span>
                            <span className="font-semibold">{acc.paymentDueDate ? `${acc.paymentDueDate}th of month` : "N/A"}</span>
                          </div>
                        </>
                      )}

                      {isLoan && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Interest Rate:</span>
                          <span className="font-semibold">{acc.interestRate ? `${acc.interestRate}% p.a.` : "N/A"}</span>
                        </div>
                      )}

                      {isInvestment && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Maturity Date:</span>
                            <span className="font-semibold">
                              {acc.maturityDate ? new Date(acc.maturityDate).toLocaleDateString("en-IN") : "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expected Return Rate:</span>
                            <span className="font-semibold">{acc.interestRate ? `${acc.interestRate}%` : "N/A"}</span>
                          </div>
                        </>
                      )}

                      {!isCredit && !isLoan && !isInvestment && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account Status:</span>
                          <span className="font-semibold text-emerald-600">Active & Reconciled</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t">
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>

                      {!acc.isArchived ? (
                        <button
                          onClick={() => setClosingAccount(acc)}
                          className="flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Archive className="h-3.5 w-3.5" /> Close
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReopenAccount(acc)}
                          className="flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" /> Re-open
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal: Add Account */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4 overflow-y-auto max-h-[90vh]">
              <h2 className="text-lg font-bold">Add Financial Account</h2>
              <form onSubmit={handleCreateAccount} className="space-y-4">
                {/* Account Branding Section */}
                <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Identity & Branding</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Preview:</span>
                      {renderAccountLogo({
                        name: form.name || "Preview",
                        logoMode: form.logoMode,
                        customLogoUrl: form.customLogoUrl,
                        iconName: form.iconName,
                        financialInstitutionId: form.financialInstitutionId,
                        type: form.type,
                      }, "h-7 w-7")}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium block mb-1">Financial Institution</label>
                    <select
                      value={form.financialInstitutionId}
                      onChange={(e) => {
                        const instId = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          financialInstitutionId: instId,
                          logoMode: instId ? "AUTO" : prev.logoMode,
                        }));
                      }}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="">Select Financial Institution (Optional)</option>
                      {institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} ({inst.shortCode || "Bank"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium block mb-1">Logo Source Mode</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { mode: "AUTO", label: "Institution" },
                        { mode: "CUSTOM", label: "Custom" },
                        { mode: "ICON", label: "System Icon" },
                        { mode: "INITIAL", label: "Initials" },
                      ].map((m) => (
                        <button
                          key={m.mode}
                          type="button"
                          onClick={() => setForm({ ...form, logoMode: m.mode })}
                          className={`rounded-md py-1 px-2 text-xs font-semibold border transition-all ${
                            form.logoMode === m.mode
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.logoMode === "CUSTOM" && (
                    <div className="space-y-2 pt-1">
                      <label className="text-xs font-medium block">Upload Custom Logo (PNG, JPG, WEBP - Max 2MB)</label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-muted">
                          <Upload className="h-3.5 w-3.5" />
                          {isUploadingLogo ? "Uploading..." : "Choose Image File"}
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCustomLogoUpload} className="hidden" />
                        </label>
                        {form.customLogoUrl && <span className="text-xs text-emerald-600 font-semibold">✓ Custom logo attached</span>}
                      </div>
                    </div>
                  )}

                  {form.logoMode === "ICON" && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-medium block">Select Icon</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: "bank", icon: <Wallet className="h-4 w-4" /> },
                          { name: "credit-card", icon: <CreditCard className="h-4 w-4" /> },
                          { name: "building", icon: <Building className="h-4 w-4" /> },
                          { name: "coins", icon: <Coins className="h-4 w-4" /> },
                          { name: "home", icon: <Home className="h-4 w-4" /> },
                          { name: "briefcase", icon: <Briefcase className="h-4 w-4" /> },
                          { name: "shield", icon: <Shield className="h-4 w-4" /> },
                          { name: "gem", icon: <Gem className="h-4 w-4" /> },
                        ].map((ic) => (
                          <button
                            key={ic.name}
                            type="button"
                            onClick={() => setForm({ ...form, iconName: ic.name })}
                            className={`p-2 rounded-lg border transition-all ${
                              form.iconName === ic.name ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {ic.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium">Account Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Salary Savings, ICICI Amazon Pay Card"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Account Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    >
                      <option value="BANK">Bank Savings</option>
                      <option value="CREDIT">Credit Card</option>
                      <option value="INVESTMENT">Brokerage / Demat</option>
                      <option value="CASH">Cash Wallet</option>
                      <option value="LOAN">Loan / EMI Liability</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Current Balance (₹)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      placeholder="50000.00"
                      value={form.balance}
                      onChange={(e) => setForm({ ...form, balance: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Account Number (Masked)</label>
                    <input
                      type="text"
                      placeholder="**** 1234"
                      value={form.accountNumber}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Sharing Access</label>
                    <select
                      value={form.isShared ? "true" : "false"}
                      onChange={(e) => setForm({ ...form, isShared: e.target.value === "true" })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    >
                      <option value="true">Shared Household Account</option>
                      <option value="false">Personal Account</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Create Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Account */}
        {editingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4 overflow-y-auto max-h-[90vh]">
              <h2 className="text-lg font-bold">Edit Account Details</h2>
              <form onSubmit={handleUpdateAccount} className="space-y-4">
                {/* Account Branding Section */}
                <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Identity & Branding</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Preview:</span>
                      {renderAccountLogo({
                        name: form.name || "Preview",
                        logoMode: form.logoMode,
                        customLogoUrl: form.customLogoUrl,
                        iconName: form.iconName,
                        financialInstitutionId: form.financialInstitutionId,
                        type: form.type,
                      }, "h-7 w-7")}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium block mb-1">Financial Institution</label>
                    <select
                      value={form.financialInstitutionId}
                      onChange={(e) => {
                        const instId = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          financialInstitutionId: instId,
                          logoMode: instId ? "AUTO" : prev.logoMode,
                        }));
                      }}
                      className="w-full rounded-md border p-2 text-xs bg-background"
                    >
                      <option value="">Select Financial Institution (Optional)</option>
                      {institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} ({inst.shortCode || "Bank"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium block mb-1">Logo Source Mode</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { mode: "AUTO", label: "Institution" },
                        { mode: "CUSTOM", label: "Custom" },
                        { mode: "ICON", label: "System Icon" },
                        { mode: "INITIAL", label: "Initials" },
                      ].map((m) => (
                        <button
                          key={m.mode}
                          type="button"
                          onClick={() => setForm({ ...form, logoMode: m.mode })}
                          className={`rounded-md py-1 px-2 text-xs font-semibold border transition-all ${
                            form.logoMode === m.mode
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.logoMode === "CUSTOM" && (
                    <div className="space-y-2 pt-1">
                      <label className="text-xs font-medium block">Upload Custom Logo (PNG, JPG, WEBP - Max 2MB)</label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-muted">
                          <Upload className="h-3.5 w-3.5" />
                          {isUploadingLogo ? "Uploading..." : "Choose Image File"}
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCustomLogoUpload} className="hidden" />
                        </label>
                        {form.customLogoUrl && <span className="text-xs text-emerald-600 font-semibold">✓ Custom logo attached</span>}
                      </div>
                    </div>
                  )}

                  {form.logoMode === "ICON" && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-medium block">Select Icon</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: "bank", icon: <Wallet className="h-4 w-4" /> },
                          { name: "credit-card", icon: <CreditCard className="h-4 w-4" /> },
                          { name: "building", icon: <Building className="h-4 w-4" /> },
                          { name: "coins", icon: <Coins className="h-4 w-4" /> },
                          { name: "home", icon: <Home className="h-4 w-4" /> },
                          { name: "briefcase", icon: <Briefcase className="h-4 w-4" /> },
                          { name: "shield", icon: <Shield className="h-4 w-4" /> },
                          { name: "gem", icon: <Gem className="h-4 w-4" /> },
                        ].map((ic) => (
                          <button
                            key={ic.name}
                            type="button"
                            onClick={() => setForm({ ...form, iconName: ic.name })}
                            className={`p-2 rounded-lg border transition-all ${
                              form.iconName === ic.name ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {ic.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium">Account Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Account Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    >
                      <option value="BANK">Bank Savings</option>
                      <option value="CREDIT">Credit Card</option>
                      <option value="INVESTMENT">Brokerage / Demat</option>
                      <option value="CASH">Cash Wallet</option>
                      <option value="LOAN">Loan / EMI Liability</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Current Balance (₹)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={form.balance}
                      onChange={(e) => setForm({ ...form, balance: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Account Number (Masked)</label>
                    <input
                      type="text"
                      placeholder="Leave blank to retain saved number"
                      value={form.accountNumber}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Sharing Access</label>
                    <select
                      value={form.isShared ? "true" : "false"}
                      onChange={(e) => setForm({ ...form, isShared: e.target.value === "true" })}
                      className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                    >
                      <option value="true">Shared Household Account</option>
                      <option value="false">Personal Account</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingAccount(null)}
                    className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Close / Soft Delete Confirmation */}
        {closingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertCircle className="h-6 w-6" />
                <h2 className="text-lg font-bold">Close Account (Soft Archive)</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to close <span className="font-semibold text-foreground">{closingAccount.name}</span>?
                <br /><br />
                <strong className="text-foreground">Zero Data Loss Guarantee:</strong> This account will be marked as closed (`isArchived: true`). Historical ledger transactions, income receipts, and reports linked to this account will remain intact in the database.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setClosingAccount(null)}
                  className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCloseAccount}
                  className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Confirm & Soft Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
