"use client";

import { useState, useEffect } from "react";
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
import { ArrowLeftRight, Plus } from "lucide-react";

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Form State
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'CONFIRMED_FAILURE' | 'NETWORK_TIMEOUT'>('CONFIRMED_FAILURE');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [txRes, accRes] = await Promise.all([
        fetch("/api/transactions?type=TRANSFER"),
        fetch("/api/accounts"),
      ]);
      if (txRes.ok) setTransfers(await txRes.json());
      if (accRes.ok) {
        const accs = await accRes.json();
        setAccounts(accs);
        if (accs.length > 0 && !sourceAccountId) setSourceAccountId(accs[0].id);
        if (accs.length > 1 && !destinationAccountId) setDestinationAccountId(accs[1].id);
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

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMessage("Please enter a valid transfer amount.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }
    if (!sourceAccountId || !destinationAccountId) {
      setErrorMessage("Please select both source and destination accounts.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }
    if (sourceAccountId === destinationAccountId) {
      setErrorMessage("Source and destination accounts must be different.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TRANSFER",
          amount: numericAmount,
          description: description || "Account Transfer",
          accountId: sourceAccountId,
          transferAccountId: destinationAccountId,
        }),
      });

      if (res.ok) {
        setIsOpen(false);
        setAmount("");
        setDescription("");
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Transfer transaction could not be saved.");
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch {
      setErrorMessage("Network timeout while submitting transfer.");
      setErrorType("NETWORK_TIMEOUT");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Account Transfers</h1>
              <FinancialBadge state="ACTUAL" />
            </div>
            <p className="text-sm text-muted-foreground">
              Move money between your checking, savings, and investment accounts cleanly.
            </p>
          </div>
          <Button onClick={() => setIsOpen(true)} className="gap-2 shadow-xs">
            <Plus className="h-4 w-4" />
            <span>Transfer Money</span>
          </Button>
        </div>

        {errorMessage && (
          <FormErrorReassurance
            type={errorType}
            message={errorMessage}
            onRetry={() => setErrorMessage(null)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfer History</CardTitle>
            <CardDescription>Posted double-entry transfers between household accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 animate-pulse bg-muted rounded-lg" />
            ) : transfers.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No Transfer Records Found"
                description="Move funds between your bank and savings accounts when needed."
                actionLabel="Transfer Money"
                onAction={() => setIsOpen(true)}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>From Account</TableHead>
                    <TableHead>To Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{new Date(item.date || item.createdAt).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="font-semibold text-xs">{item.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.account?.name || "Source"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.transferAccount?.name || "Destination"}</TableCell>
                      <TableCell><FinancialBadge state="ACTUAL" /></TableCell>
                      <TableCell className="text-right font-bold text-xs text-blue-600">
                        {formatINR(Number(item.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Modal Dialog for Human Input Form */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogHeader>
            <DialogTitle>Transfer Money</DialogTitle>
            <DialogDescription>Move funds between household accounts.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitTransfer} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Transfer Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Description / Purpose</label>
              <Input
                placeholder="e.g. Transfer to Emergency Savings"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">From Account (Source)</label>
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatINR(Number(acc.balance))})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">To Account (Destination)</label>
              <select
                value={destinationAccountId}
                onChange={(e) => setDestinationAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatINR(Number(acc.balance))})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit">Save Transfer</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
