"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { store } from "@/lib/store";
import { LineChart as LineChartIcon, Plus, ArrowUpRight, TrendingUp } from "lucide-react";

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState(store.investments);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState<"STOCK" | "MUTUAL_FUND" | "FIXED_DEPOSIT" | "GOLD" | "EPF_PPF" | "OTHER">("MUTUAL_FUND");
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");

  const totalInvested = investments.reduce((acc, i) => acc + i.quantity * i.purchasePrice, 0);
  const totalCurrentValue = investments.reduce((acc, i) => acc + i.quantity * i.currentPrice, 0);
  const totalProfitLoss = totalCurrentValue - totalInvested;
  const returnPercentage = totalInvested > 0 ? Math.round((totalProfitLoss / totalInvested) * 100) : 0;

  const handleAddInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    const pPrice = parseFloat(purchasePrice);
    const cPrice = parseFloat(currentPrice || purchasePrice);
    if (!name || isNaN(qty) || isNaN(pPrice)) return;

    store.addInvestment({
      householdId: store.household.id,
      name,
      symbol,
      type,
      quantity: qty,
      purchasePrice: pPrice,
      currentPrice: cPrice,
      lastUpdated: new Date().toISOString(),
    });

    setInvestments([...store.investments]);
    setIsAddOpen(false);
    setName("");
    setSymbol("");
    setPurchasePrice("");
    setCurrentPrice("");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Investment Portfolio</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Mutual funds SIPs, Indian equities, Sovereign Gold Bonds, and Fixed Deposits.
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" /> Add Holding
          </Button>
        </div>

        {/* Portfolio Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Current Portfolio Valuation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatINR(totalCurrentValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Invested Capital: {formatINR(totalInvested)}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Unrealized Gains</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">+{formatINR(totalProfitLoss)}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                <ArrowUpRight className="h-4 w-4" /> +{returnPercentage}% CAGR Return
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Active Asset Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{investments.length} Holdings</div>
              <p className="text-xs text-muted-foreground mt-1">Direct Growth & Equity Allocation</p>
            </CardContent>
          </Card>
        </div>

        {/* Investments Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Holdings Detail Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Quantity / Units</TableHead>
                  <TableHead>Avg Buy Price</TableHead>
                  <TableHead>Current Market Price</TableHead>
                  <TableHead className="text-right">Current Value</TableHead>
                  <TableHead className="text-right">Profit / Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investments.map((inv) => {
                  const val = inv.quantity * inv.currentPrice;
                  const cost = inv.quantity * inv.purchasePrice;
                  const pl = val - cost;

                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="font-bold text-sm">{inv.name}</div>
                        {inv.symbol && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{inv.symbol}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{inv.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{inv.quantity}</TableCell>
                      <TableCell className="text-xs">{formatINR(inv.purchasePrice)}</TableCell>
                      <TableCell className="text-xs">{formatINR(inv.currentPrice)}</TableCell>
                      <TableCell className="text-right font-bold text-sm">{formatINR(val)}</TableCell>
                      <TableCell className="text-right font-bold text-xs text-emerald-600">
                        +{formatINR(pl)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Holding Modal */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogHeader>
            <DialogTitle>Add Investment Holding</DialogTitle>
            <DialogDescription>Record mutual fund, stock, FD or Gold holding.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddInvestment} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Security Name</label>
              <Input required placeholder="e.g. Parag Parikh Flexi Cap Fund" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Ticker Symbol (Optional)</label>
                <Input placeholder="PPFCF.BO" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Asset Type</label>
                <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="MUTUAL_FUND">Mutual Fund</option>
                  <option value="STOCK">Equity Stock</option>
                  <option value="GOLD">Sovereign Gold Bond</option>
                  <option value="FIXED_DEPOSIT">Fixed Deposit</option>
                  <option value="EPF_PPF">EPF / PPF</option>
                  <option value="OTHER">Other Investment</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Quantity / Units</label>
                <Input required type="number" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Avg Buy Price (INR ₹)</label>
                <Input required type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Current Price (INR ₹)</label>
                <Input type="number" step="0.01" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit">Save Holding</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
