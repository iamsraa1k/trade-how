"use client"

import { TradeTable } from "@/features/trades/components/TradeTable";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TradesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trades, rules, monthlyAnalyses } = useData();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return null;
  }

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
