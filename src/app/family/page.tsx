"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users,
  UserPlus,
  Shield,
  Edit2,
  Trash2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
  Copy,
  Ban,
  ArrowRightLeft,
  Sparkles,
  Calendar,
  Layers,
  Wallet,
} from "lucide-react";
import { formatINR } from "@/lib/currency";

const PRESET_COLORS = [
  "#0d9488", // Teal
  "#2563eb", // Blue
  "#7c3aed", // Violet
  "#db2777", // Pink
  "#ea580c", // Orange
  "#16a34a", // Green
  "#0284c7", // Sky
  "#4f46e5", // Indigo
];

const RELATIONSHIPS = [
  { value: "SELF", label: "Self (Account Owner)" },
  { value: "SPOUSE", label: "Spouse / Partner" },
  { value: "PARENT", label: "Parent (Father / Mother)" },
  { value: "CHILD", label: "Child (Son / Daughter)" },
  { value: "BROTHER", label: "Brother" },
  { value: "SISTER", label: "Sister" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "GRANDCHILD", label: "Grandchild" },
  { value: "RELATIVE", label: "Relative" },
  { value: "OTHER", label: "Other Family Member" },
];

export default function FamilyPage() {
  const [household, setHousehold] = useState<{ id: string; name: string; currency: string } | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("MEMBER");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [isFamilyView, setIsFamilyView] = useState<boolean>(false);

  // Profile modal states
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    relationship: "SPOUSE",
    color: "#0d9488",
    dateOfBirth: "",
    notes: "",
  });

  // Advanced external access collapse
  const [showAdvancedAccess, setShowAdvancedAccess] = useState(false);

  // Invitation states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [newInvitationCode, setNewInvitationCode] = useState("");
  const [acceptCode, setAcceptCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Household name editing
  const [isEditingHousehold, setIsEditingHousehold] = useState(false);
  const [householdNameInput, setHouseholdNameInput] = useState("");

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    type: "REVOKE_INVITATION" | "REMOVE_MEMBER" | "DELETE_PROFILE";
    id: string;
    title: string;
    description: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [pRes, mRes, aRes, meRes] = await Promise.all([
        fetch("/api/household/profiles"),
        fetch("/api/household/members"),
        fetch("/api/accounts"),
        fetch("/api/auth/me"),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setProfiles(pData.profiles || []);
      }

      if (mRes.ok) {
        const data = await mRes.json();
        if (data.household) {
          setHousehold(data.household);
          setHouseholdNameInput(data.household.name);
        }
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }

      if (aRes.ok) {
        setAccounts(await aRes.json());
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        const user = meData.user || {};
        setCurrentUserRole(user.role || "MEMBER");
        setCurrentUserId(user.userId || user.id || "");
        if (user.activeProfile) {
          setActiveProfileId(user.activeProfile.id || "");
          setIsFamilyView(Boolean(user.activeProfile.isFamilyView));
        }
      }
    } catch (err) {
      console.error("Failed to load family data:", err);
      setErrorMessage("Failed to load household profiles. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddProfile = () => {
    setEditingProfileId(null);
    setProfileForm({
      name: "",
      relationship: "SPOUSE",
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      dateOfBirth: "",
      notes: "",
    });
    setIsProfileModalOpen(true);
  };

  const handleOpenEditProfile = (p: any) => {
    setEditingProfileId(p.id);
    setProfileForm({
      name: p.name || "",
      relationship: p.relationship || "OTHER",
      color: p.color || "#0d9488",
      dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split("T")[0] : "",
      notes: p.notes || "",
    });
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const method = editingProfileId ? "PATCH" : "POST";
      const payload: any = {
        name: profileForm.name.trim(),
        relationship: profileForm.relationship,
        color: profileForm.color,
        dateOfBirth: profileForm.dateOfBirth ? new Date(profileForm.dateOfBirth).toISOString() : null,
        notes: profileForm.notes.trim() || null,
      };

      if (editingProfileId) {
        payload.id = editingProfileId;
      }

      const res = await fetch("/api/household/profiles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsProfileModalOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to save profile");
      }
    } catch (err) {
      setErrorMessage("Network error saving profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchProfile = async (targetId: string) => {
    try {
      setIsSubmitting(true);
      const res = await fetch("/api/household/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: targetId }),
      });

      if (res.ok) {
        window.location.reload();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to switch profile");
      }
    } catch (err) {
      setErrorMessage("Network error switching profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmModal || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      if (confirmModal.type === "DELETE_PROFILE") {
        const res = await fetch(`/api/household/profiles?id=${confirmModal.id}`, { method: "DELETE" });
        if (res.ok) {
          setConfirmModal(null);
          await fetchData();
        } else {
          const err = await res.json();
          setErrorMessage(err.error || "Failed to remove profile");
        }
      } else if (confirmModal.type === "REVOKE_INVITATION") {
        const res = await fetch(`/api/household/members?invitationId=${confirmModal.id}`, { method: "DELETE" });
        if (res.ok) {
          setConfirmModal(null);
          await fetchData();
        } else {
          const err = await res.json();
          setErrorMessage(err.error || "Failed to revoke invitation");
        }
      } else if (confirmModal.type === "REMOVE_MEMBER") {
        const res = await fetch(`/api/household/members?memberId=${confirmModal.id}`, { method: "DELETE" });
        if (res.ok) {
          setConfirmModal(null);
          await fetchData();
        } else {
          const err = await res.json();
          setErrorMessage(err.error || "Failed to remove member");
        }
      }
    } catch (err) {
      setErrorMessage("Network error processing action");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateHouseholdName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdNameInput.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: householdNameInput.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.household) setHousehold(data.household);
        setIsEditingHousehold(false);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to update household name");
      }
    } catch (err) {
      setErrorMessage("Network error updating household name");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
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
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to send invitation");
      }
    } catch (err) {
      setErrorMessage("Network error sending invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptCode.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const res = await fetch("/api/household/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: acceptCode.trim() }),
      });

      if (res.ok) {
        setAcceptCode("");
        window.location.reload();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Failed to accept invitation");
      }
    } catch (err) {
      setErrorMessage("Network error accepting invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isOwner = currentUserRole === "OWNER";

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Error Notification Alert */}
        {errorMessage && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage("")} aria-label="Dismiss error" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Top Header & Call to Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Family Profiles & Household</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              One login for your household. Add profiles for family members and switch seamlessly anytime.
            </p>
          </div>

          <button
            onClick={handleOpenAddProfile}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            <UserPlus className="h-4 w-4" />
            + Add Family Profile
          </button>
        </div>

        {/* Section 1: Family Profiles (Primary Focus) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Family Profiles ({profiles.length})</h2>
              <p className="text-xs text-muted-foreground">
                Profiles belong to your household account — no separate passwords or emails needed.
              </p>
            </div>

            <button
              onClick={() => handleSwitchProfile("ALL")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isFamilyView
                  ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
                  : "bg-background hover:bg-accent text-foreground"
              }`}
            >
              <span>🏠 Switch to Family View (All)</span>
              {isFamilyView && <Check className="h-3.5 w-3.5 text-purple-600" />}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => {
              const isCurrent = !isFamilyView && activeProfileId === p.id;
              const initials = p.name ? p.name.substring(0, 2).toUpperCase() : "FP";
              const totalTxns = p._count?.transactions || 0;
              const totalGoals = p._count?.goals || 0;
              const totalAccounts = p._count?.accounts || 0;

              return (
                <Card
                  key={p.id}
                  className={`relative overflow-hidden transition-all ${
                    isCurrent ? "border-primary ring-2 ring-primary/20 shadow-sm" : "hover:border-primary/40"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-xs"
                          style={{ backgroundColor: p.color || "#0d9488" }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-bold truncate">{p.name}</CardTitle>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground uppercase">
                              {p.relationship}
                            </span>
                            {p.isPrimary && (
                              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                                Primary
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 shrink-0">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSwitchProfile(p.id)}
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold text-primary hover:bg-accent shrink-0 transition-colors"
                        >
                          <ArrowRightLeft className="h-3 w-3" /> Switch
                        </button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {/* Activity summary chips */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground font-medium">
                        <Layers className="h-3 w-3" /> {totalTxns} {totalTxns === 1 ? "txn" : "txns"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground font-medium">
                        <Sparkles className="h-3 w-3" /> {totalGoals} {totalGoals === 1 ? "goal" : "goals"}
                      </span>
                      {totalAccounts > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground font-medium">
                          <Wallet className="h-3 w-3" /> {totalAccounts} {totalAccounts === 1 ? "acct" : "accts"}
                        </span>
                      )}
                    </div>

                    {p.notes && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        &quot;{p.notes}&quot;
                      </p>
                    )}

                    {/* Card Actions */}
                    <div className="flex items-center justify-between border-t pt-2.5 text-xs">
                      <button
                        onClick={() => handleOpenEditProfile(p)}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium"
                      >
                        <Edit2 className="h-3 w-3" /> Edit Profile
                      </button>

                      {!p.isPrimary && profiles.length > 1 && (
                        <button
                          onClick={() =>
                            setConfirmModal({
                              type: "DELETE_PROFILE",
                              id: p.id,
                              title: "Deactivate Profile",
                              description: `Are you sure you want to deactivate ${p.name}'s profile? Financial records linked to this profile will remain safe in the household ledger.`,
                            })
                          }
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 font-medium"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Section 2: Household Info Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-bold">Household Information</CardTitle>
              <CardDescription>Household identity and currency governance</CardDescription>
            </div>
            {isOwner && !isEditingHousehold && (
              <button
                onClick={() => setIsEditingHousehold(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit Name
              </button>
            )}
          </CardHeader>
          <CardContent>
            {isEditingHousehold ? (
              <form onSubmit={handleUpdateHouseholdName} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <input
                  type="text"
                  required
                  value={householdNameInput}
                  onChange={(e) => setHouseholdNameInput(e.target.value)}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm w-full max-w-sm"
                  placeholder="Enter household name"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !householdNameInput.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingHousehold(false);
                      setHouseholdNameInput(household?.name || "");
                    }}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold tracking-tight">{household?.name || "Loading Household..."}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Primary Currency: <span className="font-semibold text-foreground">{household?.currency || "INR"}</span>
                  </p>
                </div>
                <span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-600">
                  Role: {currentUserRole}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Household Accounts & Profile Allocation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">Household Accounts & Allocations</CardTitle>
            <CardDescription>Shared family liquidity vs profile-assigned accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="rounded-lg border p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="truncate">{acc.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        acc.isShared ? "bg-emerald-500/10 text-emerald-600" : "bg-purple-500/10 text-purple-600"
                      }`}
                    >
                      {acc.isShared ? "SHARED" : "PERSONAL"}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{formatINR(acc.balance)}</div>
                  <p className="text-[11px] text-muted-foreground">
                    {acc.type} • {acc.accountNumber || "Primary"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Advanced External Access (Collapsible) */}
        <div className="rounded-xl border bg-card/60 p-4 space-y-3">
          <button
            onClick={() => setShowAdvancedAccess(!showAdvancedAccess)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Advanced: External User Logins & Multi-Account Access
              </h3>
              <p className="text-xs text-muted-foreground">
                Optional: Only use this if a member needs their own separate email/password credentials to log into this household.
              </p>
            </div>
            {showAdvancedAccess ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showAdvancedAccess && (
            <div className="pt-3 border-t space-y-6">
              <div className="flex justify-end">
                {isOwner && (
                  <button
                    onClick={() => setIsInviteOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-accent"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Invite External User
                  </button>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* External Members List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Household Logins ({members.length})
                  </h4>
                  <div className="space-y-2">
                    {members.map((m) => {
                      const isCurrent = m.user?.id === currentUserId || m.userId === currentUserId;
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border bg-background p-3 text-xs">
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span>{m.user?.name}</span>
                              {isCurrent && <span className="text-[10px] text-muted-foreground">(You)</span>}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{m.user?.email}</p>
                          </div>
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">
                            {m.role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Invitations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Pending Invitations & Join Code
                  </h4>

                  {newInvitationCode && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1.5">
                      <p className="font-semibold text-amber-700 dark:text-amber-400">Share this invitation code:</p>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 rounded bg-background p-1.5 font-mono text-xs border">{newInvitationCode}</code>
                        <button
                          onClick={() => copyToClipboard(newInvitationCode)}
                          className="shrink-0 rounded bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white"
                        >
                          {copiedCode ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleAcceptInvitation} className="flex gap-2">
                    <input
                      aria-label="Invitation code"
                      value={acceptCode}
                      onChange={(e) => setAcceptCode(e.target.value)}
                      placeholder="Enter invitation code"
                      className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={!acceptCode.trim() || isSubmitting}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Join
                    </button>
                  </form>

                  <div className="space-y-2">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-lg border bg-background p-2.5 text-xs">
                        <div>
                          <p className="font-semibold">{inv.email}</p>
                          <p className="text-[10px] text-muted-foreground">Status: {inv.status}</p>
                        </div>
                        {isOwner && inv.status === "PENDING" && (
                          <button
                            onClick={() =>
                              setConfirmModal({
                                type: "REVOKE_INVITATION",
                                id: inv.id,
                                title: "Revoke Invitation",
                                description: `Revoke invitation for ${inv.email}?`,
                              })
                            }
                            className="text-red-500 hover:text-red-600 p-1"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Add / Edit Family Profile */}
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-50">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white shadow-2xs"
                    style={{ backgroundColor: profileForm.color }}
                  >
                    {profileForm.name ? profileForm.name[0]?.toUpperCase() : "👤"}
                  </div>
                  <div>
                    <h2 className="text-base font-bold">
                      {editingProfileId ? "Edit Family Profile" : "Add Family Profile"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      No separate email or login needed.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  aria-label="Close modal"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Profile Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kowsalya, Father, Mother, Aarav"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full rounded-md border p-2.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Relationship to Household</label>
                  <select
                    value={profileForm.relationship}
                    onChange={(e) => setProfileForm({ ...profileForm, relationship: e.target.value })}
                    className="w-full rounded-md border p-2.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {RELATIONSHIPS.map((rel) => (
                      <option key={rel.value} value={rel.value}>
                        {rel.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1.5">Avatar Color</label>
                  <div className="flex items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setProfileForm({ ...profileForm, color: c })}
                        className={`h-7 w-7 rounded-full transition-transform ${
                          profileForm.color === c ? "ring-2 ring-primary ring-offset-2 scale-110" : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Date of Birth (Optional)</label>
                  <input
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(e) => setProfileForm({ ...profileForm, dateOfBirth: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Notes (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Personal notes, occupation, or reminders..."
                    value={profileForm.notes}
                    onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                    className="w-full rounded-md border p-2 text-xs bg-background resize-none"
                  />
                </div>

                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                  💡 This profile will be immediately available in the top switcher and login screen.
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="rounded-lg border px-3.5 py-2 font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !profileForm.name.trim()}
                    className="rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : editingProfileId ? "Update Profile" : "Create Profile"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Invite External User */}
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl border space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Invite External User</h2>
                <button onClick={() => setIsInviteOpen(false)} aria-label="Close modal" className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate an invitation code for a family member to join using their own email address.
              </p>
              <form onSubmit={handleInvite} className="space-y-3 text-xs">
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
                    disabled={isSubmitting}
                    className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Generate Invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirmation Dialog */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl border space-y-4">
              <h2 className="text-base font-bold">{confirmModal.title}</h2>
              <p className="text-xs text-muted-foreground">{confirmModal.description}</p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmAction}
                  className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
