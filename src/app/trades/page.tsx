import { TradeTable } from "@/components/trades/TradeTable";
import { getTrades, getRules } from "@/lib/db";
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

  return (
    <div className="w-full h-full max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trade Log</h1>
        <p className="text-muted-foreground mt-1">Review all your trades, search, and export detailed PDFs.</p>
      </div>
      <TradeTable trades={trades} rules={rules} />
    </div>
  );
}
