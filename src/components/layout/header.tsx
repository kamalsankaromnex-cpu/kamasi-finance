"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, IndianRupee, Sun, Moon, LogOut, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    role: string;
    householdName: string;
    currency: string;
    memberCount: number;
    activeProfile?: {
      id: string;
      name: string;
      relationship: string;
      isPrimary?: boolean;
      isFamilyView?: boolean;
      color?: string | null;
    } | null;
    availableProfiles?: Array<{
      id: string;
      name: string;
      relationship: string;
      avatarUrl?: string | null;
      color?: string | null;
      isPrimary?: boolean;
    }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("Profile unavailable");
        return response.json();
      })
      .then(({ user }) => {
        if (active && user) setProfile(user);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const householdName = profile?.householdName || "Household";
  const initials = profile?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  const activeProfile = profile?.activeProfile;
  const isFamilyView = Boolean(activeProfile?.isFamilyView);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (!isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    router.push("/login");
    router.refresh();
  };

  const handleSwitchProfile = async (targetId: string) => {
    try {
      setSwitching(true);
      const res = await fetch("/api/household/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: targetId }),
      });
      if (res.ok) {
        setProfileOpen(false);
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to switch profile", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 shadow-2xs">
      {/* Household, Profile Context & Currency */}
      <div className="flex items-center gap-3">
        {/* Household Dropdown */}
        <div className="relative">
          <button
            onClick={() => setHouseholdOpen(!householdOpen)}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            <span>{householdName}</span>
            {profile && <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">{profile.role}</span>}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {householdOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border bg-card p-1.5 shadow-lg animate-in fade-in-80">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select Household</p>
              <div className="flex items-center justify-between rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>{householdName}{profile ? ` · ${profile.memberCount} member${profile.memberCount === 1 ? "" : "s"}` : ""}</span>
                </div>
                <Check className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
          )}
        </div>

        {/* Global Family Profile Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen(!profileOpen);
              setHouseholdOpen(false);
            }}
            disabled={switching}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs ${
              isFamilyView
                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15"
                : "bg-background text-foreground hover:bg-accent border-primary/30"
            }`}
            title="Switch Family Profile"
          >
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-2xs"
              style={{ backgroundColor: activeProfile?.color || (isFamilyView ? "#8b5cf6" : "#0d9488") }}
            >
              {isFamilyView ? "👨‍👩‍👧" : (activeProfile?.name?.[0]?.toUpperCase() || initials[0])}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold">{activeProfile?.name || "Select Profile"}</span>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground opacity-80">
                ({isFamilyView ? "Aggregated" : activeProfile?.relationship || "Profile"})
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {profileOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-xl border bg-card p-2 shadow-xl animate-in fade-in-80">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Switch Family Profile</span>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    router.push("/choose-profile");
                  }}
                  className="text-primary hover:underline font-semibold"
                >
                  Picker
                </button>
              </div>

              {/* Individual Profiles */}
              <div className="mt-1 space-y-1">
                {profile?.availableProfiles?.map((p) => {
                  const isCurrent = !isFamilyView && activeProfile?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProfile(p.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                        isCurrent ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-2xs"
                          style={{ backgroundColor: p.color || "#0d9488" }}
                        >
                          {p.name[0]?.toUpperCase()}
                        </div>
                        <div className="text-left truncate">
                          <p className="truncate leading-tight">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground font-normal leading-tight">
                            {p.relationship} {p.isPrimary ? "• Primary" : ""}
                          </p>
                        </div>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>

              {/* Family View Option */}
              <div className="mt-2 border-t pt-2">
                <button
                  onClick={() => handleSwitchProfile("ALL")}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                    isFamilyView ? "bg-purple-500/10 text-purple-700 dark:text-purple-300" : "text-foreground hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[11px] font-bold text-white">
                      🏠
                    </div>
                    <div className="text-left">
                      <p className="leading-tight">Family View</p>
                      <p className="text-[10px] text-muted-foreground font-normal leading-tight">Household Aggregate (All Members)</p>
                    </div>
                  </div>
                  {isFamilyView && <Check className="h-4 w-4 shrink-0 text-purple-600" />}
                </button>
              </div>

              {/* Manage Profiles link */}
              <div className="mt-2 border-t pt-1.5">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    router.push("/family");
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <span>+ Manage Family Profiles</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Base Currency Badge */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
          <span>{profile?.currency || "INR"}</span>
        </div>
      </div>

      {/* Action Controls & User Identity */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="h-8 w-8 rounded-lg"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
        </Button>

        {/* User Info & Avatar */}
        <div className="flex items-center gap-3 border-l pl-3">
          <div aria-label="User avatar" className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 text-xs font-semibold text-primary">{initials}</div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold leading-tight">{profile?.name || "User"}</p>
            <p className="text-[10px] text-muted-foreground leading-none">{profile?.email || ""}</p>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="Sign Out"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
