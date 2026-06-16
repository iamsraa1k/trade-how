import { MonthlyView } from "@/features/analytics/components/MonthlyView";
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
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Monthly Analysis</h1>
        <p className="page-description">Review your performance on a monthly basis and add your end-of-month reflections.</p>
      </div>
      <MonthlyView trades={trades} rules={rules} monthlyAnalyses={analyses} />
    </div>
  );
}
