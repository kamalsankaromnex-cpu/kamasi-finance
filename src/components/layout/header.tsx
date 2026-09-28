"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, IndianRupee, Sun, Moon, LogOut, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    role: string;
    householdName: string;
    currency: string;
    memberCount: number;
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

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 shadow-2xs">
      {/* Household & Currency Context */}
      <div className="flex items-center gap-4">
        {/* Household Switcher Dropdown */}
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

        {/* Base Currency Badge */}
        <div className="flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
          <span>{profile?.currency || "INR"}</span>
        </div>
      </div>

      {/* Action Controls & User Profile */}
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
