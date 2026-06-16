"use client"

import { MonthlyView } from "@/features/analytics/components/MonthlyView";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MonthlyAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trades, rules, monthlyAnalyses: analyses } = useData();

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
        <h1 className="page-title">Monthly Analysis</h1>
        <p className="page-description">Review your performance on a monthly basis and add your end-of-month reflections.</p>
      </div>
      <MonthlyView trades={trades} rules={rules} monthlyAnalyses={analyses} />
    </div>
  );
}
