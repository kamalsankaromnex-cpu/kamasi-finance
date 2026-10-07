"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Lock, Database, Info, CheckCircle2, Moon, Sun, Monitor, Bell, Download, LogOut, KeyRound, Landmark, ArrowRight } from "lucide-react";
import Link from "next/link";
import { FormErrorReassurance } from "@/components/ui/form-error-reassurance";

export default function SettingsPage() {
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const [originalProfile, setOriginalProfile] = useState<{ name: string; email: string } | null>(null);

  // Status & Error Messages
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'CONFIRMED_FAILURE' | 'NETWORK_TIMEOUT'>('CONFIRMED_FAILURE');

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Appearance Theme State
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // Notification Preferences State
  const [notifications, setNotifications] = useState({
    financialAlerts: true,
    goalReminders: true,
    billReminders: true,
  });

  useEffect(() => {
    // 1. Fetch authenticated user profile
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          const u = { name: data.user.name, email: data.user.email };
          setProfile(u);
          setOriginalProfile(u);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // 2. Fetch Financial Institutions (Reference Data)
    fetch("/api/institutions")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setInstitutions(data))
      .catch(() => {});

    // 3. Load theme preference
    const savedTheme = (localStorage.getItem("theme") as 'light' | 'dark' | 'system') || "system";
    setTheme(savedTheme);

    // 4. Load notification preferences
    const savedNotifications = localStorage.getItem("notification_preferences");
    if (savedNotifications) {
      try { setNotifications(JSON.parse(savedNotifications)); } catch {}
    }
  }, []);

  // Theme Toggle Handler
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Notification Toggle Handler
  const handleToggleNotification = (key: keyof typeof notifications) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    localStorage.setItem("notification_preferences", JSON.stringify(updated));
  };

  // Profile Cancel Handler
  const handleCancelProfile = () => {
    if (originalProfile) {
      setProfile({ ...originalProfile });
    }
    setErrorMessage(null);
  };

  // Profile Update Submission (Real API Persistence)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !profile.name.trim()) return;
    setProfileSuccess(false);
    setErrorMessage(null);
    setIsSubmittingProfile(true);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name }),
      });

      if (res.ok) {
        setOriginalProfile({ ...profile });
        setProfileSuccess(true);
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        const data = await res.json();
        setErrorMessage(data.message || "Could not save profile changes.");
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch (err) {
      setErrorMessage("Network connection error. Could not confirm if changes were saved.");
      setErrorType("NETWORK_TIMEOUT");
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  // Password Change Submission (Real API Persistence)
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("New password must be at least 8 characters long.");
      setErrorType("CONFIRMED_FAILURE");
      return;
    }

    setPasswordSuccess(false);
    setErrorMessage(null);
    setIsSubmittingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await res.json();
        setErrorMessage(data.message || "Could not update password.");
        setErrorType("CONFIRMED_FAILURE");
      }
    } catch (err) {
      setErrorMessage("Network error during password update.");
      setErrorType("NETWORK_TIMEOUT");
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // Data Export Handler
  const handleExportData = () => {
    window.location.href = "/api/user/export-data";
  };

  // Logout Handler
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl pb-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System & Account Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal profile, security credentials, appearance, notification preferences, and privacy.
          </p>
        </div>

        {errorMessage && (
          <FormErrorReassurance
            type={errorType}
            message={errorMessage}
            onRetry={() => setErrorMessage(null)}
          />
        )}

        {profileSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>Profile updated successfully!</span>
          </div>
        )}

        {passwordSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>Password updated successfully!</span>
          </div>
        )}

        {/* 1. User Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">User Profile</CardTitle>
                <CardDescription>Your personal identity and account contact details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-24 animate-pulse bg-muted rounded-lg" />
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Full Name</label>
                  <Input
                    value={profile?.name || ""}
                    onChange={(e) => setProfile((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                    placeholder="Enter full name"
                    className="mt-1"
                    disabled={isSubmittingProfile}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Email Address</label>
                  <Input
                    value={profile?.email || ""}
                    disabled
                    className="mt-1 bg-muted/50 text-muted-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Contact system admin to change primary email address.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={isSubmittingProfile}>
                    {isSubmittingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelProfile}
                    disabled={isSubmittingProfile || profile?.name === originalProfile?.name}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* 2. Appearance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                <Sun className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Appearance & Theme</CardTitle>
                <CardDescription>Customize interface visual style and color theme</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                  theme === "light" ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"
                }`}
              >
                <Sun className="h-5 w-5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                  theme === "dark" ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"
                }`}
              >
                <Moon className="h-5 w-5" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                  theme === "system" ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"
                }`}
              >
                <Monitor className="h-5 w-5" />
                <span>System</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Notification Preferences</CardTitle>
                <CardDescription>Control automated alerts and financial reminder notifications</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div>
                <p className="text-sm font-medium">Financial Integrity & Balance Alerts</p>
                <p className="text-xs text-muted-foreground">Receive instant alerts for unexpected account balance updates.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.financialAlerts}
                onChange={() => handleToggleNotification("financialAlerts")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div>
                <p className="text-sm font-medium">Savings Goal Reminders</p>
                <p className="text-xs text-muted-foreground">Monthly reminders for active savings target progress.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.goalReminders}
                onChange={() => handleToggleNotification("goalReminders")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div>
                <p className="text-sm font-medium">Bill & EMI Due Date Alerts</p>
                <p className="text-xs text-muted-foreground">Reminders before recurring bills and loan EMIs are due.</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.billReminders}
                onChange={() => handleToggleNotification("billReminders")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
          </CardContent>
        </Card>

        {/* 4. Security & Passwords */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Security & Passwords</CardTitle>
                <CardDescription>Password modification and session authentication controls</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Password Change Form */}
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                <span>Change Password</span>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1"
                  disabled={isSubmittingPassword}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="mt-1"
                  disabled={isSubmittingPassword}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="mt-1"
                  disabled={isSubmittingPassword}
                />
              </div>
              <Button type="submit" size="sm" variant="default" disabled={isSubmittingPassword}>
                {isSubmittingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>

            <hr />

            {/* Session Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                <div>
                  <p className="text-sm font-medium">Session Token Security</p>
                  <p className="text-xs text-muted-foreground">HttpOnly, Secure, SameSite=Lax JWT authentication session.</p>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active Session</Badge>
              </div>
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Sign out of all devices and terminate current session cookie.</p>
                <Button variant="outline" size="sm" onClick={handleLogout} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Reference Data — Financial Institutions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Reference Data — Financial Institutions</CardTitle>
                <CardDescription>Master directory of registered banking and financial institutions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {institutions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No financial institutions registered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {institutions.map((inst) => (
                  <div key={inst.id} className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-semibold">{inst.name}</span>
                        {inst.shortCode && <span className="text-[10px] text-muted-foreground ml-1">({inst.shortCode})</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5b. Reference Data Management — Navigation Card */}
        <Card className="border-indigo-100 dark:border-indigo-900/50 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Reference Data Management</CardTitle>
                  <CardDescription>
                    Manage financial scopes, categories, subcategories, and facility / cost centers across your household
                  </CardDescription>
                </div>
              </div>
              <Link href="/settings/reference-data">
                <Button variant="outline" size="sm" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300">
                  Manage Reference Data
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                Financial Scopes
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                Categories
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                Subcategories
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                Facilities & Cost Centers
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 6. Data & Privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Data Privacy & Export</CardTitle>
                <CardDescription>Export your complete household data and review privacy guarantees</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div>
                <p className="text-sm font-medium">Household Data Export</p>
                <p className="text-xs text-muted-foreground">Download a complete structured JSON copy of accounts, transactions, and goals.</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleExportData}>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Data Privacy Guarantee</p>
              <p>Your financial records are strictly isolated within your household. Kamasi Finance does not sell, share, or perform third-party tracking on your financial data.</p>
            </div>
          </CardContent>
        </Card>

        {/* 6. About */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/10 text-gray-600">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">About Kamasi Finance</CardTitle>
                <CardDescription>Application version and platform documentation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground">Application Version</span>
              <span className="font-semibold">v3.10.0</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground">Double-Entry Core Engine</span>
              <span className="font-semibold">v3.10 Certified</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground">Environment</span>
              <Badge variant="outline" className="text-[10px]">Production Build</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
