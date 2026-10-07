"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Cpu, Play, Plus, CheckCircle2, AlertTriangle, ShieldCheck, Trash2, ToggleLeft, ToggleRight, Tag, Clock, Eye, AlertCircle } from "lucide-react";

export default function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<"rules" | "logs" | "review">("rules");

  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Modal / Form state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    merchantKeyword: "",
    categoryId: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rRes, lRes, cRes] = await Promise.all([
        fetch("/api/automations"),
        fetch("/api/automations/logs"),
        fetch("/api/categories"),
      ]);

      if (rRes.ok) setRules(await rRes.json());
      if (lRes.ok) setLogs(await lRes.json());
      if (cRes.ok) setCategories(await cRes.json());
    } catch (err) {
      console.error("Failed to load automation engine data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunEngine = async () => {
    try {
      setRunning(true);
      setMessage(null);
      const res = await fetch("/api/automations/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to run automation engine:", err);
    } finally {
      setRunning(false);
    }
  };

  const handleToggleRule = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name || !ruleForm.merchantKeyword || !ruleForm.categoryId) return;

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleForm.name,
          triggerType: "TRANSACTION_CREATED",
          conditionJson: JSON.stringify({ merchantContains: ruleForm.merchantKeyword }),
          actionType: "CATEGORIZE_TRANSACTION",
          actionJson: JSON.stringify({ setCategoryId: ruleForm.categoryId }),
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setRuleForm({ name: "", merchantKeyword: "", categoryId: "" });
        fetchData();
      }
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  const pendingReviewLogs = logs.filter((l) => l.status === "PENDING_REVIEW");

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-2xl">
              <Cpu className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Rule-Based Automation Engine</h1>
              <p className="text-xs text-muted-foreground font-medium">Deterministic Rule & Trigger Execution System</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              disabled={running}
              onClick={handleRunEngine}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{running ? "Executing Rules..." : "Run Engine Now"}</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center space-x-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Pattern Rule</span>
            </button>
          </div>
        </div>

        {message && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 text-xs font-medium flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 border-b pb-1">
          <button
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 text-xs font-medium rounded-t-xl transition border-b-2 ${
              activeTab === "rules" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Rules ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 text-xs font-medium rounded-t-xl transition border-b-2 ${
              activeTab === "logs" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Execution History Logs ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`px-4 py-2 text-xs font-medium rounded-t-xl transition border-b-2 ${
              activeTab === "review" ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Review Queue ({pendingReviewLogs.length})
          </button>
        </div>

        {/* TAB 1: Rules List */}
        {activeTab === "rules" && (
          <Card className="shadow-xs border-muted">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Configured Deterministic Rules</CardTitle>
              <CardDescription className="text-xs">Pattern matching rules for auto-categorization and threshold monitoring.</CardDescription>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  No custom pattern rules configured yet. Click &quot;Add Pattern Rule&quot; above to create your first exact-match categorization rule.
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((r) => (
                    <div key={r.id} className="p-4 bg-muted/40 rounded-xl border flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-foreground">{r.name}</span>
                          <span className="text-[10px] bg-primary/10 text-primary border px-2 py-0.5 rounded-full font-mono">
                            {r.triggerType}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          Condition: {r.conditionJson} | Action: {r.actionJson}
                        </p>
                      </div>

                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleToggleRule(r.id, r.isActive)}
                          className="text-muted-foreground hover:text-primary transition"
                        >
                          {r.isActive ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6" />}
                        </button>
                        <button
                          onClick={() => handleDeleteRule(r.id)}
                          className="text-muted-foreground hover:text-rose-500 transition p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB 2: Execution Logs */}
        {activeTab === "logs" && (
          <Card className="shadow-xs border-muted">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Audit & Execution History</CardTitle>
              <CardDescription className="text-xs">Real-time audit log of executed rules, budget threshold alerts, and duplicate scans.</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  No execution logs recorded yet. Click &quot;Run Engine Now&quot; to trigger rule checks.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((l) => (
                    <div key={l.id} className="p-3 bg-muted/30 rounded-xl border flex items-start justify-between text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            l.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          }`}>
                            {l.status}
                          </span>
                          <span className="font-semibold text-foreground">{l.triggerType}</span>
                        </div>
                        <p className="text-muted-foreground">{l.details}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(l.executedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB 3: Review Queue */}
        {activeTab === "review" && (
          <Card className="shadow-xs border-muted">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Review Queue & Flagged Items</CardTitle>
              <CardDescription className="text-xs">Flagged potential duplicate transactions requiring manual approval.</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingReviewLogs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  ✨ Clear! No flagged duplicate transactions pending manual review.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingReviewLogs.map((l) => (
                    <div key={l.id} className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                      <div className="flex items-center space-x-2 text-xs font-semibold text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{l.triggerType} Flagged for Review</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{l.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Add Rule Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-card border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-bold text-foreground">Create Pattern Categorization Rule</h3>
              <form onSubmit={handleCreateRule} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Rule Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Swiggy Auto-Categorize"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="w-full bg-muted border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Merchant / Description Keyword</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Swiggy"
                    value={ruleForm.merchantKeyword}
                    onChange={(e) => setRuleForm({ ...ruleForm, merchantKeyword: e.target.value })}
                    className="w-full bg-muted border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Target Category</label>
                  <select
                    required
                    value={ruleForm.categoryId}
                    onChange={(e) => setRuleForm({ ...ruleForm, categoryId: e.target.value })}
                    className="w-full bg-muted border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-xs font-semibold"
                  >
                    Save Rule
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
