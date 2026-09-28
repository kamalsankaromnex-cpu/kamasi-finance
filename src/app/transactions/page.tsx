"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { parseTransactionCSV, exportToCSV } from "@/lib/csv";
import {
  Plus,
  Download,
  Upload,
  Search,
  Filter,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Add Transaction Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");

  // CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [importStatus, setImportStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [actionError, setActionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTransactions = async () => {
    try {
      const [txnRes, accountRes, categoryRes] = await Promise.all([
        fetch("/api/transactions"), fetch("/api/accounts"), fetch("/api/categories"),
      ]);
      if (txnRes.ok) setTransactions(await txnRes.json());
      if (accountRes.ok) {
        const data = await accountRes.json();
        setAccounts(data);
        setAccountId((current) => current || data[0]?.id || "");
      }
      if (categoryRes.ok) {
        const data = await categoryRes.json();
        setCategories(data);
        setCategoryId((current) => current || data.find((c: any) => c.type === "EXPENSE")?.id || "");
      }
    } catch {
      setActionError("Could not load transactions and account data.");
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !description) return;
    setIsSubmitting(true);

    // Call Server API for atomic persistence
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          accountId,
          categoryId: type === "TRANSFER" ? null : categoryId,
          transferAccountId: type === "TRANSFER" ? transferAccountId : null,
          date: new Date().toISOString(),
          amount: numAmount,
          type,
          description,
          notes,
          tags,
        }),
      });

      if (res.ok) {
        await fetchTransactions();
      } else {
        const result = await res.json().catch(() => ({}));
        setActionError(result.error || "Transaction could not be saved.");
        setIsSubmitting(false);
        return;
      }
    } catch {
      setActionError("Transaction could not be saved. Check your connection and try again.");
      setIsSubmitting(false);
      return;
    }

    setIsAddOpen(false);
    setDescription("");
    setAmount("");
    setTags("");
    setNotes("");
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchTransactions();
      } else {
        setActionError("Transaction could not be deleted.");
      }
    } catch {
      setActionError("Transaction could not be deleted. Check your connection and try again.");
    }
  };

  const handleRefund = async (txn: any) => {
    const alreadyRefunded = Number(txn.refundedAmount || 0);
    const remaining = Number(txn.amount) - alreadyRefunded;
    const input = window.prompt(`Refund amount (up to ${formatINR(remaining)}). The refund will be credited to the original account.`);
    if (input === null) return;
    const refundAmount = Number(input);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
      setActionError("Refund amount must be positive and cannot exceed the remaining refundable amount.");
      return;
    }
    setActionError("");
    try {
      const response = await fetch(`/api/transactions/${txn.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount: refundAmount.toFixed(2), date: new Date().toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not record the refund.");
      await fetchTransactions();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not record the refund.");
    }
  };

  const handleCSVImport = async () => {
    if (!csvContent.trim()) return;
    const { data, errors } = parseTransactionCSV(csvContent);

    if (errors.length > 0 && data.length === 0) {
      setImportStatus({ message: `CSV Import Failed: ${errors.join(", ")}`, success: false });
      return;
    }
    if (!accounts[0]) {
      setImportStatus({ message: "Create an account before importing transactions.", success: false });
      return;
    }

    let imported = 0;
    for (const row of data) {
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            accountId: accounts[0]?.id,
            categoryId: categories.find((c) => c.type === (row.type || "EXPENSE"))?.id,
            date: row.date || new Date().toISOString(),
            amount: Number(row.amount),
            type: row.type || "EXPENSE",
            description: row.description,
            notes: row.notes,
            tags: row.tags,
          }),
        });
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          setImportStatus({ message: `Stopped after ${imported} rows: ${result.error || "The next transaction was rejected."}`, success: false });
          await fetchTransactions();
          return;
        }
        imported += 1;
      } catch {
        setImportStatus({ message: `Connection failed after ${imported} imported rows. Review the ledger before retrying.`, success: false });
        await fetchTransactions();
        return;
      }
    }

    await fetchTransactions();
    setImportStatus({ message: `Successfully imported ${imported} transactions!`, success: true });
    setTimeout(() => {
      setIsImportOpen(false);
      setImportStatus(null);
      setCsvContent("");
    }, 1500);
  };

  const handleExportCSV = () => {
    const exportData = transactions.map((t) => ({
      Date: new Date(t.date).toLocaleDateString("en-IN"),
      Description: t.description,
      Amount: typeof t.amount === "number" ? t.amount : Number(t.amount),
      Type: t.type,
      Voided: Boolean(t.isVoided || t.type === "VOIDED"),
      Account: accounts.find((a) => a.id === t.accountId)?.name || t.accountId,
      Category: categories.find((c) => c.id === t.categoryId)?.name || "",
      Tags: t.tags || "",
      Notes: t.notes || "",
    }));
    exportToCSV(exportData, "kamasi-finance-transactions");
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.tags && t.tags.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedType === "ALL" || (selectedType === "ADJUSTMENT" ? t.type.startsWith("ADJUSTMENT_") : t.type === selectedType);
    return matchesSearch && matchesType;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {actionError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div>}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Actuals Transaction Ledger</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Record, search, import, and categorize actual verified household cash movements.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button className="gap-2 font-semibold" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions or tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-40">
                <option value="ALL">All Types</option>
                <option value="INCOME">Income Only</option>
                <option value="EXPENSE">Expenses Only</option>
                <option value="TRANSFER">Transfers Only</option>
                <option value="ADJUSTMENT">Balance Adjustments</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ledger Records ({filteredTransactions.length})</CardTitle>
            <CardDescription>Historical verified cash items in INR (₹)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((txn) => {
                  const account = accounts.find((a) => a.id === txn.accountId);
                  const category = categories.find((c) => c.id === txn.categoryId);
                  const user = txn.user;
                  const numAmt = typeof txn.amount === "number" ? txn.amount : Number(txn.amount);

                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="font-medium whitespace-nowrap text-xs">
                        {new Date(txn.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                    <TableCell>
                        <div className="font-semibold text-sm">{txn.type.startsWith("ADJUSTMENT_") ? `Balance adjustment · ${txn.description}` : txn.description}</div>
                        {(txn.isVoided || txn.type === "VOIDED") && <span className="text-[10px] font-semibold text-muted-foreground">VOIDED</span>}
                        {txn.refundOfId && <span className="text-[10px] font-semibold text-emerald-700">REFUND</span>}
                        {txn.type === "EXPENSE" && Number(txn.refundedAmount || 0) > 0 && <span className="text-[10px] text-muted-foreground">Refunded {formatINR(Number(txn.refundedAmount))}</span>}
                        {txn.tags && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {txn.tags}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {account?.name || txn.account?.name || "General Account"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {category?.name || txn.category?.name || "Uncategorized"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user?.name || txn.user?.name || "Alex Kamasi"}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        <span className={txn.type.startsWith("ADJUSTMENT_") ? "text-muted-foreground" : txn.type === "INCOME" ? "text-emerald-600" : "text-foreground"}>
                          {txn.type === "INCOME" || txn.type === "ADJUSTMENT_INCREASE" ? "+" : txn.type === "EXPENSE" || txn.type === "ADJUSTMENT_DECREASE" ? "-" : ""}{formatINR(numAmt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                          {!txn.isVoided && txn.type === "EXPENSE" && Number(txn.refundedAmount || 0) < numAmt && <Button
                            variant="outline"
                            size="sm"
                            className="mr-2 h-8"
                            onClick={() => handleRefund(txn)}
                          >Refund</Button>}
                          {!txn.isVoided && txn.type !== "VOIDED" && <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDelete(txn.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          </Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Transaction Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogHeader>
            <DialogTitle>Add New Transaction Entry</DialogTitle>
            <DialogDescription>Record actual verified income, expense, or transfer item.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTransaction} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Transaction Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Account Transfer</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Description</label>
              <Input
                required
                placeholder="e.g. Swiggy Groceries Order"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Amount (INR ₹)</label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="2500.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {type === "TRANSFER" ? "Source Account" : "Account"}
                </label>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatINR(a.balance)})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {type === "TRANSFER" && (
              <div>
                <label className="text-xs font-semibold mb-1 block">Destination Account</label>
                <Select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)}>
                  <option value="">Select Destination Account...</option>
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatINR(a.balance)})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold mb-1 block">Category</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.filter((c) => c.type === type || type === "TRANSFER" && c.type === "TRANSFER").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Tags (comma separated)</label>
              <Input
                placeholder="groceries, household"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save Entry"}</Button>
            </div>
          </form>
        </Dialog>

        {/* CSV Import Modal */}
        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogHeader>
            <DialogTitle>Import Bank CSV Statement</DialogTitle>
            <DialogDescription>
              Paste CSV text content below. Expected headers: date, description, amount, type, tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <textarea
              className="w-full h-40 rounded-md border p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={`date,description,amount,type,tags\n2026-09-20,Starbucks Coffee,450.00,EXPENSE,dining\n2026-09-21,Freelance Project,25000.00,INCOME,work`}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
            />
            {importStatus && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  importStatus.success ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"
                }`}
              >
                {importStatus.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <span>{importStatus.message}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCSVImport}>Import Transactions</Button>
            </div>
          </div>
        </Dialog>
      </div>
    </AppLayout>
  );
}
