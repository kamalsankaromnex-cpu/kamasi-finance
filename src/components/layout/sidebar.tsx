"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Receipt,
  ArrowLeftRight,
  PieChart,
  Target,
  CalendarCheck,
  FolderKanban,
  Building2,
  LineChart,
  CreditCard,
  FileSpreadsheet,
  Bot,
  Users,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavGroup {
  title?: string;
  items: Array<{
    name: string;
    href: string;
    icon: any;
    badge?: string;
  }>;
}

const navGroups: NavGroup[] = [
  {
    items: [{ name: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Money",
    items: [
      { name: "Accounts", href: "/accounts", icon: Wallet },
      { name: "Income", href: "/income", icon: TrendingUp },
      { name: "Expenses", href: "/expenses", icon: Receipt },
      { name: "Transfers", href: "/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Planning",
    items: [
      { name: "Budgets", href: "/budgets", icon: PieChart },
      { name: "Goals", href: "/goals", icon: Target },
      { name: "Projects", href: "/projects", icon: FolderKanban },
      { name: "Forecast", href: "/forecast", icon: CalendarCheck },
    ],
  },
  {
    title: "Wealth",
    items: [
      { name: "Assets", href: "/assets", icon: Building2 },
      { name: "Investments", href: "/investments", icon: LineChart },
      { name: "Borrowing & Debt", href: "/borrowing", icon: CreditCard },
    ],
  },
  {
    items: [
      { name: "Reports", href: "/reports", icon: FileSpreadsheet },
      { name: "AI Assistant", href: "/ai", icon: Bot, badge: "Co-Pilot" },
      { name: "Family", href: "/family", icon: Users },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground shadow-xs">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-primary leading-none">Kamasi</h1>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Family Finance OS</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {group.title && (
              <p className="px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary")}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Household Footer */}
      <div className="border-t p-4 bg-muted/40">
        <SidebarHouseholdFooter />
      </div>
    </aside>
  );
}

function SidebarHouseholdFooter() {
  const [householdName, setHouseholdName] = useState("Household");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.user?.householdName) {
          setHouseholdName(data.user.householdName);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-background p-2.5 border shadow-2xs">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
        <Users className="h-4 w-4" />
      </div>
      <div className="overflow-hidden">
        <p className="text-xs font-semibold truncate">{householdName}</p>
        <p className="text-[10px] text-muted-foreground truncate">Verified Ledger OS</p>
      </div>
    </div>
  );
}
