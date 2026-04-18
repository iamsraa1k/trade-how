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
        <p className="text-muted-foreground mt-1">Summary of your trading metrics.</p>
      </div>
      
      <Dashboard trades={trades} rules={rules} />
    </div>
  );
}
