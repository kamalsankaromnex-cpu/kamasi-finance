"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, UserPlus, Shield, Mail, Wallet, CheckCircle2, Lock, Eye } from "lucide-react";
import { formatINR } from "@/lib/currency";

export default function FamilyPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [newInvitationCode, setNewInvitationCode] = useState("");
  const [acceptCode, setAcceptCode] = useState("");

  const fetchData = async () => {
    try {
      const [mRes, aRes] = await Promise.all([
        fetch("/api/household/members"),
        fetch("/api/accounts"),
      ]);
      if (mRes.ok) {
        const data = await mRes.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }
      if (aRes.ok) setAccounts(await aRes.json());
    } catch (err) {
      console.error("Failed to load family data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      const res = await fetch("/api/household/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        const created = await res.json();
        setNewInvitationCode(created.code || "");
        setIsInviteOpen(false);
        setInviteEmail("");
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to send invitation:", err);
    }
  };

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/household/invitations/accept", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: acceptCode }),
    });
    if (res.ok) window.location.reload();
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Family & Household Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage household members, access roles (Owner, Member, Viewer), and personal vs shared accounts.
            </p>
          </div>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <UserPlus className="h-4 w-4" />
            Invite Family Member
          </button>
        </div>

        {/* Members List */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Household Members ({members.length})</CardTitle>
              <CardDescription>Active family members and permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                      {m.user?.name?.substring(0, 2) || "FM"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{m.user?.name}</p>
                      <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      m.role === "OWNER"
                        ? "bg-purple-500/15 text-purple-600"
                        : m.role === "MEMBER"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-gray-500/15 text-gray-600"
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending Family Invitations</CardTitle>
              <CardDescription>Invitations sent to family members</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {newInvitationCode && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <p className="font-semibold">Share this invitation code now. It will not be shown again.</p>
                  <code className="mt-1 block break-all">{newInvitationCode}</code>
                </div>
              )}
              <form onSubmit={handleAcceptInvitation} className="flex gap-2 border-b pb-3">
                <input aria-label="Invitation code" value={acceptCode} onChange={(e) => setAcceptCode(e.target.value)} placeholder="Enter invitation code" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
                <button type="submit" disabled={!acceptCode.trim()} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Join</button>
              </form>
              {invitations.length > 0 ? (
                invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">Role: {inv.role} • Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600">
                      {inv.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No pending family invitations.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Shared vs Personal Accounts Overview */}
          <Card>
          <CardHeader>
            <CardTitle className="text-lg">Household Accounts & Access Ownership</CardTitle>
            <CardDescription>Shared family liquidity vs personal account allocations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="rounded-lg border p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span>{acc.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${acc.isShared ? "bg-emerald-500/10 text-emerald-600" : "bg-purple-500/10 text-purple-600"}`}>
                      {acc.isShared ? "SHARED" : "PERSONAL"}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{formatINR(acc.balance)}</div>
                  <p className="text-[11px] text-muted-foreground">{acc.type} • {acc.accountNumber || "Primary"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Modal: Invite Family Member */}
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border">
              <h2 className="text-lg font-bold">Invite Family Member</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send an invitation code to join your household.
              </p>
              <form onSubmit={handleInvite} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="family.member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Household Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  >
                    <option value="MEMBER">MEMBER (Can add transactions & goals)</option>
                    <option value="VIEWER">VIEWER (Read-only access)</option>
                    <option value="OWNER">OWNER (Full administrative access)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="rounded-lg border px-3 py-1.5 font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Send Invitation
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
