"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, List, CheckSquare, PlusCircle, FileText, TrendingUp, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradeFilter, TradeMode } from "@/components/TradeFilterContext";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Trade Log", href: "/trades", icon: List },
  { name: "Rules", href: "/rules", icon: CheckSquare },
  { name: "Monthly Analysis", href: "/monthly-analysis", icon: Calendar },
];

const filterOptions: { mode: TradeMode; label: string; icon: React.ElementType; description: string }[] = [
  { mode: "all", label: "All", icon: Layers, description: "Combined" },
  { mode: "regular", label: "Real", icon: TrendingUp, description: "Live trades" },
  { mode: "paper", label: "Paper", icon: FileText, description: "Simulated" },
];

export function AppSidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (val: boolean) => void }) {
  const pathname = usePathname();
  const { tradeMode, setTradeMode } = useTradeFilter();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r bg-background transition-transform duration-300 md:translate-x-0 md:static md:block",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
            TradeHow
          </Link>
        </div>

        {/* Trade Mode Filter */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">View Mode</p>
          <div className="flex rounded-xl bg-muted/50 p-1 border border-border/60 shadow-sm">
            {filterOptions.map((opt) => {
              const isActive = tradeMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setTradeMode(opt.mode)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all duration-200",
                    isActive
                      ? opt.mode === "paper"
                        ? "bg-teal-500/15 text-teal-600 dark:text-teal-400 shadow-sm ring-1 ring-teal-500/20"
                        : opt.mode === "regular"
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-500/20"
                          : "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  <opt.icon className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive && opt.mode === "paper" && "text-teal-500",
                    isActive && opt.mode === "regular" && "text-indigo-500",
                  )} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-muted",
                  isActive ? "bg-muted text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t">
            <Link
              href="/add"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            >
              <PlusCircle className="h-5 w-5" />
              Log New Trade
            </Link>
          </div>
        </nav>
      </aside>
    </>
  );
}
