"use client"

import { Dashboard } from "@/features/dashboard/components/Dashboard";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trades, rules } = useData();

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
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-description">Summary of your trading metrics.</p>
      </div>
      
      <Dashboard trades={trades} rules={rules} />
    </div>
  );
}
