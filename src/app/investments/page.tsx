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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatINR } from "@/lib/currency";
import {
  Plus,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  PieChart,
  History,
  RotateCcw,
  ShoppingCart,
  Banknote,
  Percent,
  Receipt,
  Scale
} from "lucide-react";

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [actionType, setActionType] = useState<"BUY" | "SELL" | "DIVIDEND" | "INTEREST" | "FEE" | "REVALUE" | null>(null);
  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);

  // Form States - Create Draft
  const [draftName, setDraftName] = useState("");
  const [draftSymbol, setDraftSymbol] = useState("");
  const [draftCategory, setDraftCategory] = useState("EQUITY");
  const [draftType, setDraftType] = useState("STOCK");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAccountId, setDraftAccountId] = useState("");

  // Form States - Actions (Buy / Sell / Income / Fee / Revalue)
  const [actionQuantity, setActionQuantity] = useState("");
  const [actionPrice, setActionPrice] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [actionAccountId, setActionAccountId] = useState("");
  const [actionGainLossAccountId, setActionGainLossAccountId] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionDate, setActionDate] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invRes, accRes, repRes] = await Promise.all([
        fetch("/api/investments"),
        fetch("/api/accounts"),
        fetch("/api/reports/investments"),
      ]);

      if (invRes.ok) {
        const data = await invRes.json();
        setInvestments(data.investments || []);
      }
      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(Array.isArray(data) ? data : (data.accounts || []));
      }
      if (repRes.ok) {
        const data = await repRes.json();
        setReport(data);
      }
    } catch (err) {
      console.error("Failed to load investments dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Summary Metrics
  const totalCostBasis = report ? Number(report.totalCostBasis) : investments.reduce((acc, i) => acc + Number(i.totalCostBasis || 0), 0);
  const totalMarketVal = report ? Number(report.totalMarketValue) : investments.reduce((acc, i) => acc + Number(i.currentMarketValue || 0), 0);
  const totalRealizedGL = report ? Number(report.totalRealizedGainLoss) : investments.reduce((acc, i) => acc + Number(i.realizedGainLoss || 0), 0);
  const totalUnrealizedGL = report ? Number(report.totalUnrealizedGainLoss) : totalMarketVal - totalCostBasis;
  const totalIncome = report ? Number(report.totalIncome || (Number(report.totalDividends || 0) + Number(report.totalInterest || 0))) : 0;
  const totalReturn = report ? Number(report.totalReturn) : (totalRealizedGL + totalUnrealizedGL + totalIncome);

  // Handlers
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName) return;

    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          symbol: draftSymbol || null,
          category: draftCategory,
          type: draftType,
          description: draftDescription || undefined,
          investmentAccountId: draftAccountId || undefined,
        }),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        setDraftName("");
        setDraftSymbol("");
        setDraftDescription("");
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create investment draft");
      }
    } catch (err) {
      console.error("Create draft error:", err);
    }
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestment || !actionType) return;

    try {
      let endpoint = "";
      let payload: any = {
        effectiveDate: actionDate || undefined,
        reason: actionReason || undefined,
      };

      if (actionType === "BUY") {
        endpoint = `/api/investments/${selectedInvestment.id}/buy`;
        payload = {
          ...payload,
          quantity: parseFloat(actionQuantity),
          pricePerUnit: parseFloat(actionPrice),
          payingAccountId: actionAccountId || undefined,
        };
      } else if (actionType === "SELL") {
        endpoint = `/api/investments/${selectedInvestment.id}/sell`;
        payload = {
          ...payload,
          quantity: parseFloat(actionQuantity),
          pricePerUnit: parseFloat(actionPrice),
          receivingAccountId: actionAccountId || undefined,
          gainLossAccountId: actionGainLossAccountId || undefined,
        };
      } else if (actionType === "DIVIDEND" || actionType === "INTEREST") {
        endpoint = `/api/investments/${selectedInvestment.id}/income`;
        payload = {
          ...payload,
          incomeType: actionType,
          amount: parseFloat(actionAmount),
          receivingAccountId: actionAccountId || undefined,
        };
      } else if (actionType === "FEE") {
        endpoint = `/api/investments/${selectedInvestment.id}/fee`;
        payload = {
          ...payload,
          amount: parseFloat(actionAmount),
          payingAccountId: actionAccountId || undefined,
        };
      } else if (actionType === "REVALUE") {
        endpoint = `/api/investments/${selectedInvestment.id}/revalue`;
        payload = {
          ...payload,
          currentPricePerUnit: parseFloat(actionPrice),
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setActionType(null);
        setSelectedInvestment(null);
        setActionQuantity("");
        setActionPrice("");
        setActionAmount("");
        setActionReason("");
        setActionDate("");
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || `Failed to execute ${actionType}`);
      }
    } catch (err) {
      console.error(`Action error ${actionType}:`, err);
    }
  };

  const handleReverseEvent = async (investmentId: string, eventId: string) => {
    if (!confirm("Are you sure you want to reverse this financial event? This will atomically post compensating journals and restore balances.")) {
      return;
    }

    try {
      const res = await fetch(`/api/investments/${investmentId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, reason: "Manual user reversal" }),
      });

      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to reverse event");
      }
    } catch (err) {
      console.error("Reverse event error:", err);
    }
  };

  const allEvents = investments.flatMap((inv) =>
    (inv.financialEvents || []).map((evt: any) => ({ ...evt, investmentName: inv.name, investmentSymbol: inv.symbol }))
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Investment Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Certified weighted-average cost basis, lot tracking, double-entry financial events, and compensating reversals.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" /> New Investment
          </Button>
        </div>

        {/* Portfolio Valuation Summary */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Current Market Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatINR(totalMarketVal)}</div>
              <p className="text-xs text-muted-foreground mt-1">Cost Basis: {formatINR(totalCostBasis)}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Unrealized Gain / Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalUnrealizedGL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {totalUnrealizedGL >= 0 ? "+" : ""}{formatINR(totalUnrealizedGL)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Mark-to-Market Valuation</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Realized Gains / Losses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalRealizedGL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {totalRealizedGL >= 0 ? "+" : ""}{formatINR(totalRealizedGL)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Locked via Disposals</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Income & Total Return</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatINR(totalReturn)}</div>
              <p className="text-xs text-muted-foreground mt-1">Dividends & Interest: {formatINR(totalIncome)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Navigation */}
        <Tabs defaultValue="holdings">
          <TabsList>
            <TabsTrigger value="holdings">Holdings & Lifecycle</TabsTrigger>
            <TabsTrigger value="transactions">Financial Events Ledger</TabsTrigger>
            <TabsTrigger value="lots">Tax Lots (FIFO Acquisition)</TabsTrigger>
          </TabsList>

          {/* Holdings Tab */}
          <TabsContent value="holdings">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Investment Holdings Schedule</CardTitle>
                <CardDescription>Direct operational holdings governed by weighted-average accounting</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">Loading investments...</div>
                ) : investments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No investments found. Create a draft to get started.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Security</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Holding Quantity</TableHead>
                        <TableHead>Weighted Avg Cost</TableHead>
                        <TableHead>Current Price</TableHead>
                        <TableHead className="text-right">Market Value</TableHead>
                        <TableHead className="text-right">Unrealized P&L</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.map((inv) => {
                        const qty = Number(inv.holdingQuantity || 0);
                        const costBasis = Number(inv.totalCostBasis || 0);
                        const avgCost = Number(inv.costBasisPerUnit || 0);
                        const currPrice = Number(inv.currentPricePerUnit || 0);
                        const mktVal = Number(inv.currentMarketValue || 0);
                        const unrealized = mktVal - costBasis;

                        return (
                          <TableRow key={inv.id}>
                            <TableCell>
                              <div className="font-bold text-sm">{inv.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {inv.symbol && (
                                  <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{inv.symbol}</span>
                                )}
                                <span className="text-[10px] text-muted-foreground uppercase">{inv.category} • {inv.type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  inv.status === "ACTIVE" ? "default" :
                                  inv.status === "DRAFT" ? "secondary" :
                                  inv.status === "CLOSED" ? "outline" : "destructive"
                                }
                                className="text-xs"
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{qty}</TableCell>
                            <TableCell className="text-xs font-mono">{formatINR(avgCost)}</TableCell>
                            <TableCell className="text-xs font-mono">{formatINR(currPrice)}</TableCell>
                            <TableCell className="text-right font-bold text-sm">{formatINR(mktVal)}</TableCell>
                            <TableCell className={`text-right font-bold text-xs ${unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {unrealized >= 0 ? "+" : ""}{formatINR(unrealized)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2"
                                  onClick={() => { setSelectedInvestment(inv); setActionType("BUY"); }}
                                >
                                  Buy
                                </Button>
                                {qty > 0 && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      onClick={() => { setSelectedInvestment(inv); setActionType("SELL"); }}
                                    >
                                      Sell
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      onClick={() => { setSelectedInvestment(inv); setActionType("DIVIDEND"); }}
                                    >
                                      Income
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      onClick={() => { setSelectedInvestment(inv); setActionType("REVALUE"); }}
                                    >
                                      Revalue
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Financial Events & Double-Entry Journals</CardTitle>
                <CardDescription>Complete audit record with journal linkage and compensating reversal capability</CardDescription>
              </CardHeader>
              <CardContent>
                {allEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No financial events recorded yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Investment</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Units</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Gain / Loss</TableHead>
                        <TableHead>Journal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allEvents.map((evt) => (
                        <TableRow key={evt.id} className={evt.isReversed ? "opacity-50 line-through" : ""}>
                          <TableCell className="text-xs">
                            {new Date(evt.effectiveDate || evt.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-xs font-semibold">{evt.investmentName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{evt.eventType}</Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">{evt.quantity ? Number(evt.quantity) : "—"}</TableCell>
                          <TableCell className="text-xs font-mono font-semibold">{formatINR(Number(evt.amount))}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {evt.realizedGainLoss ? (
                              <span className={Number(evt.realizedGainLoss) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {Number(evt.realizedGainLoss) >= 0 ? "+" : ""}{formatINR(Number(evt.realizedGainLoss))}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {evt.journalId ? evt.journalId.substring(0, 8) : "—"}
                          </TableCell>
                          <TableCell>
                            {evt.isReversed ? (
                              <Badge variant="destructive" className="text-[10px]">REVERSED</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">ACTIVE</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!evt.isReversed && !evt.reversalOfEventId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => handleReverseEvent(evt.investmentId, evt.id)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Reverse
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lots Tab */}
          <TabsContent value="lots">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tax Lots & Depletion Status</CardTitle>
                <CardDescription>Track purchase lots for audit trails and FIFO unit depletion</CardDescription>
              </CardHeader>
              <CardContent>
                {investments.flatMap((i) => i.lots || []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No tax lots found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Investment</TableHead>
                        <TableHead>Purchase Date</TableHead>
                        <TableHead>Original Qty</TableHead>
                        <TableHead>Remaining Qty</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.flatMap((inv) =>
                        (inv.lots || []).map((lot: any) => (
                          <TableRow key={lot.id}>
                            <TableCell className="text-xs font-semibold">{inv.name}</TableCell>
                            <TableCell className="text-xs">{new Date(lot.purchaseDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-xs font-mono">{Number(lot.originalQuantity)}</TableCell>
                            <TableCell className="text-xs font-mono font-semibold">{Number(lot.remainingQuantity)}</TableCell>
                            <TableCell className="text-xs font-mono">{formatINR(Number(lot.costPerUnit))}</TableCell>
                            <TableCell className="text-xs font-mono">{formatINR(Number(lot.totalCostBasis))}</TableCell>
                            <TableCell>
                              <Badge
                                variant={Number(lot.remainingQuantity) > 0 ? "default" : "outline"}
                                className="text-xs"
                              >
                                {Number(lot.remainingQuantity) > 0 ? "OPEN" : "DEPLETED"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Create Draft Investment */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogHeader>
            <DialogTitle>Create Investment Security Draft</DialogTitle>
            <DialogDescription>
              Create an investment holding record. No financial journal is posted until units are acquired via Buy.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDraft} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Security Name</label>
              <Input
                required
                placeholder="e.g. Mirae Asset Large Cap Fund"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Ticker Symbol (Optional)</label>
                <Input
                  placeholder="e.g. INFY or NIFTYBEES"
                  value={draftSymbol}
                  onChange={(e) => setDraftSymbol(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Category</label>
                <Select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
                  <option value="EQUITY">Equity</option>
                  <option value="MUTUAL_FUNDS">Mutual Funds</option>
                  <option value="FIXED_INCOME">Fixed Income</option>
                  <option value="COMMODITY">Commodity / Gold</option>
                  <option value="RETIREMENT">Retirement (EPF/PPF)</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Sub-Type</label>
                <Select value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                  <option value="STOCK">Stock</option>
                  <option value="MUTUAL_FUND">Mutual Fund</option>
                  <option value="ETF">ETF</option>
                  <option value="BOND">Bond</option>
                  <option value="GOLD">Gold</option>
                  <option value="FIXED_DEPOSIT">Fixed Deposit</option>
                  <option value="EPF_PPF">EPF / PPF</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Ledger Account (Optional)</label>
                <Select value={draftAccountId} onChange={(e) => setDraftAccountId(e.target.value)}>
                  <option value="">Auto-select / Default</option>
                  {accounts.filter((a) => a.type === "INVESTMENT" || a.type === "ASSET").map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Description</label>
              <Input
                placeholder="Investment thesis or notes"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create Draft</Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Action Dialog (Buy / Sell / Income / Fee / Revalue) */}
        <Dialog open={actionType !== null} onOpenChange={(open) => !open && setActionType(null)}>
          <DialogHeader>
            <DialogTitle>
              {actionType === "BUY" && `Acquire Units: ${selectedInvestment?.name}`}
              {actionType === "SELL" && `Disinvest / Sell: ${selectedInvestment?.name}`}
              {actionType === "DIVIDEND" && `Record Dividend: ${selectedInvestment?.name}`}
              {actionType === "INTEREST" && `Record Interest: ${selectedInvestment?.name}`}
              {actionType === "FEE" && `Record Brokerage / Fee: ${selectedInvestment?.name}`}
              {actionType === "REVALUE" && `Mark to Market: ${selectedInvestment?.name}`}
            </DialogTitle>
            <DialogDescription>
              {actionType === "BUY" && "Acquire lots and debit bank account via certified double-entry ledger."}
              {actionType === "SELL" && "Disinvest units using weighted-average cost basis and record realized gain/loss."}
              {actionType === "DIVIDEND" && "Record dividend yield without modifying investment cost basis."}
              {actionType === "INTEREST" && "Record interest payout without modifying investment cost basis."}
              {actionType === "FEE" && "Record management or maintenance fee."}
              {actionType === "REVALUE" && "Adjust current market valuation without affecting cost basis or realized gains."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleExecuteAction} className="space-y-4 pt-2">
            {(actionType === "BUY" || actionType === "SELL") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Quantity / Units</label>
                  <Input
                    required
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 10"
                    value={actionQuantity}
                    onChange={(e) => setActionQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Price Per Unit (₹)</label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    placeholder="e.g. 500"
                    value={actionPrice}
                    onChange={(e) => setActionPrice(e.target.value)}
                  />
                </div>
              </div>
            )}

            {(actionType === "DIVIDEND" || actionType === "INTEREST" || actionType === "FEE") && (
              <div>
                <label className="text-xs font-semibold mb-1 block">Amount (₹)</label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="e.g. 2500"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                />
              </div>
            )}

            {actionType === "REVALUE" && (
              <div>
                <label className="text-xs font-semibold mb-1 block">New Unit Price (₹)</label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="e.g. 620"
                  value={actionPrice}
                  onChange={(e) => setActionPrice(e.target.value)}
                />
              </div>
            )}

            {actionType !== "REVALUE" && (
              <div>
                <label className="text-xs font-semibold mb-1 block">
                  {actionType === "BUY" || actionType === "FEE" ? "Paying Bank Account *" : "Receiving Bank Account *"}
                </label>
                {accounts.filter((a) => a.type === "BANK" || a.type === "CASH").length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                    <p className="font-medium">No funding bank or cash account available.</p>
                    <p className="text-[11px] text-muted-foreground">
                      Create an account before recording this {actionType ? actionType.toLowerCase() : "investment"} transaction.
                    </p>
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
                  <Select value={actionAccountId} onChange={(e) => setActionAccountId(e.target.value)} required>
                    <option value="">Select Account</option>
                    {accounts.filter((a) => a.type === "BANK" || a.type === "CASH").map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name} (Balance: {formatINR(Number(acc.balance))})</option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Effective Date (Optional)</label>
                <Input
                  type="date"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Reference / Reason</label>
                <Input
                  placeholder="e.g. Regular SIP or Disinvestment"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setActionType(null)}>Cancel</Button>
              <Button type="submit">Confirm & Post to Ledger</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
