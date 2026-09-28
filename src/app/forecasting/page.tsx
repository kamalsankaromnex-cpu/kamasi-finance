"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { runForecastSimulation, ForecastMilestoneItem } from "@/lib/forecasting";
import { store } from "@/lib/store";
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

  // Milestones State
  const [milestones, setMilestones] = useState<ForecastMilestoneItem[]>(
    store.forecastScenario.milestones as ForecastMilestoneItem[]
  );

  // Modal State for New Milestone
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mYear, setMYear] = useState(2030);
  const [mCost, setMCost] = useState(1000000);
  const [mType, setMType] = useState<"EXPENSE" | "INCOME_BOOST" | "RETIREMENT">("EXPENSE");

  // Calculate dynamic baseline from current ledger
  const totalPhysicalAssetsValue = store.assets.reduce((acc, a) => acc + a.value, 0);
  const totalLiabilitiesValue = store.liabilities.reduce((acc, l) => acc + l.amount, 0);
  const totalLiquidInvestments = store.accounts.reduce((acc, a) => acc + Math.max(0, a.balance), 0);

  // Run simulation engine
  const simulationResult = useMemo(() => {
    return runForecastSimulation({
      startYear: 2026,
      endYear: 2050,
      initialLiquidInvestments: totalLiquidInvestments,
      initialPhysicalAssets: totalPhysicalAssetsValue,
      initialLiabilities: totalLiabilitiesValue,
      realEstateAppreciationRate: 5.0,
      initialAnnualIncome: 3900000, // ₹3.25L x 12
      initialAnnualExpenses: 894000,  // ₹74.5k x 12
      inflationRate,
      salaryGrowthRate,
      investmentReturnRate,
      retirementAge,
      currentAge: 32,
      milestones,
    });
  }, [inflationRate, salaryGrowthRate, investmentReturnRate, retirementAge, milestones, totalLiquidInvestments, totalPhysicalAssetsValue, totalLiabilitiesValue]);

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName) return;
    const newM: ForecastMilestoneItem = {
      id: `m-${Date.now()}`,
      name: mName,
      targetYear: Number(mYear),
      estimatedCost: Number(mCost),
      type: mType,
    };
    setMilestones([...milestones, newM]);
    setIsMilestoneOpen(false);
    setMName("");
  };

  const handleDeleteMilestone = (id?: string) => {
    if (!id) return;
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Long-Term Forecast Engine</h1>
              <Badge className="bg-primary/10 text-primary border-primary/20">2026–2050 Simulation</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Projected 25-year financial trajectory separated from actual verified historical ledger.
            </p>
          </div>
          <Button className="gap-2 font-semibold" onClick={() => setIsMilestoneOpen(true)}>
            <Plus className="h-4 w-4" /> Add Life Milestone Event
          </Button>
        </div>

        {/* 3 Executive Forecast Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                Projected 2050 Net Worth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatINR(simulationResult.terminalNetWorth2050)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Compound Growth at 2050 Terminal Horizon</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                Financial Independence (FI) Year
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {simulationResult.financialIndependenceYear || "2038"}
                </span>
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              <p className="text-xs text-emerald-600 font-semibold mt-1">Passive Returns Exceed Annual Expenses</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                Planned Milestone Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{milestones.length} Events</div>
              <p className="text-xs text-muted-foreground mt-1">Includes Villa Down Payment & Higher Education</p>
            </CardContent>
          </Card>
        </div>

        {/* Simulation Parameter Controls */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Simulation Parameters & Economic Assumptions</CardTitle>
            </div>
            <CardDescription>Adjust inflation, expected salary increments, and investment returns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Inflation Rate (% p.a.)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={inflationRate}
                  onChange={(e) => setInflationRate(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Salary Increment (% p.a.)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={salaryGrowthRate}
                  onChange={(e) => setSalaryGrowthRate(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Investment CAGR Return (% p.a.)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={investmentReturnRate}
                  onChange={(e) => setInvestmentReturnRate(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Retirement Age Target
                </label>
                <Input
                  type="number"
                  value={retirementAge}
                  onChange={(e) => setRetirementAge(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2026-2050 Visualizer Recharts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Projected Net Worth Trajectory (2026 – 2050)</CardTitle>
            <CardDescription>Compound growth curve accounting for inflation & major life milestones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simulationResult.years} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="year" stroke="#888888" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatINR(Number(value || 0)), "Net Worth"]}
                    labelFormatter={(label) => `Year ${label}`}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="endNetWorth"
                    name="Projected Net Worth"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#netWorthGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Life Milestones Manager & Timeline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Major Life Event Milestones</CardTitle>
              <CardDescription>Scheduled capital expenses or income boosts affecting cash flow</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setIsMilestoneOpen(true)} className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Milestone
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {milestones.map((m) => (
                <div key={m.id || m.name} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 font-bold text-xs">
                      {m.targetYear}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{m.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {m.type}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-sm">{formatINR(m.estimatedCost)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500 hover:text-rose-700"
                      onClick={() => handleDeleteMilestone(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Year-by-Year Simulation Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detailed Annual Projection Schedule (2026 – 2050)</CardTitle>
            <CardDescription>Yearly breakdown of income, expenses, net cashflow, and end net worth</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Projected Income</TableHead>
                  <TableHead>Projected Expenses</TableHead>
                  <TableHead>Milestones</TableHead>
                  <TableHead>Inv. Returns (11%)</TableHead>
                  <TableHead className="text-right">Ending Net Worth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulationResult.years.map((row) => (
                  <TableRow key={row.year} className={row.isRetired ? "bg-amber-500/5" : ""}>
                    <TableCell className="font-bold">{row.year}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.age} yrs</TableCell>
                    <TableCell className="text-xs text-emerald-600 font-semibold">{formatINR(row.projectedIncome)}</TableCell>
                    <TableCell className="text-xs text-rose-600 font-semibold">{formatINR(row.projectedExpenses)}</TableCell>
                    <TableCell className="text-xs">
                      {row.milestoneExpenses > 0 ? (
                        <span className="text-rose-600 font-bold">-{formatINR(row.milestoneExpenses)}</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-cyan-600 font-semibold">{formatINR(row.investmentReturns)}</TableCell>
                    <TableCell className="text-right font-bold text-sm text-foreground">
                      {formatINR(row.endNetWorth)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Milestone Dialog */}
        <Dialog open={isMilestoneOpen} onOpenChange={setIsMilestoneOpen}>
          <DialogHeader>
            <DialogTitle>Add Life Milestone Event</DialogTitle>
            <DialogDescription>Define a major event between 2026 and 2050.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMilestone} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Milestone Name</label>
              <Input
                required
                placeholder="e.g. Higher Education Reserve"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Target Year</label>
                <Input
                  required
                  type="number"
                  min="2026"
                  max="2050"
                  value={mYear}
                  onChange={(e) => setMYear(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Estimated Cost (INR ₹)</label>
                <Input
                  required
                  type="number"
                  value={mCost}
                  onChange={(e) => setMCost(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsMilestoneOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Event</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
