"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Wallet,
  PieChart,
  Target,
  LineChart,
  Building2,
  CalendarCheck,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Users,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Family & Household", href: "/family", icon: Users },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Income & Expenses", href: "/income-expenses", icon: TrendingUp },
  { name: "Accounts", href: "/accounts", icon: Wallet },
  { name: "Budgets", href: "/budgets", icon: PieChart },
  { name: "Bills & EMIs", href: "/bills", icon: CalendarCheck },
  { name: "Savings & Goals", href: "/savings-goals", icon: Target },
  { name: "Investments", href: "/investments", icon: LineChart },
  { name: "Assets & Liabilities", href: "/assets-liabilities", icon: Building2 },
  { name: "2026–2050 Forecasts", href: "/forecasting", icon: CalendarCheck, badge: "2026-2050" },
  { name: "Financial Reports", href: "/reports", icon: FileSpreadsheet },
  { name: "Household Settings", href: "/settings", icon: Settings },
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
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
          Financial Management
        </p>

        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
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

      {/* Household Status Footer */}
      <div className="border-t p-4 bg-muted/40">
        <div className="flex items-center gap-3 rounded-lg bg-background p-2.5 border shadow-2xs">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <Users className="h-4 w-4" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold truncate">Kamasi Family</p>
            <p className="text-[11px] text-muted-foreground truncate">2 Active Members</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
