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
import { store } from "@/lib/store";
import { Target, Plus, PiggyBank } from "lucide-react";

export default function SavingsGoalsPage() {
  const [goals, setGoals] = useState<any[]>(store.goals);
  const [accounts, setAccounts] = useState<any[]>(store.accounts);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [activeGoalId, setActiveGoalId] = useState<string>("");

  // Add Goal Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("2028-12-31");
  const [category, setCategory] = useState("Safety Net");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(store.accounts[0]?.id || "acc-1");

  const fetchGoals = async () => {
    try {
      const res = await fetch("/api/goals");
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      }
    } catch {
      setGoals(store.goals);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch {
      setAccounts(store.accounts);
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
    if (!name || isNaN(tAmt)) return;

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          targetAmount: tAmt,
          currentAmount: cAmt,
          targetDate,
          category,
          priority,
        }),
      });

      if (res.ok) {
        await fetchGoals();
      } else {
        store.addGoal({
          householdId: store.household.id,
          name,
          description,
          targetAmount: tAmt,
          currentAmount: cAmt,
          targetDate: new Date(targetDate).toISOString(),
          category,
          priority,
        });
        setGoals([...store.goals]);
      }
    } catch {
      store.addGoal({
        householdId: store.household.id,
        name,
        description,
        targetAmount: tAmt,
        currentAmount: cAmt,
        targetDate: new Date(targetDate).toISOString(),
        category,
        priority,
      });
      setGoals([...store.goals]);
    }

    setIsAddOpen(false);
    setName("");
    setDescription("");
    setTargetAmount("");
    setCurrentAmount("");
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dep = parseFloat(depositAmount);
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
        store.updateGoalProgress(activeGoalId, dep, selectedAccountId);
        setGoals([...store.goals]);
      }
    } catch {
      store.updateGoalProgress(activeGoalId, dep, selectedAccountId);
      setGoals([...store.goals]);
    }

    setIsDepositOpen(false);
    setDepositAmount("");
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

            return (
              <Card key={goal.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-xs">{goal.category}</Badge>
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
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-xs font-semibold"
                    onClick={() => {
                      setActiveGoalId(goal.id);
                      setIsDepositOpen(true);
                    }}
                  >
                    <PiggyBank className="h-4 w-4 text-emerald-600" /> Allocate Savings
                  </Button>
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
                <label className="text-xs font-semibold mb-1 block">Initial Amount Saved (INR ₹)</label>
                <Input type="number" placeholder="0" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Target Date</label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Priority</label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="HIGH">High Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="LOW">Low Priority</option>
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
              <Select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                {accounts.map((acc) => {
                  const bal = typeof acc.balance === "number" ? acc.balance : Number(acc.balance);
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatINR(bal)})
                    </option>
                  );
                })}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Deposit Amount (INR ₹)</label>
              <Input required type="number" step="100" placeholder="10000" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDepositOpen(false)}>Cancel</Button>
              <Button type="submit">Confirm Deposit</Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppLayout>
  );
}
