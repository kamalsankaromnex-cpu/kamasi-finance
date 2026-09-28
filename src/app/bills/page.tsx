"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatINR } from "@/lib/currency";
import {
  CalendarCheck,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wallet,
  Building2,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Filter,
} from "lucide-react";

export default function BillsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState<any>(null);

  // Forms
  const [ruleForm, setRuleForm] = useState({
    name: "",
    accountId: "",
    categoryId: "",
    amount: "",
    frequency: "MONTHLY",
    type: "EXPENSE",
    nextDueDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [payForm, setPayForm] = useState({
    amount: "",
    accountId: "",
    date: new Date().toISOString().split("T")[0],
    merchant: "",
    notes: "",
  });

  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rRes, aRes, cRes] = await Promise.all([
        fetch("/api/recurring-bills"),
        fetch("/api/accounts"),
        fetch("/api/categories"),
      ]);

      if (rRes.ok) {
        const data = await rRes.json();
        setRules(data.rules || []);
        setOccurrences(data.occurrences || []);
      }
      if (aRes.ok) setAccounts(await aRes.json());
      if (cRes.ok) setCategories(await cRes.json());
    } catch (err) {
      console.error("Failed to fetch bill data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name || !ruleForm.accountId || !ruleForm.amount) return;

    try {
      const res = await fetch("/api/recurring-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(ruleForm),
      });

      if (res.ok) {
        setIsAddRuleOpen(false);
        setRuleForm({
          name: "",
          accountId: "",
          categoryId: "",
          amount: "",
          frequency: "MONTHLY",
          type: "EXPENSE",
          nextDueDate: new Date().toISOString().split("T")[0],
          notes: "",
        });
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create recurring bill rule");
      }
    } catch (err) {
      console.error("Error creating bill rule:", err);
    }
  };

  const handleOpenPay = (occ: any) => {
    setSelectedOccurrence(occ);
    setPayForm({
      amount: occ.outstandingAmount ? String(occ.outstandingAmount) : String(occ.expectedAmount),
      accountId: occ.recurringRule?.accountId || accounts[0]?.id || "",
      date: new Date().toISOString().split("T")[0],
      merchant: occ.recurringRule?.name || "",
      notes: "",
    });
    setIsPayModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOccurrence || !payForm.accountId || !payForm.amount) return;

    try {
      const res = await fetch("/api/recurring-bills/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceId: selectedOccurrence.id,
          accountId: payForm.accountId,
          amount: parseFloat(payForm.amount),
          date: payForm.date,
          merchant: payForm.merchant,
          notes: payForm.notes,
        }),
      });

      if (res.ok) {
        setIsPayModalOpen(false);
        setSelectedOccurrence(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to record bill payment");
      }
    } catch (err) {
      console.error("Error recording bill payment:", err);
    }
  };

  // Metrics
  const totalUpcoming = occurrences
    .filter((o) => o.status === "UPCOMING" || o.status === "PARTIALLY_PAID")
    .reduce((sum, o) => sum + Number(o.outstandingAmount || o.expectedAmount), 0);

  const totalPaid = occurrences
    .filter((o) => o.status === "PAID" || o.status === "PARTIALLY_PAID")
    .reduce((sum, o) => sum + Number(o.paidAmount || 0), 0);

  const overdueCount = occurrences.filter(
    (o) => o.status === "UPCOMING" && new Date(o.dueDate) < new Date()
  ).length;

  const filteredOccurrences = occurrences.filter((occ) => {
    if (filterStatus === "ALL") return true;
    if (filterStatus === "OVERDUE") return occ.status === "UPCOMING" && new Date(occ.dueDate) < new Date();
    return occ.status === filterStatus;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CalendarCheck className="h-7 w-7 text-primary" />
              Bills & Recurring Outflows
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage utilities, subscriptions, rent, insurance, and loan EMIs with single-ledger balance tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddRuleOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              Add Recurring Bill / EMI
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Outflow
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{formatINR(totalUpcoming)}</div>
              <p className="text-xs text-muted-foreground mt-1">Due across upcoming bill occurrences</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Paid This Month
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatINR(totalPaid)}</div>
              <p className="text-xs text-muted-foreground mt-1">Settled into ledger & account balances</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Overdue Alerts
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{overdueCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Bills past scheduled due date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Bill Rules
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rules.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Recurring schedules configured</p>
            </CardContent>
          </Card>
        </div>

        {/* Bill Occurrences List */}
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-bold">Upcoming & Historical Occurrences</CardTitle>
              <CardDescription>Track payments, view due dates, and record payments with zero duplicate ledger charges.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-xs bg-background"
              >
                <option value="ALL">All Statuses</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading bill schedules...</div>
            ) : filteredOccurrences.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No bill occurrences found. Click &quot;Add Recurring Bill / EMI&quot; above to create your first schedule.
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredOccurrences.map((occ) => {
                  const isOverdue = occ.status === "UPCOMING" && new Date(occ.dueDate) < new Date();
                  const isPaid = occ.status === "PAID";
                  const isPartial = occ.status === "PARTIALLY_PAID";

                  return (
                    <div key={occ.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-xl p-2.5 ${isPaid ? "bg-emerald-500/10 text-emerald-600" : isOverdue ? "bg-rose-500/10 text-rose-600" : isPartial ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"}`}>
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{occ.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isPaid
                                ? "bg-emerald-500/10 text-emerald-600"
                                : isOverdue
                                ? "bg-rose-500/10 text-rose-600"
                                : isPartial
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-blue-500/10 text-blue-600"
                            }`}>
                              {isOverdue ? "OVERDUE" : occ.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Due: {new Date(occ.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} • Default Account: {occ.recurringRule?.account?.name || "Unlinked"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6">
                        <div className="text-right">
                          <p className="font-bold text-sm text-foreground">{formatINR(occ.expectedAmount)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Paid: {formatINR(occ.paidAmount)} | Remaining: {formatINR(occ.outstandingAmount)}
                          </p>
                        </div>

                        {!isPaid && (
                          <button
                            onClick={() => handleOpenPay(occ)}
                            className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-all"
                          >
                            Pay Now
                          </button>
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

      {/* Modal: Create Recurring Rule */}
      {isAddRuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold">Add Recurring Bill or EMI Rule</h2>
            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="text-xs font-medium">Bill Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BESCOM Electricity, House Rent, Home Loan EMI"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Expected Amount (₹)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={ruleForm.amount}
                    onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Frequency</label>
                  <select
                    value={ruleForm.frequency}
                    onChange={(e) => setRuleForm({ ...ruleForm, frequency: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="YEARLY">Yearly</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Payment Account</label>
                  <select
                    required
                    value={ruleForm.accountId}
                    onChange={(e) => setRuleForm({ ...ruleForm, accountId: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  >
                    <option value="">Select Account</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">First Due Date</label>
                  <input
                    type="date"
                    required
                    value={ruleForm.nextDueDate}
                    onChange={(e) => setRuleForm({ ...ruleForm, nextDueDate: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRuleOpen(false)}
                  className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Save Bill Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Bill */}
      {isPayModalOpen && selectedOccurrence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold">Record Bill Payment</h2>
            <p className="text-xs text-muted-foreground">
              Paying <span className="font-semibold text-foreground">{selectedOccurrence.name}</span>. Outstanding balance is {formatINR(selectedOccurrence.outstandingAmount)}.
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Payment Amount (₹)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    max={selectedOccurrence.outstandingAmount}
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Paying Account</label>
                  <select
                    required
                    value={payForm.accountId}
                    onChange={(e) => setPayForm({ ...payForm, accountId: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  >
                    <option value="">Select Account</option>
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
                  <label className="text-xs font-medium">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={payForm.date}
                    onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Merchant / Biller</label>
                  <input
                    type="text"
                    value={payForm.merchant}
                    onChange={(e) => setPayForm({ ...payForm, merchant: e.target.value })}
                    className="mt-1 w-full rounded-md border p-2 text-sm bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="rounded-md border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Confirm & Deduct Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
