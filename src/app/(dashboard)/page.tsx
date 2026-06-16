import { Dashboard } from "@/features/dashboard/components/Dashboard";
import { CalendarView } from "@/features/calendar/components/CalendarView";
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
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-description">Summary of your trading metrics.</p>
      </div>
      
      <Dashboard trades={trades} rules={rules} />
    </div>
  );
}
