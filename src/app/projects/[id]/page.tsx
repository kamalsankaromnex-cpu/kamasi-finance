"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Layers,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  CreditCard,
  Plus,
  ShieldCheck,
  Building,
  Target,
  ListTodo,
  Milestone as MilestoneIcon,
  HelpCircle,
  Link as LinkIcon,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { formatCurrency } from "@/lib/utils";

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "plan" | "funding" | "payments" | "tasks">("overview");

  // Form states
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [fundingModalOpen, setFundingModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // New cost item state
  const [costName, setCostName] = useState("");
  const [costAmount, setCostAmount] = useState("");

  // New payment state
  const [payName, setPayName] = useState("");
  const [payPlanned, setPayPlanned] = useState("");
  const [payCommitted, setPayCommitted] = useState("");
  const [payDue, setPayDue] = useState("");

  // New funding state
  const [fundName, setFundName] = useState("");
  const [fundSourceType, setFundSourceType] = useState("SAVINGS");
  const [fundPlanned, setFundPlanned] = useState("");
  const [fundCommitted, setFundCommitted] = useState("");

  // New plan version state
  const [newPlanCost, setNewPlanCost] = useState("");
  const [planReason, setPlanReason] = useState("");

  // New task state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${id}/snapshot`);
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch (err) {
      console.error("Failed to fetch project snapshot", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, [id]);

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costName || !costAmount) return;
    await fetch(`/api/projects/${id}/cost-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: costName, plannedAmount: parseFloat(costAmount) }),
    });
    setCostName("");
    setCostAmount("");
    setCostModalOpen(false);
    fetchSnapshot();
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payName || !payPlanned) return;
    await fetch(`/api/projects/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payName,
        plannedAmount: parseFloat(payPlanned),
        committedAmount: payCommitted ? parseFloat(payCommitted) : 0,
        dueDate: payDue || undefined,
      }),
    });
    setPayName("");
    setPayPlanned("");
    setPayCommitted("");
    setPayDue("");
    setPaymentModalOpen(false);
    fetchSnapshot();
  };

  const handleAddFunding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundName || !fundPlanned) return;
    await fetch(`/api/projects/${id}/funding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fundName,
        sourceType: fundSourceType,
        plannedAmount: parseFloat(fundPlanned),
        committedAmount: fundCommitted ? parseFloat(fundCommitted) : 0,
      }),
    });
    setFundName("");
    setFundPlanned("");
    setFundCommitted("");
    setFundingModalOpen(false);
    fetchSnapshot();
  };

  const handleAddPlanVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanCost) return;
    await fetch(`/api/projects/${id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estimatedTotalCost: parseFloat(newPlanCost),
        reason: planReason || undefined,
      }),
    });
    setNewPlanCost("");
    setPlanReason("");
    setPlanModalOpen(false);
    fetchSnapshot();
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle) return;
    await fetch(`/api/projects/${id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskTitle,
        dueDate: taskDueDate || undefined,
      }),
    });
    setTaskTitle("");
    setTaskDueDate("");
    setTaskModalOpen(false);
    fetchSnapshot();
  };

  const handleStatusTransition = async (toStatus: string) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "TRANSITION_STATUS", toStatus }),
    });
    fetchSnapshot();
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-muted-foreground">Loading initiative workbench...</div>
      </AppLayout>
    );
  }

  if (!snapshot) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-destructive">Project not found.</div>
      </AppLayout>
    );
  }

  const { project, health, metrics, funding, payments, costItems, tasks, milestones, linkedEntities } = snapshot;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
      {/* Header and breadcrumbs */}
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Lifecycle:</span>
          {project.status === "DRAFT" && (
            <button
              onClick={() => handleStatusTransition("ACTIVE")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Activate Project
            </button>
          )}
          {project.status === "PLANNED" && (
            <button
              onClick={() => handleStatusTransition("ACTIVE")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Start Execution
            </button>
          )}
          {project.status === "ACTIVE" && (
            <>
              <button
                onClick={() => handleStatusTransition("COMPLETED")}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900"
              >
                Mark Completed
              </button>
              <button
                onClick={() => handleStatusTransition("ON_HOLD")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted"
              >
                Put On Hold
              </button>
            </>
          )}
          {project.status === "ON_HOLD" && (
            <button
              onClick={() => handleStatusTransition("ACTIVE")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"
            >
              Resume Project
            </button>
          )}
        </div>
      </div>

      {/* Title Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-6 rounded-2xl border bg-card shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary">
              {project.projectType}
            </span>
            <span className="text-xs text-muted-foreground">Version v{project.version}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>

        <div className="flex items-center gap-4 bg-muted/40 p-4 rounded-xl border">
          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Health Status</div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                health.status === "ON_TRACK"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : health.status === "COMPLETED"
                  ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}>
                {health.status.replace("_", " ")}
              </span>
              <span className="text-xs text-muted-foreground">Score: {health.healthScore}/100</span>
            </div>
            {health.reasons.length > 0 && (
              <p className="text-xs text-muted-foreground max-w-xs line-clamp-1">{health.reasons[0]}</p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-1">
          <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Estimated Cost</span>
            <span className="text-[10px] text-primary">Plan v{project.version}</span>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(metrics.estimatedCost)}</div>
          <div className="text-[11px] text-muted-foreground">Budgeted: {formatCurrency(metrics.budgetedAmount)}</div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-1">
          <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Secured Funding</span>
            <span className="text-[10px] text-emerald-600 font-semibold">{metrics.fundingProgressPercent}%</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(metrics.securedFunding)}
          </div>
          <div className="text-[11px] text-muted-foreground">Received: {formatCurrency(funding.totalReceived)}</div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-1">
          <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Committed Schedule</span>
            <span className="text-[10px] text-amber-600 font-semibold">Legally Due</span>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(metrics.committedAmount)}
          </div>
          <div className="text-[11px] text-muted-foreground">Remaining: {formatCurrency(payments.totalRemaining)}</div>
        </div>

        <div className="p-5 rounded-2xl border bg-card shadow-xs space-y-1">
          <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Actual Paid Out</span>
            <span className="text-[10px] text-blue-600 font-semibold">{metrics.financialProgressPercent}%</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(metrics.actualPaidAmount)}
          </div>
          <div className="text-[11px] text-muted-foreground">Funding Gap: {formatCurrency(metrics.fundingGap)}</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b flex items-center gap-6">
        {[
          { key: "overview", label: "Executive Overview" },
          { key: "plan", label: "Cost & Budget Plan" },
          { key: "funding", label: "Funding Channels" },
          { key: "payments", label: "Payment Commitments" },
          { key: "tasks", label: "Tasks & Execution" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`pb-3 text-sm font-semibold transition-all relative ${
              activeTab === t.key
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {health.reasons.length > 0 && (
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <div className="font-semibold text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Health Attention Items
                </div>
                <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-5">
                  {health.reasons.map((r: string, idx: number) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-6 rounded-2xl border bg-card shadow-xs space-y-4">
              <h3 className="font-semibold text-base">Execution vs Financial Progress</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Task Completion</span>
                    <span className="font-semibold">{metrics.executionProgressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${metrics.executionProgressPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Financial Cash Outflow</span>
                    <span className="font-semibold">{metrics.financialProgressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${metrics.financialProgressPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Secured Funding Coverage</span>
                    <span className="font-semibold">{metrics.fundingProgressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${metrics.fundingProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-6 rounded-2xl border bg-card shadow-xs space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-primary" />
                Linked Financial Records
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Primary Linked Goal:</span>
                  {linkedEntities.goal ? (
                    <div className="mt-1 p-3 rounded-lg border bg-muted/20">
                      <div className="font-semibold text-sm">{linkedEntities.goal.name}</div>
                      <div className="text-muted-foreground mt-0.5">
                        Target: {formatCurrency(linkedEntities.goal.targetAmount)} | Accumulated: {formatCurrency(linkedEntities.goal.currentAmount)}
                      </div>
                    </div>
                  ) : (
                    <p className="italic text-muted-foreground mt-1">None linked</p>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground">Linked Borrowings / Debt:</span>
                  {linkedEntities.borrowings && linkedEntities.borrowings.length > 0 ? (
                    <div className="mt-1 space-y-2">
                      {linkedEntities.borrowings.map((b: any) => (
                        <div key={b.id} className="p-3 rounded-lg border bg-muted/20">
                          <div className="font-semibold text-sm">{b.name}</div>
                          <div className="text-muted-foreground">
                            Outstanding: {formatCurrency(b.outstanding)} / Principal: {formatCurrency(b.principal)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="italic text-muted-foreground mt-1">No borrowing linked</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Cost & Budget Plan */}
      {activeTab === "plan" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Planned Cost Items Breakdown</h3>
              <p className="text-xs text-muted-foreground">Cost item breakdown for the initiative budget.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPlanModalOpen(true)}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted"
              >
                Revise Estimate (v{project.version + 1})
              </button>
              <button
                onClick={() => setCostModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Add Cost Item
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 font-semibold">Cost Component</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Priority</th>
                  <th className="p-3 font-semibold text-right">Planned Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground italic">
                      No cost items broken down yet. Click &quot;Add Cost Item&quot; to plan components.
                    </td>
                  </tr>
                ) : (
                  costItems.map((c: any) => (
                    <tr key={c.id}>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{c.categoryName || "Uncategorized"}</td>
                      <td className="p-3">{c.priority}</td>
                      <td className="p-3 font-semibold text-right">{formatCurrency(c.plannedAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Funding Channels */}
      {activeTab === "funding" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Funding Channels</h3>
              <p className="text-xs text-muted-foreground">
                Separates Planned estimations from Committed or Received capital to avoid double-counting.
              </p>
            </div>
            <button
              onClick={() => setFundingModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Funding Channel
            </button>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 font-semibold">Source</th>
                  <th className="p-3 font-semibold">Channel Type</th>
                  <th className="p-3 font-semibold text-right">Planned</th>
                  <th className="p-3 font-semibold text-right">Committed</th>
                  <th className="p-3 font-semibold text-right">Received</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {funding.sources.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground italic">
                      No funding channels defined. Add Savings, Borrowing, or Sale of Asset channels.
                    </td>
                  </tr>
                ) : (
                  funding.sources.map((f: any) => (
                    <tr key={f.id}>
                      <td className="p-3 font-medium">{f.name}</td>
                      <td className="p-3 text-muted-foreground">{f.sourceType}</td>
                      <td className="p-3 text-right">{formatCurrency(f.plannedAmount)}</td>
                      <td className="p-3 font-semibold text-amber-600 dark:text-amber-400 text-right">
                        {formatCurrency(f.committedAmount)}
                      </td>
                      <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400 text-right">
                        {formatCurrency(f.receivedAmount)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted">
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Payments Schedule */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Payment Commitments Schedule</h3>
              <p className="text-xs text-muted-foreground">
                Milestone payments, vendor installments, and actual allocated ledger transactions.
              </p>
            </div>
            <button
              onClick={() => setPaymentModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Payment Commitment
            </button>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 font-semibold">Payment Milestone</th>
                  <th className="p-3 font-semibold">Due Date</th>
                  <th className="p-3 font-semibold text-right">Planned</th>
                  <th className="p-3 font-semibold text-right">Committed</th>
                  <th className="p-3 font-semibold text-right">Paid (Reconciled)</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground italic">
                      No payment schedules created.
                    </td>
                  </tr>
                ) : (
                  payments.items.map((p: any) => (
                    <tr key={p.id}>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.dueDate || "Not set"}</td>
                      <td className="p-3 text-right">{formatCurrency(p.plannedAmount)}</td>
                      <td className="p-3 font-semibold text-amber-600 dark:text-amber-400 text-right">
                        {formatCurrency(p.committedAmount)}
                      </td>
                      <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400 text-right">
                        {formatCurrency(p.paidAmount)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Tasks & Execution */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Execution Tasks</h3>
              <p className="text-xs text-muted-foreground">Actionable milestones and deliverables.</p>
            </div>
            <button
              onClick={() => setTaskModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Task
            </button>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 font-semibold">Title</th>
                  <th className="p-3 font-semibold">Due Date</th>
                  <th className="p-3 font-semibold">Priority</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground italic">
                      No tasks assigned yet.
                    </td>
                  </tr>
                ) : (
                  tasks.items.map((t: any) => (
                    <tr key={t.id}>
                      <td className="p-3 font-medium">{t.title}</td>
                      <td className="p-3 text-muted-foreground">{t.dueDate || "Not set"}</td>
                      <td className="p-3">{t.priority}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted">
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost Modal */}
      {costModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Add Planned Cost Item</h3>
            <form onSubmit={handleAddCost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Component Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goat Shed Roofing, Architect Fees"
                  value={costName}
                  onChange={(e) => setCostName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Planned Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCostModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Add Cost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Add Payment Commitment</h3>
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Milestone Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Foundation Advance, Final Contractor Payment"
                  value={payName}
                  onChange={(e) => setPayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Planned Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={payPlanned}
                  onChange={(e) => setPayPlanned(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Committed Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={payCommitted}
                  onChange={(e) => setPayCommitted(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Due Date</label>
                <input
                  type="date"
                  value={payDue}
                  onChange={(e) => setPayDue(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Funding Modal */}
      {fundingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Add Funding Channel</h3>
            <form onSubmit={handleAddFunding} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Channel Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFC Fixed Deposit, SBI Agriculture Loan"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Source Type</label>
                <select
                  value={fundSourceType}
                  onChange={(e) => setFundSourceType(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                >
                  <option value="SAVINGS">Bank Account / Savings</option>
                  <option value="BORROWING">Borrowing / Loan</option>
                  <option value="INVESTMENT_LIQUIDATION">Investment Liquidation</option>
                  <option value="ASSET_SALE">Asset Sale</option>
                  <option value="GOAL_ALLOCATION">Goal Allocation</option>
                  <option value="INCOME_FLOW">Income Flow</option>
                  <option value="EXTERNAL_GIFT">External Gift</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Planned Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={fundPlanned}
                  onChange={(e) => setFundPlanned(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Committed / Secured Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={fundCommitted}
                  onChange={(e) => setFundCommitted(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFundingModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Save Funding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plan Version Revision Modal */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Revise Financial Estimate (v{project.version + 1})</h3>
            <p className="text-xs text-muted-foreground">
              Creates a new versioned plan while preserving historical estimation decisions.
            </p>
            <form onSubmit={handleAddPlanVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">New Estimated Total Cost (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newPlanCost}
                  onChange={(e) => setNewPlanCost(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Reason for Revision</label>
                <input
                  type="text"
                  placeholder="e.g. Scope change: added solar irrigation pumps"
                  value={planReason}
                  onChange={(e) => setPlanReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Create Plan v{project.version + 1}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Add Execution Task</h3>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Get electrical sanction for pumps"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </AppLayout>
  );
}
