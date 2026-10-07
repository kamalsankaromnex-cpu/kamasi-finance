"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, User, ShieldCheck, Plus, Check, ArrowRight, Sparkles, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const RELATIONSHIP_LABELS: Record<string, string> = {
  SELF: "Self / Primary",
  SPOUSE: "Spouse / Partner",
  PARENT: "Parent",
  CHILD: "Child",
  BROTHER: "Brother",
  SISTER: "Sister",
  GRANDPARENT: "Grandparent",
  GRANDCHILD: "Grandchild",
  RELATIVE: "Relative",
  OTHER: "Family Member",
};

export default function ChooseProfilePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Add profile modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRelationship, setAddRelationship] = useState("SPOUSE");
  const [addDob, setAddDob] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        if (data.user) {
          setUserName(data.user.name || "Family Member");
          setHouseholdName(data.user.householdName || "Household");
          setProfiles(data.user.availableProfiles || []);
          setActiveProfileId(data.user.activeProfileId || null);
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  const handleSelectProfile = async (profileId: string) => {
    try {
      setSwitchingId(profileId);
      const res = await fetch("/api/household/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to select profile:", err);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;

    try {
      setAddLoading(true);
      setAddError("");
      const res = await fetch("/api/household/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          relationship: addRelationship,
          dateOfBirth: addDob || null,
          notes: addNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setAddError(err.error || "Failed to create profile");
        setAddLoading(false);
        return;
      }

      const created = await res.json();
      setIsAddOpen(false);
      // Automatically switch to the newly created profile
      await handleSelectProfile(created.id);
    } catch {
      setAddError("An unexpected error occurred");
      setAddLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs font-semibold text-muted-foreground">Loading family profiles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl space-y-8 text-center">
        {/* Header */}
        <div className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Users className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {householdName ? `${householdName} • ` : ""}Who are you using Kamasi as today?
          </p>
        </div>

        {/* Profile Selection Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {profiles.map((p) => {
            const isSelected = activeProfileId === p.id;
            const isSwitching = switchingId === p.id;
            const initials = p.name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w: string) => w[0]?.toUpperCase())
              .join("");

            return (
              <button
                key={p.id}
                type="button"
                disabled={switchingId !== null}
                onClick={() => handleSelectProfile(p.id)}
                className={`group relative flex flex-col items-center rounded-2xl border p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {p.isPrimary && (
                  <span className="absolute right-2 top-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                    Primary
                  </span>
                )}

                {/* Avatar Icon / Initial */}
                <div
                  className="mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold shadow-sm transition-transform group-hover:scale-105"
                  style={{
                    backgroundColor: p.color ? `${p.color}20` : "rgba(99, 102, 241, 0.15)",
                    color: p.color || "#6366f1",
                    border: `2px solid ${p.color || "#6366f1"}40`,
                  }}
                >
                  {initials || <User className="h-8 w-8" />}
                </div>

                {/* Profile Details */}
                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  {p.name}
                </h3>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                  {RELATIONSHIP_LABELS[p.relationship] || p.relationship}
                </p>

                {isSwitching && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-xs">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
              </button>
            );
          })}

          {/* Family View (Household Aggregate) Card */}
          <button
            type="button"
            disabled={switchingId !== null}
            onClick={() => handleSelectProfile("ALL")}
            className={`group relative flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:bg-muted/50 focus:outline-none ${
              activeProfileId === "ALL" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : ""
            }`}
          >
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 border-2 border-emerald-500/20 shadow-sm transition-transform group-hover:scale-105">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              Family View
            </h3>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              Household Total
            </p>

            {switchingId === "ALL" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-xs">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row pt-4">
          <Button
            variant="outline"
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 rounded-xl text-xs font-semibold px-4 py-2"
          >
            <Plus className="h-4 w-4 text-primary" />
            <span>Add Family Profile</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => handleSelectProfile(profiles[0]?.id || "ALL")}
            className="flex items-center gap-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <span>Continue to Dashboard</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Add Profile Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-md shadow-2xl border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">Add Family Profile</CardTitle>
                    <CardDescription className="text-xs">No email or separate password required</CardDescription>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {addError && (
                <div className="mb-4 rounded-lg bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">
                  {addError}
                </div>
              )}
              <form onSubmit={handleAddProfile} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">Full Name *</label>
                  <Input
                    required
                    placeholder="e.g. Kowsalya, Father, Aarav"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Relationship to Account Holder *</label>
                  <select
                    value={addRelationship}
                    onChange={(e) => setAddRelationship(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="SPOUSE">Spouse / Partner</option>
                    <option value="PARENT">Parent (Father / Mother)</option>
                    <option value="CHILD">Child (Son / Daughter)</option>
                    <option value="BROTHER">Brother</option>
                    <option value="SISTER">Sister</option>
                    <option value="GRANDPARENT">Grandparent</option>
                    <option value="GRANDCHILD">Grandchild</option>
                    <option value="RELATIVE">Relative</option>
                    <option value="OTHER">Other Family Member</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Date of Birth (Optional)</label>
                  <Input
                    type="date"
                    value={addDob}
                    onChange={(e) => setAddDob(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Notes (Optional)</label>
                  <Input
                    placeholder="e.g. College student, retired, etc."
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddOpen(false)}
                    disabled={addLoading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addLoading || !addName.trim()}>
                    {addLoading ? "Creating..." : "Create & Select Profile"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </Dialog>
    </div>
  );
}
