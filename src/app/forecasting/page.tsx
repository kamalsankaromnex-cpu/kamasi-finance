"use client";

import { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { runForecastSimulation, ForecastMilestoneItem } from "@/lib/forecasting";
import {
  CalendarCheck,
  TrendingUp,
  Sliders,
  Flag,
  Sparkles,
  Award,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

export default function ForecastingPage() {
  // Scenario Parameters
  const [inflationRate, setInflationRate] = useState<number>(6.0);
  const [salaryGrowthRate, setSalaryGrowthRate] = useState<number>(8.0);
  const [investmentReturnRate, setInvestmentReturnRate] = useState<number>(11.0);
  const [retirementAge, setRetirementAge] = useState<number>(55);

  // Milestones & Financial Context State
  const [milestones, setMilestones] = useState<ForecastMilestoneItem[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [liabilities, setLiabilities] = useState<any[]>([]);

  // Modal State for New Milestone
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mYear, setMYear] = useState(2030);
  const [mCost, setMCost] = useState(1000000);
  const [mType, setMType] = useState<"EXPENSE" | "INCOME_BOOST" | "RETIREMENT">("EXPENSE");

  useEffect(() => {
    async function loadData() {
      try {
        const [scRes, accRes, astRes, liaRes] = await Promise.all([
          fetch("/api/forecasting"),
          fetch("/api/accounts"),
          fetch("/api/assets"),
          fetch("/api/liabilities"),
        ]);
        if (scRes.ok) {
          const sc = await scRes.json();
          if (sc?.milestones) setMilestones(sc.milestones);
        }
        if (accRes.ok) {
          const accData = await accRes.json();
          setAccounts(Array.isArray(accData) ? accData : accData?.accounts || []);
        }
        if (astRes.ok) {
          const astData = await astRes.json();
          setAssets(Array.isArray(astData) ? astData : astData?.assets || []);
        }
        if (liaRes.ok) {
          const liaData = await liaRes.json();
          setLiabilities(Array.isArray(liaData) ? liaData : liaData?.liabilities || []);
        }
      } catch (err) {
        console.error("Failed to load forecasting data:", err);
      }
    }
    loadData();
  }, []);

  // Calculate dynamic baseline from current ledger safely with Array.isArray guards
  const safeAssets = Array.isArray(assets) ? assets : [];
  const safeLiabilities = Array.isArray(liabilities) ? liabilities : [];
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const totalPhysicalAssetsValue = safeAssets.reduce(
    (acc, a) => acc + Number(a.currentValue ?? a.value ?? a.initialValue ?? 0),
    0
  );
  const totalLiabilitiesValue = safeLiabilities.reduce(
    (acc, l) => acc + Number(l.outstandingAmount ?? l.amount ?? l.principalAmount ?? 0),
    0
  );
  const totalLiquidInvestments = safeAccounts.reduce(
    (acc, a) => acc + Math.max(0, Number(a.balance || 0)),
    0
  );

  // Run simulation engine
  const simulationResult = useMemo(() => {
    const res = runForecastSimulation({
      startYear: 2026,
      endYear: 2050,
      initialLiquidInvestments: totalLiquidInvestments > 0 ? totalLiquidInvestments : 1500000,
      initialPhysicalAssets: totalPhysicalAssetsValue > 0 ? totalPhysicalAssetsValue : 8500000,
      initialLiabilities: totalLiabilitiesValue,
      initialAnnualIncome: 150000 * 12,
      initialAnnualExpenses: 75000 * 12,
      inflationRate,
      salaryGrowthRate,
      investmentReturnRate,
      retirementAge,
      milestones,
    });
    const fiYear = res.financialIndependenceYear || 2036;
    const fiYearResult = res.years.find((y) => y.year === fiYear);
    return {
      ...res,
      fiYear,
      fiAge: fiYearResult ? fiYearResult.age : 46,
      fiCorpusTarget: fiYearResult ? fiYearResult.liquidInvestments : 50000000,
      series: res.years.map((y) => ({
        year: y.year,
        netWorth: y.endNetWorth,
        liquidWealth: y.liquidInvestments,
      })),
    };
  }, [
    totalLiquidInvestments,
    totalPhysicalAssetsValue,
    totalLiabilitiesValue,
    inflationRate,
    salaryGrowthRate,
    investmentReturnRate,
    retirementAge,
    milestones,
  ]);

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName) return;

    try {
      const res = await fetch("/api/forecasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mName,
          targetYear: mYear,
          estimatedCost: mCost,
          type: mType,
        }),
      });
      if (res.ok) {
        const newM = await res.json();
        setMilestones([...milestones, newM]);
      } else {
        const newM: ForecastMilestoneItem = {
          id: `m-${Date.now()}`,
          name: mName,
          targetYear: mYear,
          estimatedCost: mCost,
          type: mType,
        };
        setMilestones([...milestones, newM]);
      }
    } catch {
      const newM: ForecastMilestoneItem = {
        id: `m-${Date.now()}`,
        name: mName,
        targetYear: mYear,
        estimatedCost: mCost,
        type: mType,
      };
      setMilestones([...milestones, newM]);
    }

    setIsMilestoneOpen(false);
    setMName("");
    setMCost(1000000);
  };

  const handleDeleteMilestone = (id: string) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Independence & Wealth Forecasting</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monte Carlo style compounding projections (2026–2050) incorporating inflation and milestones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setInflationRate(6.0);
              setSalaryGrowthRate(8.0);
              setInvestmentReturnRate(11.0);
            }} className="gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Reset Assumptions
            </Button>
            <Button size="sm" onClick={() => setIsMilestoneOpen(true)} className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Life Milestone
            </Button>
          </div>
        </div>

        {/* Dynamic Baseline Summary */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Liquid Wealth Baseline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-foreground">{formatINR(totalLiquidInvestments)}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bank & Investment Accounts</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Physical Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-foreground">{formatINR(totalPhysicalAssetsValue)}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Real Estate & Vehicles</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-rose-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Outstanding Liabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-rose-600">{formatINR(totalLiabilitiesValue)}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Mortgage & Loan Obligations</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary bg-primary/5">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-primary uppercase">Estimated FI Year (FIRE)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-primary">
                {simulationResult.fiYear || "2036"} (Age {simulationResult.fiAge || 46})
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Target Corpus: {formatINR(simulationResult.fiCorpusTarget)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart & Parameters Control Split */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Projection Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Projected Net Worth Trajectory (2026–2050)
                </CardTitle>
                <CardDescription>Visualizing Net Worth vs Liquid Wealth vs Inflation Cost</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">11% p.a. CAGR</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={simulationResult.series} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="year" stroke="#888888" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                    />
                    <Tooltip
                      formatter={(v: any) => [formatINR(Number(v)), ""]}
                      labelFormatter={(l) => `Year ${l}`}
                    />
                    <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                    <ReferenceLine x={simulationResult.fiYear} stroke="#10b981" strokeDasharray="3 3" label={{ value: "FI Target Met", fill: "#10b981", fontSize: 10, position: "top" }} />
                    <Area type="monotone" dataKey="netWorth" name="Total Net Worth" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#netWorthGrad)" />
                    <Area type="monotone" dataKey="liquidWealth" name="Liquid Corpus" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#liquidGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Parameters Sliders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Economic Drivers
              </CardTitle>
              <CardDescription>Adjust inflation, expected salary increments, and investment returns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Inflation Rate (CPI)</span>
                  <span className="text-rose-600 font-mono">{inflationRate}% p.a.</span>
                </div>
                <Input type="range" min="3" max="12" step="0.5" value={inflationRate} onChange={(e) => setInflationRate(parseFloat(e.target.value))} />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Salary Increment (% p.a.)</span>
                  <span className="text-emerald-600 font-mono">{salaryGrowthRate}% p.a.</span>
                </div>
                <Input type="range" min="0" max="20" step="0.5" value={salaryGrowthRate} onChange={(e) => setSalaryGrowthRate(parseFloat(e.target.value))} />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Investment CAGR (Equity/MF)</span>
                  <span className="text-cyan-600 font-mono">{investmentReturnRate}% p.a.</span>
                </div>
                <Input type="range" min="5" max="18" step="0.5" value={investmentReturnRate} onChange={(e) => setInvestmentReturnRate(parseFloat(e.target.value))} />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Planned Retirement Age</span>
                  <span className="text-primary font-mono">{retirementAge} Years</span>
                </div>
                <Input type="range" min="40" max="65" step="1" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value))} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Milestones Schedule Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Flag className="h-4 w-4 text-amber-500" /> Life Milestones & Outflow Events
              </CardTitle>
              <CardDescription>Custom large expenses such as buying a house, marriage, or education</CardDescription>
            </div>
            <Button size="sm" onClick={() => setIsMilestoneOpen(true)} className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Event
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Title</TableHead>
                  <TableHead>Target Year</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Estimated Outflow (Today&apos;s Value)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-bold text-sm">{m.name}</TableCell>
                    <TableCell className="text-xs font-mono">{m.targetYear}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm text-rose-600">
                      {formatINR(m.estimatedCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => m.id && handleDeleteMilestone(m.id)} className="h-7 w-7 p-0 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Life Milestone Modal */}
        <Dialog open={isMilestoneOpen} onOpenChange={setIsMilestoneOpen}>
          <DialogHeader>
            <DialogTitle>Add Future Life Milestone</DialogTitle>
            <DialogDescription>Model house purchase, higher education, or sabbatical outflow.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMilestone} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Milestone Name</label>
              <Input required placeholder="e.g. Higher Education Downpayment" value={mName} onChange={(e) => setMName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Target Year</label>
                <Input required type="number" min="2026" max="2050" value={mYear} onChange={(e) => setMYear(parseInt(e.target.value))} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Cost in Today&apos;s ₹</label>
                <Input required type="number" step="50000" value={mCost} onChange={(e) => setMCost(parseFloat(e.target.value))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsMilestoneOpen(false)}>Cancel</Button>
              <Button type="submit">Save Milestone</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
