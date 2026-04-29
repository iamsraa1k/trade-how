import { MonthlyView } from "@/components/monthly/MonthlyView";
import { getTrades, getRules, getMonthlyAnalyses } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MonthlyAnalysisPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const trades = await getTrades(session.user.email);
  const rules = await getRules(session.user.email);
  const analyses = await getMonthlyAnalyses(session.user.email);

  return (
    <div className="w-full h-full max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monthly Analysis</h1>
        <p className="text-muted-foreground mt-1">Review your performance on a monthly basis and add your end-of-month reflections.</p>
      </div>
      <MonthlyView trades={trades} rules={rules} monthlyAnalyses={analyses} />
    </div>
  );
}
