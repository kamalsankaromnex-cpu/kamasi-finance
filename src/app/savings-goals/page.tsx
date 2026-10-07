"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR } from "@/lib/currency";
import { Plus, PiggyBank, ArrowDownRight, PauseCircle, PlayCircle, CheckCircle2, Archive, Trash2, Calculator, ChevronDown, ChevronUp, Sparkles, AlertCircle, CheckCircle, TrendingUp, Calendar, CreditCard, Bot, RefreshCw, Layers } from "lucide-react";

export default function SavingsGoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [activeGoalId, setActiveGoalId] = useState<string>("");
  const [expandedFundingId, setExpandedFundingId] = useState<string | null>(null);

  // Add Goal Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetDate, setTargetDate] = useState("2028-12-31");
  const [category, setCategory] = useState("Safety Net");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [deadlineFlexibility, setDeadlineFlexibility] = useState<"STRICT" | "MODERATE" | "FLEXIBLE">("MODERATE");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);

  // Goal Funding v2 Planner States
  const [plannerData, setPlannerData] = useState<Record<string, any>>({});
  const [loadingPlanner, setLoadingPlanner] = useState<Record<string, boolean>>({});
  const [approvingPlan, setApprovingPlan] = useState<Record<string, boolean>>({});
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});

  // Inline simulation state
  const [simContributions, setSimContributions] = useState<Record<string, number>>({});

  // Deposit/Withdraw Form State
  const [amountInput, setAmountInput] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const fetchGoals = async () => {
    try {
      const res = await fetch("/api/goals");
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      } else {
        setGoals([]);
      }
    } catch {
      setGoals([]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      } else {
        setAccounts([]);
      }
    } catch {
      setAccounts([]);
    }
  };

  useEffect(() => {
    fetchGoals();
    fetchAccounts();
  }, []);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const tAmt = parseFloat(targetAmount);
    const cAmt = parseFloat(currentAmount || "0");
    const mCont = parseFloat(monthlyContribution || "0");
    if (!name || isNaN(tAmt)) return;

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          notes,
          targetAmount: tAmt,
          currentAmount: cAmt,
          monthlyContribution: isNaN(mCont) ? 0 : mCont,
          targetDate,
          category,
          priority,
          deadlineFlexibility,
        }),
      });

      if (res.ok) {
        await fetchGoals();
      }
    } catch (err) {
      console.error("Failed to add goal:", err);
    }

    setIsAddOpen(false);
    setName("");
    setDescription("");
    setNotes("");
    setTargetAmount("");
    setCurrentAmount("");
    setMonthlyContribution("");
  };

  const handleParseAiPrompt = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiParsing(true);
    try {
      const res = await fetch("/api/goals/parse-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (res.ok) {
        const { draft } = await res.json();
        if (draft) {
          if (draft.name) setName(draft.name);
          if (draft.targetAmount) setTargetAmount(String(draft.targetAmount));
          if (draft.monthlyContribution) setMonthlyContribution(String(draft.monthlyContribution));
          if (draft.targetDate) setTargetDate(draft.targetDate);
          if (draft.priority) setPriority(draft.priority);
          if (draft.deadlineFlexibility) setDeadlineFlexibility(draft.deadlineFlexibility);
          if (draft.notes) setNotes(draft.notes);
        }
      }
    } catch (e) {
      console.error("AI parse failed", e);
    } finally {
      setIsAiParsing(false);
    }
  };

  const fetchPlannerData = async (goalId: string) => {
    setLoadingPlanner((prev) => ({ ...prev, [goalId]: true }));
    try {
      const res = await fetch(`/api/goals/${goalId}/plan`);
      if (res.ok) {
        const data = await res.json();
        setPlannerData((prev) => ({ ...prev, [goalId]: data }));
      }
    } catch (e) {
      console.error("Failed to load planner data", e);
    } finally {
      setLoadingPlanner((prev) => ({ ...prev, [goalId]: false }));
    }
  };

  const handleApprovePlan = async (goalId: string, planId: string) => {
    setApprovingPlan((prev) => ({ ...prev, [goalId]: true }));
    try {
      const res = await fetch(`/api/goals/${goalId}/plan/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, reason: "Approved via Goal Funding Planner UI" }),
      });
      if (res.ok) {
        await fetchGoals();
        await fetchPlannerData(goalId);
      }
    } catch (e) {
      console.error("Failed to approve plan", e);
    } finally {
      setApprovingPlan((prev) => ({ ...prev, [goalId]: false }));
    }
  };

  // Goal Funding calculation helper
  const calculateFunding = (goal: any) => {
    const target = Number(goal.targetAmount) || 0;
    const current = Number(goal.currentAmount) || 0;
    const monthly = simContributions[goal.id] !== undefined
      ? simContributions[goal.id]
      : (Number(goal.monthlyContribution) || 0);

    const now = new Date();
    const tgt = new Date(goal.targetDate);
    const diffMonths = (tgt.getFullYear() - now.getFullYear()) * 12 + (tgt.getMonth() - now.getMonth());
    const monthsRemaining = Math.max(1, diffMonths);

    const initialGap = Math.max(0, target - current);
    const projectedOwnFunding = current + (monthly * monthsRemaining);
    const projectedGap = Math.max(0, target - projectedOwnFunding);
    const projectedSurplus = Math.max(0, projectedOwnFunding - target);
    const isAchievable = projectedOwnFunding >= target;

    const additionalMonthlySaving = !isAchievable ? Math.ceil(projectedGap / monthsRemaining) : 0;
    const totalMonthlySavingNeeded = monthly + additionalMonthlySaving;

    let monthsToExtend: number | null = null;
    let projectedTargetDate: string | null = null;
    if (!isAchievable && monthly > 0) {
      monthsToExtend = Math.ceil(projectedGap / monthly);
      const ext = new Date(tgt);
      ext.setMonth(ext.getMonth() + monthsToExtend);
      projectedTargetDate = ext.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    }

    return {
      target,
      current,
      monthly,
      monthsRemaining,
      initialGap,
      projectedOwnFunding,
      projectedGap,
      projectedSurplus,
      isAchievable,
      additionalMonthlySaving,
      totalMonthlySavingNeeded,
      monthsToExtend,
      projectedTargetDate,
    };
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dep = parseFloat(amountInput);
    if (isNaN(dep) || dep <= 0 || !activeGoalId) return;

    try {
      const res = await fetch(`/api/goals/${activeGoalId}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          amount: dep,
          accountId: selectedAccountId,
        }),
      });

      if (res.ok) {
        await fetchGoals();
        await fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.error || "Deposit failed");
      }
    } catch (error) {
      console.error(error);
    }

    setIsDepositOpen(false);
    setAmountInput("");
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(amountInput);
    if (isNaN(w) || w <= 0 || !activeGoalId) return;

    try {
      const res = await fetch(`/api/goals/${activeGoalId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          amount: w,
          accountId: selectedAccountId,
        }),
      });

      if (res.ok) {
        await fetchGoals();
        await fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.error || "Withdrawal failed");
      }
    } catch (error) {
      console.error(error);
    }

    setIsWithdrawOpen(false);
    setAmountInput("");
  };

  const handleStatusChange = async (goalId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchGoals();
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const handleDeleteOrArchive = async (goalId: string) => {
    if (!confirm("Are you sure you want to delete or archive this savings goal?")) return;
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (res.ok) await fetchGoals();
    } catch (error) {
      console.error("Failed to delete goal", error);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Family Savings Goals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Emergency funds, house down payments, travel reserves, and wealth targets.
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" /> Create Goal
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const current = typeof goal.currentAmount === "number" ? goal.currentAmount : Number(goal.currentAmount);
            const target = typeof goal.targetAmount === "number" ? goal.targetAmount : Number(goal.targetAmount);
            const pct = Math.min(100, Math.round((current / target) * 100));
            const status = goal.status || "ACTIVE";

            return (
              <Card key={goal.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">{goal.category || "General"}</Badge>
                      <Badge
                        variant={
                          status === "ACTIVE" ? "default" : status === "PAUSED" ? "warning" : status === "COMPLETED" ? "success" : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {status}
                      </Badge>
                    </div>
                    <Badge variant={goal.priority === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">
                      {goal.priority}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{goal.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{goal.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span>{formatINR(current)} saved</span>
                      <span className="text-muted-foreground">Target: {formatINR(target)}</span>
                    </div>
                    <Progress value={pct} className="h-3" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 font-medium">
                      <span>{pct}% Completed</span>
                      <span>Target Date: {new Date(goal.targetDate).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>

                  {/* Goal Funding Section (v1) */}
                  {(() => {
                    const funding = calculateFunding(goal);
                    const isExpanded = expandedFundingId === goal.id;

                    return (
                      <div className="pt-2 border-t space-y-2">
                        <div
                          className="flex items-center justify-between cursor-pointer p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedFundingId(isExpanded ? null : goal.id)}
                        >
                          <div className="flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold">Goal Funding Plan</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {funding.isAchievable ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold">
                                🟢 On Track
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 font-semibold">
                                🟠 Gap: {formatINR(funding.projectedGap)}
                              </Badge>
                            )}
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-3 rounded-lg border bg-card/60 space-y-3 text-xs">
                            {/* Summary Metrics */}
                            <div className="grid grid-cols-2 gap-2 text-[11px] pb-2 border-b">
                              <div>
                                <span className="text-muted-foreground block">Available Now:</span>
                                <span className="font-semibold">{formatINR(funding.current)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Planned Monthly:</span>
                                <span className="font-semibold">{formatINR(funding.monthly)}/mo</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Time Remaining:</span>
                                <span className="font-semibold">{funding.monthsRemaining} months</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Projected Total:</span>
                                <span className="font-semibold">{formatINR(funding.projectedOwnFunding)}</span>
                              </div>
                            </div>

                            {/* Status Banner */}
                            {funding.isAchievable ? (
                              <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                                  <span>Goal is on track</span>
                                </div>
                                <p className="text-[11px] leading-tight">
                                  Your current planned saving of {formatINR(funding.monthly)}/month reaches your target
                                  {funding.projectedSurplus > 0 ? ` with a projected surplus of ${formatINR(funding.projectedSurplus)}.` : "."}
                                  {" "}No additional funding strategy is required.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 space-y-1">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                    <span>Funding Gap Detected</span>
                                  </div>
                                  <p className="text-[11px] leading-tight">
                                    Projected own funding is {formatINR(funding.projectedOwnFunding)}, leaving a funding gap of <strong>{formatINR(funding.projectedGap)}</strong>.
                                  </p>
                                </div>

                                {/* 4 Funding Options */}
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Funding Options</span>

                                  {/* 1. Save More */}
                                  <div className="p-2 rounded border bg-background/80 space-y-1">
                                    <div className="flex items-center justify-between font-semibold text-[11px]">
                                      <span className="flex items-center gap-1 text-primary">
                                        <TrendingUp className="h-3 w-3" /> 1. Save More
                                      </span>
                                      <span className="text-emerald-600 font-bold">+{formatINR(funding.additionalMonthlySaving)}/mo</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                      Save total {formatINR(funding.totalMonthlySavingNeeded)}/month for {funding.monthsRemaining} months to reach {formatINR(funding.target)}.
                                    </p>
                                  </div>

                                  {/* 2. Consider Investing */}
                                  <div className="p-2 rounded border bg-background/80 space-y-1">
                                    <div className="flex items-center gap-1 font-semibold text-[11px] text-primary">
                                      <Sparkles className="h-3 w-3" /> 2. Consider Investing
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                      An investment-based strategy can help bridge the {formatINR(funding.projectedGap)} gap over time.
                                      <span className="block italic text-[9px] text-muted-foreground/80 mt-0.5">Returns are not guaranteed and subject to market risk.</span>
                                    </p>
                                  </div>

                                  {/* 3. Extend Goal Date */}
                                  <div className="p-2 rounded border bg-background/80 space-y-1">
                                    <div className="flex items-center justify-between font-semibold text-[11px]">
                                      <span className="flex items-center gap-1 text-primary">
                                        <Calendar className="h-3 w-3" /> 3. Extend Target Date
                                      </span>
                                      {funding.monthsToExtend ? (
                                        <span className="text-amber-600 font-bold">+{funding.monthsToExtend} months</span>
                                      ) : null}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                      {funding.monthsToExtend
                                        ? `At your current ₹${funding.monthly.toLocaleString("en-IN")}/mo rate, extending to ${funding.projectedTargetDate} bridges the gap.`
                                        : "Set a monthly contribution to calculate required date extension."}
                                    </p>
                                  </div>

                                  {/* 4. Consider Borrowing */}
                                  <div className="p-2 rounded border bg-background/80 space-y-1">
                                    <div className="flex items-center justify-between font-semibold text-[11px]">
                                      <span className="flex items-center gap-1 text-primary">
                                        <CreditCard className="h-3 w-3" /> 4. Consider Borrowing
                                      </span>
                                      <a href="/borrowing" className="text-[10px] text-blue-600 hover:underline">View Loans &rarr;</a>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                      Borrowing can fund the {formatINR(funding.projectedGap)} gap immediately, but creates fixed EMI repayment and interest costs.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Goal Funding v2 Planner Engine */}
                            <div className="pt-3 border-t space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5" /> Planner v2 Recommendations
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 gap-1 text-primary"
                                  disabled={loadingPlanner[goal.id]}
                                  onClick={() => fetchPlannerData(goal.id)}
                                >
                                  <RefreshCw className={`h-3 w-3 ${loadingPlanner[goal.id] ? "animate-spin" : ""}`} />
                                  {plannerData[goal.id] ? "Recalculate" : "Load Plan"}
                                </Button>
                              </div>

                              {plannerData[goal.id] && (() => {
                                const pData = plannerData[goal.id];
                                const rec = pData.recommendedPlan;
                                const snap = pData.snapshot;
                                const isStale = pData.persistedActivePlan?.status === "REVIEW_REQUIRED";
                                const isApproved = pData.persistedActivePlan?.status === "ACTIVE";

                                return (
                                  <div className="space-y-2.5">
                                    {/* Financial Reality Snapshot Pills */}
                                    <div className="p-2 rounded bg-muted/40 border grid grid-cols-2 gap-1.5 text-[10px]">
                                      <div>
                                        <span className="text-muted-foreground">Unallocated Cash:</span>{" "}
                                        <span className="font-semibold">{formatINR(snap?.availableFundingCash || 0)}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">6-Mo Reserve:</span>{" "}
                                        <span className="font-semibold text-emerald-600">{formatINR(snap?.emergencyReserveAmount || 0)}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Available Surplus:</span>{" "}
                                        <span className="font-semibold">{formatINR(snap?.availableGoalFundingCapacity || 0)}/mo</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Prior Commitments:</span>{" "}
                                        <span className="font-semibold">{formatINR(snap?.higherPriorityGoalMonthlyCommitments || 0)}/mo</span>
                                      </div>
                                    </div>

                                    {/* Plan Status Banner */}
                                    {isStale && (
                                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] flex items-center gap-1.5">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        <span>Financial reality changed. Please review or regenerate plan.</span>
                                      </div>
                                    )}

                                    {/* Top Recommended Plan Card */}
                                    <div className="p-2.5 rounded-lg border bg-background space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                          <Badge className="bg-primary text-white text-[9px] px-1.5 py-0 font-bold">
                                            Rank #1
                                          </Badge>
                                          <span>{rec.name}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-primary">
                                          Score: {rec.score}/100
                                        </span>
                                      </div>

                                      <p className="text-[11px] text-muted-foreground leading-snug">
                                        {rec.explanation}
                                      </p>

                                      <div className="grid grid-cols-3 gap-1 pt-1 border-t text-[10px]">
                                        <div>
                                          <span className="text-muted-foreground block">Monthly:</span>
                                          <span className="font-bold text-emerald-600">
                                            {rec.monthlyRequired > 0 ? `${formatINR(rec.monthlyRequired)}/mo` : "₹0"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground block">Total Cost:</span>
                                          <span className="font-semibold">{formatINR(rec.totalCost)}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground block">Risk Level:</span>
                                          <span className="font-semibold">{rec.riskScore}/100</span>
                                        </div>
                                      </div>

                                      {/* Projection Range Table */}
                                      <div className="p-1.5 rounded bg-muted/20 border text-[9px] grid grid-cols-3 text-center">
                                        <div>
                                          <span className="text-muted-foreground block">Low Case</span>
                                          <span className="font-semibold">{formatINR(rec.projectedLow)}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground block font-bold text-primary">Base Case</span>
                                          <span className="font-bold text-primary">{formatINR(rec.projectedBase)}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground block">High Case</span>
                                          <span className="font-semibold">{formatINR(rec.projectedHigh)}</span>
                                        </div>
                                      </div>

                                      {/* Approve / Activate Button */}
                                      <div className="pt-1 flex items-center justify-between">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-[10px] px-1.5 text-muted-foreground gap-1"
                                          onClick={() =>
                                            setShowAlternatives((prev) => ({
                                              ...prev,
                                              [goal.id]: !prev[goal.id],
                                            }))
                                          }
                                        >
                                          <Layers className="h-3 w-3" />
                                          {showAlternatives[goal.id] ? "Hide Alternatives" : `View ${pData.alternativePlans?.length || 0} Alternatives`}
                                        </Button>

                                        {pData.persistedActivePlan?.id ? (
                                          <Button
                                            size="sm"
                                            className="h-7 text-[11px] font-semibold gap-1"
                                            disabled={isApproved || approvingPlan[goal.id]}
                                            onClick={() => handleApprovePlan(goal.id, pData.persistedActivePlan.id)}
                                          >
                                            {isApproved ? (
                                              <>
                                                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                                                Active Plan v{pData.persistedActivePlan.version}
                                              </>
                                            ) : (
                                              "Approve Plan"
                                            )}
                                          </Button>
                                        ) : (
                                          <Button
                                            size="sm"
                                            className="h-7 text-[11px] font-semibold gap-1"
                                            onClick={async () => {
                                              // Save proposal and approve
                                              const res = await fetch(`/api/goals/${goal.id}/plan`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ saveProposal: true }),
                                              });
                                              if (res.ok) {
                                                const d = await res.json();
                                                if (d.savedPlan?.id) {
                                                  await handleApprovePlan(goal.id, d.savedPlan.id);
                                                }
                                              }
                                            }}
                                          >
                                            Save & Approve Plan
                                          </Button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Alternative Strategies Accordion */}
                                    {showAlternatives[goal.id] && pData.alternativePlans && (
                                      <div className="space-y-1.5 pt-1">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Alternative Ranked Strategies</span>
                                        {pData.alternativePlans.map((alt: any) => (
                                          <div key={alt.name} className="p-2 rounded border bg-card/80 text-[10px] space-y-1">
                                            <div className="flex items-center justify-between font-bold">
                                              <span>#{alt.rank} {alt.name}</span>
                                              <span className="text-muted-foreground">{alt.score}/100</span>
                                            </div>
                                            <p className="text-muted-foreground line-clamp-2">{alt.explanation}</p>
                                            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                                              <span>Monthly: {formatINR(alt.monthlyRequired)}/mo</span>
                                              <span>Cost: {formatINR(alt.totalCost)}</span>
                                              <span>Risk: {alt.riskScore}/100</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* What-if Quick Slider / Input */}
                            <div className="pt-2 border-t">
                              <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                                <span>Simulate Monthly Saving:</span>
                                <span>{formatINR(funding.monthly)}/mo</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max={Math.max(50000, funding.totalMonthlySavingNeeded * 1.5)}
                                step="1000"
                                value={funding.monthly}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setSimContributions((prev) => ({ ...prev, [goal.id]: val }));
                                }}
                                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Actions Bar */}
                  <div className="space-y-2 pt-1 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        disabled={status !== "ACTIVE"}
                        className="gap-1.5 text-xs font-semibold"
                        onClick={() => {
                          setActiveGoalId(goal.id);
                          setAmountInput("");
                          setIsDepositOpen(true);
                        }}
                      >
                        <PiggyBank className="h-3.5 w-3.5 text-emerald-600" /> Allocate
                      </Button>
                      <Button
                        variant="outline"
                        disabled={status !== "ACTIVE" || current <= 0}
                        className="gap-1.5 text-xs font-semibold"
                        onClick={() => {
                          setActiveGoalId(goal.id);
                          setAmountInput("");
                          setIsWithdrawOpen(true);
                        }}
                      >
                        <ArrowDownRight className="h-3.5 w-3.5 text-blue-600" /> Withdraw
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      {status === "ACTIVE" ? (
                        <button
                          onClick={() => handleStatusChange(goal.id, "PAUSED")}
                          className="flex items-center gap-1 hover:text-amber-600 font-medium"
                        >
                          <PauseCircle className="h-3.5 w-3.5" /> Pause Goal
                        </button>
                      ) : status === "PAUSED" ? (
                        <button
                          onClick={() => handleStatusChange(goal.id, "ACTIVE")}
                          className="flex items-center gap-1 hover:text-emerald-600 font-medium"
                        >
                          <PlayCircle className="h-3.5 w-3.5" /> Resume Goal
                        </button>
                      ) : null}

                      {status !== "COMPLETED" && (
                        <button
                          onClick={() => handleStatusChange(goal.id, "COMPLETED")}
                          className="flex items-center gap-1 hover:text-emerald-600 font-medium"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteOrArchive(goal.id)}
                        className="flex items-center gap-1 text-destructive hover:underline font-medium ml-auto"
                      >
                        {current > 0 ? <Archive className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {current > 0 ? "Archive" : "Delete"}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Create Goal Modal */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogHeader>
            <DialogTitle>Create New Savings Goal</DialogTitle>
            <DialogDescription>Define financial target, target timeline, and priority.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddGoal} className="space-y-4 pt-2">
            {/* AI Natural Language Drafter */}
            <div className="p-3 rounded-lg border bg-primary/5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span className="flex items-center gap-1.5">
                  <Bot className="h-4 w-4" /> AI Goal Setup Assistant
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Advisory only</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Save 12 lakhs for a car by Dec 2027 with 20k monthly"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isAiParsing || !aiPrompt.trim()}
                  onClick={handleParseAiPrompt}
                  className="text-xs font-semibold shrink-0"
                >
                  {isAiParsing ? "Parsing..." : "Auto-Fill"}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">Goal Title</label>
              <Input required placeholder="e.g. Children Higher Education" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Description</label>
              <Input placeholder="Purpose of this savings goal..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Target Amount (INR ₹)</label>
                <Input required type="number" placeholder="2500000" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Current Available Amount (INR ₹)</label>
                <Input type="number" placeholder="0" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Monthly Planned Saving (INR ₹)</label>
                <Input type="number" placeholder="25000" value={monthlyContribution} onChange={(e) => setMonthlyContribution(e.target.value)} />
                <span className="text-[10px] text-muted-foreground">Planning input / projection only</span>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Target Date</label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Notes / Assumptions</label>
              <Input placeholder="e.g. Planning to buy 2400 sq.ft plot, saving from bonus" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Priority</label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="HIGH">High Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="LOW">Low Priority</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Deadline Flexibility</label>
                <Select value={deadlineFlexibility} onChange={(e) => setDeadlineFlexibility(e.target.value as any)}>
                  <option value="STRICT">Strict (Cannot Extend)</option>
                  <option value="MODERATE">Moderate (Up to 3 yrs)</option>
                  <option value="FLEXIBLE">Flexible (Can Extend)</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit">Create Savings Goal</Button>
            </div>
          </form>
        </Dialog>

        {/* Deposit Allocation Modal */}
        <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
          <DialogHeader>
            <DialogTitle>Allocate Savings Deposit</DialogTitle>
            <DialogDescription>Deduct funds from bank account and credit towards goal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Source Bank Account</label>
              {accounts.length === 0 ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-medium">No source bank account available.</p>
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
                <Select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} required>
                  {accounts.map((acc) => {
                    const bal = typeof acc.balance === "number" ? acc.balance : Number(acc.balance);
                    return (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(bal)})
                      </option>
                    );
                  })}
                </Select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Deposit Amount (INR ₹)</label>
              <Input required type="number" step="100" placeholder="10000" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDepositOpen(false)}>Cancel</Button>
              <Button type="submit">Confirm Deposit</Button>
            </div>
          </form>
        </Dialog>

        {/* Withdraw Allocation Modal */}
        <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
          <DialogHeader>
            <DialogTitle>Withdraw Funds from Goal</DialogTitle>
            <DialogDescription>Deduct saved funds from goal and credit target bank account.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWithdraw} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold mb-1 block">Destination Bank Account</label>
              {accounts.length === 0 ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-medium">No destination bank account available.</p>
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
                <Select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} required>
                  {accounts.map((acc) => {
                    const bal = typeof acc.balance === "number" ? acc.balance : Number(acc.balance);
                    return (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(bal)})
                      </option>
                    );
                  })}
                </Select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Withdrawal Amount (INR ₹)</label>
              <Input required type="number" step="100" placeholder="5000" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsWithdrawOpen(false)}>Cancel</Button>
              <Button type="submit">Confirm Withdrawal</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
