import { CalendarView } from "@/components/calendar/CalendarView";
import { getTrades, getRules } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const trades = await getTrades(session.user.email);
  const rules = await getRules(session.user.email);

  return (
    <div className="w-full h-full max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance Calendar</h1>
        <p className="text-muted-foreground mt-1">Daily overview of your trading P/L.</p>
      </div>
      <CalendarView trades={trades} rules={rules} />
    </div>
  );
}
