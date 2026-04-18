import { Dashboard } from "@/components/dashboard/Dashboard";
import { CalendarView } from "@/components/calendar/CalendarView";
import { getTrades, getRules } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const trades = await getTrades(session.user.email);
  const rules = await getRules(session.user.email);

  return (
    <div className="w-full h-full max-w-[1400px] mx-auto space-y-12 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Summary of your trading performance.</p>
      </div>
      
      <Dashboard trades={trades} rules={rules} />

      <div className="pt-8 border-t border-border/50">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Performance Calendar</h2>
            <p className="text-muted-foreground mt-1">Daily overview of your trading P/L.</p>
          </div>
          {/* Constrain calendar width to be punchy while letting dashboard be wide */}
          <div className="max-w-5xl mx-auto">
             <CalendarView trades={trades} rules={rules} />
          </div>
      </div>
    </div>
  );
}
