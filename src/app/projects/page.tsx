"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  Plus,
  AlertTriangle,
  Clock,
  TrendingUp,
  Target,
  ArrowRight,
  Filter,
  Calendar,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { formatCurrency } from "@/lib/utils";

interface ProjectMetric {
  estimatedCost: number;
  committedAmount: number;
  paidAmount: number;
  securedFunding: number;
  fundingGap: number;
  tasksCount: number;
  tasksCompleted: number;
  milestonesCount: number;
}

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  projectType: string;
  status: string;
  priority: string;
  startDate?: string;
  targetDate?: string;
  version: number;
  metrics: ProjectMetric;
}

interface FundingConflict {
  accountId: string;
  accountName: string;
  availableBalance: number;
  totalClaimed: number;
  overAllocatedAmount: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [fundingConflicts, setFundingConflicts] = useState<FundingConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Project Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState("PERSONAL");
  const [priority, setPriority] = useState("MEDIUM");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const url = statusFilter === "ALL" ? "/api/projects" : `/api/projects?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setFundingConflicts(data.fundingConflicts || []);
      }
    } catch (err) {
      console.error("Error fetching projects", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSubmitting(true);
      setErrorMsg("");
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          projectType,
          priority,
          estimatedTotalCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
          startDate: startDate || undefined,
          targetDate: targetDate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      setIsModalOpen(false);
      setName("");
      setDescription("");
      setEstimatedCost("");
      setStartDate("");
      setTargetDate("");
      fetchProjects();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  const totalEstimatedCost = projects.reduce((s, p) => s + p.metrics.estimatedCost, 0);
  const totalPaid = projects.reduce((s, p) => s + p.metrics.paidAmount, 0);
  const totalCommitted = projects.reduce((s, p) => s + p.metrics.committedAmount, 0);
  const totalFundingGap = projects.reduce((s, p) => s + p.metrics.fundingGap, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Active</span>;
      case "PLANNED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">Planned</span>;
      case "ON_HOLD":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">On Hold</span>;
      case "COMPLETED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">Completed</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">Cancelled</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">Draft</span>;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FolderKanban className="h-8 w-8 text-primary" />
            Projects & Planning
          </h1>
          <p className="text-muted-foreground mt-1">
            Universal initiative planning and execution: marriage, construction, farm expansions, and asset acquisition.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Over-allocation Alerts */}
      {fundingConflicts.length > 0 && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Multi-Project Account Over-Allocation Detected
          </div>
          <div className="text-sm text-foreground space-y-1">
            {fundingConflicts.map((c) => (
              <p key={c.accountId}>
                Account <strong>{c.accountName}</strong> has available balance of {formatCurrency(c.availableBalance)}, but total planned projects claim {formatCurrency(c.totalClaimed)}. Over-allocated by <strong>{formatCurrency(c.overAllocatedAmount)}</strong>.
              </p>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border bg-card text-card-foreground shadow-xs">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Total Estimated Cost
          </div>
          <div className="text-2xl font-bold mt-2">{formatCurrency(totalEstimatedCost)}</div>
          <p className="text-xs text-muted-foreground mt-1">Across all planned initiatives</p>
        </div>

        <div className="p-5 rounded-2xl border bg-card text-card-foreground shadow-xs">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Committed Schedule
          </div>
          <div className="text-2xl font-bold mt-2">{formatCurrency(totalCommitted)}</div>
          <p className="text-xs text-muted-foreground mt-1">Legally/contractually committed</p>
        </div>

        <div className="p-5 rounded-2xl border bg-card text-card-foreground shadow-xs">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Actual Paid Out
          </div>
          <div className="text-2xl font-bold mt-2">{formatCurrency(totalPaid)}</div>
          <p className="text-xs text-muted-foreground mt-1">Reconciled via financial ledger</p>
        </div>

        <div className="p-5 rounded-2xl border bg-card text-card-foreground shadow-xs">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            Unfunded Gap
          </div>
          <div className="text-2xl font-bold mt-2">{formatCurrency(totalFundingGap)}</div>
          <p className="text-xs text-muted-foreground mt-1">Estimated cost minus secured funding</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Filter by status:</span>
        {["ALL", "DRAFT", "PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === st
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Project Cards List */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="p-16 border border-dashed rounded-2xl text-center space-y-4">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto stroke-1" />
          <h3 className="text-lg font-semibold">No initiatives created yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Plan real-world family or business milestones: House Construction, Machinery Purchase, Goat Farm, or Marriage with full financial linkage.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => {
            const financialProgress =
              p.metrics.estimatedCost > 0
                ? Math.min(100, Math.round((p.metrics.paidAmount / p.metrics.estimatedCost) * 100))
                : 0;

            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group block p-6 rounded-2xl border bg-card hover:border-primary/50 hover:shadow-md transition-all space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      {p.projectType}
                    </span>
                    <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                      {p.name}
                    </h3>
                  </div>
                  {getStatusBadge(p.status)}
                </div>

                {p.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                )}

                {/* Progress bar */}
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Financial Execution</span>
                    <span className="font-medium text-foreground">{financialProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${financialProgress}%` }}
                    />
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-muted-foreground">Estimated:</span>
                    <p className="font-semibold">{formatCurrency(p.metrics.estimatedCost)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Paid:</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(p.metrics.paidAmount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Committed:</span>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrency(p.metrics.committedAmount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gap:</span>
                    <p className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(p.metrics.fundingGap)}
                    </p>
                  </div>
                </div>

                {/* Footer details */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {p.targetDate ? new Date(p.targetDate).toLocaleDateString() : "No target date"}
                  </div>
                  <div className="flex items-center gap-1 text-primary font-medium group-hover:translate-x-0.5 transition-transform">
                    Workbench <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-bold">Create Universal Project</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Plan any family, business, construction, or personal initiative.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goat Farm Expansion, House Construction, Sister Wedding"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Description / Objective</label>
                <textarea
                  rows={2}
                  placeholder="What is this project aiming to accomplish?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Project Type</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="PERSONAL">Personal</option>
                    <option value="FAMILY">Family</option>
                    <option value="BUSINESS">Business</option>
                    <option value="FARM">Farm / Agriculture</option>
                    <option value="CONSTRUCTION">Construction</option>
                    <option value="EVENT">Event</option>
                    <option value="EDUCATION">Education</option>
                    <option value="MEDICAL">Medical</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Initial Estimated Total Cost (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="e.g. 500000"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  Creates Plan Version 1. Produces zero journal entries.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Target Date</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Project"}
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
