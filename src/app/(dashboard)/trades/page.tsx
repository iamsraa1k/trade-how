import { TradeTable } from "@/features/trades/components/TradeTable";
import { getTrades, getRules, getMonthlyAnalyses } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function TradesPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const trades = await getTrades(session.user.email);
  const rules = await getRules(session.user.email);
  const monthlyAnalyses = await getMonthlyAnalyses(session.user.email);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Trade Log</h1>
        <p className="page-description">Review all your trades, search, and export detailed PDFs.</p>
      </div>
      <TradeTable trades={trades} rules={rules} monthlyAnalyses={monthlyAnalyses} />
    </div>
  );
}
