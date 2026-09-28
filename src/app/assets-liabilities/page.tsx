"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { store } from "@/lib/store";
import { Building2, Plus, ShieldCheck, Landmark } from "lucide-react";

export default function AssetsLiabilitiesPage() {
  const [assets, setAssets] = useState(store.assets);
  const [liabilities, setLiabilities] = useState(store.liabilities);

  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isAddLiabOpen, setIsAddLiabOpen] = useState(false);

  // Asset Form
  const [astName, setAstName] = useState("");
  const [astType, setAstType] = useState<"REAL_ESTATE" | "VEHICLE" | "GOLD" | "JEWELRY" | "ELECTRONICS" | "OTHER">("REAL_ESTATE");
  const [astValue, setAstValue] = useState("");

  // Liability Form
  const [liaName, setLiaName] = useState("");
  const [liaType, setLiaType] = useState<"MORTGAGE" | "PERSONAL_LOAN" | "CAR_LOAN" | "EDUCATION_LOAN" | "CREDIT_CARD_DEBT" | "OTHER">("MORTGAGE");
  const [liaAmount, setLiaAmount] = useState("");
  const [liaInterest, setLiaInterest] = useState("8.5");
  const [liaEmi, setLiaEmi] = useState("");

  const totalAssets = assets.reduce((acc, a) => acc + a.value, 0);
  const totalLiabilities = liabilities.reduce((acc, l) => acc + l.amount, 0);
  const netWorthBalance = totalAssets - totalLiabilities;

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(astValue);
    if (!astName || isNaN(val)) return;

    store.addAsset({
      householdId: store.household.id,
      name: astName,
      type: astType,
      value: val,
    });

    setAssets([...store.assets]);
    setIsAddAssetOpen(false);
    setAstName("");
    setAstValue("");
  };

  const handleAddLiability = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(liaAmount);
    if (!liaName || isNaN(amt)) return;

    store.addLiability({
      householdId: store.household.id,
      name: liaName,
      type: liaType,
      amount: amt,
      interestRate: parseFloat(liaInterest || "0"),
      monthlyPayment: parseFloat(liaEmi || "0"),
    });

    setLiabilities([...store.liabilities]);
    setIsAddLiabOpen(false);
    setLiaName("");
    setLiaAmount("");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets & Liabilities Balance Sheet</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Physical properties, vehicles, mortgage home loans, and debt obligations.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Physical Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatINR(totalAssets)}</div>
              <p className="text-xs text-muted-foreground mt-1">Real Estate & Vehicles Valuation</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-rose-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Debt Obligations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{formatINR(totalLiabilities)}</div>
              <p className="text-xs text-muted-foreground mt-1">Home Mortgage & Car Loans</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Net Equity Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatINR(netWorthBalance)}</div>
              <p className="text-xs text-muted-foreground mt-1">Assets minus Outstanding Debt</p>
            </CardContent>
          </Card>
        </div>

        {/* Assets & Liabilities Split Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Physical Assets Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Physical Assets</CardTitle>
                <CardDescription>Real Estate & Valuables</CardDescription>
              </div>
              <Button size="sm" onClick={() => setIsAddAssetOpen(true)} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Asset
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {assets.map((ast) => (
                <div key={ast.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-semibold text-sm">{ast.name}</p>
                    <p className="text-xs text-muted-foreground">{ast.type} • {ast.notes || "Valued 2026"}</p>
                  </div>
                  <span className="font-bold text-foreground text-sm">{formatINR(ast.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Liabilities Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Liabilities & Debt</CardTitle>
                <CardDescription>Mortgages, Loans & EMIs</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setIsAddLiabOpen(true)} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Liability
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {liabilities.map((lia) => (
                <div key={lia.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-semibold text-sm">{lia.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lia.type} • {lia.interestRate}% Interest {lia.monthlyPayment && `(EMI: ${formatINR(lia.monthlyPayment)})`}
                    </p>
                  </div>
                  <span className="font-bold text-rose-600 text-sm">{formatINR(lia.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Add Asset Dialog */}
        <Dialog open={isAddAssetOpen} onOpenChange={setIsAddAssetOpen}>
          <DialogHeader>
            <DialogTitle>Add Physical Asset</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAsset} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Asset Name</label>
              <Input required placeholder="e.g. 3BHK Apartment - Whitefield" value={astName} onChange={(e) => setAstName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Asset Type</label>
              <Select value={astType} onChange={(e) => setAstType(e.target.value as any)}>
                <option value="REAL_ESTATE">Real Estate Property</option>
                <option value="VEHICLE">Vehicle / SUV</option>
                <option value="GOLD">Physical Gold</option>
                <option value="JEWELRY">Jewelry</option>
                <option value="ELECTRONICS">High-Value Electronics</option>
                <option value="OTHER">Other Asset</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Estimated Value (INR ₹)</label>
              <Input required type="number" placeholder="9500000" value={astValue} onChange={(e) => setAstValue(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddAssetOpen(false)}>Cancel</Button>
              <Button type="submit">Save Asset</Button>
            </div>
          </form>
        </Dialog>

        {/* Add Liability Dialog */}
        <Dialog open={isAddLiabOpen} onOpenChange={setIsAddLiabOpen}>
          <DialogHeader>
            <DialogTitle>Add Debt Liability</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLiability} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Liability Name</label>
              <Input required placeholder="e.g. HDFC Home Loan Mortgage" value={liaName} onChange={(e) => setLiaName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Liability Type</label>
              <Select value={liaType} onChange={(e) => setLiaType(e.target.value as any)}>
                <option value="MORTGAGE">Home Mortgage Loan</option>
                <option value="CAR_LOAN">Car Loan</option>
                <option value="PERSONAL_LOAN">Personal Loan</option>
                <option value="EDUCATION_LOAN">Education Loan</option>
                <option value="CREDIT_CARD_DEBT">Credit Card Outstanding</option>
                <option value="OTHER">Other Liability</option>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Outstanding Balance (INR ₹)</label>
                <Input required type="number" placeholder="4200000" value={liaAmount} onChange={(e) => setLiaAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Interest Rate (% p.a.)</label>
                <Input type="number" step="0.1" value={liaInterest} onChange={(e) => setLiaInterest(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Monthly EMI (INR ₹)</label>
                <Input type="number" placeholder="48500" value={liaEmi} onChange={(e) => setLiaEmi(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddLiabOpen(false)}>Cancel</Button>
              <Button type="submit">Save Liability</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
