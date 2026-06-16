"use client"

import { RulesManager } from "@/features/rules/components/RulesManager";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RulesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { rules } = useData();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return null;
  }

  return (
    <div className="page-container max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">Trading Rules</h1>
        <p className="page-description">Manage your custom checklist for logging trades.</p>
      </div>
      <RulesManager initialRules={rules} />
    </div>
  );
}
