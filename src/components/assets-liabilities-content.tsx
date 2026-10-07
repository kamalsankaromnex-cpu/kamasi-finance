"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { LoanFdCalculator } from "@/components/financial/loan-fd-calculator";
import { Plus, Building, CreditCard } from "lucide-react";
import { FinancialBadge } from "@/components/ui/financial-badge";
import { EmptyState } from "@/components/ui/empty-state";

export function AssetsLiabilitiesContent({ initialTab = "assets" }: { initialTab?: "assets" | "liabilities" }) {
  const [activeTab, setActiveTab] = useState<"assets" | "liabilities">(initialTab);
  const [assets, setAssets] = useState<any[]>([]);
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [astRes, liaRes] = await Promise.all([
        fetch("/api/assets"),
        fetch("/api/liabilities"),
      ]);
      if (astRes.ok) {
        const astData = await astRes.json();
        if (!Array.isArray(astData) && !Array.isArray(astData?.assets)) {
          console.warn("Unexpected assets API response format:", astData);
        }
        setAssets(Array.isArray(astData) ? astData : astData?.assets || []);
      }
      if (liaRes.ok) {
        const liaData = await liaRes.json();
        if (!Array.isArray(liaData) && !Array.isArray(liaData?.liabilities)) {
          console.warn("Unexpected liabilities API response format:", liaData);
        }
        setLiabilities(Array.isArray(liaData) ? liaData : liaData?.liabilities || []);
      }
    } catch (err) {
      console.error("Failed to load assets & liabilities:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!astName || !astValue) return;
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: astName,
          type: astType,
          initialValue: parseFloat(astValue),
        }),
      });
      if (res.ok) {
        setIsAddAssetOpen(false);
        setAstName("");
        setAstValue("");
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to create asset:", err);
    }
  };

  const handleAddLiability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liaName || !liaAmount) return;
    try {
      const res = await fetch("/api/liabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: liaName,
          type: liaType,
          principalAmount: parseFloat(liaAmount),
          interestRate: parseFloat(liaInterest) || 0,
        }),
      });
      if (res.ok) {
        setIsAddLiabOpen(false);
        setLiaName("");
        setLiaAmount("");
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to create liability:", err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Assets & Liabilities</h1>
              <FinancialBadge state="ACTUAL" />
            </div>
            <p className="text-sm text-muted-foreground">
              Track physical wealth (property, vehicles, gold) and loan obligations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsAddAssetOpen(true)} size="sm" variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              <span>Add Asset</span>
            </Button>
            <Button onClick={() => setIsAddLiabOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <span>Add Liability</span>
            </Button>
          </div>
        </div>

        {/* Custom Tab Switcher */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("assets")}
            className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "assets"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Assets ({assets.length})
          </button>
          <button
            onClick={() => setActiveTab("liabilities")}
            className={`pb-2 px-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "liabilities"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Liabilities & Loans ({liabilities.length})
          </button>
        </div>

        {activeTab === "assets" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Physical & Fixed Assets</CardTitle>
              <CardDescription>Property, vehicles, land, gold, and valuable equipment</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-32 animate-pulse bg-muted rounded-lg" />
              ) : assets.length === 0 ? (
                <EmptyState
                  icon={Building}
                  title="No Assets Tracked"
                  description="Start tracking physical assets to compute your total household net worth."
                  actionLabel="Add Asset"
                  onAction={() => setIsAddAssetOpen(true)}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => (
                    <Card key={asset.id} className="p-4 border shadow-2xs space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">{asset.name}</span>
                        <FinancialBadge state="ACTUAL" />
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{((asset.type || asset.category || "ASSET") as string).replace(/_/g, " ")}</p>
                      <div className="pt-2 border-t flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Current Value</span>
                        <span className="text-base font-bold text-emerald-600">{formatINR(Number(asset.currentValue || asset.initialValue || 0))}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loans & Liabilities</CardTitle>
              <CardDescription>Mortgages, car loans, credit debt, and personal liabilities</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-32 animate-pulse bg-muted rounded-lg" />
              ) : liabilities.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title="No Liabilities Tracked"
                  description="Track loan balances, EMIs, and interest rates for settlement planning."
                  actionLabel="Add Liability"
                  onAction={() => setIsAddLiabOpen(true)}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {liabilities.map((liab) => (
                    <Card key={liab.id} className="p-4 border shadow-2xs space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">{liab.name}</span>
                        <FinancialBadge state="ACTUAL" />
                      </div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{((liab.type || liab.category || "LIABILITY") as string).replace(/_/g, " ")}</p>
                      <div className="pt-2 border-t space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Outstanding</span>
                          <span className="font-bold text-rose-600">{formatINR(Number(liab.outstandingAmount || liab.principalAmount || 0))}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Interest Rate</span>
                          <span>{Number(liab.interestRate || 0)}% p.a.</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Modal Dialogs */}
        <Dialog open={isAddAssetOpen} onOpenChange={setIsAddAssetOpen}>
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
            <DialogDescription>Track a physical asset.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAsset} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Asset Name</label>
              <Input placeholder="e.g. Apartment in Bangalore" value={astName} onChange={(e) => setAstName(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Value (₹)</label>
              <Input type="number" placeholder="e.g. 7500000" value={astValue} onChange={(e) => setAstValue(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddAssetOpen(false)}>Cancel</Button>
              <Button type="submit">Save Asset</Button>
            </div>
          </form>
        </Dialog>

        <Dialog open={isAddLiabOpen} onOpenChange={setIsAddLiabOpen}>
          <DialogHeader>
            <DialogTitle>Add Liability</DialogTitle>
            <DialogDescription>Track a loan or mortgage obligation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddLiability} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Liability Name</label>
              <Input placeholder="e.g. HDFC Home Loan" value={liaName} onChange={(e) => setLiaName(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Principal Amount (₹)</label>
              <Input type="number" placeholder="e.g. 2500000" value={liaAmount} onChange={(e) => setLiaAmount(e.target.value)} required />
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
